// Claude Code sessions (phase 4.1): the renderer opens a session in the active workspace, sends
// messages, interrupts or closes it, and receives its AgentEvents and status as push updates.
// The renderer never names a program, a flag or a path: the main process decides how `claude`
// runs (see apps/desktop/src/main/claude and ADR 0009).
import { agentEventSchema } from '@control-center/event-schema';
import { z } from 'zod';
import { WorkspaceIdSchema } from './workspace';

export const MAX_CLAUDE_SESSIONS = 4;
export const MAX_CLAUDE_MESSAGE_CHARS = 100_000;
/** Events per push: a burst is split into several updates. */
export const CLAUDE_EVENTS_PER_UPDATE = 200;

export const ClaudeSessionIdSchema = z.uuid();
export const ClaudeTargetSchema = z.strictObject({ id: ClaudeSessionIdSchema });

export const ClaudeStartSchema = ClaudeTargetSchema.extend({ workspaceId: WorkspaceIdSchema });
export const ClaudeStartResultSchema = z.enum([
  'started',
  'workspace-unavailable',
  'claude-unavailable',
  'limit',
  'failed',
]);
export type ClaudeStartResult = z.infer<typeof ClaudeStartResultSchema>;

export const ClaudeSendSchema = ClaudeTargetSchema.extend({
  text: z.string().min(1).max(MAX_CLAUDE_MESSAGE_CHARS),
});
export const ClaudeSendResultSchema = z.enum([
  'started',
  'busy',
  'closed',
  'workspace-unavailable',
]);
export type ClaudeSendResult = z.infer<typeof ClaudeSendResultSchema>;

export const ClaudeStatusSchema = z.enum(['idle', 'running', 'closed']);

export const ClaudeUpdateSchema = z.discriminatedUnion('kind', [
  ClaudeTargetSchema.extend({
    kind: z.literal('events'),
    events: z.array(agentEventSchema).min(1).max(CLAUDE_EVENTS_PER_UPDATE),
  }),
  ClaudeTargetSchema.extend({
    kind: z.literal('status'),
    status: ClaudeStatusSchema,
    /** False when hook events are off (no suitable Node): the timeline comes from the stream. */
    hooks: z.boolean(),
  }),
]);
export type ClaudeUpdate = z.infer<typeof ClaudeUpdateSchema>;
