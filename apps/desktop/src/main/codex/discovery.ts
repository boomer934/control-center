// When the app asks Codex what it offers (phase 5h.2), without a chat: a short `codex app-server`
// in a folder of the app, with only the handshake and the read-only methods of the inventory
// (CODEX_PROBE_METHODS), then the whole process tree ends. No thread, no turn, no model call.
//
// Like Claude's (../claude/discovery.ts) it runs at most once per app run and only when useful:
// the CLI version differs from the last read, or the last read is older than a day. A session
// that hears of new skills, apps or MCP servers asks for a new read.
import { execFile, type ChildProcess } from 'node:child_process';
import type { ErrorInput } from '@control-center/app-log';
import { AgentVersionSchema } from '@control-center/ipc-contract';
import { z } from 'zod';
import type { CapabilityService } from '../capabilities/service';
import { CATALOG_MAX_AGE_MS } from '../claude/discovery';
import type { Program } from '../claude/cli';
import { killTree } from '../claude/kill-tree';
import { superviseChild } from '../errors/children';
import { codexVersion } from './cli';
import { readCodexInventory, type CodexInventory } from './inventory';
import { CODEX_PROBE_METHODS } from './methods';
import { createRpcClient } from './rpc';

export const CODEX_PROBE_TIMEOUT_MS = 60_000;
/** Each method of the probe; `hooks/list` took about 2 s in the test of 2026-11-27. */
const METHOD_TIMEOUT_MS = 15_000;
const CLOSE_WAIT_MS = 5000;

export interface CodexProbeOptions {
  codex: Program;
  /** Where the probe runs: a folder of the app, never a workspace. */
  cwd: string;
  env: NodeJS.ProcessEnv;
  report: (input: ErrorInput) => unknown;
  clientVersion?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface CodexDiscovery extends CodexInventory {
  version: string | null;
}

const initializeResponse = z.looseObject({ userAgent: z.string().max(1024) });

/** Runs the probe; undefined when the server did not answer the handshake in time. */
export function probeCodex(options: CodexProbeOptions): Promise<CodexDiscovery | undefined> {
  if (options.signal?.aborted) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let settled = false;
    let ended = false;
    let exited = false;
    let afterExit: (() => void) | undefined;
    const child: ChildProcess = superviseChild({
      name: 'codex-probe',
      command: options.codex.command,
      args: [...options.codex.args, 'app-server'],
      cwd: options.cwd,
      env: options.env,
      stdin: true,
      onStdout: (chunk) => rpc.push(chunk),
      expectedExit: () => ended,
      report: options.report,
    });
    const rpc = createRpcClient(
      (line) => {
        const input = child.stdin;
        if (!input?.writable) return false;
        input.write(line);
        return true;
      },
      {
        onNotification: () => undefined,
        // the probe never approves anything
        onRequest: (id) => rpc.respondError(id, -32601, 'Not supported by this client'),
        onInvalid: () => undefined,
        onRefused: (method) =>
          options.report({
            origin: 'main',
            source: 'capabilities',
            kind: 'capabilities',
            name: 'CodexMethodRefused',
            message: `The app refused to call ${method}: it is not one of the probe's methods`,
          }),
      },
      CODEX_PROBE_METHODS,
      METHOD_TIMEOUT_MS,
    );
    const timer = setTimeout(() => finish(undefined), options.timeoutMs ?? CODEX_PROBE_TIMEOUT_MS);
    const onAbort = () => finish(undefined);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const gone = () => {
      exited = true;
      rpc.close();
      finish(undefined);
      afterExit?.();
    };
    child.on('close', gone);
    child.on('error', gone);
    child.stdin?.on('error', () => finish(undefined));

    function finish(result: CodexDiscovery | undefined) {
      if (settled) return;
      settled = true;
      ended = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      rpc.close();
      child.stdin?.end();
      if (exited) return resolve(result);
      const teardown = killTree(child, () =>
        options.report({
          origin: 'child',
          source: 'child:codex-probe',
          kind: 'child-exit',
          name: 'ProcessTreeNotEnded',
          message: 'Could not end every process of the Codex capability probe',
        }),
      );
      const waited = setTimeout(() => {
        teardown.abandon();
        resolve(result);
      }, CLOSE_WAIT_MS);
      afterExit = () => {
        clearTimeout(waited);
        resolve(result);
      };
    }

    void (async () => {
      const init = initializeResponse.safeParse(
        await rpc
          .request('initialize', {
            clientInfo: {
              name: 'vernier',
              title: 'Vernier',
              version: options.clientVersion ?? '0.0.0',
            },
            capabilities: null,
          })
          .catch(() => undefined),
      );
      if (!init.success) return finish(undefined);
      rpc.notify('initialized');
      const inventory = await readCodexInventory(rpc, {
        cwd: options.cwd,
        timeoutMs: METHOD_TIMEOUT_MS,
      });
      finish({
        version: AgentVersionSchema.safeParse(codexVersion(init.data.userAgent)).data ?? null,
        ...inventory,
      });
    })();
  });
}

