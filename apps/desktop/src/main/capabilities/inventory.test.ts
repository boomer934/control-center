// The capability inventory (phase 5h): the snapshot diff (new, changed, removed), the first read
// as baseline, "mark as seen" with its revision check, and the cleaning of untrusted text.
import {
  CapabilityKindSchema,
  CapabilityListSchema,
  MAX_CAPABILITIES_PER_AGENT,
  type Capability,
} from '@control-center/ipc-contract';
import { describe, expect, it } from 'vitest';
import {
  applyRead,
  CapabilitySnapshotSchema,
  EMPTY_SNAPSHOT,
  makeCapability,
  markSeen,
  markUnavailable,
  toCapabilityList,
} from './inventory';

const at = (minute: number) => new Date(Date.UTC(2026, 10, 27, 10, minute));
const cap = (id: string, extra: Partial<Capability> = {}): Capability => ({
  agent: 'claude',
  kind: 'command',
  id,
  label: `/${id}`,
  tags: [],
  ...extra,
});
/** A read that lists every kind, as a full `initialize` answer does. */
const readAll = (
  snapshot: Parameters<typeof applyRead>[0],
  agent: Parameters<typeof applyRead>[1],
  version: string | null,
  entries: Capability[],
  now: Date,
) => applyRead(snapshot, agent, { version, entries, kinds: CapabilityKindSchema.options }, now);
const statuses = (snapshot: Parameters<typeof toCapabilityList>[0]) =>
  Object.fromEntries(toCapabilityList(snapshot).entries.map((e) => [e.id, e.status]));

describe('makeCapability', () => {
  it('cleans and bounds the text a CLI gives', () => {
    const c = makeCapability('codex', {
      kind: 'feature',
      id: 'apps',
      label: '  Apps\n\tin C:\\Users\\someone\\x  ',
      description: `${'word '.repeat(200)} api_key=synthetic-secret-password`,
      tags: ['stage:beta', 'stage:beta', 42, ''],
    });
    expect(c?.label).toBe('Apps in ~\\x');
    expect(c?.description?.length).toBe(500);
    expect(c?.description?.endsWith('…')).toBe(true);
    expect(c?.tags).toEqual(['stage:beta']);
  });

  it('drops an id that is not printable or looks like a secret, and labels by id', () => {
    expect(makeCapability('claude', { kind: 'command', id: 'two words' })).toBeUndefined();
    expect(
      makeCapability('claude', { kind: 'command', id: 'ghp_' + 'a'.repeat(36) }),
    ).toBeUndefined();
    expect(makeCapability('claude', { kind: 'command', id: 7 })).toBeUndefined();
    expect(makeCapability('claude', { kind: 'agent', id: 'Plan', label: '   ' })).toEqual({
      agent: 'claude',
      kind: 'agent',
      id: 'Plan',
      label: 'Plan',
      tags: [],
    });
  });
});

