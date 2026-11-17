import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BRIDGE_FILE,
  createBridgeServer,
  MAX_MESSAGE_BYTES,
  newPipeName,
  newToken,
  sendHookEvent,
  type BridgeServerOptions,
  type HookPayload,
  type RejectCode,
} from './index.ts';

const BIN = fileURLToPath(new URL('./bin.ts', import.meta.url));
const payload: HookPayload = {
  hook_event_name: 'PreToolUse',
  session_id: 'claude-session',
  cwd: 'C:\\repo',
  tool_name: 'Read',
  tool_use_id: 'toolu_1',
  tool_input: { file_path: 'C:\\repo\\a.ts' },
};

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

async function startServer(extra: Partial<BridgeServerOptions> = {}) {
  const pipe = newPipeName();
  const token = newToken();
  const events: HookPayload[] = [];
  const rejects: RejectCode[] = [];
  const server = createBridgeServer({
    pipe,
    token,
    onEvent: (p) => events.push(p),
    onReject: (code) => rejects.push(code),
    ...extra,
  });
  await server.listen();
  cleanups.push(() => server.close());
  return { pipe, token, events, rejects, server };
}

/** Sends raw bytes and returns the server's answer (or '' if it closed without one). */
function raw(pipe: string, data: string | Buffer | null, keepOpen = false): Promise<string> {
  return new Promise((resolve) => {
    let answer = '';
    const socket = connect(pipe, () => {
      if (data !== null) socket.write(data);
      if (!keepOpen) socket.end();
    });
    socket.setEncoding('utf8');
    socket.on('data', (c: string) => (answer += c));
    socket.on('close', () => resolve(answer));
    socket.on('error', () => resolve(answer));
  });
}

const line = (v: unknown) => `${JSON.stringify(v)}\n`;

describe('bridge server', () => {
  it('accepts a valid event with the session token', async () => {
    const { pipe, token, events, rejects } = await startServer();
    await expect(sendHookEvent({ v: 1, pipe, token }, payload)).resolves.toEqual({ ok: true });
    expect(events).toEqual([payload]);
    expect(rejects).toEqual([]);
  });

  it.each<[string, (token: string) => string | Buffer, RejectCode]>([
    ['without a token', () => line({ v: 1, payload }), 'no-token'],
    ['with an empty token', () => line({ v: 1, token: '', payload }), 'no-token'],
    ['with a wrong token', () => line({ v: 1, token: newToken(), payload }), 'bad-token'],
    [
      'with a token that is too long',
      () => line({ v: 1, token: 'a'.repeat(500), payload }),
      'bad-token',
    ],
    ['that is not JSON', () => 'not json\n', 'malformed'],
    ['that is not an object', (t) => line([1, t]), 'malformed'],
    ['with extra fields', (t) => line({ v: 1, token: t, payload, extra: 1 }), 'malformed'],
    ['with another protocol version', (t) => line({ v: 2, token: t, payload }), 'bad-version'],
    [
      'with an unknown hook event',
      (t) => line({ v: 1, token: t, payload: { ...payload, hook_event_name: 'Bogus' } }),
      'invalid-event',
    ],
    [
      'without a session id',
      (t) => line({ v: 1, token: t, payload: { hook_event_name: 'Stop' } }),
      'invalid-event',
    ],
    [
      'bigger than the limit',
      (t) =>
        `${JSON.stringify({ v: 1, token: t, payload: { ...payload, prompt: 'x'.repeat(MAX_MESSAGE_BYTES) } })}\n`,
      'too-large',
    ],
    [
      'that ends before its newline',
      (t) => JSON.stringify({ v: 1, token: t, payload }),
      'malformed',
    ],
  ])('refuses a message %s', async (_, make, code) => {
    const { pipe, token, events, rejects } = await startServer();
    const answer = await raw(pipe, make(token));
    expect(events).toEqual([]);
    expect(rejects).toEqual([code]);
    // a client that closed its end of the pipe cannot read the answer any more
    if (answer) expect(JSON.parse(answer)).toEqual({ ok: false, code });
  });

  it('refuses a client that sends nothing in time', async () => {
    const { pipe, rejects } = await startServer({ timeoutMs: 100 });
    const answer = await raw(pipe, null, true);
    expect(rejects).toEqual(['timeout']);
    expect(JSON.parse(answer)).toEqual({ ok: false, code: 'timeout' });
  });

  it('refuses connections beyond the limit', async () => {
    const { pipe, token, rejects, events } = await startServer({
      maxConnections: 1,
      timeoutMs: 500,
    });
    const hanging = raw(pipe, null, true);
    await new Promise((r) => setTimeout(r, 50));
    await expect(sendHookEvent({ v: 1, pipe, token }, payload)).resolves.toEqual({
      ok: false,
      code: 'busy',
    });
    await hanging;
    expect(rejects).toEqual(['busy', 'timeout']);
    expect(events).toEqual([]);
  });

  it('never hands the token or the payload to the reject reporter', async () => {
    const seen: unknown[] = [];
    const { pipe } = await startServer({ onReject: (...args) => seen.push(args) });
    await raw(pipe, line({ v: 1, token: 'guess', payload }));
    expect(JSON.stringify(seen)).toBe('[["bad-token"]]');
  });

  it('cannot take a pipe name that is already in use', async () => {
    const { pipe } = await startServer();
    const twin = createBridgeServer({
      pipe,
      token: newToken(),
      onEvent: () => {},
      onReject: () => {},
    });
    await expect(twin.listen()).rejects.toThrow();
  });

  it('validates its own configuration', () => {
    const base = { onEvent: () => {}, onReject: () => {} };
    expect(() =>
      createBridgeServer({ ...base, pipe: '\\\\.\\pipe\\other', token: newToken() }),
    ).toThrow();
    expect(() => createBridgeServer({ ...base, pipe: newPipeName(), token: 'short' })).toThrow();
  });
});

