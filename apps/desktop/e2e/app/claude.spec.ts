// A Claude session end to end, without the real service: the app finds a `claude` npm shim on
// PATH whose cli.js is the fake claude, which replays a recording and runs the session's hook
// commands. The renderer drives it through window.api.claude, as the chat of phase 4.3 will.
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test as base, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from '../launch';

// Playwright loads specs as CommonJS: the fixtures package (ESM) is located by path instead.
const FAKE_CLAUDE = resolve(__dirname, '../../../../packages/fixtures/bin/fake-claude.mjs');
const test = base.extend<{ chatMode: 'normal' | 'permissions' }>({
  chatMode: ['normal', { option: true }],
});

let app: ElectronApplication;
let page: Page;
let fixture: string;

test.skip(process.platform !== 'win32', 'The Claude session targets Windows');

test.beforeEach(async ({ chatMode }) => {
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
      FAKE_CLAUDE_MODE: chatMode,
      FAKE_CLAUDE_ARGV_LOG: join(fixture, 'argv.jsonl'),
    },
  }));
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, workspace);
  await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
  await page.getByRole('dialog', { name: 'Switch workspace' }).getByText('Open folder…').click();
  await expect(page.getByTestId('status-bar')).toContainText('Project');
});

test.describe('chat dock', () => {
  test.use({ chatMode: 'permissions' });
  test('streams the chat, answers permissions, and resumes the saved conversation', async () => {
    const dock = page.getByRole('complementary', { name: 'Session' });
    const prompt = dock.getByRole('textbox', { name: 'Message Claude' });
    const send = async (text: string) => {
      await prompt.fill(text);
      await dock.getByRole('button', { name: 'Send', exact: true }).click();
    };
    const request = dock.getByRole('region', { name: 'Allow Bash?' });

    await send('Check the workspace with api_key=another-synthetic-password');
    await expect(dock.getByTestId('claude-streaming')).toContainText('Waiting for approval.');
    await expect(page.getByTestId('status-bar').getByText('Permission needed')).toBeVisible();
    await expect(request).toContainText('echo once');
    await expect(request.getByLabel('Tool arguments')).toContainText(/… \(truncated, \d+ chars\)/);
    await expect(request).toContainText(
      'Approval includes the arguments omitted from this preview.',
    );
    await expect(request).toContainText('example.txt');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(960, 600));
    await expect(request.getByRole('button', { name: 'Always in this session' })).toBeInViewport();
    await page.getByTestId('status-bar').getByText('Permission needed').click();
    await expect(request.getByLabel('Tool arguments')).toBeFocused();
    await request.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(request).toContainText('echo refused');
    await request.getByRole('button', { name: 'Deny', exact: true }).click();
    await expect(request).toContainText('echo repeat');
    await request.getByRole('button', { name: 'Always in this session' }).click();
    // The second identical request is automatic. Changed arguments require a new decision.
    await expect(request).toContainText('echo changed');
    await request.getByRole('button', { name: 'Approve', exact: true }).click();

    await expect(dock.locator('strong')).toHaveText('the turn');
    await expect(dock.locator('pre code')).toHaveText('const result = true;\n');
    await expect(dock.locator('img, a')).toHaveCount(0);
    await expect(dock.getByTestId('claude-streaming')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Session timeline' })).toContainText(
      'Turn completed',
    );
    const tool = dock.locator('details').filter({ hasText: 'echo refused' });
    await expect(tool).not.toHaveAttribute('open');
    await tool.locator('summary').click();
    await expect(tool).toHaveAttribute('open', '');
    await expect(dock.getByRole('button', { name: 'New chat' })).toBeEnabled();

    const history = join(fixture, 'user-data', 'claude-history');
    const [workspaceId] = await readdir(history);
    if (!workspaceId) throw new Error('Workspace history directory was not created');
    const root = join(history, workspaceId);
    const [filename] = await readdir(root);
    if (!filename) throw new Error('Session JSONL was not created');
    const historyFile = join(root, filename);
    await expect.poll(() => readFile(historyFile, 'utf8')).toContain('Finished **the turn**');
    const saved = await readFile(historyFile, 'utf8');
    expect(saved).toContain('Check the workspace');
    expect(saved).toContain('Finished **the turn**');
    expect(saved).toContain('<redacted:assignment>');
    expect(saved).not.toMatch(
      /(?:another-synthetic-password|synthetic-secret-password|Waiting for approval)/,
    );
    expect(
      saved
        .trim()
        .split('\n')
        .every((line) => typeof JSON.parse(line) === 'object'),
    ).toBe(true);

    // Reopen Electron against the same user data, without in-memory session state.
    await app.close();
    ({ app, page } = await launchApp({
      userDataDir: join(fixture, 'user-data'),
      env: {
        Path: `${join(fixture, 'bin')};${process.env.Path ?? process.env.PATH ?? ''}`,
        FAKE_CLAUDE_FIXTURE: 'sessione-01',
        FAKE_CLAUDE_MODE: 'permissions',
        FAKE_CLAUDE_ARGV_LOG: join(fixture, 'argv.jsonl'),
      },
    }));
    const reopened = page.getByRole('complementary', { name: 'Session' });
    await reopened.getByRole('button', { name: 'History', exact: true }).click();
    await reopened.getByRole('button', { name: /Check the workspace/ }).click();
    await expect(reopened.locator('strong')).toHaveText('the turn');
    await reopened.getByRole('button', { name: 'Resume session' }).click();
    await reopened.getByRole('textbox', { name: 'Message Claude' }).fill('Continue the saved chat');
    await reopened.getByRole('button', { name: 'Send', exact: true }).click();
    await reopened.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(reopened.locator('strong').last()).toHaveText('saved session');
    const argv = await readFile(join(fixture, 'argv.jsonl'), 'utf8');
    expect(argv).toContain('"--resume","fake-chat-session"');
    expect(await readdir(root)).toEqual([filename]);
    await expect.poll(() => readFile(historyFile, 'utf8')).toContain('Continue the saved chat');
    const continued = await readFile(historyFile, 'utf8');
    expect(continued).toContain('Continue the saved chat');
    expect(
      continued
        .trim()
        .split('\n')
        .every((line) => typeof JSON.parse(line) === 'object'),
    ).toBe(true);

    await reopened.getByRole('textbox', { name: 'Message Claude' }).fill('Stop this turn');
    await reopened.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(reopened.getByRole('region', { name: 'Allow Bash?' })).toContainText(
      'echo waiting',
    );
    await reopened.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(reopened.getByRole('region', { name: 'Allow Bash?' })).toHaveCount(0);
    await expect(reopened.getByText('Turn stopped.')).toBeVisible();
    await expect(reopened.getByRole('button', { name: 'New chat' })).toBeEnabled();
  });
});

