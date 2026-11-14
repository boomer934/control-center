export { normalizeClaudeStream } from './claude-stream';
export { normalizeClaudeHooks } from './claude-hooks';
export { mergeClaudeSession } from './merge';
export { normalizeOllamaChat, type OllamaContext } from './ollama';
export { failingCount, toolKind, type NormalizeContext } from './common';

import type { AgentEvent } from '../schema';
import { normalizeClaudeHooks } from './claude-hooks';
import { normalizeClaudeStream } from './claude-stream';
import type { NormalizeContext } from './common';
import { mergeClaudeSession } from './merge';

/** Stream-json lines + hook records of one Claude Code session → one ordered AgentEvent list. */
export function normalizeClaudeSession(
  stream: readonly unknown[],
  hooks: readonly unknown[],
  ctx: NormalizeContext,
): AgentEvent[] {
  return mergeClaudeSession(
    normalizeClaudeStream(stream, ctx),
    normalizeClaudeHooks(hooks, ctx),
    ctx,
  );
}
