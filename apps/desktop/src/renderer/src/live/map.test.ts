// Phase 5b: the map logic on the recorded fixtures (activity), the visible set, the layout and
// the per-node store.
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type AgentEvent } from '@control-center/event-schema';
import { commandKey, errorName, HOLD_MS, MapActivity, TRAIL_MS } from './activity';
import { assembleLayout, packRequest, sizeGroup } from './layout';
import { packBoxes } from './pack';
import { fixture } from './labFixtures';
import { makeResolveFile } from './resolve';
import { MapStore } from './store';
import { buildVisibleMap, indexProject, NEIGHBOR_LIMIT, VISIBLE_BUDGET } from './visible';

const session = fixture;

function activityOf(events: AgentEvent[]): MapActivity {
  const activity = new MapActivity();
  activity.apply(events);
  return activity;
}

/** Start time of the call whose target starts with `target`. */
function callAt(events: AgentEvent[], target: string): number {
  const call = events.find((e) => e.type === 'tool.called' && e.target?.startsWith(target));
  if (!call) throw new Error(`no call ${target}`);
  return Date.parse(call.timestamp);
}

const end = (events: AgentEvent[]) => Date.parse(events.at(-1)!.timestamp);

describe('MapActivity on the fixtures', () => {
  it('lights a file up while it is read, and keeps the edits with their diff', () => {
    const events = session('sessione-01');
    const activity = activityOf(events);
    const reading = activity.viewAt(callAt(events, 'src/cart.js') + 50);
    expect(reading.files.get('src/cart.js')).toMatchObject({ state: 'reading' });
    expect(reading.agents[0]).toMatchObject({
      id: 'main',
      code: 'CL',
      state: 'reading',
      target: 'f:src/cart.js',
    });

    const writing = activity.viewAt(callAt(events, 'test/cart.test.js') + 50);
    // The second call on the test file is the edit.
    const edit = events.filter(
      (e) => e.type === 'tool.called' && e.target === 'test/cart.test.js',
    )[1]!;
    const during = activity.viewAt(Date.parse(edit.timestamp) + 50);
    expect(during.files.get('test/cart.test.js')).toMatchObject({ state: 'writing' });
    expect(writing.files.get('test/cart.test.js')?.state).toBe('reading');

    const after = activity.viewAt(end(events) + 10_000);
    expect(after.files.get('src/index.js')).toMatchObject({
      state: 'done',
      diff: { add: 1, del: 1 },
      fresh: false,
    });
    expect(after.files.get('test/cart.test.js')?.diff).toEqual({ add: 3, del: 3 });
    expect(after.agents[0]).toMatchObject({ alive: false, state: 'done' });
    expect(activity.touched().sort()).toEqual([
      'README.md',
      'src/cart.js',
      'src/index.js',
      'test/cart.test.js',
    ]);
  });

  it('shows a command as a temporary node that fails, then passes', () => {
    const events = session('sessione-02');
    const activity = activityOf(events);
    const first = callAt(events, 'npm test 2>&1 | tail -40');
    const running = activity.viewAt(first + 10);
    expect(running.temps).toHaveLength(1);
    expect(running.temps[0]).toMatchObject({ kind: 'command', state: 'running' });
    expect(running.agents[0]?.target).toBe(running.temps[0]?.id);

    const failed = activity.viewAt(callAt(events, 'src/cart.js') + 10);
    expect(failed.temps[0]).toMatchObject({ state: 'error' });

    const later = activity.viewAt(end(events) + 60_000);
    expect(later.temps).toHaveLength(0); // commands leave the map when they are over
    expect(later.files.get('src/cart.js')).toMatchObject({
      state: 'done',
      diff: { add: 1, del: 2 },
    });
  });

  it('keeps a failed read on the map as an error', () => {
    const events = session('sessione-05');
    const view = activityOf(events).viewAt(end(events) + 5000);
    expect(view.files.get('config/settings.json')).toMatchObject({
      state: 'error',
      note: expect.any(String),
    });
  });

  it('marks the command waiting for a permission', () => {
    const events = session('sessione-07');
    const activity = activityOf(events);
    const asked = events.find((e) => e.type === 'permission.requested')!;
    const view = activity.viewAt(Date.parse(asked.timestamp) + 100);
    expect(view.temps.find((t) => t.label.startsWith('$ Set-Content'))).toMatchObject({
      state: 'waiting',
    });
    expect(view.agents[0]).toMatchObject({ state: 'waiting', label: 'waits' });
  });

  it('gives a subagent its own presence, while the parent delegates', () => {
    const events = session('sessione-03');
    const activity = activityOf(events);
    const view = activity.viewAt(callAt(events, 'src/inventory.js') + 50);
    const sub = view.agents.find((a) => a.kind === 'sub');
    expect(sub).toMatchObject({
      name: 'general-purpose',
      code: 'GE',
      state: 'reading',
      target: 'f:src/inventory.js',
    });
    expect(view.agents.find((a) => a.id === 'main')).toMatchObject({ label: 'delegating' });
  });
});

