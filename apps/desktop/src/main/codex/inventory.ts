// What the installed Codex offers (phase 5h.2), read from the app-server with read-only methods
// only (./methods.ts): models, experimental features, skills, hooks, installed plugins, MCP
// servers and their tools, the provider's capabilities and the permission profiles.
//
// The inventory describes the agent, not a workspace: the probe runs in a folder of the app,
// skills of a repository and hooks of a project are left out, so opening another workspace does
// not make entries come and go. A method that fails or answers out of shape says nothing about
// its kind: that kind is left out of `kinds`, and its last known entries stay.
//
// `plugin/list` and `app/list` are not called: they ask OpenAI's servers and took more than 20 s
// in the test of 2026-11-27 (CLI 0.171.0-alpha.13.2). `plugin/installed` is local.
import type { Capability, CapabilityKind } from '@control-center/ipc-contract';
import { z } from 'zod';
import { makeCapability } from '../capabilities/inventory';
import type { CodexInventoryMethod } from './methods';
import { toAgentModel } from './models';
import type { RpcClient } from './rpc';

const text = z.string().max(64 * 1024);
const optionalText = text.nullable().optional();
/** At most this many pages of a paged list (`nextCursor`). */
const MAX_PAGES = 8;

const pagedSchema = z.looseObject({
  data: z.array(z.unknown()).max(4096),
  nextCursor: z.string().max(1024).nullable().optional(),
});
const listSchema = z.looseObject({ data: z.array(z.unknown()).max(4096) });

const featureSchema = z.looseObject({
  name: z.string(),
  stage: z.string().max(64),
  enabled: z.boolean(),
  displayName: optionalText,
  description: optionalText,
  announcement: optionalText,
});
const skillEntrySchema = z.looseObject({ skills: z.array(z.unknown()).max(4096) });
const skillSchema = z.looseObject({
  name: z.string(),
  description: optionalText,
  shortDescription: optionalText,
  enabled: z.boolean(),
  scope: z.string().max(32),
  interface: z.looseObject({ displayName: optionalText }).nullable().optional(),
});
const hookEntrySchema = z.looseObject({ hooks: z.array(z.unknown()).max(1024) });
const hookSchema = z.looseObject({
  eventName: z.string().max(128),
  handlerType: z.string().max(32),
  source: z.string().max(32).optional(),
  command: optionalText,
  server: optionalText,
  tool: optionalText,
  enabled: z.boolean().optional(),
});
const pluginsSchema = z.looseObject({
  marketplaces: z.array(z.looseObject({ plugins: z.array(z.unknown()).max(4096) })).max(256),
});
const pluginSchema = z.looseObject({
  id: z.string(),
  name: z.string().max(256),
  installed: z.boolean(),
  enabled: z.boolean(),
  interface: z
    .looseObject({ displayName: optionalText, shortDescription: optionalText })
    .nullable()
    .optional(),
});
const mcpServerSchema = z.looseObject({
  name: z.string(),
  authStatus: z.string().max(32).optional(),
  serverInfo: z
    .looseObject({ title: optionalText, description: optionalText })
    .nullable()
    .optional(),
  tools: z.record(z.string(), z.unknown()).optional(),
});
const mcpToolSchema = z.looseObject({ title: optionalText, description: optionalText });
const providerSchema = z.record(z.string().max(128), z.unknown());
const profileSchema = z.looseObject({
  id: z.string(),
  description: optionalText,
  allowed: z.boolean().optional(),
});

const each = <T>(items: readonly unknown[], schema: z.ZodType<T>): T[] =>
  items.flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
const codex = (input: Parameters<typeof makeCapability>[1]) => makeCapability('codex', input);
const onOff = (enabled: boolean | undefined) =>
  enabled === undefined ? [] : [enabled ? 'enabled' : 'disabled'];

/** `model/list` pages → the models, with their efforts as tags. */
export function codexModelCapabilities(entries: readonly unknown[]): (Capability | undefined)[] {
  return entries.map((entry) => {
    const model = toAgentModel(entry);
    return model
      ? codex({
          kind: 'model',
          id: model.id,
          label: model.label,
          tags: model.efforts.map((e) => `effort:${e}`),
        })
      : undefined;
  });
}

