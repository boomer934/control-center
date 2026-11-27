// The complete list of IPC channels between the renderer and the main process.
//
// Two kinds of channel, both explicit and named, each with zod schemas:
//   - methods (`invoke`): renderer → main, a request schema and a response schema;
//   - events (`event`): main → renderer pushes, a payload schema (ADR 0007).
// There is deliberately no generic channel ("run command", "read any file", "eval"): adding a
// capability means adding a channel here, with its own narrow schemas, and reviewed code in the
// main process. See docs/memoria/SICUREZZA.md.
import { z } from 'zod';
import {
  ExplainProjectErrorResultSchema,
  ExplainProjectErrorSchema,
  CancelProjectErrorExplanationSchema,
  MachineSnapshotSchema,
} from './infra';
import {
  GitCheckpointTargetSchema,
  GitCommitSchema,
  GitDiffRequestSchema,
  GitDiffSchema,
  GitMutationSchema,
  GitPreviewSchema,
  GitRestoreRequestSchema,
  GitRestoreSchema,
  GitStageSchema,
  GitStatusSchema,
  GitWorkspaceSchema,
} from './git';
import { AgentConfigureResultSchema } from './agent-config';
import { AppUpdateStatusSchema } from './app-update';
import {
  CapabilitiesChangedSchema,
  CapabilityListSchema,
  CapabilityMarkSeenResultSchema,
  CapabilityMarkSeenSchema,
} from './capabilities';
import {
  ClaudeConfigureSchema,
  ClaudeHistoryListSchema,
  ClaudeHistorySchema,
  ClaudeHistoryTargetSchema,
  ClaudeRespondSchema,
  ClaudeSendResultSchema,
  ClaudeSendSchema,
  ClaudeStartResultSchema,
  ClaudeStartSchema,
  ClaudeTargetSchema,
  ClaudeUpdateSchema,
  ClaudeWorkspaceSchema,
} from './claude';
import {
  CodexConfigureSchema,
  CodexHistoryListSchema,
  CodexHistorySchema,
  CodexHistoryTargetSchema,
  CodexRespondSchema,
  CodexSendResultSchema,
  CodexSendSchema,
  CodexStartResultSchema,
  CodexStartSchema,
  CodexTargetSchema,
  CodexUpdateSchema,
  CodexWorkspaceSchema,
} from './codex';
import {
  TerminalResizeSchema,
  TerminalResultSchema,
  TerminalStartSchema,
  TerminalTargetSchema,
  TerminalUpdateSchema,
  TerminalWriteSchema,
} from './terminal';
import { ProjectOpenResultSchema, ProjectUpdateSchema, ProjectWorkspaceSchema } from './project';
import {
  SourceLocationSchema,
  SourceTextSchema,
  WorkspaceIdSchema,
  WorkspacePathSchema,
  WorkspaceStateSchema,
} from './workspace';

/** One request/response method: renderer → main, answered by a single handler. */
export interface InvokeSpec<
  C extends string = string,
  Req extends z.ZodType = z.ZodType,
  Res extends z.ZodType = z.ZodType,
> {
  readonly kind: 'invoke';
  readonly channel: C;
  readonly request: Req;
  readonly response: Res;
}

/** One push event: main → renderer, delivered only to the app's trusted windows. */
export interface EventSpec<C extends string = string, P extends z.ZodType = z.ZodType> {
  readonly kind: 'event';
  readonly channel: C;
  readonly payload: P;
}

export type ChannelSpec = InvokeSpec | EventSpec;

/** Channel names: `namespace:kebab-name`, lowercase. */
const CHANNEL_NAME = /^[a-z]+(?:-[a-z]+)*:[a-z]+(?:-[a-z]+)*$/;

function checkChannel(channel: string): void {
  if (!CHANNEL_NAME.test(channel)) throw new Error(`Invalid IPC channel name: ${channel}`);
}

function invoke<C extends string, Req extends z.ZodType, Res extends z.ZodType>(
  channel: C,
  request: Req,
  response: Res,
): InvokeSpec<C, Req, Res> {
  checkChannel(channel);
  return Object.freeze({ kind: 'invoke', channel, request, response });
}

function event<C extends string, P extends z.ZodType>(channel: C, payload: P): EventSpec<C, P> {
  checkChannel(channel);
  return Object.freeze({ kind: 'event', channel, payload });
}

/** Methods without arguments take no payload at all. */
const NoRequest = z.undefined();

// ── Schemas ─────────────────────────────────────────────────────────────────