test.afterEach(async () => {
  await app?.close();
  if (fixture) await rm(fixture, { recursive: true, force: true });
});

test('opens saved activity in read-only replay after restarting Electron', async () => {
  const cwd = join(fixture, 'Project');
  await mkdir(join(cwd, 'src'));
  await writeFile(join(cwd, 'src', 'cart.js'), 'export const total = 0;\n');
  const dock = page.getByRole('complementary', { name: 'Session' });
  await dock.getByRole('textbox', { name: 'Message Claude' }).fill('Record a session for replay');
  await dock.getByRole('button', { name: 'Send', exact: true }).click();
  const timeline = page.getByRole('region', { name: 'Session timeline' });
  await expect(timeline.getByRole('button', { name: 'Turn completed', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  const read = timeline.getByRole('button', { name: 'Read · src/cart.js', exact: true });
  await expect(read).toHaveCount(1);
  await read.click();
  const file = page.locator('[data-node="src/cart.js"]');
  await expect(file).toHaveAttribute('data-state', 'reading');
  const inspector = page.getByRole('region', { name: 'Event inspector' });
  await expect(inspector.getByRole('heading', { name: 'Read · src/cart.js' })).toBeVisible();
  await timeline.getByRole('button', { name: 'Back to live' }).click();
  await expect(timeline.getByRole('button', { name: 'Back to live' })).toHaveCount(0);
  await expect(inspector.getByText('Select an event, agent, or active map node.')).toBeVisible();

  await app.close();
  ({ app, page } = await launchApp({ userDataDir: join(fixture, 'user-data') }));
  const reopened = page.getByRole('region', { name: 'Session timeline' });
  const reopenedDock = page.getByRole('complementary', { name: 'Session' });
  await page.keyboard.press('Control+Alt+B');
  await expect(reopenedDock).toHaveCount(0);
  await reopened.getByRole('button', { name: 'History', exact: true }).click();
  await reopenedDock.getByRole('button', { name: /Record a session for replay/ }).click();
  await expect(reopened).toContainText('Replay · read-only');
  await expect(reopened.getByRole('button', { name: 'Back to live' })).toHaveCount(0);
  await expect(reopenedDock.getByRole('textbox', { name: 'Message Claude' })).toHaveCount(0);
  await expect(reopenedDock.getByRole('button', { name: 'Resume session' })).toBeVisible();

  await reopened.getByRole('button', { name: 'Read · src/cart.js', exact: true }).click();
  const reopenedFile = page.locator('[data-node="src/cart.js"]');
  await expect(reopenedFile).toHaveAttribute('data-state', 'reading');
  await expect(page.getByRole('region', { name: 'Event inspector' })).toContainText(
    'Read · src/cart.js',
  );
  const position = reopened.getByRole('slider', { name: 'Replay position' });
  await position.press('Home');
  await expect(reopenedFile).toHaveAttribute('data-state', 'idle');
  await position.press('End');
  await expect(position).toHaveValue((await position.getAttribute('max'))!);
  await expect(reopenedFile).not.toHaveAttribute('data-state', 'reading');
  expect(await readFile(join(cwd, 'src', 'cart.js'), 'utf8')).toBe('export const total = 0;\n');
});

test('uses the Git panel and restores a session checkpoint from the timeline', async ({
  chatMode,
}, info) => {
  expect(chatMode).toBe('normal');
  const cwd = join(fixture, 'Project');
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  const tracked = join(cwd, 'file.txt');
  git('init', '-b', 'demo');
  git('config', 'user.name', 'Test User');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'core.autocrlf', 'false');
  git('config', 'commit.gpgsign', 'false');
  await writeFile(tracked, 'Initial text\n');
  git('add', '.');
  git('commit', '-m', 'Initial commit');
  await writeFile(tracked, 'Ready to commit\n');

  await page.getByRole('link', { name: 'Git', exact: true }).click();
  const view = page.getByTestId('view-git');
  await expect(view).toContainText('demo');
  await view.getByRole('button', { name: 'Modified file.txt' }).click();
  await expect(view.getByLabel('Diff content')).toContainText('+Ready to commit');
  await writeFile(tracked, 'Refreshed before commit\n');
  await view.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(view.getByLabel('Diff content')).toContainText('+Refreshed before commit');
  await view.getByRole('button', { name: 'Stage file.txt', exact: true }).click();
  await view.getByRole('textbox', { name: 'Commit message' }).fill('Update file');
  await view.getByRole('button', { name: 'Commit staged' }).click();
  await expect(view.getByRole('button', { name: /Update file/ })).toBeVisible();
  const head = git('rev-parse', 'HEAD');
  await view.getByRole('button', { name: /Update file/ }).click();
  await expect(view.getByLabel('Diff content')).toContainText('-Initial text');

  await writeFile(tracked, 'Unsaved before Claude\n');
  await page.getByRole('link', { name: 'Live', exact: true }).click();
  const dock = page.getByRole('complementary', { name: 'Session' });
  await dock.getByRole('textbox', { name: 'Message Claude' }).fill('Read the project');
  await dock.getByRole('button', { name: 'Send', exact: true }).click();
  const timeline = page.getByRole('region', { name: 'Session timeline' });
  const review = timeline.getByRole('button', { name: 'Review Git checkpoint' });
  await expect(review).toBeVisible({ timeout: 15_000 });
  await expect(timeline).toContainText('Turn completed', { timeout: 20_000 });
  await expect(review).toBeEnabled();
  await writeFile(tracked, 'Changed after Claude\n');
  await writeFile(join(cwd, 'new.txt'), 'Keep this file for now\n');

  await review.click();
  const dialog = page.getByRole('dialog', { name: 'Restore Git checkpoint' });
  await expect(dialog.getByLabel('Working tree comparison')).toContainText(
    '+Unsaved before Claude',
  );
  await dialog.getByLabel('Files to restore').selectOption('file.txt');
  await expect(dialog.getByLabel('Working tree comparison')).toContainText('-Changed after Claude');
  if (process.env.CC_GIT_CAPTURE) {
    await page.setViewportSize({ width: 960, height: 600 });
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
      await page.screenshot({
        path: info.outputPath(`git-checkpoint-${colorScheme}.png`),
        animations: 'disabled',
      });
    }
  }
  await dialog.getByRole('button', { name: 'Restore file' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(review).toBeFocused();
  expect(await readFile(tracked, 'utf8')).toBe('Unsaved before Claude\n');
  expect(await readFile(join(cwd, 'new.txt'), 'utf8')).toBe('Keep this file for now\n');
  expect(git('rev-parse', 'HEAD')).toBe(head);
  expect(git('branch', '--show-current')).toBe('demo');
  await page.getByRole('link', { name: 'Git', exact: true }).click();
  await expect(view.getByRole('heading', { name: 'Before restore' })).toBeVisible();
  await view.getByRole('button', { name: 'Modified file.txt' }).click();
  await expect(view.getByLabel('Diff content')).toContainText('+Unsaved before Claude');
  if (process.env.CC_GIT_CAPTURE) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
      await page.screenshot({
        path: info.outputPath(`git-panel-${colorScheme}.png`),
        animations: 'disabled',
      });
    }
  }
  await page.getByRole('link', { name: 'Live', exact: true }).click();
  await dock.getByRole('button', { name: 'New chat', exact: true }).click();
  await dock.getByRole('button', { name: 'History', exact: true }).click();
  await dock.getByRole('button', { name: /Read the project/ }).click();
  await expect(review).toBeEnabled();
  await review.click();
  const comparison = page.getByRole('dialog', { name: 'Compare Git checkpoint' });
  await expect(comparison).toBeVisible();
  await expect(comparison.getByRole('button', { name: /Restore/ })).toHaveCount(0);
});

test('shows and reloads a checkpoint warning while Claude completes the turn', async () => {
  const cwd = join(fixture, 'Project');
  execFileSync('git', ['init', '-b', 'demo'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['config', 'core.sparseCheckout', 'true'], { cwd, stdio: 'ignore' });
  const dock = page.getByRole('complementary', { name: 'Session' });
  const prompt = 'Read without a checkpoint';
  await dock.getByRole('textbox', { name: 'Message Claude' }).fill(prompt);
  await dock.getByRole('button', { name: 'Send', exact: true }).click();
  const warning = dock.getByText('Turn started without a Git checkpoint (unsupported).');
  await expect(warning).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('region', { name: 'Session timeline' })).toContainText(
    'Turn completed',
    { timeout: 20_000 },
  );
  await dock.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(warning).toHaveCount(0);
  await dock.getByRole('button', { name: 'History', exact: true }).click();
  await dock.getByRole('button', { name: prompt }).click();
  await expect(warning).toBeVisible();
});

test('clears the selected Git diff when switching workspaces', async () => {
  const init = async (cwd: string, contents: string) => {
    execFileSync('git', ['init', '-b', 'demo'], { cwd, stdio: 'ignore' });
    await writeFile(join(cwd, 'shared.txt'), contents);
  };
  const first = join(fixture, 'Project');
  const second = join(fixture, 'Other');
  await mkdir(second);
  await init(first, 'First workspace\n');
  await init(second, 'Second workspace\n');
  await page.getByRole('link', { name: 'Git', exact: true }).click();
  const view = page.getByTestId('view-git');
  const file = view.getByRole('button', { name: 'Untracked shared.txt' });
  await file.click();
  await expect(view.getByLabel('Diff content')).toContainText('+First workspace');
  await app.evaluate(
    ({ dialog }, folder) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    },
    await realpath(second),
  );
  await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
  await page.getByRole('dialog', { name: 'Switch workspace' }).getByText('Open folder…').click();
  await expect(page.getByTestId('status-bar')).toContainText('Other');
  await page.getByRole('link', { name: 'Git', exact: true }).click();
  await expect(file).toHaveAttribute('aria-pressed', 'false');
  await expect(view.getByLabel('Diff content')).toHaveCount(0);
  await file.click();
  await expect(view.getByLabel('Diff content')).toContainText('+Second workspace');
});

