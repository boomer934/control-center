// What the installed Claude Code offers (phase 5h): its answer to the `initialize` control request
// of stream-json (the one the Agent SDK sends), read by a short probe without a prompt, so no
// model is called and no token is spent.
//
// The answer lists the models with their own efforts, the commands, agents, output styles and
// protocol capabilities. It also carries the account (email, organization): the schemas below
// keep only the named fields, so nothing else of the answer leaves this file.
import { randomUUID } from 'node:crypto';
import { open, type FileHandle } from 'node:fs/promises';
import type { ErrorInput } from '@control-center/app-log';
import { effortSchema } from '@control-center/event-schema';
import {
  AgentModelSchema,
  AgentVersionSchema,
  MAX_AGENT_EFFORTS,
  MAX_AGENT_MODELS,
  type AgentModel,
  type Capability,
  type CapabilityKind,
} from '@control-center/ipc-contract';
import { z } from 'zod';
import { superviseChild } from '../errors/children';
import { capabilityText, makeCapability } from '../capabilities/inventory';
import { writeJsonAtomic } from '../capabilities/service';
import type { Program } from './cli';
import { killTree } from './kill-tree';
import { CLAUDE_EFFORTS, readLimited, safeModelId } from './models';

const initModelSchema = z.object({
  value: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  supportsEffort: z.boolean().optional(),
  supportedEffortLevels: z.array(z.unknown()).max(32).optional(),
});
const initNamedSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  argumentHint: z.string().optional(),
});

/** The fields of the `initialize` answer the app reads; any other field is dropped by zod. */
export const claudeInitializeSchema = z.object({
  models: z.array(z.unknown()).max(512).optional(),
  commands: z.array(z.unknown()).max(4096).optional(),
  agents: z.array(z.unknown()).max(1024).optional(),
  available_output_styles: z.array(z.unknown()).max(256).optional(),
  capabilities: z.array(z.unknown()).max(1024).optional(),
  claude_code_version: z.string().max(64).optional(),
});
const controlResponseSchema = z.object({
  type: z.literal('control_response'),
  response: z.object({
    subtype: z.literal('success'),
    request_id: z.string().max(256),
    response: z.unknown(),
  }),
});

export interface ClaudeDiscovery {
  version: string | null;
  /** Empty when the answer listed no model the app can offer. */
  models: AgentModel[];
  capabilities: Capability[];
  /** The kinds the answer listed (a field present): only those can have removed entries. */
  kinds: CapabilityKind[];
}

const each = <T>(items: readonly unknown[] | undefined, schema: z.ZodType<T>): T[] =>
  (items ?? []).flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });

/**
 * The catalog models of an answer. `default` is not a model: it is what the CLI runs with no
 * `--model`, which the chat already offers. A model without `supportsEffort` takes no effort.
 */
function toModels(models: z.infer<typeof initModelSchema>[]): AgentModel[] {
  const out: AgentModel[] = [];
  for (const m of models) {
    if (m.value === 'default' || out.length >= MAX_AGENT_MODELS) continue;
    const id = safeModelId(m.value);
    if (id === null || out.some((o) => o.id === id)) continue;
    const listed = (m.supportedEffortLevels ?? [])
      .map((e) => effortSchema.safeParse(e).data)
      .filter((e): e is string => e !== undefined);
    const efforts = m.supportsEffort
      ? [...new Set(listed.length > 0 ? listed : CLAUDE_EFFORTS)].slice(0, MAX_AGENT_EFFORTS)
      : [];
    const label = (m.displayName && capabilityText(m.displayName, 80)) || id;
    const model = AgentModelSchema.safeParse({ id, label, efforts }).data;
    if (model) out.push(model);
  }
  return out;
}

