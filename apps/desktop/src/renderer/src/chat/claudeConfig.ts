import type { AgentCatalog } from '@control-center/ipc-contract';
import type { ClaudeHistoryRecord } from '@control-center/ipc-contract/claude';

interface Turn {
  model: string | undefined;
  requestedModel: string | null;
  contextTokens: number | undefined;
}

export function claudeTurn(records: readonly ClaudeHistoryRecord[]): Turn | undefined {
  let turn: Turn | undefined;
  let requestedModel: string | null = null;
  let contextTokens: number | undefined;
  for (const record of records) {
    if (record.kind !== 'events') continue;
    for (const event of record.events) {
      if (event.provider !== 'claude' || event.agentId !== 'main') continue;
      if (event.type === 'session.configChanged' && event.by === 'user') {
        requestedModel = event.model ?? null;
      }
      if (event.type === 'session.started') {
        turn = { model: event.model, requestedModel, contextTokens };
      }
      if (event.type === 'usage.updated' && event.scope === 'message') {
        contextTokens = event.inputTokens + event.cacheReadTokens + event.cacheCreationTokens;
        if (turn) turn.contextTokens = contextTokens;
      }
    }
  }
  return turn;
}

export function modelWarning(turn: Turn | undefined, catalog: AgentCatalog | undefined) {
  if (!turn || !catalog) return;
  const requested = catalog.current.model;
  if (requested === turn.requestedModel) return;
  const next = requested ?? catalog.defaults.model;
  const previous = turn.model ?? turn.requestedModel;
  if (next && next === previous) return;
  const family = (model: string | null) =>
    model && /^claude-(fable|opus|sonnet|haiku)-\d/.exec(model)?.[1];
  const sameFamily = Boolean(
    next && previous && (family(previous) === next || family(next) === previous),
  );
  // Match an alias to the last turn's full id only when the choice for that turn supports it.
  // Two explicit versions from the same family can still have different caches.
  if (sameFamily && next === (turn.requestedModel ?? catalog.defaults.model)) return;
  return { contextTokens: turn.contextTokens, uncertain: !next || !previous || sameFamily };
}