describe('MapActivity timing', () => {
  const t0 = Date.parse('2026-11-19T10:00:00.000Z');
  const at = (ms: number) => new Date(t0 + ms).toISOString();
  let seq = 0;
  const base = (ms: number) => ({
    schemaVersion: SCHEMA_VERSION,
    id: `e${seq}`,
    sessionId: 's',
    seq: seq++,
    timestamp: at(ms),
    source: 'hooks' as const,
    provider: 'claude' as const,
    agentId: 'main' as const,
  });
  const quickRead: AgentEvent[] = [
    {
      ...base(0),
      type: 'tool.called',
      toolUseId: 'r1',
      tool: 'Read',
      kind: 'read',
      target: 'a.ts',
    },
    { ...base(100), type: 'tool.completed', toolUseId: 'r1' },
    { ...base(100), type: 'file.read', toolUseId: 'r1', file: { path: 'a.ts', external: false } },
  ];

  it('holds a short call long enough to be seen, then tells when it changes', () => {
    const activity = activityOf(quickRead);
    expect(activity.viewAt(t0 + HOLD_MS - 1).files.get('a.ts')?.state).toBe('reading');
    expect(activity.viewAt(t0 + HOLD_MS + 1).files.get('a.ts')?.state).toBe('idle');
    expect(activity.nextChange(t0 + 200)).toBe(t0 + HOLD_MS);
    expect(activity.nextChange(t0 + HOLD_MS)).toBe(t0 + HOLD_MS + TRAIL_MS);
  });

  it('puts the main agent in waiting while the app has a permission open', () => {
    const activity = activityOf([
      {
        ...base(0),
        type: 'tool.called',
        toolUseId: 'w1',
        tool: 'Edit',
        kind: 'write',
        target: 'b.ts',
      },
    ]);
    const view = activity.viewAt(t0 + 5000, { pendingPermission: true });
    expect(view.files.get('b.ts')).toMatchObject({ state: 'waiting', note: 'waiting 0:05' });
    expect(view.agents[0]).toMatchObject({ state: 'waiting', label: 'waits' });
  });

  it('brings the agent back for the next turn of the chat', () => {
    // One `claude -p` run per message: each turn opens and closes the session again.
    const turn = (ms: number, id: string, target: string): AgentEvent[] => [
      { ...base(ms), type: 'session.started' },
      { ...base(ms + 100), type: 'tool.called', toolUseId: id, tool: 'Read', kind: 'read', target },
      { ...base(ms + 200), type: 'tool.completed', toolUseId: id },
      { ...base(ms + 3000), type: 'session.ended', ok: true, status: 'completed' },
    ];
    const activity = activityOf([...turn(0, 't1', 'a.ts'), ...turn(10_000, 't2', 'b.ts')]);
    expect(activity.viewAt(t0 + 6000).agents[0]).toMatchObject({ alive: false, state: 'done' });
    expect(activity.viewAt(t0 + 10_150).agents[0]).toMatchObject({
      alive: true,
      state: 'reading',
      target: 'f:b.ts',
    });
    expect(activity.viewAt(t0 + 20_000).agents[0]).toMatchObject({ alive: false });
  });
});

