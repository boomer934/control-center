import { describe, expect, it } from 'vitest';
import { HOLD_MS, MapActivity } from './activity';
import { fixture } from './labFixtures';
import { buildTimeline, ReplayActivity } from './replay';

describe('replay projection', () => {
  it.each(['sessione-01', 'sessione-02', 'sessione-03', 'sessione-07'])(
    'matches the live map fed only the events up to a seek in %s',
    (name) => {
      const events = fixture(name);
      const times = events.map((event) => Date.parse(event.timestamp));
      const instants = [...new Set(times.flatMap((time) => [time - 1, time, time + HOLD_MS]))].sort(
        (a, b) => a - b,
      );
      const replay = new ReplayActivity([{ kind: 'events', events }]);
      for (const at of [...instants, ...instants.toReversed()]) {
        const expected = new MapActivity();
        expected.apply(events.filter((_, index) => times[index]! <= at));
        expect(replay.viewAt(at)).toEqual(expected.viewAt(at));
      }
    },
  );

  it('shows a file diff only from the write event onward, including after a rewind', () => {
    const events = fixture('sessione-01');
    const write = events.find(
      (event) => event.type === 'file.written' && event.file.path === 'src/index.js',
    )!;
    const replay = new ReplayActivity([{ kind: 'events', events }]);
    const at = Date.parse(write.timestamp);
    expect(replay.viewAt(at).files.get('src/index.js')?.diff).toEqual({ add: 1, del: 1 });
    expect(replay.viewAt(at - 1).files.get('src/index.js')?.diff).toBeUndefined();
    expect(replay.viewAt(at).files.get('src/index.js')?.writes).toBe(1);
  });
});

describe('timeline lanes', () => {
  it('keeps a single mark per read, with the actual call interval', () => {
    const events = fixture('sessione-01');
    const timeline = buildTimeline([{ kind: 'events', events }])!;
    const marks = timeline.lanes[0]!.marks.filter((mark) => mark.label.includes('src/cart.js'));
    expect(marks).toEqual([
      expect.objectContaining({ label: 'Read · src/cart.js', tone: 'read' }),
      expect.objectContaining({ label: 'Edit · src/cart.js', tone: 'write' }),
    ]);
    expect(marks[0]!.end).toBeGreaterThanOrEqual(marks[0]!.at);
    expect(timeline.stops).toContain(marks[0]!.at);
  });

  it('nests a child lane under its parent and uses the same time axis', () => {
    const events = fixture('sessione-03');
    const timeline = buildTimeline([{ kind: 'events', events }])!;
    const [main, child] = timeline.lanes;
    expect(main).toMatchObject({ id: 'main', name: 'Claude', depth: 0 });
    expect(child).toMatchObject({ parent: 'main', name: 'general-purpose', depth: 1 });
    expect(child?.marks).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Read · src/inventory.js' })]),
    );
    expect(timeline.start).toBe(Date.parse(events[0]!.timestamp));
    expect(timeline.end).toBeGreaterThan(Date.parse(events.at(-1)!.timestamp));
  });
});
