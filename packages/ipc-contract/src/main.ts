// Main-process side of the contract: registers one handler per contract method on ipcMain.
//
// Every call goes through the same gate, in this order:
//   1. sender check (the app decides what a trusted frame is: top-level, app origin, own window);
//   2. request validation with the method's zod schema (at most one argument);
//   3. the handler;
//   4. response validation, so a handler bug can never leak unexpected data to the renderer.
// Failures become an `{ ok: false }` envelope: no exception ever crosses the IPC boundary.
//
// This module does not import Electron, so the gate is unit-testable with a fake ipcMain.
import type { z } from 'zod';
import {
  contract,
  listMethods,
  type HandlerContext,
  type Handlers,
  type InvokeSpec,
  type IpcEnvelope,
  type IpcErrorCode,
} from './contract';

/** The part of an IPC event the gate reads. Electron's IpcMainInvokeEvent satisfies it. */
export interface IpcSenderEvent {
  readonly senderFrame?: { readonly url: string } | null;
}

/** The part of Electron's ipcMain the registrar uses. */
export interface IpcMainLike<E> {
  handle(channel: string, listener: (event: E, ...args: unknown[]) => unknown): void;
  removeHandler(channel: string): void;
}

export interface IpcFailure {
  readonly channel: string;
  readonly code: IpcErrorCode;
  /** The original error, for the main-process log only: it is never sent to the renderer. */
  readonly cause?: unknown;
}

export interface RegisterOptions<E> {
  /** Must return true only for the app's own top-level frame. */
  isTrustedSender(event: E): boolean;
  /** Called for every refused or failed call (logging). */
  onFailure?(failure: IpcFailure): void;
}

function fail(code: IpcErrorCode, message: string): IpcEnvelope {
  return { ok: false, error: { code, message } };
}

/** Readable summary of a zod error: paths and messages only, never the received values. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('; ')
    .slice(0, 500);
}

/**
 * Registers the handlers of every contract method. Returns a function that removes them.
 * Throws if a handler is missing: the types already require all of them, this guards `as` casts.
 */
export function registerIpcHandlers<E extends IpcSenderEvent>(
  ipcMain: IpcMainLike<E>,
  handlers: Handlers,
  options: RegisterOptions<E>,
): () => void {
  const registered: string[] = [];
  const table = handlers as unknown as Record<string, Record<string, unknown>>;

  for (const [ns, name, spec] of listMethods()) {
    const handler = table[ns]?.[name];
    if (typeof handler !== 'function') {
      throw new Error(`Missing IPC handler for ${spec.channel}`);
    }
    ipcMain.handle(spec.channel, (event, ...args) =>
      gate(spec, handler as GateHandler, options, event, args),
    );
    registered.push(spec.channel);
  }

  return () => {
    for (const channel of registered) ipcMain.removeHandler(channel);
  };
}

type GateHandler = (request: unknown, context: HandlerContext) => unknown;

async function gate<E extends IpcSenderEvent>(
  spec: InvokeSpec,
  handler: GateHandler,
  options: RegisterOptions<E>,
  event: E,
  args: unknown[],
): Promise<IpcEnvelope> {
  const report = (code: IpcErrorCode, cause?: unknown) =>
    options.onFailure?.({ channel: spec.channel, code, cause });

  let trusted: boolean;
  try {
    trusted = options.isTrustedSender(event);
  } catch (cause) {
    report('untrusted-sender', cause);
    return fail('untrusted-sender', 'Sender check failed');
  }
  const senderUrl = event.senderFrame?.url;
  if (!trusted || typeof senderUrl !== 'string') {
    report('untrusted-sender');
    return fail('untrusted-sender', 'Sender not allowed');
  }

  if (args.length > 1) {
    report('invalid-request');
    return fail('invalid-request', 'Expected at most one argument');
  }
  const request = spec.request.safeParse(args[0]);
  if (!request.success) {
    report('invalid-request', request.error);
    return fail('invalid-request', describeIssues(request.error));
  }

  let raw: unknown;
  try {
    raw = await handler(request.data, { senderUrl });
  } catch (cause) {
    report('handler-failed', cause);
    // The message stays generic: handler errors may carry paths or other local details.
    return fail('handler-failed', 'Request failed');
  }

  const response = spec.response.safeParse(raw);
  if (!response.success) {
    report('invalid-response', response.error);
    return fail('invalid-response', 'Invalid response from main process');
  }
  return { ok: true, value: response.data };
}

export { contract };
