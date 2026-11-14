import { describe, expect, it } from 'vitest';
import { agentEventSchema, type AgentEvent } from '../schema';
import {
  failingCount,
  mergeClaudeSession,
  normalizeClaudeHooks,
  normalizeClaudeSession,
  normalizeClaudeStream,
  normalizeOllamaChat,
  toolKind,
} from './index';

const CWD = 'C:\\repo';
const ctx = { sessionId: 's1' };
const types = (events: AgentEvent[]) => events.map((e) => e.type);
const valid = (events: AgentEvent[]) => {
  for (const e of events) {
    const r = agentEventSchema.safeParse(e);
    expect(r.success, `${e.type}: ${r.error?.message}`).toBe(true);
  }
};

const init = {
  type: 'system',
  subtype: 'init',
  cwd: CWD,
  model: 'claude-sonnet-5-5',
  session_id: 'x',
};
const assistant = (ts: string, content: unknown[], extra: object = {}) => ({
  type: 'assistant',
  timestamp: ts,
  parent_tool_use_id: null,
  message: {
    id: `msg_${ts}`,
    model: 'claude-sonnet-5-5',
    content,
    usage: { input_tokens: 1, output_tokens: 2 },
  },
  ...extra,
});
const toolResult = (ts: string, id: string, content: string, extra: object = {}) => ({
  type: 'user',
  timestamp: ts,
  parent_tool_use_id: null,
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, ...extra }] },
});
const hook = (at: string, payload: object) => ({
  capturedAt: at,
  payload: { cwd: CWD, ...payload },
});

describe('helpers', () => {
  it('classifies tools', () => {
    expect(toolKind('Read')).toBe('read');
    expect(toolKind('MultiEdit')).toBe('write');
    expect(toolKind('PowerShell')).toBe('shell');
    expect(toolKind('mcp__github__list_issues')).toBe('mcp');
    expect(toolKind('Frobnicate')).toBe('other');
  });

  it('counts failing tests in the common runners', () => {
    expect(failingCount('ℹ tests 3\nℹ pass 2\nℹ fail 1\n')).toBe(1);
    expect(failingCount('  2 failing')).toBe(2);
    expect(failingCount('Tests  3 failed | 10 passed')).toBe(3);
    expect(failingCount('ℹ fail 0\n0 failed')).toBe(0);
  });
});

describe('normalizeClaudeStream', () => {
  it('relativizes paths, redacts secrets and records MCP calls', () => {
    const secret = ['abcd', 'efgh', '1234'].join('');
    const events = normalizeClaudeStream(
      [
        init,
        assistant('2026-11-14T10:00:01.000Z', [
          {
            type: 'tool_use',
            id: 't1',
            name: 'Bash',
            input: { command: `API_TOKEN=${secret} npm run deploy` },
          },
          { type: 'tool_use', id: 't2', name: 'mcp__github__list_issues', input: { repo: 'a/b' } },
          { type: 'tool_use', id: 't3', name: 'Read', input: { file_path: 'C:\\repo\\src\\a.ts' } },
        ]),
        toolResult('2026-11-14T10:00:02.000Z', 't1', 'ok'),
        toolResult('2026-11-14T10:00:02.500Z', 't2', '[]'),
        toolResult('2026-11-14T10:00:03.000Z', 't3', '1\tconst a = 1;'),
      ],
      ctx,
    );
    valid(events);
    const called = events.filter((e) => e.type === 'tool.called');
    expect(called.map((e) => e.target)).toEqual([
      'API_TOKEN=<redacted:assignment> npm run deploy',
      null,
      'src/a.ts',
    ]);
    expect(events.find((e) => e.type === 'mcp.called')).toMatchObject({
      server: 'github',
      tool: 'list_issues',
    });
    expect(events.find((e) => e.type === 'file.read')).toMatchObject({
      file: { path: 'src/a.ts', external: false },
    });
    expect(JSON.stringify(events)).not.toContain(secret);
  });

  it('counts the usage of one API message once, even when it spans several lines', () => {
    const events = normalizeClaudeStream(
      [
        init,
        assistant('2026-11-14T10:00:01.000Z', [{ type: 'thinking', thinking: '…' }]),
        assistant('2026-11-14T10:00:01.000Z', [{ type: 'text', text: 'Hi' }]),
      ],
      ctx,
    );
    expect(events.filter((e) => e.type === 'usage.updated')).toHaveLength(1);
  });

  it('turns a denied tool into permission events and a denied failure', () => {
    const events = normalizeClaudeStream(
      [
        init,
        assistant('2026-11-14T10:00:01.000Z', [
          { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'rm -rf dist' } },
        ]),
        {
          type: 'system',
          subtype: 'permission_denied',
          tool_use_id: 't1',
          tool_name: 'Bash',
          message: 'needs approval',
        },
        toolResult('2026-11-14T10:00:02.000Z', 't1', 'needs approval', { is_error: true }),
        {
          type: 'result',
          is_error: false,
          permission_denials: [{ tool_use_id: 't1', tool_name: 'Bash' }],
        },
      ],
      ctx,
    );
    valid(events);
    expect(types(events).filter((t) => t.startsWith('permission'))).toEqual([
      'permission.requested',
      'permission.resolved',
    ]);
    expect(events.find((e) => e.type === 'tool.failed')).toMatchObject({ reason: 'denied' });
  });
});

