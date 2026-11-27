import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  type RejectSummary,
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
  /** Every refused code, in order, from the grouped summaries. */
  const rejects: RejectCode[] = [];
  const server = createBridgeServer({
    pipe,
    token,
    onEvent: (p) => events.push(p),
    onReject: (summary) => {
      for (const [code, n] of Object.entries(summary.counts))
        for (let i = 0; i < n; i++) rejects.push(code as RejectCode);
    },
    reportIntervalMs: 10,
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
    await expect.poll(() => rejects).toEqual([code]);
    // a client that closed its end of the pipe cannot read the answer any more
    if (answer) expect(JSON.parse(answer)).toEqual({ ok: false, code });
  });

  it('refuses a client that sends nothing in time', async () => {
    const { pipe, rejects } = await startServer({ timeoutMs: 100 });
    const answer = await raw(pipe, null, true);
    await expect.poll(() => rejects).toEqual(['timeout']);
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
    await expect.poll(() => rejects).toEqual(['busy', 'timeout']);
    expect(events).toEqual([]);
  });

  it('never hands the token or the payload to the reject reporter', async () => {
    const seen: unknown[] = [];
    const { pipe } = await startServer({ onReject: (...args) => seen.push(args) });
    await raw(pipe, line({ v: 1, token: 'guess', payload }));
    await expect.poll(() => seen.length).toBe(1);
    expect(seen).toEqual([[{ counts: { 'bad-token': 1 }, total: 1, capped: false, final: false }]]);
  });

  it('gives a client a fixed time from connecting, however slowly it writes', async () => {
    const { pipe, rejects } = await startServer({ timeoutMs: 300 });
    const started = Date.now();
    const answer = await new Promise<string>((resolve) => {
      let text = '';
      const socket = connect(pipe);
      const drip = setInterval(() => socket.write('{'), 50);
      socket.setEncoding('utf8');
      socket.on('data', (c: string) => (text += c));
      socket.on('close', () => {
        clearInterval(drip);
        resolve(text);
      });
      socket.on('error', () => undefined);
    });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(JSON.parse(answer)).toEqual({ ok: false, code: 'timeout' });
    await expect.poll(() => rejects).toEqual(['timeout']);
  });

  it('refuses a message split into too many pieces', async () => {
    const { pipe, rejects } = await startServer({ maxFragments: 3 });
    await new Promise<void>((resolve) => {
      const socket = connect(pipe, async () => {
        for (let i = 0; i < 8 && !socket.destroyed; i++) {
          socket.write('{');
          await new Promise((r) => setTimeout(r, 30));
        }
      });
      socket.on('close', () => resolve());
      socket.on('error', () => undefined);
    });
    await expect.poll(() => rejects).toEqual(['fragmented']);
  });

  it('groups refusals and stops reporting after the cap until it closes', async () => {
    const summaries: RejectSummary[] = [];
    const { pipe, server } = await startServer({
      onReject: (s) => summaries.push(s),
      reportIntervalMs: 200,
      maxReports: 1,
    });
    const bad = line({ v: 1, token: 'guess', payload });
    await Promise.all([raw(pipe, bad), raw(pipe, bad), raw(pipe, 'nope\n')]);
    await expect.poll(() => summaries.length).toBe(1);
    expect(summaries[0]).toEqual({
      counts: { 'bad-token': 2, malformed: 1 },
      total: 3,
      capped: true,
      final: false,
    });
    await raw(pipe, bad);
    await new Promise((r) => setTimeout(r, 400));
    expect(summaries).toHaveLength(1);
    await server.close();
    expect(summaries[1]).toEqual({
      counts: { 'bad-token': 1 },
      total: 1,
      capped: false,
      final: true,
    });
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

  it('cuts a long error instead of dropping the event', async () => {
    const { pipe, token, events } = await startServer();
    const dir = sessionDir({ v: 1, pipe, token });
    const failure = {
      ...payload,
      hook_event_name: 'PostToolUseFailure',
      error: 'e'.repeat(2 * MAX_MESSAGE_BYTES),
    };
    expect((await runHook([join(dir, BRIDGE_FILE)], JSON.stringify(failure))).code).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ hook_event_name: 'PostToolUseFailure', truncated: true });
    expect(events[0]?.error).toHaveLength(16_384);
  });

  it('refuses a bridge file that is a link, too big, or not a file', async () => {
    const { pipe, token, events } = await startServer();
    const dir = sessionDir({ v: 1, pipe, token });
    const real = join(dir, BRIDGE_FILE);

    const linked = mkdtempSync(join(tmpdir(), 'cc-bridge-link-'));
    cleanups.push(() => rmSync(linked, { recursive: true, force: true }));
    let linkMade = true;
    try {
      symlinkSync(real, join(linked, BRIDGE_FILE), 'file');
    } catch {
      linkMade = false; // creating links needs Developer Mode or admin rights on Windows
    }
    if (linkMade) {
      const viaLink = await runHook([join(linked, BRIDGE_FILE)], JSON.stringify(payload));
      expect(viaLink).toMatchObject({ code: 0, stdout: '' });
      expect(viaLink.stderr).toContain('no-config');
    }

    const big = mkdtempSync(join(tmpdir(), 'cc-bridge-big-'));
    cleanups.push(() => rmSync(big, { recursive: true, force: true }));
    writeFileSync(
      join(big, BRIDGE_FILE),
      `${JSON.stringify({ v: 1, pipe, token })}${' '.repeat(4096)}`,
    );
    const tooBig = await runHook([join(big, BRIDGE_FILE)], JSON.stringify(payload));
    expect(tooBig.stderr).toContain('no-config');

    const folder = mkdtempSync(join(tmpdir(), 'cc-bridge-dir-'));
    cleanups.push(() => rmSync(folder, { recursive: true, force: true }));
    mkdirSync(join(folder, BRIDGE_FILE));
    const notFile = await runHook([join(folder, BRIDGE_FILE)], JSON.stringify(payload));
    expect(notFile.stderr).toContain('no-config');
    expect(events).toEqual([]);
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
