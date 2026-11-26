import { detectedErrorSchema } from '@control-center/event-schema';
import { z } from 'zod';
import { WorkspaceIdSchema } from './workspace';

export const TERMINAL_CHUNK_SIZE = 16_384;
export const MAX_TERMINALS = 8;
export const TerminalIdSchema = z.uuid();
const TerminalShellSchema = z.enum(['powershell', 'bash']);
export type TerminalShell = z.infer<typeof TerminalShellSchema>;
export const TerminalSizeSchema = z.strictObject({
  cols: z.int().min(2).max(500),
  rows: z.int().min(1).max(250),
});
export type TerminalSize = z.infer<typeof TerminalSizeSchema>;

export const TerminalStartSchema = TerminalSizeSchema.extend({
  id: TerminalIdSchema,
  workspaceId: WorkspaceIdSchema,
  shell: TerminalShellSchema,
});
export type TerminalStart = z.infer<typeof TerminalStartSchema>;
export const TerminalResultSchema = z.enum([
  'started',
  'workspace-unavailable',
  'shell-unavailable',
  'limit',
]);
export const TerminalTargetSchema = z.strictObject({ id: TerminalIdSchema });
export const TerminalWriteSchema = TerminalTargetSchema.extend({
  data: z.string().min(1).max(TERMINAL_CHUNK_SIZE),
});
export const TerminalResizeSchema = TerminalTargetSchema.extend(TerminalSizeSchema.shape);
/** Errors per push: the scanner of a terminal reports at most this many at once (phase 5e). */
export const MAX_TERMINAL_ERRORS = 20;
export const TerminalErrorSchema = detectedErrorSchema.extend({
  /** When the output that showed it arrived. */
  at: z.iso.datetime(),
});
export type TerminalError = z.infer<typeof TerminalErrorSchema>;
export const TerminalUpdateSchema = z.discriminatedUnion('kind', [
  TerminalWriteSchema.extend({ kind: z.literal('output') }),
  TerminalTargetSchema.extend({ kind: z.literal('exit'), exitCode: z.int() }),
  TerminalTargetSchema.extend({
    kind: z.literal('errors'),
    errors: z.array(TerminalErrorSchema).min(1).max(MAX_TERMINAL_ERRORS),
  }),
]);
export type TerminalUpdate = z.infer<typeof TerminalUpdateSchema>;
