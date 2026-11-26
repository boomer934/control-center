// Public entry point of @control-center/event-schema: the AgentEvent schema (zod), path and
// secret helpers, and the normalizers that turn agent output into AgentEvents.
export * from './schema';
export { fileRefSchema, maskHome, makeTextCleaner, toFileRef, workspacePathSchema } from './path';
export type { FileRef } from './path';
export { findSecrets, redactSecrets, SECRET_PATTERNS } from './redact';
export type { SecretPattern } from './redact';
export * from './normalize';
export { migrateAgentEvent, parseAgentEvent } from './migrate';
export {
  DEV_SERVER_BANNER,
  detectErrors,
  findErrors,
  MAX_ERRORS_PER_SCAN,
  originOfCommand,
  prepareLines,
  STACK_PARSERS,
} from './stack';
export type { DetectOptions, ErrorDraft, Found, RawError, RawFrame, StackParser } from './stack';
