import { z } from 'zod';

/**
 * Version of the persisted event format. Bump it on any breaking change and add a
 * migration, so recorded sessions stay replayable (see docs/memoria/PIANO.md, "Versionamento").
 *
 * The full AgentEvent union is designed in Phase 2. This is the minimal foundation.
 */
export const SCHEMA_VERSION = 1 as const;

export const providerSchema = z.enum(['claude', 'ollama']);
export type Provider = z.infer<typeof providerSchema>;

export const eventEnvelopeSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1),
  sessionId: z.string().min(1),
  timestamp: z.iso.datetime(),
});
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
