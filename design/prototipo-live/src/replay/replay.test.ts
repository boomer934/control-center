import { describe, expect, it } from 'vitest';
import { SIMULATED_WAIT_MS, failingCount, makeSanitizer, normalize, parseJsonl } from './normalize';
import { HOLD_MS, viewAt } from './state';
import { syntheticHooks, syntheticStream } from './synthetic';

const replay = normalize('synthetic', syntheticStream, syntheticHooks);
const op = (id: string) => {
  const o = replay.ops.find((x) => x.id === id);
  if (!o) throw new Error(`no op ${id}`);
  return o;
};

describe('normalize', () => {
  it('makes paths relative and masks the home directory', () => {
    expect(op('r1').target).toBe('src/a.ts');
    expect(op('b1').target).toBe('cd . && npm test');
    expect(replay.prompt).toBe('Fix .\\src\\b.ts');
    expect(replay.result.summary).not.toContain('Users');
    const clean = makeSanitizer('C:\\work\\x');
    expect(clean.text('see C:\\Users\\someone\\notes.txt')).toBe('see ~\\notes.txt');
    expect(JSON.stringify(replay)).not.toMatch(/Users[\\/]dev/);
  });

  it('times ops from the hooks, relative to the prompt', () => {
    expect(op('r1').start).toBe(1000);
    expect(op('r1').end).toBe(1100);
    // no PostToolUse for a failed tool: the stream tool_result closes it
    expect(op('r2').end).toBe(8100);
  });

  it('assigns subagent ops to a subagent with a two-letter sigil', () => {
    const sub = replay.agents.find((a) => a.kind === 'sub');
    expect(sub).toMatchObject({ code: 'EX', name: 'Explore', task: 'Explore src', start: 2000 });
    expect(op('s1').agent).toBe(sub?.id);
    expect(op('s1').matches).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('detects outcomes: missing file, failing tests, denied permission', () => {
    expect(op('r2')).toMatchObject({ outcome: 'error', reason: 'not found' });
    expect(op('b1')).toMatchObject({ outcome: 'error', reason: '1 failing' });
    expect(op('p1')).toMatchObject({ outcome: 'denied', simulatedWait: true });
    expect(op('p1').end - op('p1').start).toBe(SIMULATED_WAIT_MS);
    expect(replay.simulated).toEqual(['wait']);
  });

  it('counts diff lines from the structured patch', () => {
    expect(op('e1').diff).toEqual({ add: 2, del: 1 });
  });

  it('collects files, tokens and cost', () => {
    expect(replay.files).toEqual(['config/missing.json', 'src/a.ts', 'src/b.ts']);
    expect(replay.result).toMatchObject({ ok: true, tokens: 1000, costUsd: 0.12 });
  });

  it('parses jsonl and tolerates a truncated last line', () => {
    expect(parseJsonl('{"a":1}\n\n{"b":')).toEqual([{ a: 1 }]);
  });

  it('recognises common test runner failure lines', () => {
    expect(failingCount('ℹ pass 2\nℹ fail 1')).toBe(1);
    expect(failingCount('  2 failing')).toBe(2);
    expect(failingCount('Tests  3 failed | 4 passed')).toBe(3);
    expect(failingCount('ℹ fail 0')).toBe(0);
  });
});

describe('viewAt', () => {
  it('shows a read as reading while it is (visibly) active, then idle with a read count', () => {
    expect(viewAt(replay, 1050).files.get('src/a.ts')?.state).toBe('reading');
    const after = viewAt(replay, 1000 + HOLD_MS + 1).files.get('src/a.ts');
    expect(after).toMatchObject({ state: 'idle', reads: 1 });
  });

  it('keeps a finished write as done with its diff and a fading trail', () => {
    expect(viewAt(replay, 5050).files.get('src/b.ts')?.state).toBe('writing');
    const v = viewAt(replay, 5000 + HOLD_MS + 10).files.get('src/b.ts');
    expect(v).toMatchObject({ state: 'done', diff: { add: 2, del: 1 }, fresh: true });
    expect(viewAt(replay, 7000).files.get('src/b.ts')?.fresh).toBe(false);
  });

  it('runs commands, then marks failing ones as error with the reason', () => {
    expect(viewAt(replay, 6500).commands.get('b1')?.state).toBe('running');
    expect(viewAt(replay, 7500).commands.get('b1')).toMatchObject({
      state: 'error',
      note: '1 failing',
    });
  });

  it('shows a denied request as waiting, and the agent as waiting on it', () => {
    const v = viewAt(replay, op('p1').start + 2000);
    expect(v.commands.get('p1')?.state).toBe('waiting');
    expect(v.agents[0]).toMatchObject({ state: 'waiting', label: 'waits' });
  });

  it('tracks the subagent lifetime and the delegating parent', () => {
    const v = viewAt(replay, 2550);
    expect(v.agents[0]).toMatchObject({ state: 'running', label: 'delegating' });
    expect(v.agents[1]).toMatchObject({ alive: true, state: 'reading' });
    expect(viewAt(replay, 1500).agents[1]?.label).toBe('not started');
    expect(viewAt(replay, 4500).agents[1]).toMatchObject({ alive: false, state: 'done' });
  });
});