/** An answer to `initialize` → what the app offers and shows; undefined when it is not one. */
export function parseClaudeInitialize(value: unknown): ClaudeDiscovery | undefined {
  const parsed = claudeInitializeSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const init = parsed.data;
  const models = each(init.models, initModelSchema);
  const catalog = toModels(models);
  const capabilities: (Capability | undefined)[] = [
    // only the models the chat can offer: the same checks, the same first entry of an id
    ...catalog.map((model) =>
      makeCapability('claude', {
        kind: 'model',
        id: model.id,
        label: model.label,
        description: models.find((m) => m.value === model.id)?.description,
        tags: model.efforts.map((e) => `effort:${e}`),
      }),
    ),
    ...each(init.commands, initNamedSchema).map((c) =>
      makeCapability('claude', {
        kind: 'command',
        id: c.name,
        label: `/${c.name}${c.argumentHint ? ` ${c.argumentHint}` : ''}`,
        description: c.description,
      }),
    ),
    ...each(init.agents, initNamedSchema).map((a) =>
      makeCapability('claude', { kind: 'agent', id: a.name, description: a.description }),
    ),
    ...(init.available_output_styles ?? []).map((s) =>
      makeCapability('claude', { kind: 'output-style', id: s }),
    ),
    ...(init.capabilities ?? []).map((c) =>
      makeCapability('claude', { kind: 'capability', id: c }),
    ),
  ];
  const listed: [CapabilityKind, unknown][] = [
    ['model', init.models],
    ['command', init.commands],
    ['agent', init.agents],
    ['output-style', init.available_output_styles],
    ['capability', init.capabilities],
  ];
  return {
    version: AgentVersionSchema.safeParse(init.claude_code_version).data ?? null,
    models: catalog,
    capabilities: capabilities.filter((c): c is Capability => c !== undefined),
    kinds: listed.filter(([, field]) => field !== undefined).map(([kind]) => kind),
  };
}

// ── the `system/init` line of a chat session ──
//
// Each run of a session starts with this line: the tools (MCP tools included, as
// `mcp__server__tool`), the MCP servers with their status, the plugins and, in newer versions,
// the skills. They depend on the workspace (its `.mcp.json`, its skills), so they go to the
// inventory as an additive read: added or updated, never removed by a session that lacks them.

const initNameSchema = z.union([
  z.string(),
  z.object({ name: z.string(), status: z.string().max(32).optional() }),
]);
export const claudeInitLineSchema = z.object({
  tools: z.array(z.unknown()).max(4096).optional(),
  mcp_servers: z.array(z.unknown()).max(512).optional(),
  plugins: z.array(z.unknown()).max(1024).optional(),
  skills: z.array(z.unknown()).max(4096).optional(),
  claude_code_version: z.string().max(64).optional(),
});

/** A `system/init` line → the session's tools, MCP servers, plugins and skills. */
export function parseClaudeInitLine(
  line: unknown,
): { version: string | null; entries: Capability[]; kinds: CapabilityKind[] } | undefined {
  const parsed = claudeInitLineSchema.safeParse(line);
  if (!parsed.success) return undefined;
  const init = parsed.data;
  const named = (items: readonly unknown[] | undefined) =>
    each(items, initNameSchema).map((n) => (typeof n === 'string' ? { name: n } : n));
  const fields: [CapabilityKind, readonly unknown[] | undefined][] = [
    ['tool', init.tools],
    ['mcp', init.mcp_servers],
    ['plugin', init.plugins],
    ['skill', init.skills],
  ];
  const entries = fields.flatMap(([kind, items]) =>
    named(items).map((n) =>
      makeCapability('claude', {
        kind,
        id: n.name,
        tags: kind === 'tool' && n.name.startsWith('mcp__') ? ['mcp'] : [],
      }),
    ),
  );
  return {
    version: AgentVersionSchema.safeParse(init.claude_code_version).data ?? null,
    entries: entries.filter((c): c is Capability => c !== undefined),
    kinds: fields.filter(([, items]) => items !== undefined).map(([kind]) => kind),
  };
}

export const PROBE_TIMEOUT_MS = 30_000;
/** How long the probe waits for its process tree to end once it has the answer. */
const CLOSE_WAIT_MS = 5000;
/**
 * All the probe reads of stdout, every line included: the answer is one line of about 100 KB with
 * 130 commands, far below this.
 */
export const MAX_PROBE_OUTPUT_CHARS = 4 * 1024 * 1024;

export interface ProbeOptions {
  claude: Program;
  /** Where the probe runs: a folder of the app, never a workspace. */
  cwd: string;
  env: NodeJS.ProcessEnv;
  report: (input: ErrorInput) => unknown;
  timeoutMs?: number;
  /** Aborted when the app quits: the probe ends its process tree and answers undefined. */
  signal?: AbortSignal;
}