describe('hook script', () => {
  function sessionDir(config: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), 'cc-bridge-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, BRIDGE_FILE), JSON.stringify(config));
    return dir;
  }

  function runHook(args: string[], stdin: string) {
    return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(process.execPath, [BIN, ...args], { windowsHide: true });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (c: Buffer) => (stdout += c.toString()));
      child.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
      child.on('close', (code) => resolve({ code, stdout, stderr }));
      child.stdin.end(stdin);
    });
  }

  it('delivers the payload from stdin to the app', async () => {
    const { pipe, token, events } = await startServer();
    const dir = sessionDir({ v: 1, pipe, token });
    const result = await runHook([join(dir, BRIDGE_FILE)], JSON.stringify(payload));
    expect(result).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(events).toEqual([payload]);
  });

  it('trims a payload too big for one message', async () => {
    const { pipe, token, events } = await startServer();
    const dir = sessionDir({ v: 1, pipe, token });
    const big = {
      ...payload,
      hook_event_name: 'PostToolUse',
      tool_response: { file: { content: 'x'.repeat(2 * MAX_MESSAGE_BYTES) } },
    };
    expect((await runHook([join(dir, BRIDGE_FILE)], JSON.stringify(big))).code).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      hook_event_name: 'PostToolUse',
      tool_use_id: 'toolu_1',
      truncated: true,
    });
    expect(events[0]).not.toHaveProperty('tool_response');
  });

  it('always exits 0 and never prints the token', async () => {
    const token = newToken();
    // nobody listens on this pipe
    const dir = sessionDir({ v: 1, pipe: newPipeName(), token });
    const unreachable = await runHook([join(dir, BRIDGE_FILE)], JSON.stringify(payload));
    expect(unreachable.code).toBe(0);
    expect(unreachable.stdout).toBe('');
    expect(unreachable.stderr).toContain('unreachable');
    expect(unreachable.stderr).not.toContain(token);

    const invalid = await runHook([join(dir, BRIDGE_FILE)], '{"hook_event_name":"Bogus"}');
    expect(invalid).toMatchObject({ code: 0, stdout: '' });
    expect(invalid.stderr).toContain('input-invalid');

    const noConfig = await runHook([join(dir, 'other.json')], JSON.stringify(payload));
    expect(noConfig).toMatchObject({ code: 0, stdout: '' });
    expect(noConfig.stderr).toContain('no-config');
  });
});
