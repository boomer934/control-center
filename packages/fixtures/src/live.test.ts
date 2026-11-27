import {
  agentEventSchema,
  LiveClaudeSession,
  normalizeClaudeSession,
  type AgentEvent,
} from '@control-center/event-schema';
import { describe, expect, it } from 'vitest';
import { listClaudeSessions, loadClaudeSession } from './index';

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const iso = (v: unknown): string | undefined =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined;

const CWD = 'C:\\fixtures\\workspace';

type Arrival = { kind: 'stream' | 'hook'; at: string; value: unknown };

/** The recording as it would arrive live: both sources interleaved by their clocks. */
function arrivals(stream: unknown[], hooks: unknown[]): Arrival[] {
  const out: Arrival[] = [];
  let at = hooks.map((h) => (isObj(h) ? iso(h.capturedAt) : undefined)).find(Boolean) ?? '';
  for (const line of stream) {
    at = (isObj(line) ? iso(line.timestamp) : undefined) ?? at;
    out.push({ kind: 'stream', at, value: line });
  }
  for (const h of hooks)
    out.push({ kind: 'hook', at: (isObj(h) ? iso(h.capturedAt) : undefined) ?? at, value: h });
  return out
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (x.a.at < y.a.at ? -1 : x.a.at > y.a.at ? 1 : x.i - y.i))
    .map(({ a }) => a);
}

function replay(live: LiveClaudeSession, items: Arrival[]): AgentEvent[] {
  const out: AgentEvent[] = [];
  for (const a of items)
    out.push(...(a.kind === 'stream' ? live.stream(a.value, a.at) : live.hook(a.value)));
  out.push(...live.endRun());
  return out;
}

/** What an event is about, without its time or number. */
const fact = (e: AgentEvent) =>
  [e.type, e.agentId, 'toolUseId' in e ? (e.toolUseId ?? '') : ''].join(' ');

