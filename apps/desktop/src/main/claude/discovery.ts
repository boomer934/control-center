// When the app asks Claude Code what it offers (phase 5h). The probe (./catalog.ts) runs at most
// once per app run, and only when it is useful: the CLI version differs from the last read, or
// the last read is older than a day (new skills or plugins of the user). Nothing runs at startup:
// the first Claude session or the first look at the capability list starts it.
//
// The models found are the catalog of the next sessions and are kept in
// `<userData>/agent-catalog.json`, so a later start offers them before any probe; the whole
// answer goes to the capability inventory.
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import type { ErrorInput } from '@control-center/app-log';
import { AgentVersionSchema, type AgentModel } from '@control-center/ipc-contract';
import type { CapabilityService } from '../capabilities/service';
import {
  probeClaude,
  readCatalogCache,
  writeCatalogCache,
  type ClaudeDiscovery,
  type ProbeOptions,
} from './catalog';
import type { Program } from './cli';

export const CATALOG_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** How long a session start waits for a first probe before it falls back to the fixed list. */
export const FIRST_CATALOG_WAIT_MS = 10_000;

export interface ClaudeDiscoveryDeps {
  dataDir: string;
  report: (input: ErrorInput) => unknown;
  program: () => Promise<Program | undefined>;
  capabilities: Pick<CapabilityService, 'record' | 'unavailable' | 'lastRead'>;
  env?: NodeJS.ProcessEnv;
  probe?: (options: ProbeOptions) => Promise<ClaudeDiscovery | undefined>;
  version?: (program: Program, env: NodeJS.ProcessEnv) => Promise<string | null>;
  now?: () => Date;
  firstWaitMs?: number;
}

/** `claude --version` → `2.1.326`, or null when it cannot be read. */
export function readClaudeVersion(
  program: Program,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      program.command,
      [...program.args, '--version'],
      { env, windowsHide: true, timeout: 10_000, maxBuffer: 64 * 1024 },
      (error, stdout) => {
        const word = error ? undefined : /^\s*(\S+)/.exec(String(stdout))?.[1];
        resolve(AgentVersionSchema.safeParse(word).data ?? null);
      },
    );
  });
}

/** The user's environment minus Electron's own switches. */
function childEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) if (!/^ELECTRON_/i.test(k)) out[k] = v;
  return out;
}

export function createClaudeDiscovery(deps: ClaudeDiscoveryDeps) {
  const cacheFile = join(deps.dataDir, 'agent-catalog.json');
  const now = deps.now ?? (() => new Date());
  const env = childEnv(deps.env ?? process.env);
  const probe = deps.probe ?? probeClaude;
  const version = deps.version ?? readClaudeVersion;
  let models: AgentModel[] | undefined;
  const loaded = readCatalogCache(cacheFile).then((cache) => {
    if (cache && cache.models.length > 0) models ??= cache.models;
  });
  let checked: Promise<void> | undefined;
  let warned = false;

  async function run(): Promise<void> {
    const claude = await deps.program();
    if (!claude) return deps.capabilities.unavailable('claude');
    const last = await deps.capabilities.lastRead('claude');
    if (last && models) {
      const fresh = now().getTime() - Date.parse(last.readAt) < CATALOG_MAX_AGE_MS;
      if (fresh && last.version !== null && last.version === (await version(claude, env))) return;
    }
    const found = await probe({ claude, cwd: deps.dataDir, env, report: deps.report });
    if (!found) {
      if (!warned) {
        warned = true;
        deps.report({
          origin: 'main',
          source: 'claude',
          kind: 'claude-setup',
          name: 'ClaudeCatalogUnavailable',
          message:
            'Claude Code did not list its models: the chat offers the built-in list until it does',
        });
      }
      return deps.capabilities.unavailable('claude');
    }
    if (found.models.length > 0) {
      models = found.models;
      await writeCatalogCache(cacheFile, {
        version: found.version,
        readAt: now().toISOString(),
        models: found.models,
      }).catch(() => undefined);
    }
    await deps.capabilities.record('claude', found.version, found.capabilities);
  }

  /** Reads the CLI once per app run, when its answer may have changed. */
  function refresh(): Promise<void> {
    checked ??= loaded.then(run).catch(() => undefined);
    return checked;
  }

  return {
    refresh,
    /**
     * The models of the next session: the ones found, else the last known ones (a refresh starts
     * in the background), else a first probe, waited for a bounded time. Undefined: none known.
     */
    async models(): Promise<AgentModel[] | undefined> {
      await loaded;
      const pending = refresh();
      if (!models) {
        let timer: NodeJS.Timeout | undefined;
        await Promise.race([
          pending,
          new Promise((r) => (timer = setTimeout(r, deps.firstWaitMs ?? FIRST_CATALOG_WAIT_MS))),
        ]);
        clearTimeout(timer);
      }
      return models;
    },
  };
}
export type ClaudeDiscoveryService = ReturnType<typeof createClaudeDiscovery>;
