// The model catalog of a Codex session (phase 5f, ADR 0017/0018): `model/list` of the session's
// own app-server, and the thread's configured model and effort as the defaults.
//
// Unlike Claude's flags, a `turn/start` override lasts for the following turns of the thread too
// ("for this turn and subsequent turns"). So the session always sends an explicit model and
// effort, resolved here: `null` means "back to the CLI's configuration", not "no override".
import { effortSchema, modelIdSchema } from '@control-center/event-schema';
import {
  MAX_AGENT_EFFORTS,
  MAX_AGENT_MODELS,
  type AgentCatalog,
  type AgentConfig,
  type AgentModel,
} from '@control-center/ipc-contract';
import { z } from 'zod';

const NO_CONFIG: AgentConfig = { model: null, effort: null };

/** What the app reads of one `model/list` entry; the rest of the entry is ignored. */
export const codexModelSchema = z.looseObject({
  id: z.string(),
  displayName: z.string().optional(),
  hidden: z.boolean().optional(),
  supportedReasoningEfforts: z.array(z.looseObject({ reasoningEffort: z.string() })).optional(),
  defaultReasoningEffort: z.string().optional(),
});
export const codexModelListSchema = z.looseObject({
  data: z.array(z.unknown()).max(512),
  nextCursor: z.string().max(1024).nullable().optional(),
});

/** One `model/list` entry → a catalog model, or undefined when an id or effort is not safe. */
export function toAgentModel(entry: unknown): AgentModel | undefined {
  const parsed = codexModelSchema.safeParse(entry);
  if (!parsed.success || parsed.data.hidden) return undefined;
  const id = modelIdSchema.safeParse(parsed.data.id);
  if (!id.success) return undefined;
  const efforts = (parsed.data.supportedReasoningEfforts ?? [])
    .map((e) => effortSchema.safeParse(e.reasoningEffort).data)
    .filter((e): e is string => e !== undefined)
    .slice(0, MAX_AGENT_EFFORTS);
  const fallback = effortSchema.safeParse(parsed.data.defaultReasoningEffort).data;
  const defaultEffort = fallback && efforts.includes(fallback) ? fallback : undefined;
  const label = (parsed.data.displayName ?? id.data).replace(/\s+/g, ' ').trim().slice(0, 80);
  return {
    id: id.data,
    label: label || id.data,
    efforts,
    ...(defaultEffort ? { defaultEffort } : {}),
  };
}

/** The thread's configured model and effort, when they are safe to show. */
export function codexDefaults(model: unknown, effort: unknown): AgentConfig {
  return {
    model: modelIdSchema.safeParse(model).data ?? null,
    effort: effortSchema.safeParse(effort).data ?? null,
  };
}

/** What a choice resolves to: the model and effort `turn/start` sends. */
export function resolveCodexConfig(
  config: AgentConfig,
  catalog: Pick<AgentCatalog, 'models' | 'defaults'>,
): { model?: string; effort?: string } {
  const model = config.model ?? catalog.defaults.model ?? undefined;
  const entry = model === undefined ? undefined : catalog.models.find((m) => m.id === model);
  let effort = config.effort ?? undefined;
  if (effort === undefined) {
    // back to the configured effort when the model is the configured one, else the model's own
    const configured = config.model === null || config.model === catalog.defaults.model;
    effort = (configured ? catalog.defaults.effort : null) ?? entry?.defaultEffort;
  }
  return { model, effort };
}

/**
 * Whether a choice is valid: the model it resolves to is in the catalog (or none is named and
 * the configuration names none), and the effort is one that model takes.
 */
export function acceptsCodexConfig(
  config: AgentConfig,
  catalog: Pick<AgentCatalog, 'models' | 'defaults'>,
): boolean {
  if (config.model !== null && !catalog.models.some((m) => m.id === config.model)) return false;
  if (config.effort === null) return true;
  const model = config.model ?? catalog.defaults.model;
  const entry = model === null ? undefined : catalog.models.find((m) => m.id === model);
  return entry !== undefined && entry.efforts.includes(config.effort);
}

/** The session's catalog, with `saved` as the current choice when it is still valid. */
export function codexCatalog(
  models: readonly AgentModel[],
  defaults: AgentConfig,
  saved?: AgentConfig,
): AgentCatalog {
  const base = { models: models.slice(0, MAX_AGENT_MODELS), defaults };
  return { ...base, current: saved && acceptsCodexConfig(saved, base) ? saved : NO_CONFIG };
}