describe('LiveClaudeSession', () => {
  for (const name of listClaudeSessions()) {
    it(`reports the same facts as the batch merge for ${name}`, () => {
      const { stream, hooks } = loadClaudeSession(name);
      const batch = normalizeClaudeSession(stream, hooks, { sessionId: 's', cwd: CWD });
      const live = replay(
        new LiveClaudeSession({ sessionId: 's', cwd: CWD }),
        arrivals(stream, hooks),
      );

      expect(live.map(fact).sort()).toEqual(batch.map(fact).sort());
      expect(live.map((e) => e.seq)).toEqual(live.map((_, i) => i));
      for (const e of live) expect(agentEventSchema.safeParse(e).success, e.type).toBe(true);
      const times = live.map((e) => e.timestamp);
      expect(times).toEqual([...times].sort());
      expect(live[0]?.type).toBe('session.started');
      expect(live.at(-1)?.type).toBe('session.ended');
    });
  }

  it('attributes subagent hooks that arrive before the stream once the stream links them', () => {
    const live = new LiveClaudeSession({ sessionId: 's', cwd: CWD });
    const at = (s: number) => new Date(Date.UTC(2026, 10, 17, 10, 0, s)).toISOString();
    const hook = (s: number, payload: object) => ({
      capturedAt: at(s),
      payload: { cwd: CWD, ...payload },
    });
    const agentCall = (id: string) => ({
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        id: `m-${id}`,
        content: [{ type: 'tool_use', id, name: 'Agent', input: { description: id } }],
      },
    });
    const out: AgentEvent[] = [];
    out.push(...live.stream({ type: 'system', subtype: 'init', cwd: CWD }, at(0)));
    // two subagents running in parallel: Claude's agent ids cannot be told apart yet
    out.push(
      ...live.hook(
        hook(1, {
          hook_event_name: 'PreToolUse',
          tool_name: 'Agent',
          tool_use_id: 'A1',
          tool_input: {},
        }),
      ),
    );
    out.push(
      ...live.hook(
        hook(1, {
          hook_event_name: 'PreToolUse',
          tool_name: 'Agent',
          tool_use_id: 'A2',
          tool_input: {},
        }),
      ),
    );
    out.push(...live.stream(agentCall('A1'), at(1)), ...live.stream(agentCall('A2'), at(1)));
    const read = {
      hook_event_name: 'PreToolUse',
      agent_id: 'claude-b',
      tool_name: 'Read',
      tool_use_id: 'R1',
      tool_input: { file_path: `${CWD}\\a.ts` },
    };
    out.push(...live.hook(hook(2, read)));
    expect(out.find((e) => e.type === 'tool.called' && e.toolUseId === 'R1')).toBeUndefined();
    out.push(
      ...live.stream(
        {
          type: 'assistant',
          parent_tool_use_id: 'A2',
          message: {
            id: 'm-r',
            content: [{ type: 'tool_use', id: 'R1', name: 'Read', input: read.tool_input }],
          },
        },
        at(3),
      ),
    );
    out.push(...live.hook(hook(4, { ...read, hook_event_name: 'PostToolUse', tool_response: {} })));
    const r1 = out.filter((e) => 'toolUseId' in e && e.toolUseId === 'R1');
    expect(r1.map((e) => [e.type, e.agentId])).toEqual([
      ['tool.called', 'sub:A2'],
      ['tool.completed', 'sub:A2'],
      ['file.read', 'sub:A2'],
    ]);
    // the held hook was never shown: the stream's copy is the one the timeline got
    expect(r1[0]?.source).toBe('stream');
  });

  it('keeps the stream session.started when hooks arrive before init, as with the real CLI', () => {
    const live = new LiveClaudeSession({ sessionId: 's', cwd: CWD });
    const at = '2026-11-17T10:00:00.000Z';
    const hook = (name: string, extra: object = {}) => ({
      capturedAt: at,
      payload: { hook_event_name: name, session_id: 'c', cwd: CWD, ...extra },
    });
    const out = [
      ...live.hook(hook('SessionStart')),
      ...live.hook(hook('UserPromptSubmit', { prompt: 'hello' })),
    ];
    expect(out).toEqual([]);
    out.push(
      ...live.stream(
        {
          type: 'system',
          subtype: 'init',
          cwd: CWD,
          model: 'claude-x',
          claude_code_version: '2.1.326',
        },
        '2026-11-17T10:00:01.000Z',
      ),
    );
    expect(out.map((e) => [e.type, e.source])).toEqual([
      ['session.started', 'stream'],
      ['message.user', 'hooks'],
    ]);
    expect(out[0]).toMatchObject({ model: 'claude-x', cliVersion: '2.1.326', timestamp: at });
  });

  it('releases early hooks when the run ends without any stream', () => {
    const live = new LiveClaudeSession({ sessionId: 's', cwd: CWD });
    live.hook({
      capturedAt: '2026-11-17T10:00:00.000Z',
      payload: { hook_event_name: 'UserPromptSubmit', session_id: 'c', prompt: 'hi' },
    });
    const out = live.endRun('2026-11-17T10:00:05.000Z');
    expect(out.map((e) => e.type)).toEqual(['session.started', 'message.user', 'session.ended']);
  });

  it('ends a run whose process died and keeps numbering across runs', () => {
    const live = new LiveClaudeSession({ sessionId: 's', cwd: CWD });
    const first = [
      ...live.stream({ type: 'system', subtype: 'init', cwd: CWD }, '2026-11-17T10:00:00.000Z'),
      ...live.stream(
        {
          type: 'assistant',
          parent_tool_use_id: null,
          message: {
            id: 'm',
            content: [{ type: 'tool_use', id: 'B1', name: 'Bash', input: { command: 'ls' } }],
          },
        },
        '2026-11-17T10:00:01.000Z',
      ),
      ...live.endRun('2026-11-17T10:00:02.000Z'),
    ];
    expect(first.map((e) => e.type)).toEqual([
      'session.started',
      'tool.called',
      'tool.failed',
      'session.ended',
    ]);
    expect(first.at(-1)).toMatchObject({
      ok: false,
      status: 'failed',
      reason: 'process-exited',
      source: 'app',
    });
    live.startRun('2026-11-17T10:01:00.000Z');
    const second = live.stream(
      { type: 'system', subtype: 'init', cwd: CWD },
      '2026-11-17T10:01:00.000Z',
    );
    expect(second.map((e) => [e.type, e.seq])).toEqual([['session.started', 4]]);
    expect(live.endRun()).toHaveLength(1);
    expect(live.endRun()).toEqual([]);
  });
});

