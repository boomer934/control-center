import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from '../launch';

let app: ElectronApplication;
let page: Page;
let fixture: string;
let userDataDir: string;
let first: string;
let second: string;

test.skip(process.platform !== 'win32', 'The desktop workspace and ConPTY target Windows');

test.beforeEach(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'cc-workspace-e2e-'));
  userDataDir = join(fixture, 'user-data');
  first = join(fixture, 'First project');
  second = join(fixture, 'Second project');
  await mkdir(first);
  await mkdir(second);
  first = await realpath(first);
  second = await realpath(second);
  ({ app, page } = await launchApp({ userDataDir }));
});

test.afterEach(async () => {
  await app?.close();
  if (fixture) await rm(fixture, { recursive: true, force: true });
});

async function chooseFolder(path: string) {
  // Stub only the native OS dialog. The real IPC handler sees the result as usual.
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, path);
  await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
  await page.getByRole('dialog', { name: 'Switch workspace' }).getByText('Open folder…').click();
  await expect(
    page
      .getByTestId('status-bar')
      .locator('[title]')
      .filter({
        hasText: path.endsWith('First project') ? 'First project' : 'Second project',
      }),
  ).toHaveAttribute('title', path);
}

async function selectRecent(name: string) {
  await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Switch workspace' });
  await picker.getByRole('combobox').fill(name);
  await picker.getByRole('option', { name: new RegExp(name) }).click();
  await expect(page.getByTestId('status-bar')).toContainText(name);
}

test('opens a workspace, searches recents and restores its view and dock after restart', async () => {
  await page.keyboard.press('Control+P');
  await expect(page.getByRole('dialog', { name: 'Switch workspace' })).toBeVisible();
  await page.keyboard.press('Escape');
  await chooseFolder(first);
  await page.keyboard.press('Control+4');
  await expect(page.getByTestId('view-mcp')).toBeVisible();
  await page.keyboard.press('Control+Alt+B');
  await expect(page.getByTestId('right-dock')).toHaveCount(0);
  await chooseFolder(second);
  await expect(page.getByTestId('right-dock')).toBeVisible();
  await selectRecent('First project');
  await expect(page.getByTestId('view-mcp')).toBeVisible();
  await expect(page.getByTestId('right-dock')).toHaveCount(0);

  // launchApp waits for the Live view, so start the second run on Live.
  await page.keyboard.press('Control+1');
  await expect(page.getByTestId('app-info')).toBeVisible();
  await app.close();
  ({ app, page } = await launchApp({ userDataDir }));
  await expect(page.getByTestId('status-bar')).toContainText('First project');
  await expect(page.getByTestId('right-dock')).toHaveCount(0);
});

test('runs PowerShell through ConPTY, keeps tabs across workspace switches and scopes shortcuts', async () => {
  const styleViolations: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('style-src')) {
      styleViolations.push(message.text());
    }
  });
  await chooseFolder(first);
  await page.keyboard.press('Control+Backquote');
  const terminal = page.getByRole('region', { name: 'Terminal' });
  await terminal.getByRole('button', { name: 'PowerShell', exact: true }).click();
  const output = terminal.locator('.xterm-rows');
  await expect(output).toContainText('First project', { timeout: 15_000 });
  const input = terminal.locator('textarea');
  await expect(input).toBeFocused();
  await input.press('Control+Shift+P');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await page.keyboard.press('Escape');
  await input.focus();
  await page.keyboard.type("Write-Output ('CC_PTY_' + 'FIRST')");
  await page.keyboard.press('Enter');
  await expect(output).toContainText('CC_PTY_FIRST');

  await terminal.getByRole('button', { name: 'PowerShell', exact: true }).click();
  await expect(output).toContainText('First project');
  await expect(output).not.toContainText('CC_PTY_FIRST');
  await terminal.getByRole('button', { name: 'Close PowerShell 2' }).click();
  await expect(output).toContainText('CC_PTY_FIRST');

  await chooseFolder(second);
  await selectRecent('First project');
  await expect(output).toContainText('CC_PTY_FIRST');
  await terminal.getByRole('button', { name: 'Close PowerShell 1' }).click();
  await expect(terminal.getByText('Start PowerShell or Bash in this workspace.')).toBeVisible();
  expect(styleViolations).toEqual([]);
});

