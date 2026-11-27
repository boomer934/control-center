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
//
// What is new or changed is decided by revisions, not by clocks: two operations in the same
// millisecond (a read right after "mark as seen") still come in order.

const IsoSchema = z.iso.datetime();
const RevisionSchema = z.number().int().nonnegative();

const StoredEntrySchema = CapabilitySchema.extend({
  firstSeen: z.strictObject({ version: AgentVersionSchema.nullable(), at: IsoSchema }),
  changedAt: IsoSchema,
  /** The revision that added the entry, and the one that last changed it. */
  firstRevision: RevisionSchema,
  changedRevision: RevisionSchema,
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
  /** The revision of the last "mark as seen" (or of the first read): later changes are news. */
  seenRevision: RevisionSchema.nullable(),
});

export const SNAPSHOT_VERSION = 2;
export const CapabilitySnapshotSchema = z.strictObject({
  v: z.literal(SNAPSHOT_VERSION),
  revision: RevisionSchema,
  agents: z.array(StoredAgentSchema).max(CapabilityAgentSchema.options.length),
  entries: z
    .array(StoredEntrySchema)
    .max(MAX_CAPABILITIES_PER_AGENT * CapabilityAgentSchema.options.length),
});
export type CapabilitySnapshot = z.infer<typeof CapabilitySnapshotSchema>;

export const EMPTY_SNAPSHOT: CapabilitySnapshot = {
  v: SNAPSHOT_VERSION,
  revision: 0,
  agents: [],
  entries: [],
};

const key = (e: Pick<Capability, 'agent' | 'kind' | 'id'>) =>
  `${e.agent}\u0000${e.kind}\u0000${e.id}`;
const signature = (e: Pick<Capability, 'label' | 'description' | 'tags'>) =>
  JSON.stringify([e.label, e.description ?? '', e.tags]);
const order = (a: Capability, b: Capability) =>
  a.agent.localeCompare(b.agent) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);
const byAgent = (a: { agent: string }, b: { agent: string }) => a.agent.localeCompare(b.agent);
const capability = ({ agent, kind, id, label, description, tags }: Capability): Capability => ({
  agent,
  kind,
  id,
  label,
  ...(description === undefined ? {} : { description }),
  tags,
});

/** One read of an agent's CLI: the entries found, and the kinds the answer actually listed. */
export interface CapabilityRead {
  version: string | null;
  entries: readonly Capability[];
  /**
   * The kinds this read covers. An entry of another kind is kept as it is: an answer without a
   * `commands` field says nothing about the commands, it does not remove them.
   */
  kinds: readonly CapabilityKind[];
  /**
   * Entries of the covered kinds are added or updated, none is removed, and the agent's last
   * read (version, time) stays: a chat session's answer depends on its workspace (its MCP
   * servers, its skills), so what one session lacks may still be there in another.
   */
  additive?: boolean;
}

/**
 * The snapshot after a successful read of `agent`: entries it did not have are new, entries whose
 * text or tags differ are changed, entries of a covered kind the read lacks are removed. The first
 * read of an agent is the baseline: it counts as seen, so a fresh install shows no novelties.
 * An agent never holds more than MAX_CAPABILITIES_PER_AGENT entries: the oldest removals go first.
 */