/** `experimentalFeature/list` → features with their stage; the announcement when there is no description. */
export function codexFeatureCapabilities(entries: readonly unknown[]): (Capability | undefined)[] {
  return each(entries, featureSchema).map((f) =>
    codex({
      kind: 'feature',
      id: f.name,
      label: f.displayName || f.name,
      description: f.description || f.announcement || undefined,
      tags: [`stage:${f.stage}`, ...onOff(f.enabled)],
    }),
  );
}

/** `skills/list` → the skills of the user, the system and the admin (not those of a repository). */
export function codexSkillCapabilities(value: unknown): (Capability | undefined)[] {
  const entries = listSchema.safeParse(value).data?.data ?? [];
  return each(entries, skillEntrySchema).flatMap((entry) =>
    each(entry.skills, skillSchema)
      .filter((s) => s.scope !== 'repo')
      .map((s) =>
        codex({
          kind: 'skill',
          id: s.name,
          label: s.interface?.displayName || s.name,
          description: s.shortDescription || s.description || undefined,
          tags: [`scope:${s.scope}`, ...onOff(s.enabled)],
        }),
      ),
  );
}

/**
 * `hooks/list` → the user's hooks (not a project's). The id is the event and its position, never
 * the path of the hooks file; the command is shown as text, cleaned like every description.
 */
export function codexHookCapabilities(value: unknown): (Capability | undefined)[] {
  const entries = listSchema.safeParse(value).data?.data ?? [];
  const count = new Map<string, number>();
  return each(entries, hookEntrySchema).flatMap((entry) =>
    each(entry.hooks, hookSchema)
      .filter((h) => h.source === undefined || h.source === 'user')
      .map((h) => {
        const n = count.get(h.eventName) ?? 0;
        count.set(h.eventName, n + 1);
        const target =
          h.handlerType === 'mcpTool' && h.server && h.tool ? `${h.server}/${h.tool}` : h.command;
        return codex({
          kind: 'hook',
          id: `${h.eventName}:${n}`,
          label: `${h.eventName} (${h.handlerType})`,
          description: target ?? undefined,
          tags: onOff(h.enabled),
        });
      }),
  );
}

/** `plugin/installed` → the plugins that are installed, from every marketplace. */
export function codexPluginCapabilities(value: unknown): (Capability | undefined)[] {
  const marketplaces = pluginsSchema.safeParse(value).data?.marketplaces ?? [];
  return marketplaces.flatMap((m) =>
    each(m.plugins, pluginSchema)
      .filter((p) => p.installed)
      .map((p) =>
        codex({
          kind: 'plugin',
          id: p.id,
          label: p.interface?.displayName || p.name,
          description: p.interface?.shortDescription ?? undefined,
          tags: onOff(p.enabled),
        }),
      ),
  );
}

/** `mcpServerStatus/list` pages → each server, and each of its tools as `mcp__server__tool`. */
export function codexMcpCapabilities(entries: readonly unknown[]): (Capability | undefined)[] {
  return each(entries, mcpServerSchema).flatMap((server) => {
    const tools = Object.entries(server.tools ?? {});
    return [
      codex({
        kind: 'mcp',
        id: server.name,
        label: server.serverInfo?.title || server.name,
        description: server.serverInfo?.description ?? undefined,
        tags: [
          ...(server.authStatus ? [`auth:${server.authStatus}`] : []),
          `tools:${tools.length}`,
        ],
      }),
      ...tools.map(([name, raw]) => {
        const tool = mcpToolSchema.safeParse(raw).data;
        return codex({
          kind: 'tool',
          id: `mcp__${server.name}__${name}`,
          label: tool?.title || name,
          description: tool?.description ?? undefined,
          tags: [`mcp:${server.name}`],
        });
      }),
    ];
  });
}

/** `modelProvider/capabilities/read` → each capability the provider has (`webSearch`…). */
export function codexProviderCapabilities(value: unknown): (Capability | undefined)[] {
  const flags = providerSchema.safeParse(value).data ?? {};
  return Object.entries(flags)
    .filter(([, on]) => on === true)
    .map(([name]) => codex({ kind: 'capability', id: name }));
}