export const AppInfoSchema = z
  .object({
    name: z.string().min(1).max(100),
    version: z.string().min(1).max(50),
    electron: z.string().min(1).max(50),
    chrome: z.string().min(1).max(50),
    node: z.string().min(1).max(50),
    platform: z.string().min(1).max(20),
    packaged: z.boolean(),
  })
  .strict();
export type AppInfo = z.infer<typeof AppInfoSchema>;

export const OpenExternalRequestSchema = z
  .object({
    // The main process still checks the scheme (https only) before opening anything.
    url: z.string().min(1).max(2048),
  })
  .strict();

export const OpenExternalResponseSchema = z
  .object({
    opened: z.boolean(),
  })
  .strict();

// ── Errors Console (phase 3b) ───────────────────────────────────────────────

export const ERROR_ORIGINS = ['main', 'renderer', 'child', 'ipc'] as const;
export const ERROR_KINDS = [
  'uncaught-exception',
  'unhandled-rejection',
  'window-error',
  'render-error',
  'process-gone',
  'child-stderr',
  'child-exit',
  'child-spawn',
  'ipc-failure',
  'bridge-rejected',
  'claude-setup',
  'codex-setup',
  'capabilities',
] as const;

export const StackFrameSchema = z
  .object({
    fn: z.string().max(300).nullable(),
    file: z.string().max(500),
    line: z.number().int().nonnegative().nullable(),
    column: z.number().int().nonnegative().nullable(),
    kind: z.enum(['project', 'dependency', 'internal']),
  })
  .strict();

export const ErrorGroupSchema = z
  .object({
    id: z.string().min(1).max(40),
    origin: z.enum(ERROR_ORIGINS),
    source: z.string().max(200),
    kind: z.enum(ERROR_KINDS),
    name: z.string().max(200),
    message: z.string().max(2000),
    frames: z.array(StackFrameSchema).max(60),
    count: z.number().int().positive(),
    firstSeen: z.string().max(40),
    lastSeen: z.string().max(40),
  })
  .strict();
export type ErrorGroupDto = z.infer<typeof ErrorGroupSchema>;

export const ErrorListSchema = z
  .object({
    /** Changes whenever a group is added, counted or cleared. */
    revision: z.number().int().nonnegative(),
    groups: z.array(ErrorGroupSchema).max(200),
  })
  .strict();

/** What the renderer may report about its own errors. The main process cleans and bounds it. */
export const RendererErrorReportSchema = z
  .object({
    kind: z.enum(['window-error', 'unhandled-rejection', 'render-error']),
    name: z.string().max(200),
    message: z.string().max(4000),
    stack: z.string().max(20_000),
  })
  .strict();

export const RendererErrorAckSchema = z.object({ id: z.string().max(40) }).strict();
export const CopyReportResponseSchema = z
  .object({ copied: z.boolean(), groups: z.number().int().nonnegative() })
  .strict();
export const ClearErrorsResponseSchema = z
  .object({ cleared: z.number().int().nonnegative() })
  .strict();

/** Pushed when the error groups change: the renderer then reloads `errors:list`. */
export const ErrorsChangedSchema = z.object({ revision: z.number().int().nonnegative() }).strict();

// ── Contract ────────────────────────────────────────────────────────────────