export function applyRead(
  snapshot: CapabilitySnapshot,
  agent: CapabilityAgent,
  read: CapabilityRead,
  now: Date,
): CapabilitySnapshot {
  const at = now.toISOString();
  const revision = snapshot.revision + 1;
  const version = AgentVersionSchema.safeParse(read.version).data ?? null;
  const covered = new Set(read.kinds);
  const previous = new Map(
    snapshot.entries.filter((e) => e.agent === agent).map((e) => [key(e), e]),
  );
  const incoming = new Map<string, Capability>();
  for (const c of read.entries) {
    if (c.agent !== agent || !covered.has(c.kind) || incoming.has(key(c))) continue;
    if (incoming.size >= MAX_CAPABILITIES_PER_AGENT) break;
    incoming.set(key(c), c);
  }

  const present: StoredEntry[] = [];
  let touched = false;
  for (const [k, c] of incoming) {
    const old = previous.get(k);
    if (old === undefined || old.removedAt !== undefined || signature(old) !== signature(c))
      touched = true;
    if (!old) {
      present.push({
        ...capability(c),
        firstSeen: { version, at },
        changedAt: at,
        firstRevision: revision,
        changedRevision: revision,
      });
    } else if (old.removedAt !== undefined || signature(old) !== signature(c)) {
      // back after a removal, or different: changed now, first seen when it first appeared
      present.push({
        ...capability(c),
        firstSeen: old.firstSeen,
        changedAt: at,
        firstRevision: old.firstRevision,
        changedRevision: revision,
      });
    } else {
      present.push(old);
    }
  }
  const removed: StoredEntry[] = [];
  for (const [k, old] of previous) {
    if (incoming.has(k)) continue;
    if (old.removedAt !== undefined) removed.push(old);
    else if (!covered.has(old.kind) || read.additive) present.push(old);
    else removed.push({ ...old, removedAt: at, changedAt: at, changedRevision: revision });
  }
  // present entries first, then the newest removals while there is room: the snapshot never
  // outgrows its own schema (nor the IPC list)
  const current = present.slice(0, MAX_CAPABILITIES_PER_AGENT);
  removed.sort((a, b) => b.changedRevision - a.changedRevision);
  const kept = removed.slice(0, MAX_CAPABILITIES_PER_AGENT - current.length);

  // an additive read that brings nothing new is no change at all (no new revision)
  if (read.additive && !touched && current.length + kept.length === previous.size) return snapshot;

  const record = snapshot.agents.find((a) => a.agent === agent);
  const baseline = !record?.readAt;
  const agents = read.additive
    ? snapshot.agents
    : [
        ...snapshot.agents.filter((a) => a.agent !== agent),
        {
          agent,
          state: 'ready' as const,
          version,
          readAt: at,
          seenAt: baseline ? at : (record?.seenAt ?? null),
          seenRevision: baseline ? revision : (record?.seenRevision ?? null),
        },
      ].sort(byAgent);

  return {
    v: SNAPSHOT_VERSION,
    revision,
    agents,
    entries: [...snapshot.entries.filter((e) => e.agent !== agent), ...current, ...kept].sort(
      order,
    ),
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
    : {
        agent,
        state: 'unavailable' as const,
        version: null,
        readAt: null,
        seenAt: null,
        seenRevision: null,
      };
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    agents: [...snapshot.agents.filter((a) => a.agent !== agent), next].sort(byAgent),
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
      agents: snapshot.agents.map((a) =>
        targets(a.agent) ? { ...a, seenAt: at, seenRevision: revision } : a,
      ),
      entries: snapshot.entries.filter((e) => !(targets(e.agent) && e.removedAt !== undefined)),
    },
  };
}

function statusOf(entry: StoredEntry, seenRevision: number | null): CapabilityEntry['status'] {
  const after = (r: number) => seenRevision === null || r > seenRevision;
  if (entry.removedAt !== undefined) return 'removed';
  if (after(entry.firstRevision)) return 'new';
  if (after(entry.changedRevision)) return 'changed';
  return 'seen';
}

/** What `capabilities:list` returns: every agent, read or not, and the entries with a status. */
export function toCapabilityList(snapshot: CapabilitySnapshot): CapabilityList {
  const records = new Map(snapshot.agents.map((a) => [a.agent, a]));
  const agents: AgentInventory[] = CapabilityAgentSchema.options.map((agent) => {
    const record = records.get(agent);
    return record
      ? {
          agent,
          state: record.state,
          version: record.version,
          readAt: record.readAt,
          seenAt: record.seenAt,
        }
      : { agent, state: 'not-read', version: null, readAt: null, seenAt: null };
  });
  return {
    revision: snapshot.revision,
    agents,
    entries: snapshot.entries.map((entry) => ({
      ...capability(entry),
      firstSeen: entry.firstSeen,
      changedAt: entry.changedAt,
      status: statusOf(entry, records.get(entry.agent)?.seenRevision ?? null),
    })),
  };
}
