import { describe, expect, it } from 'vitest';
import { agentEventSchema, type AgentEvent } from '../schema';
import { countDiff, LiveCodexSession } from './codex';

const CWD = 'C:\\Users\\dev\\proj';
const AT = '2026-11-27T20:00:00.000Z';
const at = (s: number) => new Date(Date.parse(AT) + s * 1000).toISOString();
const T1 = 'turn-1';

const item = (method: 'item/started' | 'item/completed', value: object, turnId = T1) => ({
  method,
  params: { threadId: 'th', turnId, item: value },
});

const command = (status: string, extra: object = {}) => ({
  type: 'commandExecution',
  id: 'exec-1',
  command: '"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "npm test"',
  cwd: CWD,
  status,
  commandActions: [{ type: 'unknown', command: 'npm test' }],
  aggregatedOutput: null,
  exitCode: null,
  durationMs: null,
  ...extra,
});

function feed(live: LiveCodexSession, messages: { method: string; params: unknown }[], from = 1) {
  const out: AgentEvent[] = [];
  messages.forEach((m, i) => out.push(...live.notification(m.method, m.params, at(from + i))));
  return out;
}

function valid(events: AgentEvent[]) {
  for (const e of events)
    expect(agentEventSchema.safeParse(e).success, JSON.stringify(e)).toBe(true);
  expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => events[0]!.seq + i));
  return events;
}