/**
 * Starts `claude -p` in stream-json, sends only `initialize` and ends the process tree once the
 * answer arrives (or after `timeoutMs`). Undefined when no valid answer came.
 */
export function probeClaude(options: ProbeOptions): Promise<ClaudeDiscovery | undefined> {
  const requestId = randomUUID();
  if (options.signal?.aborted) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let settled = false;
    let output = '';
    let received = 0;
    let ended = false;
    const child = superviseChild({
      name: 'claude-probe',
      command: options.claude.command,
      args: [
        ...options.claude.args,
        '-p',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--verbose',
      ],
      cwd: options.cwd,
      env: options.env,
      stdin: true,
      expectedExit: () => ended,
      report: options.report,
      onStdout(chunk) {
        if (settled) return;
        received += chunk.length;
        if (received > MAX_PROBE_OUTPUT_CHARS) return finish(undefined);
        output += chunk;
        let nl: number;
        while ((nl = output.indexOf('\n')) >= 0) {
          const line = output.slice(0, nl);
          output = output.slice(nl + 1);
          const answer = readAnswer(line, requestId);
          if (answer !== null) return finish(answer);
        }
      },
    });
    const timer = setTimeout(() => finish(undefined), options.timeoutMs ?? PROBE_TIMEOUT_MS);
    const onAbort = () => finish(undefined);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    let exited = false;
    let afterExit: (() => void) | undefined;
    const onExit = () => {
      exited = true;
      finish(undefined);
      afterExit?.();
    };
    child.on('close', onExit);
    child.on('error', () => {
      // never started: there is no 'close' to wait for
      exited = true;
      finish(undefined);
      afterExit?.();
    });
    /** Ends the process tree, then answers once it is gone (or the teardown gave up). */
    function finish(result: ClaudeDiscovery | undefined) {
      if (settled) return;
      settled = true;
      ended = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      child.stdin?.end();
      if (exited) return resolve(result);
      const teardown = killTree(child, () =>
        options.report({
          origin: 'child',
          source: 'child:claude-probe',
          kind: 'child-exit',
          name: 'ProcessTreeNotEnded',
          message: 'Could not end every process of the Claude catalog probe',
        }),
      );
      const waited = setTimeout(() => {
        // nothing of the teardown outlives the probe: a late taskkill could name a reused PID
        teardown.abandon();
        resolve(result);
      }, CLOSE_WAIT_MS);
      afterExit = () => {
        clearTimeout(waited);
        resolve(result);
      };
    }
    child.stdin?.on('error', () => finish(undefined));
    child.stdin?.write(
      `${JSON.stringify({ type: 'control_request', request_id: requestId, request: { subtype: 'initialize' } })}\n`,
    );
  });
}

/** null: not the answer (another line); undefined: the answer, but not a valid one. */
function readAnswer(line: string, requestId: string): ClaudeDiscovery | undefined | null {
  if (!line.includes('control_response')) return null;
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  const response = controlResponseSchema.safeParse(value);
  if (!response.success || response.data.response.request_id !== requestId) return null;
  return parseClaudeInitialize(response.data.response.response);
}

// ── the last known catalog, for the first sessions of the next start ──

export const MAX_CATALOG_BYTES = 256 * 1024;
const CatalogCacheSchema = z.strictObject({
  v: z.literal(1),
  claude: z.strictObject({
    version: AgentVersionSchema.nullable(),
    readAt: z.iso.datetime(),
    models: z.array(AgentModelSchema).max(MAX_AGENT_MODELS),
  }),
});
export type ClaudeCatalogCache = z.infer<typeof CatalogCacheSchema>['claude'];

/** `<userData>/agent-catalog.json`, when present and valid. */
export async function readCatalogCache(file: string): Promise<ClaudeCatalogCache | undefined> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(file, 'r');
    const text = await readLimited(handle, MAX_CATALOG_BYTES);
    return text === undefined
      ? undefined
      : CatalogCacheSchema.safeParse(JSON.parse(text)).data?.claude;
  } catch {
    return undefined;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export function writeCatalogCache(file: string, claude: ClaudeCatalogCache): Promise<void> {
  return writeJsonAtomic(file, CatalogCacheSchema.parse({ v: 1, claude }));
}
