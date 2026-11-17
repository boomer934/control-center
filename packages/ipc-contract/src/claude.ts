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

export const ClaudeWorkspaceSchema = z.strictObject({ workspaceId: WorkspaceIdSchema });
export const ClaudeHistoryTargetSchema = ClaudeWorkspaceSchema.extend({ historyId: z.uuid() });
export const ClaudeStartSchema = ClaudeTargetSchema.extend({
  workspaceId: WorkspaceIdSchema,
  historyId: z.uuid().optional(),
});
export const ClaudeStartResultSchema = z.enum([
  'started',
  'workspace-unavailable',
  'claude-unavailable',
  'history-unavailable',
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

export const MAX_CLAUDE_PERMISSION_REQUESTS = 16;
export const MAX_CLAUDE_PERMISSION_DETAILS = 16_384;
export const ClaudePermissionChoiceSchema = z.enum(['approve', 'deny', 'session']);
export type ClaudePermissionChoice = z.infer<typeof ClaudePermissionChoiceSchema>;
export const ClaudeRespondSchema = ClaudeTargetSchema.extend({
  requestId: z.uuid(),
  choice: ClaudePermissionChoiceSchema,
});
export const ClaudePermissionSchema = z.strictObject({
  requestId: z.uuid(),
  tool: z.string().min(1).max(256),
  details: z.string().max(MAX_CLAUDE_PERMISSION_DETAILS),
  truncated: z.boolean(),
  canRemember: z.boolean(),
});
export type ClaudePermission = z.infer<typeof ClaudePermissionSchema>;

export const ClaudePromptSchema = z.strictObject({
  kind: z.literal('prompt'),
  text: z.string().max(MAX_CLAUDE_MESSAGE_CHARS),
});
export const ClaudeEventsSchema = z.strictObject({
  kind: z.literal('events'),
  events: z.array(agentEventSchema).min(1).max(CLAUDE_EVENTS_PER_UPDATE),
});
export const ClaudeHistoryRecordSchema = z.discriminatedUnion('kind', [
  ClaudePromptSchema,
  ClaudeEventsSchema,
]);
export type ClaudeHistoryRecord = z.infer<typeof ClaudeHistoryRecordSchema>;
export const ClaudeHistoryListSchema = z
  .array(
    z.strictObject({
      id: z.uuid(),
      title: z.string().max(120),
      updatedAt: z.iso.datetime(),
    }),
  )
  .max(25);
export type ClaudeHistorySummary = z.infer<typeof ClaudeHistoryListSchema>[number];
export const ClaudeHistorySchema = z.strictObject({
  records: z.array(ClaudeHistoryRecordSchema),
  resumable: z.boolean(),
});
export type ClaudeHistory = z.infer<typeof ClaudeHistorySchema>;

export const MAX_CLAUDE_PARTIAL_CHARS = 100_000;
export const ClaudeUpdateSchema = z.discriminatedUnion('kind', [
  ClaudeTargetSchema.extend({
    kind: z.literal('permissions'),
    requests: z.array(ClaudePermissionSchema).max(MAX_CLAUDE_PERMISSION_REQUESTS),
  }),
  ClaudeEventsSchema.extend(ClaudeTargetSchema.shape),
  ClaudePromptSchema.extend(ClaudeTargetSchema.shape),
  ClaudeTargetSchema.extend({
    kind: z.literal('partial'),
    text: z.string().max(MAX_CLAUDE_PARTIAL_CHARS),
  }),
  ClaudeTargetSchema.extend({
    kind: z.literal('status'),
    status: ClaudeStatusSchema,
    /** False when hook events are off (no suitable Node): the timeline comes from the stream. */
    hooks: z.boolean(),
  }),
]);
export type ClaudeUpdate = z.infer<typeof ClaudeUpdateSchema>;
