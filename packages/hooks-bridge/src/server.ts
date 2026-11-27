// The app's end of the bridge: a named pipe server for one session.
//
// Every connection must deliver exactly one well-formed message with the session's token before
// an absolute deadline; anything else is refused with a code. Refusals are counted by code and
// handed to the caller in grouped summaries, at most one per interval and a limited number per
// session, so a flood of bad connections cannot flood the Errors Console; only codes and counts
// leave the server, never a token or a payload. No TCP: a named pipe is local. Its default DACL
// (libuv) gives write access only to the creating user, SYSTEM and Administrators, but read access
// to Everyone and Anonymous; see docs/memoria/SICUREZZA.md for what that leaves open.
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
  type RejectSummary,
} from './protocol.ts';

export interface BridgeServerOptions {
  pipe: string;
  token: string;
  /** A valid event of this session, with the time it arrived. */
  onEvent: (payload: HookPayload, receivedAt: string) => void;
  /** Refused connections, grouped by code. Never receives the token or the payload. */
  onReject: (summary: RejectSummary) => void;
  /** Default MAX_MESSAGE_BYTES. */
  maxBytes?: number;
  /** Time a client has, from connecting, to deliver its whole message. Default 5 s. */
  timeoutMs?: number;
  /** Connections served at once; more are refused as `busy`. Default 16. */
  maxConnections?: number;
  /** Most `data` chunks one message may arrive in; more are refused as `fragmented`. Default 1024. */
  maxFragments?: number;
  /** Refusals are summed over this interval before a summary goes out. Default 2 s. */
  reportIntervalMs?: number;
  /** Summaries per server; after the last one refusals are only counted, until close. Default 20. */
  maxReports?: number;
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
  const maxFragments = options.maxFragments ?? 1024;
  const reportIntervalMs = options.reportIntervalMs ?? 2000;
  const maxReports = options.maxReports ?? 20;
  const sockets = new Set<Socket>();
  let server: Server | undefined;

  // ── refusals, grouped before they reach the caller ──
  let counts: Partial<Record<RejectCode, number>> = {};
  let total = 0;
  let reports = 0;
  let reportTimer: NodeJS.Timeout | undefined;
  const sendSummary = (final: boolean) => {
    if (total === 0) return;
    reports++;
    const summary: RejectSummary = { counts, total, capped: reports === maxReports, final };
    counts = {};
    total = 0;
    try {
      options.onReject(summary);
    } catch {
      // a failing reporter must not stop the server
    }
  };
  const refused = (code: RejectCode) => {
    counts[code] = (counts[code] ?? 0) + 1;
    total++;
    if (reportTimer || reports >= maxReports) return;
    reportTimer = setTimeout(() => {
      reportTimer = undefined;
      sendSummary(false);
    }, reportIntervalMs);
  };

  const handle = (socket: Socket) => {
    let done = false;
    let size = 0;
    const chunks: Buffer[] = [];
    // set once the connection is accepted; `busy` refuses before it exists
    const timer: { deadline?: NodeJS.Timeout } = {};

    const finish = (code?: RejectCode) => {
      if (done) return;
      done = true;
      clearTimeout(timer.deadline);
      if (code) refused(code);
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
    socket.on('close', () => {
      clearTimeout(timer.deadline);
      sockets.delete(socket);
    });
    socket.on('error', () => socket.destroy());
    if (sockets.size > maxConnections) return finish('busy');
    // absolute: a client that trickles a byte at a time does not get more time
    timer.deadline = setTimeout(() => finish('timeout'), timeoutMs);
    socket.on('data', (chunk: Buffer) => {
      if (done) return;
      const nl = chunk.indexOf(0x0a);
      const take = nl >= 0 ? chunk.subarray(0, nl) : chunk;
      size += take.length;
      if (size + (nl >= 0 ? 1 : 0) > maxBytes) return finish('too-large');
      if (chunks.length >= maxFragments) return finish('fragmented');
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
        clearTimeout(reportTimer);
        reportTimer = undefined;
        sendSummary(true);
        if (!server) return resolve();
        server.close(() => resolve());
        server = undefined;
      }),
  };
}
