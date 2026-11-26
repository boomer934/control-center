import type { AgentEvent, AgentId, EventOf } from '@control-center/event-schema';
import { timedEvents, type ReplayRecord, type Timeline, type TimelineMark } from './replay';

type Usage = EventOf<'usage.updated'>;
type Tokens = { total: number; cache: number };

export function indexInspection(records: readonly ReplayRecord[], timeline?: Timeline) {
  const marks = timeline?.lanes.flatMap((lane) => lane.marks) ?? [];
  const byId = new Map(marks.map((mark) => [mark.id, mark]));
  const byNode = new Map<string, TimelineMark[]>();
  for (const mark of marks.sort((a, b) => a.at - b.at)) {
    if (!mark.nodeId) continue;
    const list = byNode.get(mark.nodeId) ?? [];
    list.push(mark);
    byNode.set(mark.nodeId, list);
  }
  return { events: timedEvents(records), byId, byNode };
}

/** A turn's final usage replaces the partial message counts for that agent and turn. */
export function summarizeEvents(events: readonly AgentEvent[]) {
  const turns = new Map<AgentId, { messages: Tokens; final?: Tokens | undefined }>();
  const usage = new Map<AgentId, Tokens>();
  const calls = new Map<string, EventOf<'tool.called'>>();
  const failures = new Map<AgentId, EventOf<'tool.failed'>>();
  const permissions = new Map<AgentId, EventOf<'permission.requested'>>();
  const writes = new Map<string, EventOf<'file.written'>>();
  const reads = new Set<string>();
  const localCalls = new Map<string, EventOf<'tool.called'>>();
  let durationMs = 0;
  let hasDuration = false;

  function tally(id: AgentId, tokens: Tokens) {
    const previous = usage.get(id) ?? { total: 0, cache: 0 };
    usage.set(id, { total: previous.total + tokens.total, cache: previous.cache + tokens.cache });
  }

  const flush = () => {
    for (const [id, turn] of turns) tally(id, turn.final ?? turn.messages);
    turns.clear();
  };

  function count(event: Usage) {
    const cache = event.cacheReadTokens + event.cacheCreationTokens;
    const total = event.inputTokens + event.outputTokens + cache;
    const turn = turns.get(event.agentId) ?? { messages: { total: 0, cache: 0 } };
    if (event.scope === 'session') turn.final = { total, cache };
    else turn.messages = { total: turn.messages.total + total, cache: turn.messages.cache + cache };
    turns.set(event.agentId, turn);
  }

  for (const event of events) {
    switch (event.type) {
      case 'session.started':
        if (event.agentId === 'main') flush();
        break;
      case 'session.ended':
        if (event.agentId === 'main' && event.durationMs !== undefined) {
          durationMs += event.durationMs;
          hasDuration = true;
        }
        permissions.delete(event.agentId);
        for (const [id, call] of localCalls)
          if (call.agentId === event.agentId) localCalls.delete(id);
        break;
      case 'tool.called':
        calls.set(event.toolUseId, event);
        if (event.kind === 'shell') localCalls.set(event.toolUseId, event);
        permissions.delete(event.agentId);
        break;
      case 'tool.failed':
        failures.set(event.agentId, event);
        // A failed or completed command is no longer running.
        localCalls.delete(event.toolUseId);
        break;
      case 'tool.completed':
        localCalls.delete(event.toolUseId);
        break;
      case 'permission.requested':
        permissions.set(event.agentId, event);
        break;
      case 'permission.resolved':
        permissions.delete(event.agentId);
        break;
      case 'file.read':
        if (!event.file.external) reads.add(event.file.path);
        break;
      case 'file.written':
        if (!event.file.external) writes.set(event.file.path, event);
        break;
      case 'usage.updated':
        count(event);
        break;
    }
  }
  flush();
  let total = 0;
  let cache = 0;
  let local = 0;
  for (const [id, tokens] of usage) {
    total += tokens.total;
    cache += tokens.cache;
    if (id.startsWith('ollama:')) local += tokens.total;
  }
  return {
    calls,
    failures,
    permissions,
    usage,
    reads,
    writes,
    commands: [...localCalls.values()],
    total,
    cache,
    local,
    durationMs: hasDuration ? durationMs : undefined,
  };
}
