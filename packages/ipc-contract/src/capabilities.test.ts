import { describe, expect, it } from 'vitest';
import {
  CapabilityEntrySchema,
  CapabilityIdSchema,
  CapabilityListSchema,
  CapabilityMarkSeenSchema,
} from './capabilities';

const entry = {
  agent: 'claude',
  kind: 'model',
  id: 'opus',
  label: 'Opus 5.5',
  tags: ['effort:high'],
  status: 'new',
  firstSeen: { version: '2.1.326', at: '2026-11-27T10:00:00.000Z' },
  changedAt: '2026-11-27T10:00:00.000Z',
};

describe('capability schemas (phase 5h)', () => {
  it('accepts an inventory entry and nothing beyond its fields', () => {
    expect(CapabilityEntrySchema.parse(entry)).toEqual(entry);
    expect(CapabilityEntrySchema.safeParse({ ...entry, account: { email: 'x' } }).success).toBe(
      false,
    );
    expect(CapabilityEntrySchema.safeParse({ ...entry, agent: 'ollama' }).success).toBe(false);
    expect(CapabilityEntrySchema.safeParse({ ...entry, label: 'x'.repeat(121) }).success).toBe(
      false,
    );
    expect(
      CapabilityEntrySchema.safeParse({
        ...entry,
        firstSeen: { version: '1; rm', at: entry.changedAt },
      }).success,
    ).toBe(false);
  });

  it('takes printable ids without whitespace', () => {
    for (const ok of ['opus', 'plugin:skill', 'mcp__server__tool', 'ui_surface_v1'])
      expect(CapabilityIdSchema.safeParse(ok).success).toBe(true);
    for (const bad of ['', 'two words', 'tab\there', 'line\n', 'x'.repeat(201)])
      expect(CapabilityIdSchema.safeParse(bad).success).toBe(false);
  });

  it('bounds the list and requires a revision to mark news as seen', () => {
    expect(CapabilityListSchema.parse({ revision: 0, agents: [], entries: [] })).toBeTruthy();
    expect(CapabilityMarkSeenSchema.safeParse({}).success).toBe(false);
    expect(CapabilityMarkSeenSchema.safeParse({ revision: 3 }).success).toBe(true);
    expect(CapabilityMarkSeenSchema.safeParse({ revision: 3, agent: 'codex' }).success).toBe(true);
  });
});
