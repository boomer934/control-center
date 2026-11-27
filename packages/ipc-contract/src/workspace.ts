import { z } from 'zod';
import { workspacePathSchema } from '@control-center/event-schema';

export const WorkspaceIdSchema = z.hash('sha256', { enc: 'hex' });
export const WorkspacePathSchema = z.string().min(1).max(32_767);
export const SourcePathSchema = workspacePathSchema.pipe(WorkspacePathSchema);
export const SourceLocationSchema = z.strictObject({
  workspaceId: WorkspaceIdSchema,
  path: SourcePathSchema,
  line: z.int().positive(),
  column: z.int().positive().optional(),
});
export const MAX_SOURCE_BYTES = 1024 * 1024;
export const SourceTextSchema = z.string().max(MAX_SOURCE_BYTES).nullable();
export const MAX_RECENT_WORKSPACES = 20;

export const RecentWorkspaceRootsSchema = z.array(WorkspacePathSchema).max(MAX_RECENT_WORKSPACES);

const WorkspaceSchema = z.strictObject({
  id: WorkspaceIdSchema,
  root: WorkspacePathSchema,
  name: WorkspacePathSchema,
});
export type WorkspaceDto = z.infer<typeof WorkspaceSchema>;

export const WorkspaceStateSchema = z.strictObject({
  active: WorkspaceSchema.nullable(),
  recent: z.array(WorkspaceSchema).max(MAX_RECENT_WORKSPACES),
});
export type WorkspaceState = z.infer<typeof WorkspaceStateSchema>;
