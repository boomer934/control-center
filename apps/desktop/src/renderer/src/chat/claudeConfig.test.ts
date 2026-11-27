import { SCHEMA_VERSION, type AgentEvent } from '@control-center/event-schema';
import type { AgentCatalog } from '@control-center/ipc-contract';
import { expect, it } from 'vitest';
import { claudeTurn, modelWarning } from './claudeConfig';

const base = {
  schemaVersion: SCHEMA_VERSION,
  sessionId: 'config-test',
  id: 'config-test:0',
  timestamp: '2026-11-27T12:00:00.000Z',
  seq: 0,
  agentId: 'main',
  provider: 'claude',
  source: 'stream',
} as const;

const catalog: AgentCatalog = {
  models: [],
  defaults: { model: 'sonnet', effort: null },
  current: { model: 'sonnet', effort: 'high' },
};
const started: AgentEvent = { ...base, type: 'session.started', model: 'claude-sonnet-5-5' };
const usage = {
  ...base,
  type: 'usage.updated',
  scope: 'message',
  inputTokens: 100,
  outputTokens: 50,
  cacheReadTokens: 1000,
  cacheCreationTokens: 200,
} as const satisfies AgentEvent;

it('estimates the context from the most recent main message and recognizes CLI aliases', () => {
  const turn = claudeTurn([
    {
      kind: 'events',
      events: [
        started,
        { ...usage, inputTokens: 10 },
        usage,
        { ...usage, agentId: 'sub:test', inputTokens: 9000 },
        { ...usage, scope: 'session', inputTokens: 9000 },
      ],
    },
  ]);
  expect(modelWarning(turn, catalog)).toBeUndefined();
  expect(modelWarning(turn, { ...catalog, current: { model: 'opus', effort: null } })).toEqual({
    contextTokens: 1300,
    uncertain: false,
  });
  expect(
    modelWarning(turn, { ...catalog, current: { model: 'claude-sonnet-4-6', effort: null } }),
  ).toMatchObject({ uncertain: false });
});

it('warns about an unconfirmed model change when the last turn did not report its model', () => {
  const turn = claudeTurn([{ kind: 'events', events: [{ ...started, model: undefined }] }]);
  expect(
    modelWarning(turn, { ...catalog, current: { model: null, effort: 'high' } }),
  ).toBeUndefined();
  expect(modelWarning(turn, catalog)).toMatchObject({ uncertain: true });
  expect(modelWarning(undefined, catalog)).toBeUndefined();
});

it('treats switching from a pinned version to its family alias as a possible model change', () => {
  const turn = claudeTurn([
    {
      kind: 'events',
      events: [
        { ...base, type: 'session.configChanged', by: 'user', model: 'claude-sonnet-4-6' },
        { ...started, model: 'claude-sonnet-4-6' },
      ],
    },
  ]);
  expect(modelWarning(turn, catalog)).toMatchObject({ uncertain: true });
});
