// What the installed agent CLIs can do (phase 5h): models, commands, agents, features… read by
// the main process from the CLIs themselves (Claude Code `initialize`, the Codex app-server's
// read-only methods), compared with the last snapshot and published as an inventory with what is
// new, changed or removed since the user last looked.
//
// Everything here comes from a program the app does not control: ids, labels and descriptions
// are bounded, cleaned in the main process (home folders, secrets) and shown as plain text. No
// field of an account (email, organization, plan) is part of these schemas.
import { z } from 'zod';

export const CapabilityAgentSchema = z.enum(['claude', 'codex']);
export type CapabilityAgent = z.infer<typeof CapabilityAgentSchema>;

export const CapabilityKindSchema = z.enum([
  'model',
  'command',
  'agent',
  'output-style',
  'tool',
  'skill',
  'plugin',
  'mcp',
  'hook',
  'app',
  'profile',
  'feature',
  'flag',
  'method',
  /** A protocol capability the CLI announces (Claude `capabilities`, e.g. `ui_surface_v1`). */
  'capability',
]);
export type CapabilityKind = z.infer<typeof CapabilityKindSchema>;

export const MAX_CAPABILITIES_PER_AGENT = 2048;
export const MAX_CAPABILITY_ENTRIES =
  MAX_CAPABILITIES_PER_AGENT * CapabilityAgentSchema.options.length;
export const MAX_CAPABILITY_LABEL = 120;
export const MAX_CAPABILITY_DESCRIPTION = 500;
export const MAX_CAPABILITY_TAGS = 16;

/** Printable, no whitespace: `opus`, `plugin:skill`, `mcp__server__tool`, `ui_surface_v1`. */
export const CapabilityIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[^\s\p{Cc}]+$/u);

/** A CLI version as the CLI reports it: `2.1.326`, `0.171.0-alpha.13.2`. */
export const AgentVersionSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[0-9A-Za-z][0-9A-Za-z.+-]*$/);

const IsoSchema = z.iso.datetime();
const RevisionSchema = z.number().int().nonnegative();

/** One thing an agent can do, as read from its CLI. `kind` + `id` identify it within an agent. */
export const CapabilitySchema = z.strictObject({
  agent: CapabilityAgentSchema,
  kind: CapabilityKindSchema,
  id: CapabilityIdSchema,
  label: z.string().min(1).max(MAX_CAPABILITY_LABEL),
  description: z.string().max(MAX_CAPABILITY_DESCRIPTION).optional(),
  /**
   * Short facts that matter to the user (`effort:high`, `stage:beta`, `enabled`): a change of the
   * label, the description or a tag marks the entry as changed.
   */
  tags: z.array(z.string().min(1).max(64)).max(MAX_CAPABILITY_TAGS),
});
export type Capability = z.infer<typeof CapabilitySchema>;

/**
 * Relative to the last time the user marked the agent's news as seen: `new` appeared after it,
 * `changed` changed after it, `removed` is gone since (kept until seen), `seen` is neither.
 */
export const CapabilityStatusSchema = z.enum(['new', 'changed', 'removed', 'seen']);
export type CapabilityStatus = z.infer<typeof CapabilityStatusSchema>;

export const CapabilityEntrySchema = CapabilitySchema.extend({
  status: CapabilityStatusSchema,
  /** The CLI version and the time the entry was first read. */
  firstSeen: z.strictObject({ version: AgentVersionSchema.nullable(), at: IsoSchema }),
  /** When the entry last appeared, changed or disappeared. */
  changedAt: IsoSchema,
});
export type CapabilityEntry = z.infer<typeof CapabilityEntrySchema>;

export const AgentInventoryStateSchema = z.enum([
  /** Never read on this computer yet. */
  'not-read',
  /** Read from the CLI (`readAt`). */
  'ready',
  /** The CLI was not found, or did not answer, at the last attempt: the entries are the last known. */
  'unavailable',
]);
export const AgentInventorySchema = z.strictObject({
  agent: CapabilityAgentSchema,
  state: AgentInventoryStateSchema,
  /** CLI version of the last successful read. */
  version: AgentVersionSchema.nullable(),
  readAt: IsoSchema.nullable(),
  /** The last "mark as seen"; the first read of an agent counts as seen. */
  seenAt: IsoSchema.nullable(),
});
export type AgentInventory = z.infer<typeof AgentInventorySchema>;

export const CapabilityListSchema = z.strictObject({
  /** Grows with every change of the inventory: `mark-seen` names the revision it was shown. */
  revision: RevisionSchema,
  agents: z.array(AgentInventorySchema).max(CapabilityAgentSchema.options.length),
  entries: z.array(CapabilityEntrySchema).max(MAX_CAPABILITY_ENTRIES),
});
export type CapabilityList = z.infer<typeof CapabilityListSchema>;

/** Only the new revision: the renderer reads the list again (like `errors:changed`). */
export const CapabilitiesChangedSchema = z.strictObject({ revision: RevisionSchema });

export const CapabilityMarkSeenSchema = z.strictObject({
  /** Absent: every agent. */
  agent: CapabilityAgentSchema.optional(),
  /** The revision the user was shown: news that arrived after it are not marked. */
  revision: RevisionSchema,
});
export const CapabilityMarkSeenResultSchema = z.enum([
  'marked',
  /** The inventory changed since `revision`: nothing marked, read the list again. */
  'stale',
]);
export type CapabilityMarkSeenResult = z.infer<typeof CapabilityMarkSeenResultSchema>;