export const contract = {
  app: {
    getInfo: invoke('app:get-info', NoRequest, AppInfoSchema),
    getUpdateStatus: invoke('app:get-update-status', NoRequest, AppUpdateStatusSchema),
    setUpdateEnabled: invoke(
      'app:set-update-enabled',
      z.object({ enabled: z.boolean() }).strict(),
      AppUpdateStatusSchema,
    ),
    restartToUpdate: invoke(
      'app:restart-to-update',
      NoRequest,
      z.object({ restarting: z.boolean() }).strict(),
    ),
    updateStatus: event('app:update-status', AppUpdateStatusSchema),
  },
  errors: {
    list: invoke('errors:list', NoRequest, ErrorListSchema),
    reportRenderer: invoke(
      'errors:report-renderer',
      RendererErrorReportSchema,
      RendererErrorAckSchema,
    ),
    copyReport: invoke('errors:copy-report', NoRequest, CopyReportResponseSchema),
    clear: invoke('errors:clear', NoRequest, ClearErrorsResponseSchema),
    changed: event('errors:changed', ErrorsChangedSchema),
  },
  shell: {
    openExternal: invoke(
      'shell:open-external',
      OpenExternalRequestSchema,
      OpenExternalResponseSchema,
    ),
  },
  workspace: {
    getState: invoke('workspace:get-state', NoRequest, WorkspaceStateSchema),
    chooseFolder: invoke('workspace:choose-folder', NoRequest, WorkspaceStateSchema.nullable()),
    selectRecent: invoke(
      'workspace:select-recent',
      z.strictObject({ id: WorkspaceIdSchema }),
      WorkspaceStateSchema.nullable(),
    ),
    openFile: invoke(
      'workspace:open-file',
      z.strictObject({
        workspaceId: WorkspaceIdSchema,
        path: WorkspacePathSchema,
        source: z.enum(['terminal', 'problems']),
      }),
      z.boolean(),
    ),
    readSourceLocation: invoke(
      'workspace:read-source-location',
      SourceLocationSchema,
      SourceTextSchema,
    ),
  },
  terminal: {
    start: invoke('terminal:start', TerminalStartSchema, TerminalResultSchema),
    write: invoke('terminal:write', TerminalWriteSchema, z.boolean()),
    resize: invoke('terminal:resize', TerminalResizeSchema, z.boolean()),
    close: invoke('terminal:close', TerminalTargetSchema, z.boolean()),
    updated: event('terminal:updated', TerminalUpdateSchema),
  },
  claude: {
    start: invoke('claude:start', ClaudeStartSchema, ClaudeStartResultSchema),
    send: invoke('claude:send', ClaudeSendSchema, ClaudeSendResultSchema),
    respond: invoke('claude:respond', ClaudeRespondSchema, z.boolean()),
    configure: invoke('claude:configure', ClaudeConfigureSchema, AgentConfigureResultSchema),
    listHistory: invoke('claude:list-history', ClaudeWorkspaceSchema, ClaudeHistoryListSchema),
    readHistory: invoke(
      'claude:read-history',
      ClaudeHistoryTargetSchema,
      ClaudeHistorySchema.nullable(),
    ),
    interrupt: invoke('claude:interrupt', ClaudeTargetSchema, z.boolean()),
    close: invoke('claude:close', ClaudeTargetSchema, z.boolean()),
    updated: event('claude:updated', ClaudeUpdateSchema),
  },
  codex: {
    start: invoke('codex:start', CodexStartSchema, CodexStartResultSchema),
    send: invoke('codex:send', CodexSendSchema, CodexSendResultSchema),
    respond: invoke('codex:respond', CodexRespondSchema, z.boolean()),
    configure: invoke('codex:configure', CodexConfigureSchema, AgentConfigureResultSchema),
    listHistory: invoke('codex:list-history', CodexWorkspaceSchema, CodexHistoryListSchema),
    readHistory: invoke(
      'codex:read-history',
      CodexHistoryTargetSchema,
      CodexHistorySchema.nullable(),
    ),
    interrupt: invoke('codex:interrupt', CodexTargetSchema, z.boolean()),
    close: invoke('codex:close', CodexTargetSchema, z.boolean()),
    updated: event('codex:updated', CodexUpdateSchema),
  },
  capabilities: {
    list: invoke('capabilities:list', NoRequest, CapabilityListSchema),
    markSeen: invoke(
      'capabilities:mark-seen',
      CapabilityMarkSeenSchema,
      CapabilityMarkSeenResultSchema,
    ),
    changed: event('capabilities:changed', CapabilitiesChangedSchema),
  },
  git: {
    status: invoke('git:status', GitWorkspaceSchema, GitStatusSchema),
    diff: invoke('git:diff', GitDiffRequestSchema, GitDiffSchema),
    stage: invoke('git:stage', GitStageSchema, GitMutationSchema),
    commit: invoke('git:commit', GitCommitSchema, GitMutationSchema),
    preview: invoke('git:preview', GitCheckpointTargetSchema, GitPreviewSchema),
    restore: invoke('git:restore', GitRestoreRequestSchema, GitRestoreSchema),
  },
  project: {
    open: invoke('project:open', ProjectWorkspaceSchema, ProjectOpenResultSchema),
    updated: event('project:updated', ProjectUpdateSchema),
  },
  infra: {
    snapshot: invoke('infra:snapshot', NoRequest, MachineSnapshotSchema),
    explainProjectError: invoke(
      'infra:explain-project-error',
      ExplainProjectErrorSchema,
      ExplainProjectErrorResultSchema,
    ),
    cancelProjectErrorExplanation: invoke(
      'infra:cancel-project-error-explanation',
      CancelProjectErrorExplanationSchema,
      z.boolean(),
    ),
  },
} as const;

export type Contract = typeof contract;
export type Namespace = keyof Contract;