test('runs a Claude session from the renderer and streams its AgentEvents', async () => {
  const result = await page.evaluate(async () => {
    const api = window.api;
    const state = await api.workspace.getState();
    const workspaceId = state.active?.id ?? '';
    const id = crypto.randomUUID();
    const events: Array<{ type: string; source: string; seq: number }> = [];
    const records: string[] = [];
    const statuses: Array<{ status: string; hooks: boolean }> = [];
    let resolveIdle: () => void = () => {};
    const idle = new Promise<void>((r) => (resolveIdle = r));
    const stop = api.claude.onUpdated((u) => {
      if (u.id !== id) return;
      if (u.kind === 'prompt' || u.kind === 'events') records.push(u.kind);
      if (u.kind === 'events') events.push(...u.events);
      if (u.kind === 'status') {
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
    const [summary] = await api.claude.listHistory({ workspaceId });
    const saved = summary && (await api.claude.readHistory({ workspaceId, historyId: summary.id }));
    return { started, sent, events, records, saved, statuses, emptyMessage, closed };
  });

  expect(result.started).toBe('started');
  expect(result.sent).toBe('started');
  expect(result.statuses[0]).toEqual({ status: 'idle', hooks: true });
  expect(result.statuses.map((s) => s.status)).toContain('running');
  expect(result.records.slice(0, 2)).toEqual(['prompt', 'events']);
  expect(result.saved?.records.map((record) => record.kind)).toEqual(result.records);
  expect(result.events.map((e) => e.seq)).toEqual(result.events.map((_, i) => i));
  expect(result.events[0]?.type).toBe('session.started');
  expect(result.events.at(-1)?.type).toBe('session.ended');
  expect(result.events.some((e) => e.source === 'hooks')).toBe(true);
  expect(result.events.filter((e) => e.type === 'tool.called').length).toBeGreaterThan(0);
  // an empty message never reaches the main process
  expect(result.emptyMessage).toContain('invalid-request');
  expect(result.closed).toBe(true);
});