describe('MapActivity errors (phase 5e)', () => {
  const t0 = Date.parse('2026-11-26T10:00:00.000Z');
  const at = (ms: number) => new Date(t0 + ms).toISOString();
  let seq = 0;
  const base = (ms: number) => ({
    schemaVersion: SCHEMA_VERSION,
    id: `x${seq}`,
    sessionId: 's',
    seq: seq++,
    timestamp: at(ms),
    source: 'stream' as const,
    provider: 'claude' as const,
    agentId: 'main' as const,
  });
  const detected = {
    origin: 'command' as const,
    language: 'node' as const,
    message: "TypeError: Cannot read properties of undefined (reading 'reduce')",
    file: { path: 'src/lib/price.js', external: false as const },
    line: 2,
    frames: [],
  };
  const error = (ms: number): AgentEvent => ({ ...base(ms), type: 'error.detected', ...detected });
  const edit = (ms: number, id: string): AgentEvent[] => [
    {
      ...base(ms),
      type: 'tool.called',
      toolUseId: id,
      tool: 'Edit',
      kind: 'write',
      target: 'src/lib/price.js',
    },
    { ...base(ms + 100), type: 'tool.completed', toolUseId: id },
    {
      ...base(ms + 100),
      type: 'file.written',
      toolUseId: id,
      op: 'edit',
      file: { path: 'src/lib/price.js', external: false },
    },
  ];

  it('turns the culprit red with its line, until a later write fixes it', () => {
    const activity = activityOf([error(1000), ...edit(5000, 'w1')]);
    expect(activity.touched()).toEqual(['src/lib/price.js']);
    expect(activity.viewAt(t0 + 500).files.get('src/lib/price.js')).toBeUndefined();
    expect(activity.viewAt(t0 + 1000).files.get('src/lib/price.js')).toMatchObject({
      state: 'error',
      note: 'L2 TypeError',
    });
    // the write shows while it runs, then clears the error
    expect(activity.viewAt(t0 + 5050).files.get('src/lib/price.js')?.state).toBe('writing');
    expect(activity.viewAt(t0 + 8000).files.get('src/lib/price.js')?.state).toBe('done');
    // an error after the fix is red again
    activity.apply([error(9000)]);
    expect(activity.viewAt(t0 + 9500).files.get('src/lib/price.js')?.state).toBe('error');
    // no agent chip for an error alone
    expect(activityOf([error(0)]).viewAt(t0 + 10).agents).toEqual([]);
  });

  it('clears an error of a command when the same command passes again', () => {
    expect(commandKey('npm test 2>&1 | tail -40')).toBe('npm test');
    expect(commandKey('npm test > out.txt && echo ok')).toBe('npm test');
    expect(commandKey(null)).toBeUndefined();
    const run = (ms: number, id: string, target: string, ok: boolean): AgentEvent[] => [
      { ...base(ms), type: 'tool.called', toolUseId: id, tool: 'Bash', kind: 'shell', target },
      ok
        ? { ...base(ms + 500), type: 'tool.completed', toolUseId: id }
        : { ...base(ms + 500), type: 'tool.failed', toolUseId: id, reason: 'tests-failing' },
    ];
    const activity = activityOf([
      ...run(0, 'c1', 'npm test 2>&1 | tail -40', false),
      { ...base(500), type: 'error.detected', ...detected, toolUseId: 'c1' },
      ...run(3000, 'c2', 'npm run lint', true),
    ]);
    const state = (ms: number) => activity.viewAt(t0 + ms).files.get('src/lib/price.js')?.state;
    expect(state(5000)).toBe('error');
    activity.apply(run(6000, 'c3', 'npm test 2>&1 | tail -15', true));
    expect(state(6200)).toBe('error');
    expect(state(7000) ?? 'idle').toBe('idle');
  });

  it('names an error briefly for its node', () => {
    expect(errorName("TypeError: Cannot read properties of undefined (reading 'x')")).toBe(
      'TypeError',
    );
    expect(errorName('AssertionError [ERR_ASSERTION]: Expected values')).toBe('AssertionError');
    expect(errorName('error[E0425]: cannot find value')).toBe('error[E0425]');
    expect(errorName('TS2322: Type string')).toBe('TS2322');
    expect(errorName('panic: runtime error')).toBe('panic');
    expect(errorName('Unexpected "}"')).toBe('Unexpected "}"');
    expect(errorName('django.core.exceptions.ImproperlyConfigured: x')).toBe('django.core.excep…');
  });

  it('counts an error once when the terminal and the session both report it', () => {
    const activity = activityOf([error(1000)]);
    const revision = activity.revision;
    activity.applyErrors([{ ...detected, origin: 'command', at: at(1000) }]);
    expect(activity.revision).toBe(revision);
    activity.applyErrors([{ ...detected, origin: 'terminal', at: at(2000) }]);
    expect(activity.revision).toBe(revision + 1);
  });

  it('matches a path the project does not have by its unique suffix', () => {
    const paths = new Map(
      ['rs/src/stock.rs', 'app/models.py', 'api/app/models.py', 'src/lib/price.js'].map((p) => [
        p,
        null,
      ]),
    );
    const resolve = makeResolveFile(paths);
    expect(resolve({ path: 'src/lib/price.js', external: false })).toBe('src/lib/price.js');
    expect(resolve({ path: 'src/stock.rs', external: false })).toBe('rs/src/stock.rs');
    // a container path: `app/models.py` is ambiguous, the longer suffix is not
    expect(resolve({ path: '/srv/api/app/models.py', external: true })).toBe('api/app/models.py');
    expect(resolve({ path: '/app/app/models.py', external: true })).toBeUndefined();
    expect(resolve({ path: '/usr/lib/x.py', external: true })).toBeUndefined();
    expect(resolve({ path: 'missing.ts', external: false })).toBeUndefined();

    const activity = new MapActivity(resolve);
    activity.apply([
      {
        ...base(0),
        type: 'error.detected',
        ...detected,
        file: { path: 'src/stock.rs', external: false },
      },
    ]);
    expect(activity.touched()).toEqual(['rs/src/stock.rs']);
  });
});

