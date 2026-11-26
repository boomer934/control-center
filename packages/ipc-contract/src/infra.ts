import { z } from 'zod';
import { detectedErrorSchema } from '@control-center/event-schema';
import { SourcePathSchema, WorkspaceIdSchema } from './workspace';

const count = z.int().nonnegative();

export const MachineSnapshotSchema = z.strictObject({
  docker: z.strictObject({ running: count }).nullable(),
  ports: z.strictObject({ listening: count, wildcard: count }).nullable(),
  gpu: z.strictObject({ usedMiB: count, totalMiB: count }).nullable(),
  ollama: z
    .strictObject({
      models: z
        .array(
          z.strictObject({
            name: z.string().min(1).max(180),
            inVram: z.boolean(),
          }),
        )
        .max(128),
    })
    .nullable(),
});

export type MachineSnapshot = z.infer<typeof MachineSnapshotSchema>;

export const ProjectErrorContextSchema = detectedErrorSchema
  .pick({
    message: true,
    language: true,
    origin: true,
    line: true,
    column: true,
  })
  .extend({ path: z.string().max(1024).pipe(SourcePathSchema).optional() });
export type ProjectErrorContext = z.infer<typeof ProjectErrorContextSchema>;

export const ExplainProjectErrorSchema = z.strictObject({
  workspaceId: WorkspaceIdSchema,
  error: ProjectErrorContextSchema,
});
export const OllamaModelNameSchema = z.string().regex(/^[A-Za-z0-9_.:/-]{1,180}$/);
export const ExplainProjectErrorResultSchema = z.union([
  z.enum(['unavailable', 'no-model', 'busy', 'failed']),
  z.strictObject({ model: OllamaModelNameSchema, text: z.string().min(1).max(16_000) }),
]);
export type ExplainProjectErrorResult = z.infer<typeof ExplainProjectErrorResultSchema>;
