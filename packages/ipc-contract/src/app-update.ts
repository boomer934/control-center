import { z } from 'zod';

export const StableVersionSchema = z
  .string()
  .max(40)
  .regex(/^\d+\.\d+\.\d+$/);

export const AppUpdateStatusSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.enum(['unavailable', 'disabled', 'idle', 'checking', 'error']) }).strict(),
  z
    .object({ phase: z.enum(['downloading', 'ready', 'installing']), version: StableVersionSchema })
    .strict(),
]);

export type AppUpdateStatus = z.infer<typeof AppUpdateStatusSchema>;
