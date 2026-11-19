// Messages between the main process and the project model worker. The main process validates
// every message from the worker with these schemas before using it (rule 4: every boundary has
// a schema), even though the worker is our own code: its data comes from the user's disk.
import { z } from 'zod';
import { ProjectDeltaSchema, ProjectSnapshotSchema } from './schema.ts';

export const WorkerStartSchema = z.strictObject({
  type: z.literal('start'),
  root: z.string().min(1).max(32_767),
  wasmDir: z.string().min(1).max(32_767),
});
export type WorkerStart = z.infer<typeof WorkerStartSchema>;

export const WorkerMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('snapshot'), snapshot: ProjectSnapshotSchema }),
  z.strictObject({ type: z.literal('delta'), delta: ProjectDeltaSchema }),
  /** The first scan failed: the model is not available for this workspace. */
  z.strictObject({ type: z.literal('failed') }),
]);
export type WorkerMessage = z.infer<typeof WorkerMessageSchema>;

/** How often the worker sends accumulated changes. */
export const DELTA_INTERVAL_MS = 100;
