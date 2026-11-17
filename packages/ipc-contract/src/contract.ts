// The complete list of IPC methods between the renderer and the main process.
//
// Every method is an explicit, named channel with a zod schema for the request and one for the
// response. There is deliberately no generic channel ("run command", "read any file", "eval"):
// adding a capability means adding a method here, with its own narrow schemas, and a reviewed
// handler in the main process. See docs/memoria/SICUREZZA.md.
import { z } from 'zod';

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

/** Channel names: `namespace:kebab-name`, lowercase. */
const CHANNEL_NAME = /^[a-z]+(?:-[a-z]+)*:[a-z]+(?:-[a-z]+)*$/;

function invoke<C extends string, Req extends z.ZodType, Res extends z.ZodType>(
  channel: C,
  request: Req,
  response: Res,
): InvokeSpec<C, Req, Res> {
  if (!CHANNEL_NAME.test(channel)) throw new Error(`Invalid IPC channel name: ${channel}`);
  return Object.freeze({ kind: 'invoke', channel, request, response });
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

// ── Contract ────────────────────────────────────────────────────────────────

export const contract = {
  app: {
    getInfo: invoke('app:get-info', NoRequest, AppInfoSchema),
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
  },
  shell: {
    openExternal: invoke(
      'shell:open-external',
      OpenExternalRequestSchema,
      OpenExternalResponseSchema,
    ),
  },
} as const;

export type Contract = typeof contract;
export type Namespace = keyof Contract;

/** Every method of the contract as `[namespace, method, spec]`. */
export function listMethods(): Array<[string, string, InvokeSpec]> {
  const out: Array<[string, string, InvokeSpec]> = [];
  for (const [ns, methods] of Object.entries(contract)) {
    for (const [name, spec] of Object.entries(methods)) out.push([ns, name, spec as InvokeSpec]);
  }
  return out;
}

/** Every channel name of the contract. */
export function listChannels(): string[] {
  return listMethods().map(([, , spec]) => spec.channel);
}

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

/** The typed API the preload exposes as `window.api`. */
export type Api = {
  readonly [NS in Namespace]: {
    readonly [M in keyof Contract[NS]]: MethodOf<Contract[NS][M]>;
  };
};

type HandlerOf<S> =
  S extends InvokeSpec<string, infer Req, infer Res>
    ? (request: z.output<Req>, context: HandlerContext) => z.input<Res> | Promise<z.input<Res>>
    : never;

/** What a main-process handler knows about the caller (already checked as trusted). */
export interface HandlerContext {
  /** URL of the frame that sent the request. */
  readonly senderUrl: string;
}

/** One handler per contract method: the main process must implement all of them. */
export type Handlers = {
  readonly [NS in Namespace]: {
    readonly [M in keyof Contract[NS]]: HandlerOf<Contract[NS][M]>;
  };
};
