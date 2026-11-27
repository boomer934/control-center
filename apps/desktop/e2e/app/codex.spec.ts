// A Codex session end to end, without the real service: the app finds a `codex` npm shim on PATH
// whose bin/codex.js is the fake `codex app-server`, which speaks the real JSON-RPC and plays
// scripted turns. The renderer drives it through window.api.codex, as the chat will (phase 5f.2).
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from '../launch';

// Playwright loads specs as CommonJS: the fixtures package (ESM) is located by path instead.
const FAKE_CODEX = resolve(__dirname, '../../../../packages/fixtures/bin/fake-codex.mjs');

let app: ElectronApplication;
let page: Page;
let fixture: string;
let log: string;

test.skip(process.platform !== 'win32', 'The Codex session targets Windows');

test.beforeEach(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'cc-codex-e2e-'));
  const bin = join(fixture, 'bin');
  const cli = join(bin, 'node_modules', '@openai', 'codex', 'bin');
  await mkdir(cli, { recursive: true });
  await writeFile(
    join(bin, 'codex.cmd'),
    '@rem npm shim stand-in: the app runs codex.js with node\r\n',
  );
  await writeFile(
    join(cli, 'codex.js'),
    `import(${JSON.stringify(pathToFileURL(FAKE_CODEX).href)});\n`,
  );
  await mkdir(join(fixture, 'Project'));
  const workspace = await realpath(join(fixture, 'Project'));
  log = join(fixture, 'sent.jsonl');
  ({ app, page } = await launchApp({
    userDataDir: join(fixture, 'user-data'),
    env: { Path: `${bin};${process.env.Path ?? process.env.PATH ?? ''}`, FAKE_CODEX_LOG: log },
  }));
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, workspace);
  await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
  await page.getByRole('dialog', { name: 'Switch workspace' }).getByText('Open folder…').click();
  await expect(page.getByTestId('status-bar')).toContainText('Project');
});

