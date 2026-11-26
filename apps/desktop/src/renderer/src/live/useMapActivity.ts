// Feeds the map store from the event records of a session (phase 5b). New events are folded at
// once but drawn at most once per frame; without events the map wakes only when something must
// change (hold, trail, a running clock), so an idle map costs nothing.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent } from '@control-center/event-schema';
import type { TerminalError } from '@control-center/ipc-contract/terminal';
import { MapActivity, type ResolveFile } from './activity';
import { ReplayActivity, type ReplayRecord } from './replay';
import { MapStore } from './store';

/** What the chat keeps: event batches among prompts and checkpoints. */
export type EventRecord = ReplayRecord;

export interface MapActivityOptions {
  /** Fixed instant (ms since the epoch) instead of "now": replay and tests. */
  at?: number;
  /** Limit the map to recorded events at or before the fixed time. */
  historical?: boolean;
  pendingPermission?: boolean;
  /** Folders shown as collapsed nodes or containers, with their file count. */
  folders: ReadonlyMap<string, number>;
  /** Errors found outside the session (integrated terminals): live map only. */
  errors?: readonly TerminalError[];
  /** Map file of an error's culprit (suffix match against the project). */
  resolveFile?: ResolveFile;
}

/** A clock on a node ("0:04") moves once a second while something runs or waits. */
const TICK_MS = 1000;

export function useMapActivity(
  records: readonly EventRecord[],
  options: MapActivityOptions,
): { store: MapStore; touched: string[] } {
  const store = useMemo(() => new MapStore(), []);
  const resolver = useRef(options.resolveFile);
  resolver.current = options.resolveFile;
  const resolveFile = useRef<ResolveFile>((file) =>
    resolver.current ? resolver.current(file) : file.external ? undefined : file.path,
  ).current;
  const activity = useRef(new MapActivity(resolveFile));
  const seen = useRef<{
    first?: EventRecord;
    count: number;
    errors?: readonly TerminalError[];
  }>({ count: 0 });
  const opts = useRef(options);
  const replay = useMemo(
    () => (options.historical ? new ReplayActivity(records, undefined, resolveFile) : undefined),
    [options.historical, records, resolveFile],
  );
  const [touched, setTouched] = useState<string[]>([]);
  const frame = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flush = useRef<() => void>(() => undefined);

  flush.current = () => {
    frame.current = 0;
    clearTimeout(timer.current);
    const { at, pendingPermission, folders } = opts.current;
    const t = at ?? Date.now();
    const view = replay?.viewAt(t) ?? activity.current.viewAt(t, { pendingPermission });
    store.update(view, folders);
    if (at !== undefined) return;
    const busy =
      view.agents.some((a) => a.alive && (a.state === 'running' || a.state === 'waiting')) ||
      view.temps.some((temp) => temp.state === 'running');
    const next = activity.current.nextChange(t);
    const wait = Math.min(busy ? TICK_MS : Infinity, next === undefined ? Infinity : next - t);
    if (wait !== Infinity) timer.current = setTimeout(schedule, Math.max(16, wait));
  };

  function schedule() {
    if (!frame.current) frame.current = requestAnimationFrame(() => flush.current());
  }

  useEffect(() => {
    opts.current = options;
    schedule();
  });

  useEffect(() => {
    const state = seen.current;
    // A new session or a loaded history replaces the records: start again from nothing.
    if (records[0] !== state.first || records.length < state.count) {
      activity.current = new MapActivity(resolveFile);
      state.count = 0;
      state.first = records[0];
      state.errors = undefined;
    }
    const batch: AgentEvent[] = [];
    for (let i = state.count; i < records.length; i++) {
      const record = records[i]!;
      if (record.kind === 'events') batch.push(...record.events);
    }
    state.count = records.length;
    activity.current.apply(batch);
    // Terminal errors are re-applied whole: the activity drops the ones it already has.
    if (options.errors && options.errors !== state.errors) {
      activity.current.applyErrors(options.errors);
      state.errors = options.errors;
    }
    // The touched files decide what the map shows: update them now, so the first layout is
    // already the right one, instead of a layout without them followed by a second one.
    const files = activity.current.touched();
    setTouched((previous) =>
      previous.length === files.length && previous.every((path, index) => path === files[index])
        ? previous
        : files,
    );
    schedule();
  }, [records, options.errors]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      clearTimeout(timer.current);
    },
    [],
  );

  return { store, touched };
}
