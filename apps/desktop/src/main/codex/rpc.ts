// JSON-RPC over the stdio of `codex app-server` (one JSON object per line, no `jsonrpc` field):
// the app's requests and their responses, the server's notifications and the server's own
// requests (approvals), each checked by shape before it reaches the session.
//
// The app-server also offers powerful writes (`config/value/write`, `plugin/install`, `fs/*`,
// `command/exec`, `account/*`…). Every client is built with a closed list of the methods it may
// call (./methods.ts): anything else is refused before it is sent.
import { z } from 'zod';

export const MAX_LINE_CHARS = 16 * 1024 * 1024;

const idSchema = z.union([z.int().nonnegative(), z.string().min(1).max(128)]);
const methodSchema = z.string().min(1).max(128);
const errorSchema = z.looseObject({ code: z.number(), message: z.string().max(4096) });

const responseSchema = z.union([
  z.looseObject({ id: idSchema, result: z.unknown() }).refine((m) => !('method' in m)),
  z.looseObject({ id: idSchema, error: errorSchema }).refine((m) => !('method' in m)),
]);
const serverRequestSchema = z.looseObject({
  id: idSchema,
  method: methodSchema,
  params: z.unknown(),
});
const notificationSchema = z.looseObject({ method: methodSchema, params: z.unknown().optional() });

export class RpcError extends Error {
  override name = 'CodexRpcError';
  constructor(
    readonly method: string,
    readonly code: number | 'timeout' | 'closed' | 'refused',
    message: string,
  ) {
    super(message);
  }
}

export interface RpcHandlers {
  onNotification: (method: string, params: unknown) => void;
  onRequest: (id: number | string, method: string, params: unknown) => void;
  /** A line that is not one of the three shapes: counted by the session, never shown. */
  onInvalid: () => void;
  /** A call to a method outside the client's list: refused, never sent. */
  onRefused?: (method: string) => void;
}

export interface RpcClient {
  request<T = unknown>(method: string, params: unknown, timeoutMs?: number): Promise<T>;
  notify(method: string, params?: unknown): void;
  respond(id: number | string, result: unknown): void;
  respondError(id: number | string, code: number, message: string): void;
  /** Feeds stdout text; complete lines are parsed and dispatched. */
  push(chunk: string): void;
  /** The process is gone: every pending request fails. */
  close(): void;
}

export function createRpcClient(
  write: (line: string) => boolean,
  handlers: RpcHandlers,
  /** The only methods this client may call or notify. */
  allowed: ReadonlySet<string>,
  defaultTimeoutMs = 30_000,
): RpcClient {
  const permitted = (method: string) => {
    if (allowed.has(method)) return true;
    handlers.onRefused?.(method.slice(0, 128));
    return false;
  };
  let next = 1;
  let closed = false;
  let buffer = '';
  let discarding = false;
  const pending = new Map<
    number,
    {
      method: string;
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();

  const send = (message: object) => !closed && write(JSON.stringify(message) + '\n');

  const onLine = (text: string) => {
    if (!text.trim()) return;
    if (text.length > MAX_LINE_CHARS) return handlers.onInvalid();
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return handlers.onInvalid();
    }
    const response = responseSchema.safeParse(value);
    if (response.success) {
      const id = response.data.id;
      const call = typeof id === 'number' ? pending.get(id) : undefined;
      if (!call) return; // a late answer to a request that timed out
      pending.delete(id as number);
      clearTimeout(call.timer);
      const error = errorSchema.safeParse((response.data as { error?: unknown }).error).data;
      if (error) call.reject(new RpcError(call.method, error.code, error.message.slice(0, 500)));
      else call.resolve((response.data as { result: unknown }).result);
      return;
    }
    const request = serverRequestSchema.safeParse(value);
    if (request.success)
      return handlers.onRequest(request.data.id, request.data.method, request.data.params);
    const notification = notificationSchema.safeParse(value);
    if (notification.success && !('id' in (value as object)))
      return handlers.onNotification(notification.data.method, notification.data.params);
    handlers.onInvalid();
  };

  return {
    request<T>(method: string, params: unknown, timeoutMs = defaultTimeoutMs): Promise<T> {
      if (!permitted(method))
        return Promise.reject(new RpcError(method, 'refused', 'Not a method this client calls'));
      if (closed) return Promise.reject(new RpcError(method, 'closed', 'The Codex server is gone'));
      const id = next++;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new RpcError(method, 'timeout', `No answer to ${method}`));
        }, timeoutMs);
        pending.set(id, { method, resolve: resolve as (v: unknown) => void, reject, timer });
        if (!send({ id, method, params })) {
          pending.delete(id);
          clearTimeout(timer);
          reject(new RpcError(method, 'closed', 'The Codex server is gone'));
        }
      });
    },
    notify(method, params) {
      if (!permitted(method)) return;
      send(params === undefined ? { method } : { method, params });
    },
    respond(id, result) {
      send({ id, result });
    },
    respondError(id, code, message) {
      send({ id, error: { code, message } });
    },
    push(chunk) {
      if (discarding) {
        const end = chunk.indexOf('\n');
        if (end < 0) return;
        discarding = false;
        chunk = chunk.slice(end + 1);
      }
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        onLine(line);
      }
      if (buffer.length > MAX_LINE_CHARS) {
        buffer = '';
        discarding = true;
        handlers.onInvalid();
      }
    },
    close() {
      if (closed) return;
      if (buffer) onLine(buffer);
      buffer = '';
      closed = true;
      for (const [id, call] of pending) {
        clearTimeout(call.timer);
        call.reject(new RpcError(call.method, 'closed', 'The Codex server is gone'));
        pending.delete(id);
      }
    },
  };
}
