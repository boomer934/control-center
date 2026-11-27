// Integration tests of the Codex session: the fake `codex app-server` speaks the real JSON-RPC
// over stdio and plays scripted turns; the session turns its notifications into AgentEvents and
// its approval requests into permission prompts.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ErrorInput } from '@control-center/app-log';
import { agentEventSchema, type AgentEvent } from '@control-center/event-schema';
import type { AgentConfig } from '@control-center/ipc-contract';
import type { ClaudePermission } from '@control-center/ipc-contract/claude';
import { FAKE_CODEX } from '@control-center/fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CODEX_THREAD_POLICY,
  openCodexSession,
  type CodexSession,
  type CodexSessionOptions,
} from './session';

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() =>
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }),
  );
  return dir;
}

interface Harness {
  session: CodexSession;
  events: AgentEvent[];
  reports: ErrorInput[];
  permissions: ClaudePermission[][];
  threadIds: string[];
  cwd: string;
  /** Requests the app sent to the server, in order. */
  sent(): { method?: string; params?: Record<string, unknown> }[];
  /** Resolves when the current turn is over. */
  idle(): Promise<void>;
  /** Resolves at the next permission prompt. */
  prompt(): Promise<ClaudePermission>;
}

async function open(
  extra: Partial<CodexSessionOptions> & { fakeEnv?: Record<string, string> } = {},
): Promise<Harness> {
  const { fakeEnv, ...rest } = extra;
  const cwd = tempDir('cc-codex-ws-');
  const log = join(tempDir('cc-codex-log-'), 'sent.jsonl');
  const events: AgentEvent[] = [];
  const reports: ErrorInput[] = [];
  const permissions: ClaudePermission[][] = [];
  const threadIds: string[] = [];
  let wake: (() => void) | undefined;
  let onPrompt: ((p: ClaudePermission) => void) | undefined;
  const session = await openCodexSession({
    sessionId: '0f8fad5b-d9cb-469f-a165-70867728950e',
    cwd,
    dataDir: cwd,
    codex: { command: process.execPath, args: [FAKE_CODEX] },
    env: { ...process.env, FAKE_CODEX_LOG: log, ...fakeEnv },
    report: (r) => reports.push(r),
    onEvents: (e) => events.push(...e),
    onStatus: (s) => {
      if (s !== 'running') wake?.();
    },
    onPermissions: (requests) => {
      permissions.push(requests);
      if (requests[0]) onPrompt?.(requests[0]);
    },
    onPartial: () => {},
    onSessionId: (id) => threadIds.push(id),
    ...rest,
  });
  cleanups.push(() => session.close());
  return {
    session,
    events,
    reports,
    permissions,
    threadIds,
    cwd,
    sent: () =>
      existsSync(log)
        ? readFileSync(log, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l) as { method?: string; params?: Record<string, unknown> })
        : [],
    idle: () =>
      session.status === 'running' ? new Promise<void>((r) => (wake = r)) : Promise.resolve(),
    prompt: () => new Promise((r) => (onPrompt = r)),
  };
}

const types = (events: AgentEvent[]) => events.map((e) => e.type);
const turnStarts = (h: Harness) => h.sent().filter((m) => m.method === 'turn/start');
const NONE: AgentConfig = { model: null, effort: null };