describe('LiveCodexSession', () => {
  it('turns a full turn into valid events, with relative paths', () => {
    const live = new LiveCodexSession({ sessionId: 's1', cwd: CWD });
    const events: AgentEvent[] = [];
    events.push(...live.startTurn(at(0), {}, { model: 'gpt-6.2-sol', effort: 'high' }, '0.171.0'));
    events.push(...live.bindTurn(T1, at(0)));
    events.push(
      ...feed(live, [
        item('item/completed', {
          type: 'userMessage',
          id: 'u1',
          content: [{ type: 'text', text: `Fix ${CWD}\\src\\a.ts`, text_elements: [] }],
        }),
        item('item/started', command('inProgress')),
      ]),
    );
    events.push(
      ...live.approvalRequested({ toolUseId: 'exec-1', tool: 'shell', detail: 'npm test' }, at(4)),
      ...live.approvalResolved({ toolUseId: 'exec-1', tool: 'shell', decision: 'allowed' }, at(5)),
    );
    events.push(
      ...feed(
        live,
        [
          item('item/completed', command('completed', { exitCode: 0, durationMs: 1200 })),
          item('item/started', {
            type: 'fileChange',
            id: 'patch-1',
            status: 'inProgress',
            changes: [
              { path: `${CWD}\\src\\a.ts`, kind: { type: 'update', move_path: null }, diff: '' },
            ],
          }),
          item('item/completed', {
            type: 'fileChange',
            id: 'patch-1',
            status: 'completed',
            changes: [
              {
                path: `${CWD}\\src\\a.ts`,
                kind: { type: 'update', move_path: null },
                diff: '@@\n-a\n+b\n+c\n',
              },
              { path: 'src/new.ts', kind: { type: 'add' }, diff: 'x\ny\n' },
            ],
          }),
          item('item/completed', {
            type: 'agentMessage',
            id: 'm1',
            text: 'Done.',
            phase: 'final_answer',
          }),
          {
            method: 'thread/tokenUsage/updated',
            params: {
              threadId: 'th',
              turnId: T1,
              tokenUsage: {
                last: {
                  inputTokens: 1000,
                  cachedInputTokens: 800,
                  cacheWriteInputTokens: 0,
                  outputTokens: 20,
                },
                total: {},
              },
            },
          },
          {
            method: 'turn/completed',
            params: {
              threadId: 'th',
              turn: { id: T1, status: 'completed', error: null, durationMs: 9000 },
            },
          },
        ],
        6,
      ),
    );
    valid(events);
    expect(events.map((e) => e.type)).toEqual([
      'session.started',
      'message.user',
      'tool.called',
      'permission.requested',
      'permission.resolved',
      'tool.completed',
      'tool.called',
      'file.written',
      'file.written',
      'tool.completed',
      'message.assistant',
      'usage.updated',
      'session.ended',
    ]);
    expect(events.every((e) => e.provider === 'codex' && e.agentId === 'main')).toBe(true);
    const started = events[0];
    expect(started).toMatchObject({ model: 'gpt-6.2-sol', effort: 'high', cliVersion: '0.171.0' });
    expect(events[1]).toMatchObject({ text: 'Fix .\\src\\a.ts' });
    expect(events[2]).toMatchObject({ tool: 'shell', kind: 'shell', target: 'npm test' });
    expect(events[7]).toMatchObject({
      file: { path: 'src/a.ts', external: false },
      op: 'edit',
      diff: { add: 2, del: 1 },
    });
    expect(events[8]).toMatchObject({
      file: { path: 'src/new.ts' },
      op: 'create',
      diff: { add: 2, del: 0 },
    });
    expect(events[11]).toMatchObject({ inputTokens: 200, cacheReadTokens: 800, outputTokens: 20 });
    expect(events[12]).toMatchObject({ ok: true, status: 'completed', durationMs: 9000 });
  });

  it('drops notifications of other turns and before a turn starts', () => {
    const live = new LiveCodexSession({ sessionId: 's1', cwd: CWD });
    const usage = {
      method: 'thread/tokenUsage/updated',
      params: {
        threadId: 'th',
        turnId: 'old',
        tokenUsage: { last: { inputTokens: 5 }, total: {} },
      },
    };
    expect(feed(live, [usage])).toEqual([]);
    live.startTurn(at(0), {});
    expect(feed(live, [usage])).toEqual([]);
    expect(live.bindTurn(T1, at(1)).map((e) => e.type)).toEqual(['session.started']);
    expect(
      feed(live, [
        usage,
        item('item/completed', { type: 'agentMessage', id: 'm', text: 'x' }, 'old'),
      ]),
    ).toEqual([]);
  });

  it('closes open calls when a turn is interrupted', () => {
    const live = new LiveCodexSession({ sessionId: 's1', cwd: CWD });
    live.startTurn(at(0), {});
    const events = [
      ...feed(live, [
        {
          method: 'turn/started',
          params: { threadId: 'th', turn: { id: T1, status: 'inProgress' } },
        },
        item('item/started', command('inProgress')),
        {
          method: 'turn/completed',
          params: { threadId: 'th', turn: { id: T1, status: 'interrupted', error: null } },
        },
      ]),
    ];
    valid(events);
    expect(events.map((e) => e.type)).toEqual([
      'session.started',
      'tool.called',
      'tool.failed',
      'session.ended',
    ]);
    expect(events[2]).toMatchObject({ reason: 'interrupted' });
    expect(events[3]).toMatchObject({ ok: false, status: 'failed', reason: 'interrupted' });
    expect(feed(live, [item('item/completed', command('completed'))])).toEqual([]);
  });

  it('reports a declined command as denied and a failing one with its exit code', () => {
    const live = new LiveCodexSession({ sessionId: 's1', cwd: CWD });
    live.startTurn(at(0), {});
    live.bindTurn(T1, at(0));
    const declined = feed(live, [item('item/completed', command('declined'))]);
    expect(declined.map((e) => e.type)).toEqual(['tool.called', 'tool.failed']);
    expect(declined[1]).toMatchObject({ reason: 'denied' });
    const failed = feed(live, [
      item('item/completed', {
        ...command('failed', { exitCode: 1, aggregatedOutput: '2 failing' }),
        id: 'exec-2',
      }),
    ]);
    expect(failed[1]).toMatchObject({ reason: 'tests-failing', detail: 'exit 1' });
    valid([...declined, ...failed]);
  });

  it('records a user change of model or effort once, before the turn that applies it', () => {
    const live = new LiveCodexSession({ sessionId: 's1', cwd: CWD });
    const turn = (n: number, config: { model?: string; effort?: string }) => {
      live.startTurn(at(n), config, config);
      const id = `t${n}`;
      return [
        ...live.bindTurn(id, at(n)),
        ...live.notification(
          'turn/completed',
          { threadId: 'th', turn: { id, status: 'completed' } },
          at(n),
        ),
      ];
    };
    const first = turn(1, { model: 'gpt-6-luna', effort: 'low' });
    expect(first.map((e) => e.type)).toEqual([
      'session.configChanged',
      'session.started',
      'session.ended',
    ]);
    expect(first[0]).toMatchObject({
      model: 'gpt-6-luna',
      effort: 'low',
      by: 'user',
      source: 'app',
    });
    expect(turn(2, { model: 'gpt-6-luna', effort: 'low' }).map((e) => e.type)).toEqual([
      'session.started',
      'session.ended',
    ]);
    // a turn the server refused changes nothing: the next one still reports the change
    live.startTurn(at(3), { model: 'gpt-6.2-sol', effort: 'high' });
    expect(live.endTurn(at(3), 'failed')).toEqual([]);
    const fourth = turn(4, { model: 'gpt-6.2-sol', effort: 'high' });
    expect(fourth[0]).toMatchObject({
      type: 'session.configChanged',
      model: 'gpt-6.2-sol',
      previousModel: 'gpt-6-luna',
      previousEffort: 'low',
    });
    valid(first);
    valid(fourth);
  });

  it('a resumed session reports only a choice that differs from the restored one', () => {
    const live = new LiveCodexSession({ sessionId: 's1', cwd: CWD });
    live.restoreConfig({ model: 'gpt-6-luna', effort: 'low' });
    live.startTurn(at(1), { model: 'gpt-6-luna', effort: 'low' });
    expect(live.bindTurn(T1, at(1)).map((e) => e.type)).toEqual(['session.started']);
  });

  it('turns a provider reroute into a configChanged by the provider', () => {
    const live = new LiveCodexSession({ sessionId: 's1', cwd: CWD });
    live.startTurn(at(0), {}, { model: 'gpt-6.2-sol', effort: 'high' });
    live.bindTurn(T1, at(0));
    const events = feed(live, [
      {
        method: 'model/rerouted',
        params: {
          threadId: 'th',
          turnId: T1,
          fromModel: 'gpt-6.2-sol',
          toModel: 'gpt-6-luna',
          reason: 'highRiskCyberActivity',
        },
      },
      item('item/completed', { type: 'agentMessage', id: 'm', text: 'hi' }),
    ]);
    valid(events);
    expect(events[0]).toMatchObject({
      type: 'session.configChanged',
      by: 'provider',
      model: 'gpt-6-luna',
      previousModel: 'gpt-6.2-sol',
      effort: 'high',
    });
    expect(events[1]).toMatchObject({ type: 'message.assistant', model: 'gpt-6-luna' });
  });

  it('ends a started turn the app gave up on, and nothing else', () => {
    const live = new LiveCodexSession({ sessionId: 's1', cwd: CWD });
    live.startTurn(at(0), {});
    live.bindTurn(T1, at(0));
    feed(live, [item('item/started', command('inProgress'))]);
    const end = live.endTurn(at(9), 'process-failed');
    expect(end.map((e) => e.type)).toEqual(['tool.failed', 'session.ended']);
    expect(end[1]).toMatchObject({ reason: 'process-failed', ok: false });
    expect(live.endTurn(at(10))).toEqual([]);
  });
});

describe('countDiff', () => {
  it('counts unified diff lines, and a new file without markers as added', () => {
    expect(countDiff('--- a\n+++ b\n@@\n-x\n+y\n context\n', false)).toEqual({ add: 1, del: 1 });
    expect(countDiff('a\nb\nc\n', true)).toEqual({ add: 3, del: 0 });
    expect(countDiff('', true)).toEqual({ add: 0, del: 0 });
  });
});
