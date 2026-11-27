// Integration tests of the Claude session: the fake `claude` replays a recording, runs the hook
// commands of the session's settings, the real hook script delivers them over the named pipe,
// and the session turns stream and hooks into AgentEvents.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ErrorInput } from '@control-center/app-log';
import {
  agentEventSchema,
  normalizeClaudeSession,
  type AgentEvent,
} from '@control-center/event-schema';
import { FAKE_CLAUDE, loadClaudeSession } from '@control-center/fixtures';
import { BRIDGE_FILE } from '@control-center/hooks-bridge';
import { afterEach, describe, expect, it } from 'vitest';
import { openClaudeSession, type ClaudeSession, type ClaudeSessionOptions } from './session';
import { SESSIONS_DIR } from './session-files';

const HOOK_SCRIPT = join(__dirname, '../../../../../packages/hooks-bridge/src/bin.ts');
const RECORDED_CWD = 'C:\\fixtures\\workspace';

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  // Windows frees the folder of a killed process tree a moment after the kill returns
  cleanups.push(() =>
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }),
  );
  return dir;
}

interface Harness {
  session: ClaudeSession;
  events: AgentEvent[];
  reports: ErrorInput[];
  dataDir: string;
  /** Resolves when the current run is over. */
  idle(): Promise<void>;
}

async function open(
  fixture: string,
  extra: Partial<ClaudeSessionOptions> & { fakeEnv?: Record<string, string> } = {},
): Promise<Harness> {
  const { fakeEnv, ...rest } = extra;
  const dataDir = tempDir('cc-data-');
  const events: AgentEvent[] = [];
  const reports: ErrorInput[] = [];
  let wake: (() => void) | undefined;
  const session = await openClaudeSession({
    cwd: tempDir('cc-ws-'),
    dataDir,
    claude: { command: process.execPath, args: [FAKE_CLAUDE] },
    hooks: { node: process.execPath, script: HOOK_SCRIPT },
    env: { ...process.env, FAKE_CLAUDE_FIXTURE: fixture, ...fakeEnv },
    report: (r) => reports.push(r),
    onEvents: (e) => events.push(...e),
    onStatus: (s) => {
      if (s !== 'running') wake?.();
    },
    ...rest,
  });
  cleanups.push(() => session.close());
  const idle = () =>
    session.status === 'running' ? new Promise<void>((r) => (wake = r)) : Promise.resolve();
  return { session, events, reports, dataDir, idle };
}

const fact = (e: AgentEvent) =>
  [e.type, e.agentId, 'toolUseId' in e ? (e.toolUseId ?? '') : ''].join(' ');

function checkTimeline(events: AgentEvent[]): void {
  for (const e of events) expect(agentEventSchema.safeParse(e).success, e.type).toBe(true);
  expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i));
  const times = events.map((e) => e.timestamp);
  expect(times).toEqual([...times].sort());
}

