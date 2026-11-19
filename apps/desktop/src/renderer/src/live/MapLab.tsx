// Map lab (phase 5b): the map driven by the recorded fixtures at fixed instants, for the visual
// tests, and by a synthetic stream of 500 files at 20 events per second, for the performance
// test. Only in the development and E2E builds (see LAB in shell/route.ts): the fixtures never
// ship in the app.
import { useEffect, useMemo, useState } from 'react';
import type { AgentEvent } from '@control-center/event-schema';
import {
  PROJECT_MODEL_VERSION,
  type ProjectFile,
  type ProjectSnapshot,
} from '@control-center/project-model/schema';
import { routeParam } from '../shell/route';
import { FIXTURE_PROJECT, fixture, projectFile as file } from './labFixtures';
import { LiveMap, type DiffPreview } from './LiveMap';
import type { EventRecord } from './useMapActivity';

type Scene = { fixture?: string; at(events: AgentEvent[]): number };

const startOf = (events: AgentEvent[], target: string, nth = 0) => {
  const calls = events.filter((e) => e.type === 'tool.called' && e.target === target);
  return Date.parse(calls[nth]?.timestamp ?? events[0]!.timestamp);
};

const SCENES: Record<string, Scene> = {
  empty: { at: () => 0 },
  reading: { fixture: 'sessione-01', at: (e) => startOf(e, 'src/cart.js') + 300 },
  writing: { fixture: 'sessione-01', at: (e) => startOf(e, 'test/cart.test.js', 1) + 300 },
  error: { fixture: 'sessione-02', at: (e) => startOf(e, 'src/cart.js') + 300 },
  waiting: {
    fixture: 'sessione-07',
    at: (e) => Date.parse(e.find((x) => x.type === 'permission.requested')!.timestamp) + 2000,
  },
  subagent: { fixture: 'sessione-03', at: (e) => startOf(e, 'src/inventory.js') + 300 },
  done: { fixture: 'sessione-01', at: (e) => Date.parse(e.at(-1)!.timestamp) + 5000 },
};

const FAKE_DIFF: DiffPreview = {
  ok: true,
  truncated: false,
  text: [
    'diff --git a/src/cart.js b/src/cart.js',
    '@@ -12,7 +12,6 @@ export function total(items) {',
    '   const sum = items.reduce((acc, item) => acc + item.price, 0);',
    '-  const rounded = Math.round(sum * 100) / 100;',
    '-  return rounded;',
    '+  return Math.round(sum * 100) / 100;',
    ' }',
  ].join('\n'),
};

// ── Performance bench: 500 files on the map, 20 events per second ────────────
const BENCH_DIRS = 10;
const BENCH_PER_DIR = 52;
const BENCH_TOUCHED = 500;
const EVENTS_PER_SECOND = 20;

function benchProject(): ProjectSnapshot {
  const files: ProjectFile[] = [];
  for (let d = 0; d < BENCH_DIRS; d++)
    for (let i = 0; i < BENCH_PER_DIR; i++)
      files.push(file(`pkg${d}/src/module-${String(i).padStart(2, '0')}.ts`));
  return {
    version: PROJECT_MODEL_VERSION,
    revision: 1,
    status: 'ready',
    truncated: false,
    progress: { indexed: files.length, parseable: files.length },
    files,
  };
}

let seq = 0;
function event<T extends AgentEvent['type']>(
  type: T,
  agentId: 'main' | 'sub:bench',
  at: number,
  fields: Omit<
    Extract<AgentEvent, { type: T }>,
    | 'schemaVersion'
    | 'id'
    | 'sessionId'
    | 'seq'
    | 'timestamp'
    | 'source'
    | 'provider'
    | 'agentId'
    | 'type'
  >,
): AgentEvent {
  const n = seq++;
  return {
    schemaVersion: 1,
    id: `b${n}`,
    sessionId: 'bench',
    seq: n,
    timestamp: new Date(at).toISOString(),
    source: 'hooks',
    provider: 'claude',
    agentId,
    type,
    ...fields,
  } as AgentEvent;
}

