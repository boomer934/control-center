// The capability inventory of the agents (phase 5h): what each CLI said it can do at its last
// read, compared with the snapshot of the reads before it. Pure functions: the service
// (./service.ts) keeps the snapshot in `<userData>/capabilities.json` and publishes it.
//
// Every entry starts as untrusted text from a CLI: `makeCapability` is the only way in. It drops
// an id that is not printable or looks like a credential, cleans label and description (home
// folders become `~`, secrets are redacted, whitespace collapsed) and bounds every field.
import { makeTextCleaner } from '@control-center/event-schema';
import {
  AgentVersionSchema,
  CapabilityAgentSchema,
  CapabilityIdSchema,
  CapabilitySchema,
  MAX_CAPABILITIES_PER_AGENT,
  MAX_CAPABILITY_DESCRIPTION,
  MAX_CAPABILITY_LABEL,
  MAX_CAPABILITY_TAGS,
  type AgentInventory,
  type Capability,
  type CapabilityAgent,
  type CapabilityEntry,
  type CapabilityKind,
  type CapabilityList,
  type CapabilityMarkSeenResult,
} from '@control-center/ipc-contract';
import { z } from 'zod';

const clean = makeTextCleaner('');

/** One line of plain text, at most `max` characters (an ellipsis marks a cut). */
export function capabilityText(value: string, max: number): string {
  const text = clean(value).replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export interface CapabilityInput {
  kind: CapabilityKind;
  id: unknown;
  label?: unknown;
  description?: unknown;
  tags?: readonly unknown[];
}

/** A capability that may leave the main process, or undefined when its id is not safe. */
export function makeCapability(
  agent: CapabilityAgent,
  input: CapabilityInput,
): Capability | undefined {
  const id = CapabilityIdSchema.safeParse(input.id).data;
  if (id === undefined || clean(id) !== id) return undefined;
  const label =
    (typeof input.label === 'string' ? capabilityText(input.label, MAX_CAPABILITY_LABEL) : '') ||
    capabilityText(id, MAX_CAPABILITY_LABEL);
  const description =
    typeof input.description === 'string'
      ? capabilityText(input.description, MAX_CAPABILITY_DESCRIPTION)
      : '';
  const tags = [
    ...new Set(
      (input.tags ?? [])
        .filter((t): t is string => typeof t === 'string')
        .map((t) => capabilityText(t, 64))
        .filter(Boolean),
    ),
  ].slice(0, MAX_CAPABILITY_TAGS);
  return CapabilitySchema.safeParse({
    agent,
    kind: input.kind,
    id,
    label,
    ...(description ? { description } : {}),
    tags,
  }).data;
}

// ── the snapshot ────────────────────────────────────────────────────────────

const IsoSchema = z.iso.datetime();

const StoredEntrySchema = CapabilitySchema.extend({
  firstSeen: z.strictObject({ version: AgentVersionSchema.nullable(), at: IsoSchema }),
  changedAt: IsoSchema,
  /** Set while the entry is gone; dropped with the entry once the user has seen it. */
  removedAt: IsoSchema.optional(),
});
type StoredEntry = z.infer<typeof StoredEntrySchema>;

const StoredAgentSchema = z.strictObject({
  agent: CapabilityAgentSchema,
  state: z.enum(['ready', 'unavailable']),
  version: AgentVersionSchema.nullable(),
  readAt: IsoSchema.nullable(),
  seenAt: IsoSchema.nullable(),
});

export const CapabilitySnapshotSchema = z.strictObject({
  v: z.literal(1),
  revision: z.number().int().nonnegative(),
  agents: z.array(StoredAgentSchema).max(CapabilityAgentSchema.options.length),
  entries: z
    .array(StoredEntrySchema)
    .max(MAX_CAPABILITIES_PER_AGENT * CapabilityAgentSchema.options.length),
});
export type CapabilitySnapshot = z.infer<typeof CapabilitySnapshotSchema>;

export const EMPTY_SNAPSHOT: CapabilitySnapshot = { v: 1, revision: 0, agents: [], entries: [] };

const key = (e: Pick<Capability, 'agent' | 'kind' | 'id'>) =>
  `${e.agent}\u0000${e.kind}\u0000${e.id}`;
const signature = (e: Pick<Capability, 'label' | 'description' | 'tags'>) =>
  JSON.stringify([e.label, e.description ?? '', e.tags]);
const order = (a: Capability, b: Capability) =>
  a.agent.localeCompare(b.agent) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);
const capability = ({ agent, kind, id, label, description, tags }: Capability): Capability => ({
  agent,
  kind,
  id,
  label,
  ...(description === undefined ? {} : { description }),
  tags,
});

/**
 * The snapshot after a successful read of `agent`: entries it did not have are new, entries whose
 * text or tags differ are changed, entries the read lacks are removed. The first read of an agent
 * is the baseline: it counts as seen, so a fresh install does not show hundreds of novelties.
 */
