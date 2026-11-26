import { z } from 'zod';
import { fileRefSchema } from './path';

/**
 * Version of the persisted event format. Bump it on any breaking change and add a migration, so
 * recorded sessions stay replayable (see docs/memoria/PIANO.md, "Versionamento", and ADR 0003).
 */
export const SCHEMA_VERSION = 2 as const;

export const providerSchema = z.enum(['claude', 'ollama']);
export type Provider = z.infer<typeof providerSchema>;

/** Where an event was derived from: Claude Code stream-json, Claude Code hooks, Ollama, the app. */
export const sourceSchema = z.enum(['stream', 'hooks', 'ollama', 'app']);
export type Source = z.infer<typeof sourceSchema>;

/**
 * The agent an event belongs to: `main` for the session's own agent, `sub:<toolUseId>` for a
 * subagent (keyed by the tool call that spawned it), `ollama:<name>` for a local agent.
 */
export const agentIdSchema = z
  .string()
  .regex(/^(?:main|sub:[A-Za-z0-9_-]+|ollama:[A-Za-z0-9_.:/-]+)$/, 'unknown agent id form');
export type AgentId = z.infer<typeof agentIdSchema>;

export const eventEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1),
  sessionId: z.string().min(1),
  /** Position of the event in its session, from 0, without gaps. */
  seq: z.int().nonnegative(),
  timestamp: z.iso.datetime(),
  source: sourceSchema,
  provider: providerSchema,
  agentId: agentIdSchema,
});
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

/** How the Live view draws a tool call (read ≠ write, see docs/memoria/DESIGN.md). */
export const toolKindSchema = z.enum([
  'read',
  'search',
  'write',
  'shell',
  'agent',
  'mcp',
  'web',
  'other',
]);
export type ToolKind = z.infer<typeof toolKindSchema>;

export const failureReasonSchema = z.enum([
  'not-found',
  'denied',
  'tests-failing',
  'interrupted',
  'failed',
]);
export type FailureReason = z.infer<typeof failureReasonSchema>;

const toolUseId = z.string().min(1);
const nonNeg = z.number().nonnegative();
const tokens = z.int().nonnegative();
const text = z.string();

const event = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  eventEnvelopeSchema.extend({ type: z.literal(type), ...shape });

export const sessionStartedSchema = event('session.started', {
  model: z.string().optional(),
  permissionMode: z.string().optional(),
  cliVersion: z.string().optional(),
});
export const sessionEndedSchema = event('session.ended', {
  ok: z.boolean(),
  /** `blocked`: the agent stopped to ask the user something. */
  status: z.enum(['completed', 'blocked', 'failed']).optional(),
  reason: z.string().optional(),
  summary: text.optional(),
  durationMs: nonNeg.optional(),
  turns: z.int().nonnegative().optional(),
  costUsd: nonNeg.optional(),
});

export const messageUserSchema = event('message.user', { text });
export const messageAssistantSchema = event('message.assistant', {
  text,
  model: z.string().optional(),
});

export const toolCalledSchema = event('tool.called', {
  toolUseId,
  tool: z.string().min(1),
  kind: toolKindSchema,
  /** What the call is about, already cleaned: a path, a command line, a pattern, a task. */
  target: text.nullable(),
});
export const toolCompletedSchema = event('tool.completed', {
  toolUseId,
  durationMs: nonNeg.optional(),
  /** Workspace files a search returned. */
  files: z.array(fileRefSchema).optional(),
});
export const toolFailedSchema = event('tool.failed', {
  toolUseId,
  reason: failureReasonSchema,
  /** Short, cleaned explanation: "1 failing", the tool's error message. */
  detail: text.optional(),
  durationMs: nonNeg.optional(),
});

export const fileReadSchema = event('file.read', { toolUseId, file: fileRefSchema });
export const fileWrittenSchema = event('file.written', {
  toolUseId,
  file: fileRefSchema,
  op: z.enum(['create', 'edit']),
  diff: z.strictObject({ add: z.int().nonnegative(), del: z.int().nonnegative() }).optional(),
});

/** The envelope `agentId` is the new agent; `parentAgentId` the one that spawned it. */
export const agentSpawnedSchema = event('agent.spawned', {
  parentAgentId: agentIdSchema,
  name: z.string().min(1),
  task: text.optional(),
  model: z.string().optional(),
  toolUseId: toolUseId.optional(),
});
export const agentFinishedSchema = event('agent.finished', {
  ok: z.boolean(),
  durationMs: nonNeg.optional(),
  tokens: tokens.optional(),
});

