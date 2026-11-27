// Model and reasoning effort of an agent session (phase 5f, ADR 0017). Shared by every provider
// namespace (`claude`, `codex`): the main process publishes the provider's catalog with each
// session, the renderer picks a model and an effort from it, and the choice applies from the
// next turn. The main process checks every choice against the catalog it published: the renderer
// never names a flag, and a value outside the catalog never reaches a command line.
import { effortSchema, modelIdSchema } from '@control-center/event-schema';
import { z } from 'zod';

export const MAX_AGENT_MODELS = 64;
export const MAX_AGENT_EFFORTS = 8;

/** One model the provider offers, with the efforts it accepts. */
export const AgentModelSchema = z.strictObject({
  id: modelIdSchema,
  label: z.string().min(1).max(80),
  /** Empty: the model takes no effort setting. */
  efforts: z.array(effortSchema).max(MAX_AGENT_EFFORTS),
  defaultEffort: effortSchema.optional(),
});
export type AgentModel = z.infer<typeof AgentModelSchema>;

/**
 * A model and an effort; `null` leaves the choice to the CLI's own configuration (no flag, no
 * per-turn override).
 */
export const AgentConfigSchema = z.strictObject({
  model: modelIdSchema.nullable(),
  effort: effortSchema.nullable(),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/** The catalog of a session: what can be chosen, what the CLI uses by default, what is chosen. */
export const AgentCatalogSchema = z.strictObject({
  models: z.array(AgentModelSchema).max(MAX_AGENT_MODELS),
  /** What the CLI's configuration selects when nothing is chosen, as far as the app can read it. */
  defaults: AgentConfigSchema,
  /** The choice for the next turn. */
  current: AgentConfigSchema,
});
export type AgentCatalog = z.infer<typeof AgentCatalogSchema>;

export const AgentConfigureResultSchema = z.enum([
  /** Stored: the next turn runs with it (a turn already running keeps its own). */
  'applied',
  /** Not in the session's catalog, or an effort the chosen model does not take. */
  'invalid',
  'closed',
]);
export type AgentConfigureResult = z.infer<typeof AgentConfigureResultSchema>;

/**
 * Whether `config` is a valid choice in `catalog`: a known model (or none) and, with an effort,
 * one the model takes. Without a model, the effort must be one some model of the catalog takes.
 */
export function isConfigInCatalog(config: AgentConfig, models: readonly AgentModel[]): boolean {
  const model = config.model === null ? undefined : models.find((m) => m.id === config.model);
  if (config.model !== null && !model) return false;
  if (config.effort === null) return true;
  return model
    ? model.efforts.includes(config.effort)
    : models.some((m) => m.efforts.includes(config.effort as string));
}
