import { describe, expect, it } from 'vitest';
import { eventEnvelopeSchema, providerSchema, SCHEMA_VERSION } from './index';

describe('event envelope', () => {
  it('accepts a valid envelope', () => {
    const result = eventEnvelopeSchema.safeParse({
      schemaVersion: SCHEMA_VERSION,
      id: 'evt-1',
      sessionId: 'session-1',
      timestamp: '2026-11-13T10:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an envelope from a different schema version', () => {
    const result = eventEnvelopeSchema.safeParse({
      schemaVersion: 999,
      id: 'evt-1',
      sessionId: 'session-1',
      timestamp: '2026-11-13T10:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('only knows the claude and ollama providers', () => {
    expect(providerSchema.options).toEqual(['claude', 'ollama']);
  });
});