export const mcpCalledSchema = event('mcp.called', {
  toolUseId,
  server: z.string().min(1),
  tool: z.string().min(1),
});

export const permissionRequestedSchema = event('permission.requested', {
  toolUseId: toolUseId.optional(),
  tool: z.string().optional(),
  detail: text.optional(),
});
export const permissionResolvedSchema = event('permission.resolved', {
  toolUseId: toolUseId.optional(),
  tool: z.string().optional(),
  decision: z.enum(['allowed', 'denied']),
  /** `policy`: settings or rules decided; `user`: a person answered. */
  by: z.enum(['user', 'policy', 'hook']),
  detail: text.optional(),
});

export const usageUpdatedSchema = event('usage.updated', {
  /** `message`: one model response; `session`: running total reported at the end of a turn. */
  scope: z.enum(['message', 'session']),
  model: z.string().optional(),
  inputTokens: tokens,
  outputTokens: tokens,
  cacheReadTokens: tokens,
  cacheCreationTokens: tokens,
  costUsd: nonNeg.optional(),
  /** Local models only (Ollama): generation speed. */
  tokensPerSecond: nonNeg.optional(),
});

export const notificationSchema = event('notification', {
  kind: z.enum(['permission', 'idle', 'other']),
  message: text,
});

/** Where the output that showed an error came from (phase 5e). */
export const errorOriginSchema = z.enum(['terminal', 'command', 'docker', 'dev-server', 'test']);
export type ErrorOrigin = z.infer<typeof errorOriginSchema>;

/** Which stack trace parser recognized the error (`node` covers TypeScript too). */
export const errorLanguageSchema = z.enum(['node', 'python', 'go', 'rust', 'browser']);
export type ErrorLanguage = z.infer<typeof errorLanguageSchema>;

export const MAX_ERROR_FRAMES = 20;

/** One frame of a stack trace, or the location of a compiler diagnostic. */
export const stackFrameSchema = z.strictObject({
  file: fileRefSchema,
  line: z.int().positive().optional(),
  column: z.int().positive().optional(),
  /** Function name, as the runtime printed it. */
  fn: z.string().min(1).max(200).optional(),
});
export type StackFrame = z.infer<typeof stackFrameSchema>;

/**
 * An error found in the output of the project (terminal, agent commands, containers, dev
 * servers). `file` is the culprit: the frame in the workspace closest to the failure, outside
 * dependencies; absent when no frame is in the workspace.
 */
export const errorDetectedSchema = event('error.detected', {
  origin: errorOriginSchema,
  language: errorLanguageSchema,
  /** "TypeError: Cannot read properties of undefined", already cleaned. */
  message: text.max(500),
  file: fileRefSchema.optional(),
  line: z.int().positive().optional(),
  column: z.int().positive().optional(),
  frames: z.array(stackFrameSchema).max(MAX_ERROR_FRAMES),
  /** The agent command whose output showed the error. */
  toolUseId: toolUseId.optional(),
});

/** The error itself, without the envelope: what the parsers produce and the terminal pushes. */
export const detectedErrorSchema = errorDetectedSchema.pick({
  origin: true,
  language: true,
  message: true,
  file: true,
  line: true,
  column: true,
  frames: true,
  toolUseId: true,
});
export type DetectedError = z.infer<typeof detectedErrorSchema>;

export const agentEventSchema = z.discriminatedUnion('type', [
  sessionStartedSchema,
  sessionEndedSchema,
  messageUserSchema,
  messageAssistantSchema,
  toolCalledSchema,
  toolCompletedSchema,
  toolFailedSchema,
  fileReadSchema,
  fileWrittenSchema,
  agentSpawnedSchema,
  agentFinishedSchema,
  mcpCalledSchema,
  permissionRequestedSchema,
  permissionResolvedSchema,
  usageUpdatedSchema,
  notificationSchema,
  errorDetectedSchema,
]);
export type AgentEvent = z.infer<typeof agentEventSchema>;
export type AgentEventType = AgentEvent['type'];
export type EventOf<T extends AgentEventType> = Extract<AgentEvent, { type: T }>;

export const AGENT_EVENT_TYPES = agentEventSchema.options.map(
  (o) => o.shape.type.value,
) as AgentEventType[];
