// A Claude session end to end, without the real service: the app finds a `claude` npm shim on
// PATH whose cli.js is the fake claude, which replays a recording and runs the session's hook
// commands. The renderer drives it through window.api.claude, as the chat of phase 4.3 will.
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from '../launch';

// Playwright loads specs as CommonJS: the fixtures package (ESM) is located by path instead.
const FAKE_CLAUDE = resolve(__dirname, '../../../../packages/fixtures/bin/fake-claude.mjs');

let app: ElectronApplication;
let page: Page;
let fixture: string;

test.skip(process.platform !== 'win32', 'The Claude session targets Windows');

test.beforeEach(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'cc-claude-e2e-'));
  const bin = join(fixture, 'bin');
  const cli = join(bin, 'node_modules', '@anthropic-ai', 'claude-code');
  await mkdir(cli, { recursive: true });
  await writeFile(
    join(bin, 'claude.cmd'),
    '@rem npm shim stand-in: the app runs cli.js with node\r\n',
  );
  await writeFile(
    join(cli, 'cli.js'),
    `import(${JSON.stringify(pathToFileURL(FAKE_CLAUDE).href)});\n`,
  );
  await mkdir(join(fixture, 'Project'));
  const workspace = await realpath(join(fixture, 'Project'));
  ({ app, page } = await launchApp({
    userDataDir: join(fixture, 'user-data'),
    env: {
      Path: `${bin};${process.env.Path ?? process.env.PATH ?? ''}`,
      FAKE_CLAUDE_FIXTURE: 'sessione-01',
    },
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
  if (fixture) await rm(fixture, { recursive: true, force: true });
});

test('runs a Claude session from the renderer and streams its AgentEvents', async () => {
  const result = await page.evaluate(async () => {
    const api = window.api;
    const state = await api.workspace.getState();
    const workspaceId = state.active?.id ?? '';
    const id = crypto.randomUUID();
    const events: Array<{ type: string; source: string; seq: number }> = [];
    const statuses: Array<{ status: string; hooks: boolean }> = [];
    let resolveIdle: () => void = () => {};
    const idle = new Promise<void>((r) => (resolveIdle = r));
    const stop = api.claude.onUpdated((u) => {
      if (u.id !== id) return;
      if (u.kind === 'events') events.push(...u.events);
      else {
        statuses.push({ status: u.status, hooks: u.hooks });
        if (u.status === 'idle' && statuses.some((s) => s.status === 'running')) resolveIdle();
      }
    });
    const started = await api.claude.start({ id, workspaceId });
    const sent = await api.claude.send({ id, text: 'Rename the helper' });
    await Promise.race([idle, new Promise((r) => setTimeout(r, 30_000))]);
    const emptyMessage = await api.claude.send({ id, text: '' }).catch((e: Error) => e.message);
    const closed = await api.claude.close({ id });
    stop();
    return { started, sent, events, statuses, emptyMessage, closed };
  });

  expect(result.started).toBe('started');
  expect(result.sent).toBe('started');
  expect(result.statuses[0]).toEqual({ status: 'idle', hooks: true });
  expect(result.statuses.map((s) => s.status)).toContain('running');
  expect(result.events.map((e) => e.seq)).toEqual(result.events.map((_, i) => i));
  expect(result.events[0]?.type).toBe('session.started');
  expect(result.events.at(-1)?.type).toBe('session.ended');
  expect(result.events.some((e) => e.source === 'hooks')).toBe(true);
  expect(result.events.filter((e) => e.type === 'tool.called').length).toBeGreaterThan(0);
  // an empty message never reaches the main process
  expect(result.emptyMessage).toContain('invalid-request');
  expect(result.closed).toBe(true);
});
