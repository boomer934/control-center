// The hook script's end of the bridge: one connection, one message, one answer.
import { connect } from 'node:net';
import {
  bridgeConfigSchema,
  bridgeReplySchema,
  encodeMessage,
  hookPayloadSchema,
  type BridgeConfig,
  type BridgeReply,
} from './protocol.ts';

/** What happened to a delivery: the app's answer, or why there was none. */
export type DeliveryResult = BridgeReply | { ok: false; code: 'unreachable' | 'no-answer' };

export function sendHookEvent(
  config: BridgeConfig,
  payload: unknown,
  timeoutMs = 3000,
): Promise<DeliveryResult> {
  const cfg = bridgeConfigSchema.parse(config);
  const event = hookPayloadSchema.parse(payload);
  const message = encodeMessage(cfg.token, event);
  return new Promise((resolve) => {
    let answer = '';
    let settled = false;
    const settle = (result: DeliveryResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };
    const socket = connect(cfg.pipe);
    const timer = setTimeout(() => settle({ ok: false, code: 'no-answer' }), timeoutMs);
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(message));
    socket.on('error', () => settle({ ok: false, code: 'unreachable' }));
    socket.on('data', (chunk: string) => {
      answer += chunk;
      const nl = answer.indexOf('\n');
      if (nl < 0) {
        if (answer.length > 1024) settle({ ok: false, code: 'no-answer' });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(answer.slice(0, nl));
      } catch {
        return settle({ ok: false, code: 'no-answer' });
      }
      const reply = bridgeReplySchema.safeParse(parsed);
      settle(reply.success ? reply.data : { ok: false, code: 'no-answer' });
    });
    socket.on('close', () => settle({ ok: false, code: 'no-answer' }));
  });
}
