// The normalizers against every committed sanitized recording: each source and the merged
// session must validate against AgentEvent, and the merged timeline must be coherent.
import { describe, expect, it } from 'vitest';
import {
  agentEventSchema,
  findSecrets,
  normalizeClaudeHooks,
  normalizeClaudeSession,
  normalizeClaudeStream,
  normalizeOllamaChat,
  type AgentEvent,
} from '@control-center/event-schema';
import { listClaudeSessions, loadClaudeSession, loadSynthetic } from './index';

const sessions = listClaudeSessions();
const merged = new Map<string, AgentEvent[]>();
for (const name of sessions) {
  const f = loadClaudeSession(name);
  merged.set(name, normalizeClaudeSession(f.stream, f.hooks, { sessionId: name }));
}

const strings = (v: unknown): string[] =>
  typeof v === 'string'
    ? [v]
    : Array.isArray(v)
      ? v.flatMap(strings)
      : v && typeof v === 'object'
        ? Object.values(v).flatMap(strings)
        : [];

function expectValid(events: AgentEvent[]) {
  for (const e of events) {
    const r = agentEventSchema.safeParse(e);
    expect(r.success, `${e.id} ${e.type}: ${r.error?.message}`).toBe(true);
  }
}

it('has at least 5 recorded sessions', () => {
  expect(sessions.length).toBeGreaterThanOrEqual(5);
});

describe.each(sessions)('%s', (name) => {
  const f = loadClaudeSession(name);
  const events = merged.get(name) ?? [];

  it('converts the stream, the hooks and the merged session without validation errors', () => {
    expectValid(normalizeClaudeStream(f.stream, { sessionId: name }));
    expectValid(normalizeClaudeHooks(f.hooks, { sessionId: name }));
    expectValid(events);
    expect(events.length).toBeGreaterThan(0);
  });

  it('starts with session.started, ends with session.ended, in time order without gaps', () => {
    expect(events[0]?.type).toBe('session.started');
    expect(events.at(-1)?.type).toBe('session.ended');
    events.forEach((e, i) => {
      expect(e.seq).toBe(i);
      if (i > 0) expect(e.timestamp >= (events[i - 1]?.timestamp ?? '')).toBe(true);
    });
  });

  it('closes every tool call exactly once, after it started', () => {
    const calls = events.filter((e) => e.type === 'tool.called');
    for (const call of calls) {
      const ends = events.filter(
        (e) =>
          (e.type === 'tool.completed' || e.type === 'tool.failed') &&
          e.toolUseId === call.toolUseId,
      );
      expect(ends, call.toolUseId).toHaveLength(1);
      expect(ends[0]!.seq).toBeGreaterThan(call.seq);
    }
  });

  it('finishes every agent it spawns', () => {
    for (const s of events.filter((e) => e.type === 'agent.spawned'))
      expect(
        events.filter((e) => e.type === 'agent.finished' && e.agentId === s.agentId),
      ).toHaveLength(1);
  });

  it('keeps file paths inside the workspace and no personal data or secrets', () => {
    for (const e of events) {
      if ((e.type === 'file.read' || e.type === 'file.written') && !e.file.external)
        expect(e.file.path).not.toMatch(/^([A-Za-z]:|\/|~|\.\.)/);
      for (const s of strings(e)) {
        expect(findSecrets(s), s).toEqual([]);
        expect(s).not.toMatch(/[A-Za-z]:[\\/]+Users[\\/]+(?!user\b)/i);
        expect(s).not.toContain('C:\\fixtures\\workspace');
      }
    }
  });

  it('matches the recorded timeline', () => {
    const timeline = events.map((e) => {
      const what =
        e.type === 'tool.called'
          ? `${e.tool} ${e.target ?? ''}`
          : e.type === 'tool.failed'
            ? e.reason
            : e.type === 'file.written'
              ? `${e.file.path} ${e.op} +${e.diff?.add ?? 0}-${e.diff?.del ?? 0}`
              : e.type === 'file.read'
                ? e.file.path
                : e.type === 'agent.spawned'
                  ? e.name
                  : e.type === 'session.ended'
                    ? (e.status ?? '')
                    : '';
      return `${e.agentId === 'main' ? 'main' : 'sub '} ${e.type}${what ? ` ${what}` : ''}`;
    });
    expect(timeline).toMatchSnapshot();
  });
});

describe('the whole set', () => {
  const all = [...merged.values()].flat();

  it('covers every behaviour the Live view draws', () => {
    expect(
      all.some((e) => e.type === 'file.written' && e.diff && e.diff.add + e.diff.del > 0),
    ).toBe(true);
    expect(all.some((e) => e.type === 'file.written' && e.op === 'create')).toBe(true);
    expect(all.some((e) => e.type === 'tool.failed' && e.reason === 'not-found')).toBe(true);
    expect(all.some((e) => e.type === 'tool.failed' && e.reason === 'tests-failing')).toBe(true);
    expect(all.some((e) => e.type === 'permission.resolved' && e.decision === 'denied')).toBe(true);
    expect(all.some((e) => e.type === 'agent.spawned')).toBe(true);
    expect(all.some((e) => e.type === 'agent.finished')).toBe(true);
    expect(all.some((e) => e.type === 'usage.updated' && e.scope === 'session')).toBe(true);
    expect(all.some((e) => e.type === 'session.ended' && e.status === 'blocked')).toBe(true);
    expect(all.some((e) => e.agentId !== 'main' && e.type === 'file.read')).toBe(true);
  });
});

describe('ollama-chat (synthetic)', () => {
  it('converts the documented /api/chat stream', () => {
    const events = normalizeOllamaChat(loadSynthetic('ollama-chat'), { sessionId: 'ollama-chat' });
    expectValid(events);
    expect(events.map((e) => e.type)).toEqual(['message.assistant', 'usage.updated']);
    expect(events[0]).toMatchObject({
      text: 'The function `computeTotal` applies the discount as a percentage.',
      agentId: 'ollama:qwen2.5-coder:7b',
    });
    expect(events[1]).toMatchObject({ inputTokens: 182, outputTokens: 24, tokensPerSecond: 50 });
  });
});
