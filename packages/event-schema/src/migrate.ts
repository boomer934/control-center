// Migrations of persisted AgentEvents (ADR 0003, ADR 0015). Events saved by an older version of
// the app (the chat history of phase 4.3) are brought to SCHEMA_VERSION before validation, one
// step at a time, so a recorded session stays replayable after a breaking change.
import { agentEventSchema, SCHEMA_VERSION, type AgentEvent } from './schema';

type Step = (event: Record<string, unknown>) => Record<string, unknown>;

/** `STEPS[n]` turns an event of version n into one of version n + 1. */
const STEPS: Readonly<Record<number, Step>> = {
  // 1 → 2: `error.detected` joins the union. Every v1 event is a valid v2 event.
  1: (event) => ({ ...event, schemaVersion: 2 }),
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Brings a persisted event to the current schema version. Returns the value unchanged when it is
 * not an event of a known older version (current, newer or malformed): validation decides then.
 */
export function migrateAgentEvent(value: unknown): unknown {
  if (!isRecord(value)) return value;
  let event = value;
  let version = event.schemaVersion;
  while (typeof version === 'number' && version < SCHEMA_VERSION) {
    const step = STEPS[version];
    if (!step) return value;
    event = step(event);
    version = event.schemaVersion;
  }
  return event;
}

/** Migrates, then validates, a persisted event. */
export function parseAgentEvent(
  value: unknown,
): { success: true; data: AgentEvent } | { success: false } {
  const parsed = agentEventSchema.safeParse(migrateAgentEvent(value));
  return parsed.success ? { success: true, data: parsed.data } : { success: false };
}