describe('model and effort per run (phase 5f)', () => {
  const { stream, hooks } = loadClaudeSession('sessione-01');
  const run = (
    live: LiveClaudeSession,
    at: string,
    config?: { model?: string; effort?: string },
  ) => [...live.startRun(at, config), ...replay(live, arrivals(stream, hooks))];

  it('reports nothing while the CLI configuration applies', () => {
    const live = new LiveClaudeSession({ sessionId: 's', cwd: CWD });
    const events = run(live, '2026-11-27T10:00:00.000Z');
    expect(events.some((e) => e.type === 'session.configChanged')).toBe(false);
    const started = events.find((e) => e.type === 'session.started');
    expect(started && 'effort' in started ? started.effort : undefined).toBeUndefined();
  });

  it('records a choice before the run that applies it, and the effort on session.started', () => {
    const live = new LiveClaudeSession({ sessionId: 's', cwd: CWD });
    const first = run(live, '2026-11-27T10:00:00.000Z', { model: 'opus', effort: 'high' });
    expect(first[0]).toMatchObject({
      type: 'session.configChanged',
      source: 'app',
      provider: 'claude',
      seq: 0,
      model: 'opus',
      effort: 'high',
      by: 'user',
    });
    expect(first[0]).not.toHaveProperty('previousModel');
    expect(first[1]).toMatchObject({ type: 'session.started', effort: 'high' });

    // same choice: no event; a new one names the previous configuration
    const same = run(live, '2026-11-27T11:00:00.000Z', { model: 'opus', effort: 'high' });
    expect(same.some((e) => e.type === 'session.configChanged')).toBe(false);
    const changed = run(live, '2026-11-27T12:00:00.000Z', { model: 'sonnet' });
    expect(changed[0]).toMatchObject({
      type: 'session.configChanged',
      model: 'sonnet',
      previousModel: 'opus',
      previousEffort: 'high',
    });
    expect(changed[0]).not.toHaveProperty('effort');
    const all = [...first, ...same, ...changed];
    expect(all.map((e) => e.seq)).toEqual(all.map((_, i) => i));
    for (const e of all) expect(agentEventSchema.safeParse(e).success).toBe(true);
  });

  it('a session resumed from the history reports only a real change', () => {
    const live = new LiveClaudeSession({ sessionId: 's', cwd: CWD });
    live.restoreConfig({ model: 'opus', effort: 'max' });
    const events = run(live, '2026-11-27T10:00:00.000Z', { model: 'opus', effort: 'max' });
    expect(events.some((e) => e.type === 'session.configChanged')).toBe(false);
    // back to the CLI's own configuration
    const reset = run(live, '2026-11-27T11:00:00.000Z', {});
    expect(reset[0]).toMatchObject({
      type: 'session.configChanged',
      previousModel: 'opus',
      previousEffort: 'max',
    });
    expect(reset[0]).not.toHaveProperty('model');
  });

  it('a run that dies before starting changes nothing: the retry reports the choice', () => {
    const live = new LiveClaudeSession({ sessionId: 's', cwd: CWD });
    // the CLI exits before `init`, without hooks: no event at all
    expect(live.startRun('2026-11-27T10:00:00.000Z', { model: 'opus' })).toEqual([]);
    expect(live.endRun('2026-11-27T10:00:01.000Z', 'process-failed')).toEqual([]);
    const retry = run(live, '2026-11-27T10:01:00.000Z', { model: 'opus' });
    expect(retry.slice(0, 2)).toMatchObject([
      { type: 'session.configChanged', model: 'opus', seq: 0 },
      { type: 'session.started', seq: 1 },
    ]);
    expect(retry[0]).not.toHaveProperty('previousModel');
    expect(retry.map((e) => e.seq)).toEqual(retry.map((_, i) => i));
  });
});