describe('normalizeClaudeHooks', () => {
  it('handles PostToolUseFailure, Notification and a subagent', () => {
    const events = normalizeClaudeHooks(
      [
        hook('2026-11-14T10:00:00.000Z', { hook_event_name: 'SessionStart' }),
        hook('2026-11-14T10:00:01.000Z', {
          hook_event_name: 'PreToolUse',
          tool_name: 'Agent',
          tool_use_id: 'ta',
          tool_input: { description: 'look', subagent_type: 'explorer' },
        }),
        hook('2026-11-14T10:00:02.000Z', {
          hook_event_name: 'PreToolUse',
          tool_name: 'Read',
          tool_use_id: 'tr',
          agent_id: 'A1',
          tool_input: { file_path: 'C:\\repo\\x.ts' },
        }),
        hook('2026-11-14T10:00:02.100Z', {
          hook_event_name: 'PostToolUseFailure',
          tool_name: 'Read',
          tool_use_id: 'tr',
          agent_id: 'A1',
          error: 'File does not exist.',
        }),
        hook('2026-11-14T10:00:03.000Z', { hook_event_name: 'SubagentStop', agent_id: 'A1' }),
        hook('2026-11-14T10:00:03.100Z', {
          hook_event_name: 'PostToolUse',
          tool_name: 'Agent',
          tool_use_id: 'ta',
          tool_response: { agentId: 'A1' },
        }),
        hook('2026-11-14T10:00:04.000Z', {
          hook_event_name: 'Notification',
          notification_type: 'permission_prompt',
          message: 'Claude needs your permission to use Bash',
        }),
        hook('2026-11-14T10:00:05.000Z', { hook_event_name: 'SessionEnd', reason: 'other' }),
      ],
      ctx,
    );
    valid(events);
    expect(events.find((e) => e.type === 'tool.failed')).toMatchObject({
      agentId: 'sub:ta',
      reason: 'not-found',
      durationMs: 100,
    });
    expect(events.find((e) => e.type === 'agent.finished')).toMatchObject({ agentId: 'sub:ta' });
    expect(events.find((e) => e.type === 'notification')).toMatchObject({ kind: 'permission' });
    expect(types(events)).toContain('permission.requested');
  });
});

describe('mergeClaudeSession', () => {
  const stream = [
    init,
    assistant('2026-11-14T10:00:01.000Z', [
      { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'C:\\repo\\a.ts' } },
    ]),
    toolResult('2026-11-14T10:00:03.000Z', 't1', 'x'),
    { type: 'result', is_error: false, duration_ms: 3000 },
  ];
  const hooks = [
    hook('2026-11-14T10:00:00.500Z', { hook_event_name: 'SessionStart' }),
    hook('2026-11-14T10:00:01.200Z', {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_use_id: 't1',
      tool_input: { file_path: 'C:\\repo\\a.ts' },
    }),
    hook('2026-11-14T10:00:01.250Z', {
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
      tool_use_id: 't1',
      duration_ms: 50,
      tool_input: { file_path: 'C:\\repo\\a.ts' },
      tool_response: {},
    }),
    hook('2026-11-14T10:00:02.000Z', {
      hook_event_name: 'Notification',
      message: 'Claude is waiting for your input',
    }),
    hook('2026-11-14T10:00:04.000Z', { hook_event_name: 'SessionEnd', reason: 'other' }),
  ];

  it('keeps each fact once, with the hooks timing', () => {
    const events = normalizeClaudeSession(stream, hooks, ctx);
    valid(events);
    expect(types(events)).toEqual([
      'session.started',
      'usage.updated',
      'tool.called',
      'tool.completed',
      'file.read',
      'notification',
      'usage.updated',
      'session.ended',
    ]);
    expect(events.find((e) => e.type === 'tool.called')?.timestamp).toBe(
      '2026-11-14T10:00:01.200Z',
    );
    expect(events.find((e) => e.type === 'tool.completed')).toMatchObject({
      timestamp: '2026-11-14T10:00:01.250Z',
      durationMs: 50,
    });
    expect(events.at(0)?.timestamp).toBe('2026-11-14T10:00:00.500Z');
    expect(events.at(-1)).toMatchObject({
      type: 'session.ended',
      timestamp: '2026-11-14T10:00:04.000Z',
      reason: 'other',
    });
    expect(events.find((e) => e.type === 'notification')).toMatchObject({ kind: 'idle' });
  });

  it('numbers the merged events from 0 without gaps', () => {
    const events = mergeClaudeSession(
      normalizeClaudeStream(stream, ctx),
      normalizeClaudeHooks(hooks, ctx),
      ctx,
    );
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i));
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });
});

describe('normalizeOllamaChat', () => {
  it('joins the reply and derives tokens per second', () => {
    const events = normalizeOllamaChat(
      [
        {
          model: 'llama3.2',
          created_at: '2026-11-14T10:00:00.000Z',
          message: { role: 'assistant', content: 'Hel' },
          done: false,
        },
        {
          model: 'llama3.2',
          created_at: '2026-11-14T10:00:00.100Z',
          message: { role: 'assistant', content: 'lo' },
          done: false,
        },
        {
          model: 'llama3.2',
          created_at: '2026-11-14T10:00:00.200Z',
          message: { role: 'assistant', content: '' },
          done: true,
          prompt_eval_count: 10,
          eval_count: 50,
          eval_duration: 1_000_000_000,
        },
      ],
      ctx,
    );
    valid(events);
    expect(events[0]).toMatchObject({
      type: 'message.assistant',
      text: 'Hello',
      agentId: 'ollama:llama3.2',
      provider: 'ollama',
    });
    expect(events[1]).toMatchObject({
      type: 'usage.updated',
      inputTokens: 10,
      outputTokens: 50,
      tokensPerSecond: 50,
    });
  });
});
