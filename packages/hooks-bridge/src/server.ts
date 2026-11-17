// The app's end of the bridge: a named pipe server for one session.
//
// Every connection must deliver exactly one well-formed message with the session's token within
// the time limit; anything else is refused with a code, and the code (only the code) is reported
// to the caller, which records it in the Errors Console. No TCP: a named pipe is local, and its
// default security descriptor gives write access only to the user who created it.
import { createServer, type Server, type Socket } from 'node:net';
import {
  BRIDGE_PROTOCOL,
  encodeLine,
  hookPayloadSchema,
  MAX_MESSAGE_BYTES,
  PIPE_NAME,
  sameToken,
  TOKEN,
  type HookPayload,
  type RejectCode,
} from './protocol.ts';

export interface BridgeServerOptions {
  pipe: string;
  token: string;
  /** A valid event of this session, with the time it arrived. */
  onEvent: (payload: HookPayload, receivedAt: string) => void;
  /** A refused connection. Never receives the token or the payload. */
  onReject: (code: RejectCode) => void;
  /** Default MAX_MESSAGE_BYTES. */
  maxBytes?: number;
  /** Time a client has to deliver its message. Default 5 s. */
  timeoutMs?: number;
  /** Connections served at once; more are refused as `busy`. Default 16. */
  maxConnections?: number;
}

export interface BridgeServer {
  /** Starts listening. Fails if the pipe already exists (another process holds the name). */
  listen(): Promise<void>;
  close(): Promise<void>;
}

export function createBridgeServer(options: BridgeServerOptions): BridgeServer {
  if (!PIPE_NAME.test(options.pipe)) throw new Error('Invalid bridge pipe name');
  if (!TOKEN.test(options.token)) throw new Error('Invalid bridge token');
  const maxBytes = options.maxBytes ?? MAX_MESSAGE_BYTES;
  const timeoutMs = options.timeoutMs ?? 5000;
  const maxConnections = options.maxConnections ?? 16;
  const sockets = new Set<Socket>();
  let server: Server | undefined;

  const handle = (socket: Socket) => {
    let done = false;
    let size = 0;
    const chunks: Buffer[] = [];

    const finish = (code?: RejectCode) => {
      if (done) return;
      done = true;
      socket.setTimeout(0);
      if (code) {
        try {
          options.onReject(code);
        } catch {
          // a failing reporter must not keep the connection open
        }
      }
      socket.end(encodeLine(code ? { ok: false, code } : { ok: true }));
      socket.destroySoon();
    };

    const deliver = (line: string) => {
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        return finish('malformed');
      }
      if (typeof message !== 'object' || message === null || Array.isArray(message))
        return finish('malformed');
      const m = message as Record<string, unknown>;
      const keys = Object.keys(m);
      if (keys.some((k) => k !== 'v' && k !== 'token' && k !== 'payload'))
        return finish('malformed');
      if (m.v !== BRIDGE_PROTOCOL) return finish('bad-version');
      if (typeof m.token !== 'string' || m.token === '') return finish('no-token');
      if (m.token.length > 128 || !sameToken(m.token, options.token)) return finish('bad-token');
      const payload = hookPayloadSchema.safeParse(m.payload);
      if (!payload.success) return finish('invalid-event');
      const receivedAt = new Date().toISOString();
      finish();
      try {
        options.onEvent(payload.data, receivedAt);
      } catch {
        // the consumer reports its own failures; the hook script has its answer already
      }
    };

    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    if (sockets.size > maxConnections) return finish('busy');
    socket.setTimeout(timeoutMs, () => finish('timeout'));
    socket.on('data', (chunk: Buffer) => {
      if (done) return;
      const nl = chunk.indexOf(0x0a);
      const take = nl >= 0 ? chunk.subarray(0, nl) : chunk;
      size += take.length;
      if (size + (nl >= 0 ? 1 : 0) > maxBytes) return finish('too-large');
      chunks.push(take);
      if (nl >= 0) deliver(Buffer.concat(chunks).toString('utf8'));
    });
    socket.on('end', () => finish('malformed'));
  };

  return {
    listen: () =>
      new Promise((resolve, reject) => {
        if (server) return reject(new Error('Bridge server already listening'));
        const s = createServer({ allowHalfOpen: true }, handle);
        s.once('error', reject);
        s.listen(options.pipe, () => {
          s.off('error', reject);
          s.on('error', () => undefined);
          server = s;
          resolve();
        });
      }),
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        sockets.clear();
        if (!server) return resolve();
        server.close(() => resolve());
        server = undefined;
      }),
  };
}
