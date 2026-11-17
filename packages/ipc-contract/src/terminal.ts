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
export const TerminalUpdateSchema = z.discriminatedUnion('kind', [
  TerminalWriteSchema.extend({ kind: z.literal('output') }),
  TerminalTargetSchema.extend({ kind: z.literal('exit'), exitCode: z.int() }),
]);
export type TerminalUpdate = z.infer<typeof TerminalUpdateSchema>;