function useBench(snapshot: ProjectSnapshot, running: boolean): EventRecord[] {
  const paths = useMemo(
    () => snapshot.files.slice(0, BENCH_TOUCHED).map((f) => f.path),
    [snapshot],
  );
  const [records, setRecords] = useState<EventRecord[]>(() => {
    // Every file read once a minute ago: all 500 are on the map, idle.
    const t = Date.now() - 60_000;
    const events: AgentEvent[] = [
      event('session.started', 'main', t, {}),
      event('agent.spawned', 'sub:bench', t, { parentAgentId: 'main', name: 'Explore' }),
    ];
    paths.forEach((path, i) => {
      const agent = i % 2 ? 'main' : 'sub:bench';
      const id = `seed${i}`;
      events.push(
        event('tool.called', agent, t, { toolUseId: id, tool: 'Read', kind: 'read', target: path }),
      );
      events.push(event('tool.completed', agent, t + 5, { toolUseId: id }));
      events.push(
        event('file.read', agent, t + 5, { toolUseId: id, file: { path, external: false } }),
      );
    });
    return [{ kind: 'events', events }];
  });

  useEffect(() => {
    if (!running) return;
    let n = 0;
    const timer = setInterval(() => {
      // Each tick is one event: calls open, then complete with their file event.
      const i = n++;
      const call = Math.floor(i / 3);
      const path = paths[(call * 37) % paths.length]!;
      const agent = call % 2 ? 'main' : 'sub:bench';
      const id = `live${call}`;
      const write = call % 4 === 0;
      const now = Date.now();
      const step = i % 3;
      const e =
        step === 0
          ? event('tool.called', agent, now, {
              toolUseId: id,
              tool: write ? 'Edit' : 'Read',
              kind: write ? 'write' : 'read',
              target: path,
            })
          : step === 1
            ? event('tool.completed', agent, now, { toolUseId: id })
            : write
              ? event('file.written', agent, now, {
                  toolUseId: id,
                  file: { path, external: false },
                  op: 'edit',
                  diff: { add: 2, del: 1 },
                })
              : event('file.read', agent, now, { toolUseId: id, file: { path, external: false } });
      setRecords((previous) => [...previous, { kind: 'events', events: [e] }]);
    }, 1000 / EVENTS_PER_SECOND);
    return () => clearInterval(timer);
  }, [running, paths]);

  return records;
}

function Bench() {
  const snapshot = useMemo(benchProject, []);
  const [running, setRunning] = useState(false);
  const records = useBench(snapshot, running);
  useEffect(() => {
    (window as unknown as { __mapBench?: (on: boolean) => void }).__mapBench = setRunning;
  }, []);
  return <LiveMap snapshot={snapshot} records={records} />;
}

/** The scene of `#/map-lab?scene=…`, following hash changes that keep the same route. */
function useScene(): string {
  const [scene, setScene] = useState(() => routeParam('scene') ?? 'empty');
  useEffect(() => {
    const onHash = () => setScene(routeParam('scene') ?? 'empty');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return scene;
}

export default function MapLab() {
  const scene = useScene();
  const chosen = SCENES[scene];
  const events = useMemo(() => (chosen?.fixture ? fixture(chosen.fixture) : []), [chosen]);
  const records = useMemo<EventRecord[]>(
    () => (events.length ? [{ kind: 'events', events }] : []),
    [events],
  );
  const at = useMemo(
    () => (chosen && events.length ? chosen.at(events) : undefined),
    [chosen, events],
  );
  return (
    <div
      className="live-view map-lab"
      data-focus-scope="live"
      data-testid="map-lab"
      data-scene={scene}
    >
      <div className="lmap-area">
        {scene === 'bench' ? (
          <Bench />
        ) : chosen ? (
          <LiveMap
            key={scene}
            snapshot={FIXTURE_PROJECT}
            records={records}
            at={at ?? Date.parse('2026-11-19T10:00:00Z')}
            pendingPermission={false}
            loadDiff={() => Promise.resolve(FAKE_DIFF)}
          />
        ) : (
          <p className="shell-muted">
            Unknown scene. Use one of: {[...Object.keys(SCENES), 'bench'].join(', ')}.
          </p>
        )}
      </div>
    </div>
  );
}