describe('openCodexSession', () => {
  it('opens a thread with the workspace and the approval policy, and runs a turn', async () => {
    const h = await open();
    const thread = h.sent().find((m) => m.method === 'thread/start');
    expect(thread?.params).toMatchObject({ cwd: h.cwd, ...CODEX_THREAD_POLICY });
    expect(h.session.catalog?.(undefined)).toEqual({
      models: [
        expect.objectContaining({ id: 'gpt-6.2-sol', label: 'GPT-6.2 Sol', defaultEffort: 'low' }),
        expect.objectContaining({
          id: 'gpt-6-luna',
          efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        }),
      ],
      defaults: { model: 'gpt-6.2-sol', effort: 'high' },
      current: NONE,
    });
    expect(h.threadIds).toEqual([]);

    expect(h.session.send('Read the notes', NONE)).toBe('started');
    expect(h.session.send('again', NONE)).toBe('busy');
    await h.idle();
    for (const e of h.events) expect(agentEventSchema.safeParse(e).success).toBe(true);
    expect(types(h.events)).toEqual([
      'session.started',
      'message.user',
      'tool.called',
      'file.read',
      'tool.completed',
      'tool.called',
      'file.written',
      'tool.completed',
      'message.assistant',
      'usage.updated',
      'session.ended',
    ]);
    expect(h.events[0]).toMatchObject({
      provider: 'codex',
      model: 'gpt-6.2-sol',
      effort: 'high',
      cliVersion: '0.171.0-alpha.13.2',
    });
    expect(h.events[3]).toMatchObject({ file: { path: 'notes.txt', external: false } });
    expect(h.events[6]).toMatchObject({
      file: { path: 'src/app.ts' },
      op: 'edit',
      diff: { add: 2, del: 1 },
    });
    // no path of the workspace leaves in a message
    expect(h.events[8]).toMatchObject({ text: 'Working on it. Done in ..' });
    expect(h.session.status).toBe('idle');
    // the thread is saved for resuming once a turn ran
    expect(h.threadIds).toHaveLength(1);
    // with nothing chosen, the configured model and effort are sent explicitly
    expect(turnStarts(h)[0]?.params).toMatchObject({ model: 'gpt-6.2-sol', effort: 'high' });
    expect(h.reports).toEqual([]);
  });

  it('asks for approval and answers the server with the user choice', async () => {
    const h = await open();
    const prompt = h.prompt();
    h.session.send('[approve] read notes', NONE);
    const request = await prompt;
    expect(request).toMatchObject({ tool: 'Shell', canRemember: true, truncated: false });
    expect(request.details).toContain("Get-Content -LiteralPath 'notes.txt'");
    expect(h.session.respond('not-a-request', 'approve')).toBe(false);
    expect(h.session.respond(request.requestId, 'approve')).toBe(true);
    expect(h.session.respond(request.requestId, 'approve')).toBe(false);
    await h.idle();
    const answer = h.sent().find((m) => (m as { result?: unknown }).result !== undefined) as
      { result?: { decision?: string } } | undefined;
    expect(answer?.result).toEqual({ decision: 'accept' });
    expect(types(h.events)).toContain('permission.requested');
    expect(h.events.find((e) => e.type === 'permission.resolved')).toMatchObject({
      decision: 'allowed',
      by: 'user',
    });
    expect(h.events.find((e) => e.type === 'tool.completed')).toBeDefined();
    expect(h.permissions.at(-1)).toEqual([]);
  });

  it('a denied command is reported as denied', async () => {
    const h = await open();
    const prompt = h.prompt();
    h.session.send('[approve] read notes', NONE);
    expect(h.session.respond((await prompt).requestId, 'deny')).toBe(true);
    await h.idle();
    expect(h.events.find((e) => e.type === 'tool.failed')).toMatchObject({ reason: 'denied' });
    expect(h.events.find((e) => e.type === 'permission.resolved')).toMatchObject({
      decision: 'denied',
    });
  });

  it('a patch approval names the files of the patch', async () => {
    const h = await open();
    const prompt = h.prompt();
    h.session.send('[patch] edit', NONE);
    const request = await prompt;
    expect(request).toMatchObject({ tool: 'Patch' });
    expect(request.details).toContain('src/app.ts');
    expect(request.details).toContain('Edit the app');
    expect(h.session.respond(request.requestId, 'session')).toBe(true);
    await h.idle();
    expect(h.events.filter((e) => e.type === 'file.written')).toHaveLength(1);
  });

  it('interrupts a running turn', async () => {
    const h = await open();
    h.session.send('[hang] count', NONE);
    await new Promise((r) => setTimeout(r, 200));
    expect(h.session.status).toBe('running');
    expect(h.session.interrupt()).toBe(true);
    await h.idle();
    expect(h.sent().some((m) => m.method === 'turn/interrupt')).toBe(true);
    expect(h.events.at(-1)).toMatchObject({
      type: 'session.ended',
      ok: false,
      reason: 'interrupted',
    });
    expect(h.session.interrupt()).toBe(false);
    // the session takes the next turn
    expect(h.session.send('next', NONE)).toBe('started');
    await h.idle();
    expect(h.events.at(-1)).toMatchObject({ type: 'session.ended', ok: true });
  });

  it('sends the chosen model and effort, and goes back to the configured ones on null', async () => {
    const h = await open();
    h.session.send('one', { model: 'gpt-6-luna', effort: 'low' });
    await h.idle();
    h.session.send('two', { model: 'gpt-6-luna', effort: null });
    await h.idle();
    h.session.send('three', NONE);
    await h.idle();
    expect(turnStarts(h).map((m) => [m.params?.model, m.params?.effort])).toEqual([
      ['gpt-6-luna', 'low'],
      ['gpt-6-luna', 'medium'],
      ['gpt-6.2-sol', 'high'],
    ]);
    const changes = h.events.filter((e) => e.type === 'session.configChanged');
    expect(changes).toEqual([
      expect.objectContaining({ by: 'user', model: 'gpt-6-luna', effort: 'low' }),
      expect.objectContaining({ by: 'user', model: 'gpt-6-luna', previousEffort: 'low' }),
      expect.objectContaining({ by: 'user', previousModel: 'gpt-6-luna' }),
    ]);
  });

  it('reports a provider reroute', async () => {
    const h = await open();
    h.session.send('[reroute] hi', NONE);
    await h.idle();
    expect(h.events.find((e) => e.type === 'session.configChanged')).toMatchObject({
      by: 'provider',
      model: 'gpt-6-luna',
      previousModel: 'gpt-6.2-sol',
    });
  });

  it('a failed turn ends with the error, and the session stays usable', async () => {
    const h = await open();
    h.session.send('[fail] hi', NONE);
    await h.idle();
    expect(h.events.find((e) => e.type === 'notification')).toMatchObject({
      message: 'The model is unavailable',
    });
    expect(h.events.at(-1)).toMatchObject({
      type: 'session.ended',
      ok: false,
      reason: 'The model is unavailable',
    });
    expect(h.session.status).toBe('idle');
  });

  it('resumes a saved thread', async () => {
    const id = '01a21e97-6223-7a62-857e-ebdd926bb3d2';
    const h = await open({ resume: id, resumeConfig: { model: 'gpt-6-luna', effort: 'low' } });
    expect(h.sent().find((m) => m.method === 'thread/resume')?.params).toMatchObject({
      threadId: id,
      cwd: h.cwd,
      ...CODEX_THREAD_POLICY,
    });
    expect(h.session.threadId).toBe(id);
    h.session.send('more', { model: 'gpt-6-luna', effort: 'low' });
    await h.idle();
    // same choice as the restored one: no change recorded; the thread id is already saved
    expect(types(h.events)).not.toContain('session.configChanged');
    expect(h.threadIds).toEqual([]);
  });

  it('refuses to open when Codex is not signed in', async () => {
    await expect(open({ fakeEnv: { FAKE_CODEX_SIGNED_OUT: '1' } })).rejects.toMatchObject({
      name: 'CodexNotSignedIn',
    });
  });

  it('warns once about an untested version', async () => {
    const h = await open({ fakeEnv: { FAKE_CODEX_VERSION: '9.9.9' } });
    expect(h.reports).toEqual([
      expect.objectContaining({ kind: 'codex-setup', name: 'UntestedCodexVersion' }),
    ]);
  });

  it('closes the server and refuses later turns', async () => {
    const h = await open();
    h.session.send('[hang] count', NONE);
    await new Promise((r) => setTimeout(r, 100));
    await h.session.close();
    expect(h.session.status).toBe('closed');
    expect(h.session.send('more', NONE)).toBe('closed');
    expect(h.reports.filter((r) => r.name === 'CodexServerExited')).toEqual([]);
  });
});
