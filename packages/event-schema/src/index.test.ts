import { describe, expect, it } from 'vitest';
import {
  AGENT_EVENT_TYPES,
  agentEventSchema,
  eventEnvelopeSchema,
  providerSchema,
  SCHEMA_VERSION,
} from './index';

const envelope = {
  schemaVersion: SCHEMA_VERSION,
  id: 'evt-1',
  sessionId: 'session-1',
  seq: 0,
  timestamp: '2026-11-13T10:00:00.000Z',
  source: 'stream',
  provider: 'claude',
  agentId: 'main',
} as const;

const ws = (path: string) => ({ path, external: false });

/** One valid example of every event type. */
const SAMPLES: Record<string, Record<string, unknown>> = {
  'session.started': {
    model: 'claude-sonnet-5-5',
    permissionMode: 'default',
    cliVersion: '2.1.322',
  },
  'session.ended': { ok: true, status: 'completed', durationMs: 1200, turns: 2, costUsd: 0.12 },
  'message.user': { text: 'Run the tests' },
  'message.assistant': { text: 'Done.', model: 'claude-sonnet-5-5' },
  'tool.called': { toolUseId: 'toolu_1', tool: 'Read', kind: 'read', target: 'src/a.ts' },
  'tool.completed': { toolUseId: 'toolu_1', durationMs: 12, files: [ws('src/a.ts')] },
  'tool.failed': { toolUseId: 'toolu_1', reason: 'not-found', detail: 'File does not exist.' },
  'file.read': { toolUseId: 'toolu_1', file: ws('src/a.ts') },
  'file.written': {
    toolUseId: 'toolu_2',
    file: ws('src/a.ts'),
    op: 'edit',
    diff: { add: 3, del: 1 },
  },
  'agent.spawned': {
    parentAgentId: 'main',
    name: 'general-purpose',
    task: 'Explore src',
    toolUseId: 'toolu_3',
  },
  'agent.finished': { ok: true, durationMs: 6000, tokens: 55000 },
  'mcp.called': { toolUseId: 'toolu_4', server: 'github', tool: 'list_issues' },
  'permission.requested': { toolUseId: 'toolu_5', tool: 'Bash', detail: 'rm -rf dist' },
  'permission.resolved': { toolUseId: 'toolu_5', tool: 'Bash', decision: 'denied', by: 'policy' },
  'usage.updated': {
    scope: 'message',
    inputTokens: 2,
    outputTokens: 16,
    cacheReadTokens: 100,
    cacheCreationTokens: 0,
  },
  notification: { kind: 'permission', message: 'Claude needs your permission to use Bash' },
};

describe('event envelope', () => {
  it('accepts a valid envelope', () => {
    expect(eventEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it('rejects an envelope from a different schema version', () => {
    expect(eventEnvelopeSchema.safeParse({ ...envelope, schemaVersion: 999 }).success).toBe(false);
  });

  it('only knows the claude and ollama providers', () => {
    expect(providerSchema.options).toEqual(['claude', 'ollama']);
  });

  it('accepts only the known agent id forms', () => {
    for (const agentId of ['main', 'sub:toolu_01ABC', 'ollama:qwen2.5-coder:7b'])
      expect(eventEnvelopeSchema.safeParse({ ...envelope, agentId }).success).toBe(true);
    for (const agentId of ['', 'sub:', 'subagent', 'other:x'])
      expect(eventEnvelopeSchema.safeParse({ ...envelope, agentId }).success).toBe(false);
  });

  it('rejects a negative or fractional seq and a non-ISO timestamp', () => {
    expect(eventEnvelopeSchema.safeParse({ ...envelope, seq: -1 }).success).toBe(false);
    expect(eventEnvelopeSchema.safeParse({ ...envelope, seq: 1.5 }).success).toBe(false);
    expect(eventEnvelopeSchema.safeParse({ ...envelope, timestamp: '14/11/2026' }).success).toBe(
      false,
    );
  });
});

describe('AgentEvent', () => {
  it('has a sample for every event type', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...AGENT_EVENT_TYPES].sort());
  });

  it.each(Object.entries(SAMPLES))('accepts a valid %s', (type, payload) => {
    const result = agentEventSchema.safeParse({ ...envelope, type, ...payload });
    expect(result.success, result.error?.message).toBe(true);
  });

  it('rejects unknown types and unknown fields', () => {
    expect(agentEventSchema.safeParse({ ...envelope, type: 'tool.exploded' }).success).toBe(false);
    expect(
      agentEventSchema.safeParse({ ...envelope, type: 'message.user', text: 'hi', secret: 'x' })
        .success,
    ).toBe(false);
  });

  it('never accepts an absolute or escaping path as a workspace file', () => {
    for (const path of [
      'C:/repo/src/a.ts',
      '/home/user/a.ts',
      '../outside.ts',
      'src\\a.ts',
      '~/a.ts',
    ])
      expect(
        agentEventSchema.safeParse({
          ...envelope,
          type: 'file.read',
          toolUseId: 't',
          file: ws(path),
        }).success,
        path,
      ).toBe(false);
  });

  it('accepts an external path only with the home directory masked', () => {
    const file = (path: string) => ({
      ...envelope,
      type: 'file.read',
      toolUseId: 't',
      file: { path, external: true },
    });
    expect(agentEventSchema.safeParse(file('~/notes.md')).success).toBe(true);
    expect(agentEventSchema.safeParse(file('D:/data/x.csv')).success).toBe(true);
    expect(agentEventSchema.safeParse(file('C:/Users/someone/notes.md')).success).toBe(false);
    expect(agentEventSchema.safeParse(file('/home/someone/notes.md')).success).toBe(false);
  });

  it('rejects an invalid enum value', () => {
    expect(
      agentEventSchema.safeParse({
        ...envelope,
        type: 'tool.failed',
        toolUseId: 't',
        reason: 'oops',
      }).success,
    ).toBe(false);
    expect(
      agentEventSchema.safeParse({
        ...envelope,
        type: 'tool.called',
        toolUseId: 't',
        tool: 'X',
        kind: 'teleport',
        target: null,
      }).success,
    ).toBe(false);
  });
});