/** `permissionProfile/list` → the profiles, with whether the user may pick them. */
export function codexProfileCapabilities(entries: readonly unknown[]): (Capability | undefined)[] {
  return each(entries, profileSchema).map((p) =>
    codex({
      kind: 'profile',
      id: p.id,
      description: p.description ?? undefined,
      tags: p.allowed === undefined ? [] : [p.allowed ? 'allowed' : 'not-allowed'],
    }),
  );
}

export interface CodexInventory {
  entries: Capability[];
  /** The kinds whose method answered in shape: only those can have removed entries. */
  kinds: CapabilityKind[];
}

type Request = Pick<RpcClient, 'request'>;

/** Every page of a paged list, or undefined when the first page failed. */
async function pages(
  rpc: Request,
  method: CodexInventoryMethod,
  params: object,
  timeoutMs: number,
): Promise<unknown[] | undefined> {
  const out: unknown[] = [];
  let cursor: string | null | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const value = await rpc
      .request(method, cursor ? { ...params, cursor } : params, timeoutMs)
      .catch(() => undefined);
    const list = pagedSchema.safeParse(value);
    if (!list.success) return page === 0 ? undefined : out;
    out.push(...list.data.data);
    cursor = list.data.nextCursor;
    if (!cursor) break;
  }
  return out;
}

const once = (rpc: Request, method: CodexInventoryMethod, params: object, timeoutMs: number) =>
  rpc.request(method, params, timeoutMs).then(
    (value) => ({ value }),
    () => undefined,
  );

/**
 * Reads the inventory from an initialized app-server, one method after the other (the server
 * answers in order; a slow method delays the others but never blocks them past its timeout).
 */
export async function readCodexInventory(
  rpc: Request,
  options: { cwd: string; timeoutMs: number },
): Promise<CodexInventory> {
  const { timeoutMs } = options;
  const entries: (Capability | undefined)[] = [];
  const kinds: CapabilityKind[] = [];
  const add = (covered: CapabilityKind[], found: (Capability | undefined)[] | undefined) => {
    if (found === undefined) return;
    kinds.push(...covered.filter((k) => !kinds.includes(k)));
    entries.push(...found);
  };
  const listed = (value: { value: unknown } | undefined, schema: z.ZodType) =>
    value !== undefined && schema.safeParse(value.value).success ? value.value : undefined;
  const map = <T>(value: T | undefined, f: (v: T) => (Capability | undefined)[]) =>
    value === undefined ? undefined : f(value);

  add(['model'], map(await pages(rpc, 'model/list', {}, timeoutMs), codexModelCapabilities));
  add(
    ['feature'],
    map(await pages(rpc, 'experimentalFeature/list', {}, timeoutMs), codexFeatureCapabilities),
  );
  const cwds = { cwds: [options.cwd] };
  add(
    ['skill'],
    map(
      listed(await once(rpc, 'skills/list', cwds, timeoutMs), listSchema),
      codexSkillCapabilities,
    ),
  );
  add(
    ['hook'],
    map(listed(await once(rpc, 'hooks/list', cwds, timeoutMs), listSchema), codexHookCapabilities),
  );
  add(
    ['plugin'],
    map(
      listed(await once(rpc, 'plugin/installed', cwds, timeoutMs), pluginsSchema),
      codexPluginCapabilities,
    ),
  );
  add(
    ['mcp', 'tool'],
    map(
      await pages(rpc, 'mcpServerStatus/list', { detail: 'toolsAndAuthOnly' }, timeoutMs),
      codexMcpCapabilities,
    ),
  );
  add(
    ['capability'],
    map(
      listed(await once(rpc, 'modelProvider/capabilities/read', {}, timeoutMs), providerSchema),
      codexProviderCapabilities,
    ),
  );
  add(
    ['profile'],
    map(await pages(rpc, 'permissionProfile/list', {}, timeoutMs), codexProfileCapabilities),
  );
  return { entries: entries.filter((c): c is Capability => c !== undefined), kinds };
}