describe('buildVisibleMap', () => {
  const paths = [
    'README.md',
    'package.json',
    'src/a.ts',
    'src/b.ts',
    'src/c.ts',
    'src/ui/button.tsx',
    'src/ui/menu.tsx',
    'src/deep/x/y.ts',
    'docs/guide.md',
    'test/a.test.ts',
  ];
  const files = paths.map((path) => ({
    path,
    language: null,
    size: 1,
    roles: [],
    indexed: true,
    imports: path === 'src/a.ts' ? ['src/b.ts'] : path === 'test/a.test.ts' ? ['src/a.ts'] : [],
    importDirs: [],
    externals: [],
  }));
  const index = indexProject(files, new Map(files.map((f) => [f.path, f])));
  const none = { expanded: new Set<string>(), showAll: false };

  it('collapses everything before a session', () => {
    const map = buildVisibleMap(index, [], none);
    expect(map.files.size).toBe(0);
    expect(map.groups.map((g) => [g.label, g.count, g.collapsed])).toEqual([
      ['./', 2, false],
      ['docs', 1, true],
      ['src', 6, true],
      ['test', 1, true],
    ]);
    expect(map.groups[0]!.items).toEqual([
      expect.objectContaining({ kind: 'ghost', name: '+2 files' }),
    ]);
  });

  it('shows the touched files with their import neighbours, the rest collapsed', () => {
    const map = buildVisibleMap(index, ['src/a.ts'], none);
    expect([...map.files].sort()).toEqual(['src/a.ts', 'src/b.ts', 'test/a.test.ts']);
    const src = map.groups.find((g) => g.path === 'src')!;
    expect(src.items.map((i) => `${i.kind}:${i.name}`)).toEqual([
      'file:a.ts',
      'file:b.ts',
      'ghost:+1 file',
      'folder:deep/',
      'folder:ui/',
    ]);
    expect(src.items.find((i) => i.name === 'ui/')).toMatchObject({ count: 2 });
  });

  it('opens a folder on request and keeps unknown touched files', () => {
    const map = buildVisibleMap(index, ['src/new.ts'], {
      expanded: new Set(['src/ui']),
      showAll: false,
    });
    expect(map.files).toEqual(new Set(['src/new.ts', 'src/ui/button.tsx', 'src/ui/menu.tsx']));
    const names = map.groups.find((g) => g.path === 'src')!.items.map((i) => i.name);
    expect(names).toContain('ui/button.tsx');
  });

  it('shows the whole project within the budget, and the key follows the structure', () => {
    const all = buildVisibleMap(index, [], { expanded: new Set(), showAll: true });
    expect(all.files.size).toBe(paths.length);
    expect(buildVisibleMap(index, [], { expanded: new Set(), showAll: true }).key).toBe(all.key);
    expect(buildVisibleMap(index, ['src/a.ts'], none).key).not.toBe(all.key);
  });

  it('bounds the neighbours of a hub and the whole map', () => {
    const hub = Array.from({ length: VISIBLE_BUDGET + 40 }, (_, i) => ({
      path: `lib/f${String(i).padStart(4, '0')}.ts`,
      language: null,
      size: 1,
      roles: [],
      indexed: true,
      imports: ['lib/hub.ts'],
      importDirs: [],
      externals: [],
    }));
    const big = indexProject(hub, new Map(hub.map((f) => [f.path, f])));
    const map = buildVisibleMap(big, ['lib/hub.ts'], none);
    expect(map.files.size).toBe(1 + NEIGHBOR_LIMIT);
    const all = buildVisibleMap(big, [], { expanded: new Set(), showAll: true });
    expect(all.files.size).toBeLessThanOrEqual(VISIBLE_BUDGET);
  });
});

