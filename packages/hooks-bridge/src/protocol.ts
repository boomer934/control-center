// Wire protocol between the hook script (one short-lived process per hook) and the app.
//
// One connection carries one message: a single JSON line `{ v, token, payload }`, answered by a
// single JSON line `{ ok, code? }`. The pipe name and the token are random per session and live
// only in the session's bridge file, in the app's data folder (never in the environment, so the
// commands the agent runs do not inherit them). See ADR 0009 and docs/memoria/SICUREZZA.md.
//
// This file runs under Node's type stripping (the hook script is started from source): only
// erasable TypeScript, and relative imports keep their `.ts` extension.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const BRIDGE_PROTOCOL = 1;

/** Largest message the app accepts, newline included. Bigger payloads are trimmed by the script. */
export const MAX_MESSAGE_BYTES = 1024 * 1024;

/** File, inside the session folder, that tells the hook script where and how to deliver. */
export const BRIDGE_FILE = 'bridge.json';

const PIPE_PREFIX = '\\\\.\\pipe\\control-center-';
export const PIPE_NAME = /^\\\\\.\\pipe\\control-center-[0-9a-f]{32}$/;
export const TOKEN = /^[0-9a-f]{64}$/;

/** A fresh, unguessable pipe name: `\\.\pipe\control-center-<128 random bits>`. */
export const newPipeName = (): string => `${PIPE_PREFIX}${randomBytes(16).toString('hex')}`;

/** A fresh session token: 256 random bits, hex. */
export const newToken = (): string => randomBytes(32).toString('hex');

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();

/** Constant-time comparison of a presented token with the session's. */
export const sameToken = (presented: string, expected: string): boolean =>
  timingSafeEqual(digest(presented), digest(expected));

/** The hook events Claude Code sends that the app knows about. */
export const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Notification',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'SessionEnd',
] as const;
export type HookEventName = (typeof HOOK_EVENTS)[number];

const id = z.string().min(1).max(200);

/**
 * A hook payload as Claude Code writes it on the script's stdin. The fields the normalizers read
 * are checked; the rest passes through (the normalizers treat it as untrusted data anyway).
 */
export const hookPayloadSchema = z.looseObject({
  hook_event_name: z.enum(HOOK_EVENTS),
  session_id: id,
  cwd: z.string().min(1).max(4096).optional(),
  agent_id: id.optional(),
  tool_name: id.optional(),
  tool_use_id: id.optional(),
  tool_input: z.record(z.string(), z.unknown()).optional(),
  tool_response: z.unknown().optional(),
  notification_type: z.string().max(100).optional(),
  // long texts are not refused here: the message size limit and encodeMessage bound them
  message: z.string().optional(),
  prompt: z.string().optional(),
  error: z.string().optional(),
  duration_ms: z.number().nonnegative().optional(),
  is_interrupt: z.boolean().optional(),
  reason: z.string().max(200).optional(),
  /** Set by the hook script when it dropped `tool_input`/`tool_response` to fit a message. */
  truncated: z.literal(true).optional(),
});
export type HookPayload = z.infer<typeof hookPayloadSchema>;

/** Contents of the session's bridge file. */
export const bridgeConfigSchema = z.strictObject({
  v: z.literal(BRIDGE_PROTOCOL),
  pipe: z.string().regex(PIPE_NAME),
  token: z.string().regex(TOKEN),
});
export type BridgeConfig = z.infer<typeof bridgeConfigSchema>;

/** Why the app refused a message. Logged with the code only: never the token or the payload. */
export const REJECT_CODES = [
  'too-large',
  'malformed',
  'bad-version',
  'no-token',
  'bad-token',
  'invalid-event',
  'timeout',
  'busy',
] as const;
export type RejectCode = (typeof REJECT_CODES)[number];

/** The message envelope. Its fields are checked one by one by the server, in this order. */
export const bridgeMessageSchema = z.strictObject({
  v: z.literal(BRIDGE_PROTOCOL),
  token: z.string().min(1).max(128),
  payload: z.unknown(),
});
export type BridgeMessage = z.infer<typeof bridgeMessageSchema>;

export const bridgeReplySchema = z.strictObject({
  ok: z.boolean(),
  code: z.enum(REJECT_CODES).optional(),
});
export type BridgeReply = z.infer<typeof bridgeReplySchema>;

/** One message on the wire: compact JSON and a newline. */
export const encodeLine = (value: unknown): string => `${JSON.stringify(value)}\n`;

/** Longest `error` or `message` kept in a trimmed payload. */
const TRIMMED_TEXT = 16_384;

/**
 * The message for a payload, trimmed to fit: when it is too big, the tool's input and response
 * (file contents, command output) and the prompt are dropped, `error` and `message` are cut, and
 * the payload is marked `truncated`.
 */
export function encodeMessage(token: string, payload: HookPayload): string {
  const line = encodeLine({ v: BRIDGE_PROTOCOL, token, payload });
  if (Buffer.byteLength(line, 'utf8') <= MAX_MESSAGE_BYTES) return line;
  const { tool_input: _input, tool_response: _response, prompt: _prompt, ...rest } = payload;
  const trimmed: HookPayload = { ...rest, truncated: true };
  if (rest.error !== undefined) trimmed.error = rest.error.slice(0, TRIMMED_TEXT);
  if (rest.message !== undefined) trimmed.message = rest.message.slice(0, TRIMMED_TEXT);
  return encodeLine({ v: BRIDGE_PROTOCOL, token, payload: trimmed });
}
