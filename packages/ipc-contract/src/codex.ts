// Codex sessions (phase 5f.1, ADR 0018): the same forms as the `claude` namespace, so the renderer
// drives both providers alike. The main process runs one `codex app-server` per session (JSON-RPC
// over stdio, no shell) and decides the program, the flags and the sandbox: the renderer never
// names any of them.
import { z } from 'zod';
import {
  ClaudeConfigureSchema,
  ClaudeHistoryListSchema,
  ClaudeHistoryRecordSchema,
  ClaudeHistorySchema,
  ClaudeHistoryTargetSchema,
  ClaudeRespondSchema,
  ClaudeSendResultSchema,
  ClaudeSendSchema,
  ClaudeStartSchema,
  ClaudeTargetSchema,
  ClaudeUpdateSchema,
  ClaudeWorkspaceSchema,
  MAX_CLAUDE_MESSAGE_CHARS,
} from './claude';

export const MAX_CODEX_SESSIONS = 4;
export const MAX_CODEX_MESSAGE_CHARS = MAX_CLAUDE_MESSAGE_CHARS;

export const CodexTargetSchema = ClaudeTargetSchema;
export const CodexWorkspaceSchema = ClaudeWorkspaceSchema;
export const CodexHistoryTargetSchema = ClaudeHistoryTargetSchema;
/** `historyId`: a saved Codex session of this workspace to resume (its thread). */
export const CodexStartSchema = ClaudeStartSchema;
export const CodexStartResultSchema = z.enum([
  'started',
  'workspace-unavailable',
  /** No usable `codex` (PATH or the Codex app's package), or not logged in. */
  'codex-unavailable',
  'history-unavailable',
  'limit',
  'failed',
]);
export type CodexStartResult = z.infer<typeof CodexStartResultSchema>;
export const CodexSendSchema = ClaudeSendSchema;
export const CodexSendResultSchema = ClaudeSendResultSchema;
export type CodexSendResult = z.infer<typeof CodexSendResultSchema>;
export const CodexConfigureSchema = ClaudeConfigureSchema;
/** `session`: accept for the rest of the session, offered only when the server allows it. */
export const CodexRespondSchema = ClaudeRespondSchema;
export const CodexHistoryRecordSchema = ClaudeHistoryRecordSchema;
export const CodexHistoryListSchema = ClaudeHistoryListSchema;
export const CodexHistorySchema = ClaudeHistorySchema;
/**
 * Same updates as Claude's. `status.hooks` is always false: Codex has no hook bridge, its timeline
 * comes from the app-server notifications.
 */
export const CodexUpdateSchema = ClaudeUpdateSchema;
export type CodexUpdate = z.infer<typeof CodexUpdateSchema>;