describe('capability snapshot', () => {
  it('takes the first read as the baseline: nothing is new', () => {
    const first = readAll(EMPTY_SNAPSHOT, 'claude', '2.1.326', [cap('a'), cap('b')], at(0));
    expect(statuses(first)).toEqual({ a: 'seen', b: 'seen' });
    const list = toCapabilityList(first);
    expect(CapabilityListSchema.parse(list)).toEqual(list);
    expect(list.agents).toEqual([
      {
        agent: 'claude',
        state: 'ready',
        version: '2.1.326',
        readAt: at(0).toISOString(),
        seenAt: at(0).toISOString(),
      },
      { agent: 'codex', state: 'not-read', version: null, readAt: null, seenAt: null },
    ]);
  });

  it('marks new, changed and removed entries against the last time they were seen', () => {
    const first = readAll(
      EMPTY_SNAPSHOT,
      'claude',
      '2.1.326',
      [cap('a'), cap('b'), cap('c')],
      at(0),
    );
    const second = readAll(
      first,
      'claude',
      '2.1.330',
      [cap('a'), cap('b', { description: 'now explained' }), cap('d')],
      at(5),
    );
    expect(statuses(second)).toEqual({ a: 'seen', b: 'changed', c: 'removed', d: 'new' });
    const d = toCapabilityList(second).entries.find((e) => e.id === 'd');
    expect(d?.firstSeen).toEqual({ version: '2.1.330', at: at(5).toISOString() });
    // the same read again changes nothing
    const again = readAll(
      second,
      'claude',
      '2.1.330',
      [cap('a'), cap('b', { description: 'now explained' }), cap('d')],
      at(6),
    );
    expect(statuses(again)).toEqual(statuses(second));
    expect(again.entries.find((e) => e.id === 'b')?.changedAt).toBe(at(5).toISOString());
  });

  it('marks as seen only the revision the user was shown, and drops what was removed', () => {
    const first = readAll(EMPTY_SNAPSHOT, 'claude', null, [cap('a'), cap('c')], at(0));
    const second = readAll(first, 'claude', null, [cap('a'), cap('d')], at(5));
    const stale = markSeen(second, undefined, first.revision, at(6));
    expect(stale.result).toBe('stale');
    expect(stale.snapshot).toBe(second);
    const seen = markSeen(second, 'claude', second.revision, at(6));
    expect(seen.result).toBe('marked');
    expect(statuses(seen.snapshot)).toEqual({ a: 'seen', d: 'seen' });
    // an entry that comes back after being seen as removed is new again
    const back = readAll(seen.snapshot, 'claude', null, [cap('a'), cap('c'), cap('d')], at(7));
    expect(statuses(back)).toEqual({ a: 'seen', c: 'new', d: 'seen' });
  });

  it('keeps each agent apart, and the last entries of an agent whose CLI is gone', () => {
    const claude = readAll(EMPTY_SNAPSHOT, 'claude', null, [cap('a')], at(0));
    const codex = readAll(
      claude,
      'codex',
      '0.171.0-alpha.13.2',
      [cap('a', { agent: 'codex', kind: 'feature' })],
      at(1),
    );
    const gone = markUnavailable(codex, 'claude');
    expect(toCapabilityList(gone).agents.map((a) => [a.agent, a.state])).toEqual([
      ['claude', 'unavailable'],
      ['codex', 'ready'],
    ]);
    expect(gone.entries).toHaveLength(2);
    expect(markUnavailable(gone, 'claude')).toBe(gone);
    const fresh = markUnavailable(EMPTY_SNAPSHOT, 'codex');
    expect(toCapabilityList(fresh).agents[1]).toMatchObject({
      agent: 'codex',
      state: 'unavailable',
      readAt: null,
    });
    // only entries of the agent being read count, and duplicates once
    const mixed = readAll(
      EMPTY_SNAPSHOT,
      'claude',
      null,
      [cap('x'), cap('x'), cap('y', { agent: 'codex' })],
      at(2),
    );
    expect(mixed.entries.map((e) => [e.agent, e.id])).toEqual([['claude', 'x']]);
    expect(CapabilitySnapshotSchema.parse(gone)).toEqual(gone);
  });

  it('removes only kinds the answer listed: a field missing from the answer says nothing', () => {
    const first = readAll(
      EMPTY_SNAPSHOT,
      'claude',
      null,
      [cap('a'), cap('m', { kind: 'model' })],
      at(0),
    );
    // an answer with only a version, then one with models only
    const empty = applyRead(first, 'claude', { version: '2.1.330', entries: [], kinds: [] }, at(1));
    expect(statuses(empty)).toEqual({ a: 'seen', m: 'seen' });
    const models = applyRead(
      empty,
      'claude',
      { version: null, entries: [], kinds: ['model'] },
      at(2),
    );
    expect(statuses(models)).toEqual({ a: 'seen', m: 'removed' });
    // an entry of a kind the read does not cover is ignored, not added
    const stray = applyRead(
      models,
      'claude',
      { version: null, entries: [cap('z')], kinds: ['model'] },
      at(3),
    );
    expect(stray.entries.map((e) => e.id)).not.toContain('z');
  });

  it('adds without removing on an additive read, and keeps the last read of the agent', () => {
    const tool = (id: string, description?: string) =>
      cap(id, { kind: 'tool', label: id, ...(description ? { description } : {}) });
    const first = readAll(EMPTY_SNAPSHOT, 'claude', '2.1.326', [tool('Read')], at(0));
    const session = (entries: Capability[], now: Date, from = first) =>
      applyRead(
        from,
        'claude',
        { version: '9.9.9', entries, kinds: ['tool'], additive: true },
        now,
      );
    // a session that lacks `Read` but has an MCP tool: nothing removed, the tool is new
    const second = session([tool('mcp__gh__search')], at(1));
    expect(statuses(second)).toEqual({ Read: 'seen', mcp__gh__search: 'new' });
    expect(second.agents).toEqual(first.agents);
    // a session with nothing new is no change at all
    expect(session([tool('Read')], at(2), second)).toBe(second);
    expect(session([], at(2), second)).toBe(second);
    // a changed description still counts
    const changed = session([tool('Read', 'Reads files')], at(3), second);
    expect(statuses(changed).Read).toBe('changed');
    expect(CapabilitySnapshotSchema.parse(changed)).toEqual(changed);
  });

  it('never outgrows the schema: removals beyond the per-agent limit drop, oldest first', () => {
    const many = (prefix: string) =>
      Array.from({ length: MAX_CAPABILITIES_PER_AGENT }, (_, i) => cap(`${prefix}${i}`));
    const first = readAll(EMPTY_SNAPSHOT, 'claude', null, many('a'), at(0));
    const second = readAll(first, 'claude', null, many('b'), at(1));
    const third = readAll(second, 'claude', null, many('c').slice(0, 10), at(2));
    for (const snapshot of [second, third]) {
      expect(snapshot.entries.length).toBeLessThanOrEqual(MAX_CAPABILITIES_PER_AGENT);
      expect(CapabilitySnapshotSchema.safeParse(snapshot).success).toBe(true);
      expect(CapabilityListSchema.safeParse(toCapabilityList(snapshot)).success).toBe(true);
    }
    // the ten present entries stay, the newest removals (the b's) fill the rest
    const ids = third.entries.map((e) => e.id);
    expect(ids.filter((id) => id.startsWith('c'))).toHaveLength(10);
    expect(ids.filter((id) => id.startsWith('a'))).toHaveLength(0);
  });

  it('orders by revision: a read in the same millisecond as "mark as seen" is still news', () => {
    const first = readAll(EMPTY_SNAPSHOT, 'claude', null, [cap('a')], at(0));
    const seen = markSeen(first, 'claude', first.revision, at(1)).snapshot;
    const same = readAll(seen, 'claude', null, [cap('a', { label: 'changed' }), cap('b')], at(1));
    expect(statuses(same)).toEqual({ a: 'changed', b: 'new' });
  });
});
