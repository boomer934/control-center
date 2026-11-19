// Project model channels (phase 5a, ADR 0012). The model itself is defined in
// @control-center/project-model/schema; here it only gets the workspace it belongs to.
import { ProjectDeltaSchema, ProjectSnapshotSchema } from '@control-center/project-model/schema';
import { z } from 'zod';
import { WorkspaceIdSchema } from './workspace';

export const ProjectWorkspaceSchema = z.strictObject({ workspaceId: WorkspaceIdSchema });

export const ProjectOpenResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), snapshot: ProjectSnapshotSchema }),
  z.strictObject({
    ok: z.literal(false),
    error: z.enum(['workspace-unavailable', 'failed']),
  }),
]);
export type ProjectOpenResult = z.infer<typeof ProjectOpenResultSchema>;

/**
 * Pushed to the windows that opened the model. A `delta` applies to `revision - 1`; a window
 * that missed one calls `project:open` again for a fresh snapshot.
 */
export const ProjectUpdateSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    workspaceId: WorkspaceIdSchema,
    kind: z.literal('delta'),
    delta: ProjectDeltaSchema,
  }),
  z.strictObject({ workspaceId: WorkspaceIdSchema, kind: z.literal('failed') }),
]);
export type ProjectUpdate = z.infer<typeof ProjectUpdateSchema>;
