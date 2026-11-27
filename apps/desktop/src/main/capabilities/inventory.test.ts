// The capability inventory (phase 5h): the snapshot diff (new, changed, removed), the first read
// as baseline, "mark as seen" with its revision check, and the cleaning of untrusted text.
import { CapabilityListSchema, type Capability } from '@control-center/ipc-contract';
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
    const first = applyRead(EMPTY_SNAPSHOT, 'claude', '2.1.326', [cap('a'), cap('b')], at(0));
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
    const first = applyRead(
      EMPTY_SNAPSHOT,
      'claude',
      '2.1.326',
      [cap('a'), cap('b'), cap('c')],
      at(0),
    );
    const second = applyRead(
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
    const again = applyRead(
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
    const first = applyRead(EMPTY_SNAPSHOT, 'claude', null, [cap('a'), cap('c')], at(0));
    const second = applyRead(first, 'claude', null, [cap('a'), cap('d')], at(5));
    const stale = markSeen(second, undefined, first.revision, at(6));
    expect(stale.result).toBe('stale');
    expect(stale.snapshot).toBe(second);
    const seen = markSeen(second, 'claude', second.revision, at(6));
    expect(seen.result).toBe('marked');
    expect(statuses(seen.snapshot)).toEqual({ a: 'seen', d: 'seen' });
    // an entry that comes back after being seen as removed is new again
    const back = applyRead(seen.snapshot, 'claude', null, [cap('a'), cap('c'), cap('d')], at(7));
    expect(statuses(back)).toEqual({ a: 'seen', c: 'new', d: 'seen' });
  });

  it('keeps each agent apart, and the last entries of an agent whose CLI is gone', () => {
    const claude = applyRead(EMPTY_SNAPSHOT, 'claude', null, [cap('a')], at(0));
    const codex = applyRead(
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
    const mixed = applyRead(
      EMPTY_SNAPSHOT,
      'claude',
      null,
      [cap('x'), cap('x'), cap('y', { agent: 'codex' })],
      at(2),
    );
    expect(mixed.entries.map((e) => [e.agent, e.id])).toEqual([['claude', 'x']]);
    expect(CapabilitySnapshotSchema.parse(gone)).toEqual(gone);
  });
});
