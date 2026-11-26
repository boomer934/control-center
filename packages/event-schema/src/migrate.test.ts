import { describe, expect, it } from 'vitest';
import { migrateAgentEvent, parseAgentEvent } from './migrate';
import { SCHEMA_VERSION } from './schema';

const v1 = {
  schemaVersion: 1,
  id: 's:0',
  sessionId: 's',
  seq: 0,
  timestamp: '2026-11-17T10:00:00.000Z',
  source: 'stream',
  provider: 'claude',
  agentId: 'main',
  type: 'tool.called',
  toolUseId: 't1',
  tool: 'Read',
  kind: 'read',
  target: 'src/a.ts',
};

describe('event migrations', () => {
  it('brings a v1 event to the current version', () => {
    const parsed = parseAgentEvent(v1);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual({ ...v1, schemaVersion: SCHEMA_VERSION });
  });

  it('leaves current events alone and does not mutate the input', () => {
    const current = { ...v1, schemaVersion: SCHEMA_VERSION };
    expect(migrateAgentEvent(current)).toBe(current);
    migrateAgentEvent(v1);
    expect(v1.schemaVersion).toBe(1);
  });

  it('rejects unknown, future and malformed versions', () => {
    expect(parseAgentEvent({ ...v1, schemaVersion: 0 }).success).toBe(false);
    expect(parseAgentEvent({ ...v1, schemaVersion: SCHEMA_VERSION + 1 }).success).toBe(false);
    expect(parseAgentEvent({ ...v1, schemaVersion: '1' }).success).toBe(false);
    expect(parseAgentEvent(null).success).toBe(false);
  });

  it('validates error.detected with the current schema', () => {
    const { toolUseId: _t, tool: _tool, kind: _k, target: _target, ...envelope } = v1;
    const error = {
      ...envelope,
      schemaVersion: SCHEMA_VERSION,
      type: 'error.detected',
      origin: 'terminal',
      language: 'node',
      message: 'Error: x',
      file: { path: 'src/a.ts', external: false },
      line: 3,
      frames: [{ file: { path: 'src/a.ts', external: false }, line: 3, column: 1, fn: 'f' }],
    };
    expect(parseAgentEvent(error).success).toBe(true);
    expect(parseAgentEvent({ ...error, origin: 'nowhere' }).success).toBe(false);
    expect(parseAgentEvent({ ...error, line: 0 }).success).toBe(false);
    expect(
      parseAgentEvent({ ...error, file: { path: 'C:/Users/me/a.ts', external: false } }).success,
    ).toBe(false);
  });
});
