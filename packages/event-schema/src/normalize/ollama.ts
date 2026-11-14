// Ollama `/api/chat` streaming response (NDJSON) → AgentEvents.
//
// Minimal on purpose: the real Ollama bridge (agents, tool calls through MCP) is phase 7. Each
// chunk carries a piece of the reply; the last one (`done: true`) carries the token counts and
// durations in nanoseconds, from which the generation speed is derived.
import type { AgentEvent, AgentId } from '../schema';
import { EPOCH, EventLog, int, isObj, iso, num, str } from './common';
import { makeTextCleaner } from '../path';

export interface OllamaContext {
  sessionId: string;
  /** Defaults to `ollama:<model>`. */
  agentId?: AgentId;
  cwd?: string;
}

export function normalizeOllamaChat(chunks: readonly unknown[], ctx: OllamaContext): AgentEvent[] {
  const records = chunks.filter(isObj);
  const log = new EventLog(ctx.sessionId, 'ollama', 'ollama');
  const clean = makeTextCleaner(ctx.cwd ?? '');
  let reply = '';
  let model: string | undefined;
  let now = records.map((c) => iso(c.created_at)).find((t) => t !== undefined) ?? EPOCH;

  for (const c of records) {
    now = iso(c.created_at) ?? now;
    model ??= str(c.model);
    const message = isObj(c.message) ? c.message : undefined;
    reply += str(message?.content) ?? '';
    if (c.done !== true) continue;

    const agentId: AgentId =
      ctx.agentId ?? `ollama:${(model ?? 'model').replace(/[^A-Za-z0-9_.:/-]/g, '-')}`;
    const text = clean(reply);
    if (text)
      log.push({
        type: 'message.assistant',
        timestamp: now,
        agentId,
        text,
        ...(model ? { model } : {}),
      });
    const evalCount = int(c.eval_count);
    const evalNs = num(c.eval_duration);
    log.push({
      type: 'usage.updated',
      timestamp: now,
      agentId,
      scope: 'message',
      ...(model ? { model } : {}),
      inputTokens: int(c.prompt_eval_count),
      outputTokens: evalCount,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      ...(evalNs && evalNs > 0
        ? { tokensPerSecond: Math.round((evalCount / evalNs) * 1e9 * 10) / 10 }
        : {}),
    });
    reply = '';
  }
  return log.events;
}