describe('layout', () => {
  const m = { row: 24, ch: 7.2 };

  it('lays the nodes of a container on a grid and packs containers without overlaps', async () => {
    const files = Array.from({ length: 30 }, (_, i) => ({ path: `p${i % 5}/file-${i}.ts` }));
    const index = indexProject(files);
    const visible = buildVisibleMap(
      index,
      files.map((f) => f.path),
      { expanded: new Set(), showAll: false },
    );
    const sized = sizeGroup(visible.groups[0]!, m);
    expect(sized.items.length).toBe(6);
    expect(new Set(sized.items.map((i) => i.y)).size).toBeLessThan(6); // more than one column

    const packed = await packBoxes(packRequest(1, visible, m, 1.6));
    const layout = assembleLayout(visible, m, packed);
    expect(layout.items).toHaveLength(30);
    const boxes = layout.groups;
    for (const a of boxes)
      for (const b of boxes)
        if (a !== b)
          expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(
            true,
          );
    expect(layout.abs.get('f:p0/file-0.ts')).toBeDefined();
  });
});

describe('MapStore', () => {
  it('notifies only the nodes that changed', () => {
    const store = new MapStore();
    const calls: string[] = [];
    for (const key of ['f:a.ts', 'f:b.ts', 'd:', 'agents'])
      store.subscribe(key, () => calls.push(key));
    const view = (state: 'reading' | 'idle') => ({
      t: 0,
      files: new Map([
        ['a.ts', { state, reads: 1, writes: 0, fresh: false }],
        ['b.ts', { state: 'idle' as const, reads: 1, writes: 0, fresh: false }],
      ]),
      temps: [],
      agents: [],
    });
    store.update(view('reading'), new Map([['', 2]]));
    expect(calls.sort()).toEqual(['d:', 'f:a.ts', 'f:b.ts']);
    calls.length = 0;
    store.update(view('idle'), new Map([['', 2]]));
    expect(calls.sort()).toEqual(['d:', 'f:a.ts']);
    calls.length = 0;
    store.update(view('idle'), new Map([['', 2]]));
    expect(calls).toEqual([]);
    expect(store.heat('')).toMatchObject({ read: 2, total: 2 });
  });
});