/** `codex --version` → `0.171.0-alpha.13.2` (the last word of `codex-cli 0.171.0-alpha.13.2`). */
export function readCodexVersion(
  program: Program,
  env: NodeJS.ProcessEnv,
  signal?: AbortSignal,
): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      program.command,
      [...program.args, '--version'],
      { env, windowsHide: true, timeout: 10_000, maxBuffer: 64 * 1024, signal },
      (error, stdout) => {
        const word = error ? undefined : String(stdout).trim().split(/\s+/).pop();
        resolve(AgentVersionSchema.safeParse(word).data ?? null);
      },
    );
  });
}

export interface CodexDiscoveryDeps {
  dataDir: string;
  report: (input: ErrorInput) => unknown;
  program: () => Promise<Program | undefined>;
  capabilities: Pick<CapabilityService, 'record' | 'unavailable' | 'lastRead'>;
  clientVersion?: string;
  env?: NodeJS.ProcessEnv;
  probe?: (options: CodexProbeOptions) => Promise<CodexDiscovery | undefined>;
  version?: (
    program: Program,
    env: NodeJS.ProcessEnv,
    signal?: AbortSignal,
  ) => Promise<string | null>;
  now?: () => Date;
}

/** The user's environment minus Electron's own switches. */
function childEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) if (!/^ELECTRON_/i.test(k)) out[k] = v;
  return out;
}

export function createCodexDiscovery(deps: CodexDiscoveryDeps) {
  const now = deps.now ?? (() => new Date());
  const env = childEnv(deps.env ?? process.env);
  const probe = deps.probe ?? probeCodex;
  const version = deps.version ?? readCodexVersion;
  let checked: Promise<void> | undefined;
  /** Set by a session that heard of a change: the next refresh reads even a fresh inventory. */
  let stale = false;
  let warned = false;
  const closing = new AbortController();
  const signal = closing.signal;

  async function run(force: boolean): Promise<void> {
    if (signal.aborted) return;
    const codex = await deps.program();
    if (signal.aborted) return;
    if (!codex) return deps.capabilities.unavailable('codex');
    const last = await deps.capabilities.lastRead('codex');
    if (!force && last?.state === 'ready') {
      const fresh = now().getTime() - Date.parse(last.readAt) < CATALOG_MAX_AGE_MS;
      if (fresh && last.version !== null && last.version === (await version(codex, env, signal)))
        return;
    }
    if (signal.aborted) return;
    const found = await probe({
      codex,
      cwd: deps.dataDir,
      env,
      report: deps.report,
      clientVersion: deps.clientVersion,
      signal,
    });
    if (signal.aborted) return;
    if (!found) {
      if (!warned) {
        warned = true;
        deps.report({
          origin: 'main',
          source: 'capabilities',
          kind: 'capabilities',
          name: 'CodexCapabilitiesUnavailable',
          message: 'Codex did not list what it offers: the capability list keeps the last one',
        });
      }
      return deps.capabilities.unavailable('codex');
    }
    await deps.capabilities.record('codex', {
      version: found.version,
      entries: found.entries,
      kinds: found.kinds,
    });
  }

  /** Reads Codex once per app run (again after `invalidate`), when its answer may have changed. */
  function refresh(): Promise<void> {
    if (!checked) {
      const force = stale;
      stale = false;
      checked = run(force).catch(() => undefined);
    }
    return checked;
  }

  return {
    refresh,
    /**
     * A session heard that skills, apps or MCP servers changed: the next refresh reads again,
     * once the running one (if any) is over. Many notices in a row make one read.
     */
    invalidate(): void {
      if (signal.aborted || stale) return;
      stale = true;
      const current = checked;
      if (!current) return;
      void current.then(() => {
        if (checked === current) checked = undefined;
      });
    },
    async close(): Promise<void> {
      closing.abort();
      await checked;
    },
  };
}
export type CodexDiscoveryService = ReturnType<typeof createCodexDiscovery>;