/** `changed` → `onChanged`: the name under which an event is exposed in `window.api`. */
export function listenerName(event: string): string {
  return `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;
}

function listSpecs(): Array<[string, string, ChannelSpec]> {
  const out: Array<[string, string, ChannelSpec]> = [];
  for (const [ns, specs] of Object.entries(contract)) {
    for (const [name, spec] of Object.entries(specs)) out.push([ns, name, spec as ChannelSpec]);
  }
  return out;
}

/** Every method of the contract as `[namespace, method, spec]`. */
export function listMethods(): Array<[string, string, InvokeSpec]> {
  return listSpecs().filter((e): e is [string, string, InvokeSpec] => e[2].kind === 'invoke');
}

/** Every event of the contract as `[namespace, event, spec]`. */
export function listEvents(): Array<[string, string, EventSpec]> {
  return listSpecs().filter((e): e is [string, string, EventSpec] => e[2].kind === 'event');
}

/** Every channel name of the contract, methods and events, in declaration order. */
export function listChannels(): string[] {
  return listSpecs().map(([, , spec]) => spec.channel);
}

/** Fails fast if an event's `onX` name would shadow a method of the same namespace. */
export function assertNoNameClash(): void {
  for (const [ns, name] of listEvents()) {
    const exposed = listenerName(name);
    if (exposed in contract[ns as Namespace]) {
      throw new Error(`IPC event ${ns}.${name} clashes with ${ns}.${exposed}`);
    }
  }
}
assertNoNameClash();

// ── Envelope ────────────────────────────────────────────────────────────────
// The main process never lets an exception cross the IPC boundary: it always answers with an
// envelope, and the preload turns a failure into an IpcError in the renderer.

export const IPC_ERROR_CODES = [
  'untrusted-sender',
  'invalid-request',
  'invalid-response',
  'handler-failed',
] as const;
export type IpcErrorCode = (typeof IPC_ERROR_CODES)[number];

/** Why the main process did not push an event. Never sent to the renderer: only logged. */
export const IPC_EVENT_FAILURE_CODES = ['unknown-event', 'invalid-event', 'send-failed'] as const;
export type IpcEventFailureCode = (typeof IPC_EVENT_FAILURE_CODES)[number];

export const IpcEnvelopeSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: z.unknown() }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.object({ code: z.enum(IPC_ERROR_CODES), message: z.string().max(2000) }).strict(),
    })
    .strict(),
]);
export type IpcEnvelope = z.infer<typeof IpcEnvelopeSchema>;

/** The error the renderer sees when a call is refused or fails. */
export class IpcError extends Error {
  readonly code: IpcErrorCode;
  constructor(code: IpcErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'IpcError';
    this.code = code;
  }
}

// ── Derived types ───────────────────────────────────────────────────────────

type MethodOf<S> =
  S extends InvokeSpec<string, infer Req, infer Res>
    ? [z.input<Req>] extends [undefined]
      ? () => Promise<z.output<Res>>
      : (request: z.input<Req>) => Promise<z.output<Res>>
    : never;

/** Stops a subscription. Calling it again does nothing. */
export type Unsubscribe = () => void;

type SubscribeOf<S> =
  S extends EventSpec<string, infer P>
    ? (listener: (payload: z.output<P>) => void) => Unsubscribe
    : never;

/** Methods keep their name; an event `changed` becomes `onChanged`. */
type ApiKey<NS extends Namespace, K extends keyof Contract[NS]> = Contract[NS][K] extends EventSpec
  ? `on${Capitalize<K & string>}`
  : K;

type ApiMember<S> = S extends EventSpec ? SubscribeOf<S> : MethodOf<S>;

/** The typed API the preload exposes as `window.api`. */
export type Api = {
  readonly [NS in Namespace]: {
    readonly [K in keyof Contract[NS] as ApiKey<NS, K>]: ApiMember<Contract[NS][K]>;
  };
};

/** The payload type of an event of the contract. */
export type EventPayload<S extends EventSpec> = z.input<S['payload']>;

type HandlerOf<S> =
  S extends InvokeSpec<string, infer Req, infer Res>
    ? (request: z.output<Req>, context: HandlerContext) => z.input<Res> | Promise<z.input<Res>>
    : never;

/** Only the methods of a namespace: events have no handler. */
type MethodKeys<NS extends Namespace> = {
  [K in keyof Contract[NS]]: Contract[NS][K] extends InvokeSpec ? K : never;
}[keyof Contract[NS]];

/** What a main-process handler knows about the caller (already checked as trusted). */
export interface HandlerContext {
  /** URL of the frame that sent the request. */
  readonly senderUrl: string;
  /** ID of the trusted Electron WebContents, when provided by the IPC transport. */
  readonly senderId?: number;
}

/** One handler per contract method: the main process must implement all of them. */
export type Handlers = {
  readonly [NS in Namespace]: {
    readonly [M in MethodKeys<NS>]: HandlerOf<Contract[NS][M]>;
  };
};