test('rejects files outside the active workspace and terminal calls without an owned id', async () => {
  await writeFile(join(second, 'outside.txt'), 'fixture');
  await chooseFolder(first);
  const active = await page.evaluate(() => window.api.workspace.getState());
  const workspaceId = active.active?.id;
  if (!workspaceId) throw new Error('Expected an active workspace');
  const result = await page.evaluate(async (id) => {
    const unknownTab = crypto.randomUUID();
    return {
      path: await window.api.workspace.openFile({
        workspaceId: id,
        path: '../Second project/outside.txt',
        source: 'terminal',
      }),
      write: await window.api.terminal.write({ id: unknownTab, data: 'text' }),
      resize: await window.api.terminal.resize({ id: unknownTab, cols: 80, rows: 24 }),
      close: await window.api.terminal.close({ id: unknownTab }),
    };
  }, workspaceId);
  expect(result).toEqual({ path: false, write: false, resize: false, close: false });
});

test('runs Git Bash in the selected workspace when installed', async () => {
  const candidates = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs'),
  ];
  test.skip(
    !candidates.some((root) => root && existsSync(join(root, 'Git', 'bin', 'bash.exe'))),
    'Git for Windows is not installed in a supported location',
  );
  await chooseFolder(first);
  await page.keyboard.press('Control+Backquote');
  const terminal = page.getByRole('region', { name: 'Terminal' });
  await terminal.getByRole('button', { name: 'Bash', exact: true }).click();
  const output = terminal.locator('.xterm-rows');
  await expect(output).toContainText('$', { timeout: 15_000 });
  await terminal.locator('textarea').focus();
  await page.keyboard.type(`printf 'CC_BASH_%s\\n' "\${PWD##*/}"`);
  await page.keyboard.press('Enter');
  await expect(output).toContainText('CC_BASH_First project');
});

test('opens a canonical workspace file as text in the Windows editor', async () => {
  const file = join(first, 'project notes.txt');
  await writeFile(file, 'fixture');
  await chooseFolder(first);
  await app.evaluate(() => {
    const cp = process.getBuiltinModule('node:child_process');
    const events = process.getBuiltinModule('node:events');
    if (!cp || !events) throw new Error('Missing Node builtins');
    const original = cp.spawn;
    cp.spawn = ((program: string, args: string[], options: { shell?: boolean }) => {
      const child = new events.EventEmitter();
      const unref = () => {};
      Object.assign(child, { unref });
      process.env.CC_E2E_EDITOR_CALL = JSON.stringify({ program, args, shell: options.shell });
      cp.spawn = original;
      queueMicrotask(() => child.emit('spawn'));
      return child;
    }) as typeof cp.spawn;
  });
  await page.keyboard.press('Control+Backquote');
  const terminal = page.getByRole('region', { name: 'Terminal' });
  await terminal.getByRole('button', { name: 'PowerShell', exact: true }).click();
  await expect(terminal.locator('.xterm-rows')).toContainText('First project', { timeout: 15_000 });
  await page.keyboard.type("Write-Output ('\"project ' + 'notes.txt\"')");
  await page.keyboard.press('Enter');
  const link = terminal.locator('.xterm-rows').getByText('"project notes.txt"', { exact: true });
  const position = { x: 20, y: 5 };
  const screen = terminal.locator('.xterm-screen');
  // The screen receives pointer events over the text row, which xterm may repaint.
  await expect(async () => {
    await link.hover({ position, force: true, timeout: 1500 });
    await expect(screen).toHaveClass(/xterm-cursor-pointer/, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await link.click({ position, force: true });
  await expect.poll(() => app.evaluate(() => Boolean(process.env.CC_E2E_EDITOR_CALL))).toBe(true);
  const invocation = await app.evaluate(() => process.env.CC_E2E_EDITOR_CALL);
  expect(JSON.parse(invocation ?? 'null')).toEqual({
    program: expect.stringMatching(/\\System32\\notepad\.exe$/i),
    args: [file],
    shell: false,
  });
});