export function applyRead(
  snapshot: CapabilitySnapshot,
  agent: CapabilityAgent,
  version: string | null,
  read: readonly Capability[],
  now: Date,
): CapabilitySnapshot {
  const at = now.toISOString();
  const safeVersion = AgentVersionSchema.safeParse(version).data ?? null;
  const previous = new Map(
    snapshot.entries.filter((e) => e.agent === agent).map((e) => [key(e), e]),
  );
  const incoming = new Map<string, Capability>();
  for (const c of read) {
    if (c.agent !== agent || incoming.has(key(c))) continue;
    if (incoming.size >= MAX_CAPABILITIES_PER_AGENT) break;
    incoming.set(key(c), c);
  }

  const entries: StoredEntry[] = [];
  for (const [k, c] of incoming) {
    const old = previous.get(k);
    if (!old) {
      entries.push({ ...capability(c), firstSeen: { version: safeVersion, at }, changedAt: at });
    } else if (old.removedAt !== undefined || signature(old) !== signature(c)) {
      // back after a removal, or different: changed now, first seen when it first appeared
      entries.push({ ...capability(c), firstSeen: old.firstSeen, changedAt: at });
    } else {
      entries.push(old);
    }
  }
  for (const [k, old] of previous) {
    if (incoming.has(k)) continue;
    entries.push(old.removedAt === undefined ? { ...old, removedAt: at, changedAt: at } : old);
  }

  const record = snapshot.agents.find((a) => a.agent === agent);
  const agents = [
    ...snapshot.agents.filter((a) => a.agent !== agent),
    {
      agent,
      state: 'ready' as const,
      version: safeVersion,
      readAt: at,
      // the first read is the baseline
      seenAt: record?.readAt ? record.seenAt : at,
    },
  ].sort((a, b) => a.agent.localeCompare(b.agent));

  return {
    v: 1,
    revision: snapshot.revision + 1,
    agents,
    entries: [...snapshot.entries.filter((e) => e.agent !== agent), ...entries].sort(order),
  };
}

/** The CLI of `agent` was not found or did not answer: its last known entries stay. */
export function markUnavailable(
  snapshot: CapabilitySnapshot,
  agent: CapabilityAgent,
): CapabilitySnapshot {
  const record = snapshot.agents.find((a) => a.agent === agent);
  if (record?.state === 'unavailable') return snapshot;
  const next = record
    ? { ...record, state: 'unavailable' as const }
    : { agent, state: 'unavailable' as const, version: null, readAt: null, seenAt: null };
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    agents: [...snapshot.agents.filter((a) => a.agent !== agent), next].sort((a, b) =>
      a.agent.localeCompare(b.agent),
    ),
  };
}

/**
 * Marks the news of `agent` (or of every agent) as seen, only if the user was shown the current
 * revision: news that arrived after it stay new. Removed entries are dropped once seen.
 */
export function markSeen(
  snapshot: CapabilitySnapshot,
  agent: CapabilityAgent | undefined,
  revision: number,
  now: Date,
): { snapshot: CapabilitySnapshot; result: CapabilityMarkSeenResult } {
  if (revision !== snapshot.revision) return { snapshot, result: 'stale' };
  const at = now.toISOString();
  const targets = (a: CapabilityAgent) => agent === undefined || a === agent;
  return {
    result: 'marked',
    snapshot: {
      ...snapshot,
      revision: snapshot.revision + 1,
      agents: snapshot.agents.map((a) => (targets(a.agent) ? { ...a, seenAt: at } : a)),
      entries: snapshot.entries.filter((e) => !(targets(e.agent) && e.removedAt !== undefined)),
    },
  };
}

function statusOf(entry: StoredEntry, seenAt: string | null): CapabilityEntry['status'] {
  const after = (time: string) => seenAt === null || time > seenAt;
  if (entry.removedAt !== undefined) return 'removed';
  if (after(entry.firstSeen.at)) return 'new';
  if (after(entry.changedAt)) return 'changed';
  return 'seen';
}

/** What `capabilities:list` returns: every agent, read or not, and the entries with a status. */
export function toCapabilityList(snapshot: CapabilitySnapshot): CapabilityList {
  const agents: AgentInventory[] = CapabilityAgentSchema.options.map((agent) => {
    const record = snapshot.agents.find((a) => a.agent === agent);
    return record ?? { agent, state: 'not-read', version: null, readAt: null, seenAt: null };
  });
  const seen = new Map(agents.map((a) => [a.agent, a.seenAt]));
  return {
    revision: snapshot.revision,
    agents,
    entries: snapshot.entries.map((entry) => ({
      ...capability(entry),
      firstSeen: entry.firstSeen,
      changedAt: entry.changedAt,
      status: statusOf(entry, seen.get(entry.agent) ?? null),
    })),
  };
}