describe('Claude session with the fake claude', () => {
  it.each(['sessione-01', 'sessione-03', 'sessione-04', 'sessione-07'])(
    'turns %s into the same facts as the batch normalizers, hooks included',
    async (fixture) => {
      const h = await open(fixture);
      expect(h.session.hooks).toBe(true);
      expect(h.session.send('go')).toBe('started');
      expect(h.session.send('again')).toBe('busy');
      await h.idle();

      const { stream, hooks } = loadClaudeSession(fixture);
      const batch = normalizeClaudeSession(stream, hooks, { sessionId: 'x', cwd: RECORDED_CWD });
      expect(h.events.map(fact).sort()).toEqual(batch.map(fact).sort());
      checkTimeline(h.events);
      // the hooks really travelled through the pipe
      expect(h.events.some((e) => e.source === 'hooks')).toBe(true);
      expect(h.events[0]?.type).toBe('session.started');
      expect(h.events.at(-1)?.type).toBe('session.ended');
      expect(h.reports.filter((r) => r.kind !== 'claude-setup')).toEqual([]);
    },
    60_000,
  );

  it('resumes Claude’s session on the next message and keeps numbering', async () => {
    const log = join(tempDir('cc-argv-'), 'argv.jsonl');
    const h = await open('sessione-02', { fakeEnv: { FAKE_CLAUDE_ARGV_LOG: log } });
    h.session.send('first');
    await h.idle();
    const claudeId = h.session.claudeSessionId;
    expect(claudeId).toMatch(/^[0-9a-f-]{36}$/);
    const firstRun = h.events.length;
    h.session.send('second');
    await h.idle();

    const runs = readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as string[]);
    expect(runs).toHaveLength(2);
    for (const args of runs)
      expect(args.slice(0, 7)).toEqual([
        '-p',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--verbose',
        '--settings',
      ]);
    // inline JSON with the hook command, never a file path
    expect(JSON.parse(runs[0]?.[7] ?? '')).toHaveProperty('hooks.PreToolUse');
    expect(runs[0]).not.toContain('--resume');
    expect(runs[1]?.slice(-2)).toEqual(['--resume', claudeId]);
    expect(h.events[firstRun]).toMatchObject({ type: 'session.started', seq: firstRun });
    checkTimeline(h.events);
  }, 60_000);

  it('interrupts a run and closes the call it left open', async () => {
    const h = await open('sessione-02', { fakeEnv: { FAKE_CLAUDE_MODE: 'hang' } });
    h.session.send('go');
    await expect
      .poll(() => h.events.some((e) => e.type === 'tool.called'), { timeout: 20_000 })
      .toBe(true);
    expect(h.session.interrupt()).toBe(true);
    await h.idle();
    const end = h.events.at(-1);
    expect(end).toMatchObject({ type: 'session.ended', ok: false, reason: 'interrupted' });
    expect(h.events.find((e) => e.type === 'tool.failed')).toMatchObject({ reason: 'interrupted' });
    // an exit the app asked for is not an error
    expect(h.reports.filter((r) => r.kind === 'child-exit')).toEqual([]);
  }, 60_000);

  it('reports a run that crashes and ends it as failed', async () => {
    const h = await open('sessione-02', { fakeEnv: { FAKE_CLAUDE_MODE: 'crash' } });
    h.session.send('go');
    await h.idle();
    expect(h.events.at(-1)).toMatchObject({
      type: 'session.ended',
      ok: false,
      reason: 'process-failed',
    });
    expect(h.reports.map((r) => r.kind)).toContain('child-exit');
    checkTimeline(h.events);
  }, 60_000);

  it('warns once about a Claude Code version that was not tested', async () => {
    const h = await open('sessione-05', { fakeEnv: { FAKE_CLAUDE_VERSION: '9.8.7' } });
    h.session.send('go');
    await h.idle();
    h.session.send('again');
    await h.idle();
    const warnings = h.reports.filter((r) => r.kind === 'claude-setup');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('9.8.7');
  }, 60_000);

  it('refuses forged hook messages, reports them and keeps them out of the timeline', async () => {
    const h = await open('sessione-02', { fakeEnv: { FAKE_CLAUDE_MODE: 'hang' } });
    h.session.send('go');
    await expect.poll(() => h.events.length, { timeout: 20_000 }).toBeGreaterThan(0);
    const file = join(h.dataDir, SESSIONS_DIR, h.session.id, BRIDGE_FILE);
    const { pipe, token } = JSON.parse(readFileSync(file, 'utf8')) as {
      pipe: string;
      token: string;
    };
    const forged = {
      hook_event_name: 'PreToolUse',
      session_id: 'x',
      tool_name: 'Bash',
      tool_use_id: 'forged',
      tool_input: { command: 'rm -rf /' },
    };
    const send = (message: unknown) =>
      new Promise<void>((resolve) => {
        const socket = connect(pipe, () => socket.write(`${JSON.stringify(message)}\n`));
        socket.on('data', () => socket.destroy());
        socket.on('close', () => resolve());
        socket.on('error', () => resolve());
      });
    await send({ v: 1, payload: forged });
    await send({ v: 1, token: 'f'.repeat(64), payload: forged });
    await send({ v: 1, token, payload: { ...forged, hook_event_name: 'Nope' } });

    // refusals reach the Console grouped, after the server's report interval
    await expect
      .poll(() => h.reports.filter((r) => r.kind === 'bridge-rejected').map((r) => r.message), {
        timeout: 10_000,
      })
      .toEqual(['Refused 3 hook message(s) (no-token, bad-token, invalid-event)']);
    expect(JSON.stringify(h.reports)).not.toContain(token);
    expect(h.events.some((e) => 'toolUseId' in e && e.toolUseId === 'forged')).toBe(false);
    h.session.interrupt();
    await h.idle();
  }, 60_000);

  it('closing during a run kills it and reports nothing afterwards', async () => {
    const h = await open('sessione-02', { fakeEnv: { FAKE_CLAUDE_MODE: 'hang' } });
    h.session.send('go');
    await expect.poll(() => h.events.length, { timeout: 20_000 }).toBeGreaterThan(0);
    await h.session.close();
    const after = h.events.length;
    await new Promise((r) => setTimeout(r, 500));
    expect(h.events.length).toBe(after);
    expect(h.session.status).toBe('closed');
  }, 60_000);

  it('terminates a run synchronously when the app quits', async () => {
    const h = await open('sessione-02', { fakeEnv: { FAKE_CLAUDE_MODE: 'hang' } });
    h.session.send('go');
    // wait for the hang point, so no hook command is starting while the tree is killed
    await expect
      .poll(() => h.events.some((e) => e.type === 'tool.called'), { timeout: 20_000 })
      .toBe(true);
    h.session.terminate();
    await h.idle();
    expect(h.events.at(-1)).toMatchObject({ type: 'session.ended', reason: 'interrupted' });
  }, 60_000);

  it('removes its files, token included, when it closes', async () => {
    const h = await open('sessione-05');
    const dir = join(h.dataDir, SESSIONS_DIR, h.session.id);
    expect(existsSync(join(dir, BRIDGE_FILE))).toBe(true);
    // the hooks travel on the command line: no settings file on disk
    expect(readdirSync(dir)).toEqual([BRIDGE_FILE]);
    await h.session.close();
    expect(existsSync(dir)).toBe(false);
    expect(h.session.send('late')).toBe('closed');
  });

  it('runs on the stream alone when hooks are off', async () => {
    const h = await open('sessione-01', { hooks: undefined });
    expect(h.session.hooks).toBe(false);
    h.session.send('go');
    await h.idle();
    expect(h.events.every((e) => e.source !== 'hooks')).toBe(true);
    expect(h.events.at(-1)).toMatchObject({ type: 'session.ended', ok: true });
    checkTimeline(h.events);
  }, 60_000);
});