test.afterEach(async () => {
  await app?.close();
  await rm(fixture, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

const sentRequests = async () =>
  (await readFile(log, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { method?: string; params?: Record<string, unknown> });

test('runs, approves, interrupts and resumes a Codex session from the renderer', async () => {
  const result = await page.evaluate(async () => {
    const api = window.api;
    const workspaceId = (await api.workspace.getState()).active?.id ?? '';
    const run = (id: string) => {
      const events: Array<{
        type: string;
        seq: number;
        provider: string;
        by?: string;
        reason?: string;
      }> = [];
      const catalogs: Array<{
        models: { id: string }[];
        current: { model: string | null; effort: string | null };
      }> = [];
      let waitIdle: (() => void) | undefined;
      let waitPrompt: ((requestId: string) => void) | undefined;
      let running = false;
      const stop = api.codex.onUpdated((u) => {
        if (u.id !== id) return;
        if (u.kind === 'events') events.push(...u.events);
        if (u.kind === 'config') catalogs.push(u.catalog);
        if (u.kind === 'permissions' && u.requests[0]) waitPrompt?.(u.requests[0].requestId);
        if (u.kind === 'status') {
          if (u.status === 'running') running = true;
          if (u.status === 'idle' && running) {
            running = false;
            waitIdle?.();
          }
        }
      });
      const timeout = <T>(p: Promise<T>) =>
        Promise.race([
          p,
          new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 20_000)),
        ]);
      return {
        events,
        catalogs,
        stop,
        idle: () => timeout(new Promise<void>((r) => (waitIdle = r))),
        prompt: () => timeout(new Promise<string>((r) => (waitPrompt = r))),
      };
    };

    const id = crypto.randomUUID();
    const first = run(id);
    const started = await api.codex.start({ id, workspaceId });
    const configured = await api.codex.configure({ id, model: 'gpt-6-luna', effort: 'low' });
    const invalid = await api.codex.configure({ id, model: 'gpt-6-luna', effort: 'ultra' });
    let idle = first.idle();
    const prompt = first.prompt();
    const sent = await api.codex.send({ id, text: '[approve] Read the notes' });
    const requestId = await prompt;
    const approved = await api.codex.respond({ id, requestId, choice: 'approve' });
    await idle;
    idle = first.idle();
    await api.codex.send({ id, text: '[hang] Count slowly' });
    await new Promise((r) => setTimeout(r, 300));
    const interrupted = await api.codex.interrupt({ id });
    await idle;
    const closed = await api.codex.close({ id });
    first.stop();

    const [summary] = await api.codex.listHistory({ workspaceId });
    const resumedId = crypto.randomUUID();
    const second = run(resumedId);
    const resumed = await api.codex.start({ id: resumedId, workspaceId, historyId: summary?.id });
    idle = second.idle();
    await api.codex.send({ id: resumedId, text: 'Go on' });
    await idle;
    await api.codex.close({ id: resumedId });
    second.stop();
    return {
      started,
      configured,
      invalid,
      sent,
      approved,
      interrupted,
      closed,
      resumed,
      first: { events: first.events, catalogs: first.catalogs },
      second: { events: second.events, catalogs: second.catalogs },
    };
  });

  expect(result).toMatchObject({
    started: 'started',
    configured: 'applied',
    invalid: 'invalid',
    sent: 'started',
    approved: true,
    interrupted: true,
    closed: true,
    resumed: 'started',
  });
  const { events, catalogs } = result.first;
  expect(catalogs[0]?.models.map((m) => m.id)).toEqual(['gpt-6.2-sol', 'gpt-6-luna']);
  expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i));
  expect(events.every((e) => e.provider === 'codex')).toBe(true);
  const types = events.map((e) => e.type);
  expect(types.slice(0, 2)).toEqual(['session.configChanged', 'session.started']);
  expect(types).toContain('permission.requested');
  expect(types).toContain('permission.resolved');
  expect(types).toContain('file.written');
  expect(events.filter((e) => e.type === 'session.ended').map((e) => e.reason)).toEqual([
    undefined,
    'interrupted',
  ]);
  // the resumed session keeps the choice saved in the history and does not report it again
  expect(result.second.catalogs[0]?.current).toEqual({ model: 'gpt-6-luna', effort: 'low' });
  expect(result.second.events.map((e) => e.type)).not.toContain('session.configChanged');

  const sent = await sentRequests();
  const thread = sent.find((m) => m.method === 'thread/start');
  const resume = sent.find((m) => m.method === 'thread/resume');
  expect(thread?.params).toMatchObject({ approvalPolicy: 'untrusted', sandbox: 'workspace-write' });
  expect(resume?.params?.threadId).toBeTruthy();
  expect(
    sent.filter((m) => m.method === 'turn/start').map((m) => [m.params?.model, m.params?.effort]),
  ).toEqual([
    ['gpt-6-luna', 'low'],
    ['gpt-6-luna', 'low'],
    ['gpt-6-luna', 'low'],
  ]);
  expect(sent.some((m) => m.method === 'turn/interrupt')).toBe(true);
});

test('an approval reaches only the session that asked for it', async () => {
  const result = await page.evaluate(async () => {
    const api = window.api;
    const workspaceId = (await api.workspace.getState()).active?.id ?? '';
    const prompts = new Map<string, string>();
    const waiters = new Map<string, () => void>();
    const stop = api.codex.onUpdated((u) => {
      if (u.kind === 'permissions' && u.requests[0]) {
        prompts.set(u.id, u.requests[0].requestId);
        waiters.get(u.id)?.();
      }
    });
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    await api.codex.start({ id: a, workspaceId });
    await api.codex.start({ id: b, workspaceId });
    const asked = (id: string) => new Promise<void>((r) => waiters.set(id, r));
    const askedA = asked(a);
    await api.codex.send({ id: a, text: '[approve] one' });
    await askedA;
    // a second session on the same workspace waits while the first one has a turn running
    const busy = await api.codex.send({ id: b, text: '[approve] two' });
    const requestA = prompts.get(a) ?? '';
    const crossed = await api.codex.respond({ id: b, requestId: requestA, choice: 'approve' });
    const answered = await api.codex.respond({ id: a, requestId: requestA, choice: 'deny' });
    await api.codex.close({ id: a });
    await api.codex.close({ id: b });
    stop();
    return { busy, crossed, answered };
  });
  expect(result).toEqual({ busy: 'busy', crossed: false, answered: true });
});
