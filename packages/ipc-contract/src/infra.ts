import { z } from 'zod';

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
