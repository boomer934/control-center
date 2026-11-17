// Errors Console (phase 3b): an error caused in the main process, in the renderer and in a child
// process reaches the Console with the stack of the TypeScript source, the log is JSONL with no
// secrets, and "copy report" is redacted. The faults come from the E2E build (`--mode e2e`); each
// one marks its throwing line with an `E2E_MARK_*` comment, which the tests look up in the source
// to check the reported line number exactly.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { APP_DIR, launchApp } from '../launch';

const REPO = resolve(APP_DIR, '../..');
const FAULTS_MAIN = 'apps/desktop/src/main/errors/faults.ts';
const FAULTS_RENDERER = 'apps/desktop/src/renderer/src/errors/faults.tsx';
const CHILD_FIXTURE = 'apps/desktop/e2e/fixtures/child-crash.ts';

// Assembled at run time so no secret-shaped literal lives in the repository. Not a real key.
const FAKE_KEY = ['sk-', 'ant-', 'api03-', 'x'.repeat(28)].join('');
const FAKE_HOME_PATH = 'C:\\Users\\someone\\private.txt';

interface Frame {
  fn: string | null;
  file: string;
  line: number | null;
  kind: 'project' | 'dependency' | 'internal';
}
interface Group {
  id: string;
  origin: string;
  source: string;
  kind: string;
  name: string;
  message: string;
  frames: Frame[];
  count: number;
}

/** 1-based line of the first line of `file` (repo-relative) containing `marker`. */
function markerLine(file: string, marker: string): number {
  const lines = readFileSync(resolve(REPO, file), 'utf8').split('\n');
  const index = lines.findIndex((l) => l.includes(marker));
  if (index < 0) throw new Error(`${marker} not found in ${file}`);
  return index + 1;
}

let app: ElectronApplication;
let page: Page;
let userData: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'cc-e2e-errors-'));
  ({ app, page } = await launchApp({ userDataDir: userData }));
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userData, { recursive: true, force: true });
});

const list = () => page.evaluate(() => window.api.errors.list());

async function waitForGroup(match: (g: Group) => boolean): Promise<Group> {
  let found: Group | undefined;
  await expect
    .poll(
      async () => {
        const { groups } = (await list()) as { groups: Group[] };
        found = groups.find(match);
        return found !== undefined;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return found!;
}

function topProjectFrame(g: Group): Frame {
  const frame = g.frames.find((f) => f.kind === 'project');
  if (!frame) throw new Error(`no project frame in ${JSON.stringify(g.frames)}`);
  return frame;
}

test('an uncaught exception in the main process shows the TypeScript source line', async () => {
  await app.evaluate(() => (globalThis as any).__ccFaults.uncaught()); // eslint-disable-line @typescript-eslint/no-explicit-any
  const g = await waitForGroup((x) => x.message === 'e2e main uncaught exception');
  expect(g).toMatchObject({ origin: 'main', source: 'main', kind: 'uncaught-exception' });
  expect(topProjectFrame(g)).toMatchObject({
    file: FAULTS_MAIN,
    line: markerLine(FAULTS_MAIN, 'E2E_MARK_MAIN_THROW'),
  });
});

test('an unhandled rejection in the main process shows the TypeScript source line', async () => {
  await app.evaluate(() => (globalThis as any).__ccFaults.rejection()); // eslint-disable-line @typescript-eslint/no-explicit-any
  const g = await waitForGroup((x) => x.message === 'e2e main unhandled rejection');
  expect(g).toMatchObject({ origin: 'main', kind: 'unhandled-rejection' });
  expect(topProjectFrame(g)).toMatchObject({
    file: FAULTS_MAIN,
    line: markerLine(FAULTS_MAIN, 'E2E_MARK_MAIN_REJECT'),
  });
});

test('an error in the renderer reaches the Console with the source line, not the bundle', async () => {
  await page.evaluate(() => (window as any).__ccFaults.windowError()); // eslint-disable-line @typescript-eslint/no-explicit-any
  const g = await waitForGroup((x) => x.message === 'e2e renderer window error');
  expect(g).toMatchObject({ origin: 'renderer', source: 'renderer', kind: 'window-error' });
  const frame = topProjectFrame(g);
  expect(frame.file).toBe(FAULTS_RENDERER);
  expect(frame.line).toBe(markerLine(FAULTS_RENDERER, 'E2E_MARK_RENDERER_THROW'));
  // nothing may still point at the bundle
  expect(g.frames.some((f) => f.file.includes('/assets/'))).toBe(false);
});

test('an unhandled rejection in the renderer is reported with its source line', async () => {
  await page.evaluate(() => (window as any).__ccFaults.rejection()); // eslint-disable-line @typescript-eslint/no-explicit-any
  const g = await waitForGroup((x) => x.message === 'e2e renderer unhandled rejection');
  expect(g.kind).toBe('unhandled-rejection');
  expect(topProjectFrame(g)).toMatchObject({
    file: FAULTS_RENDERER,
    line: markerLine(FAULTS_RENDERER, 'E2E_MARK_RENDERER_REJECT'),
  });
});

test('a React render error is caught by the boundary and reported, the Console survives', async () => {
  await page.evaluate(() => (window as any).__ccFaults.renderCrash()); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId('render-fallback')).toBeVisible();
  const g = await waitForGroup((x) => x.message === 'e2e renderer render crash');
  expect(g).toMatchObject({ origin: 'renderer', kind: 'render-error' });
  expect(topProjectFrame(g)).toMatchObject({
    file: FAULTS_RENDERER,
    line: markerLine(FAULTS_RENDERER, 'E2E_MARK_RENDERER_RENDER'),
  });
  await expect(page.getByTestId('status-errors')).toBeVisible();
});

test('a crash of a child process shows its stderr stack and its exit', async () => {
  const file = resolve(REPO, CHILD_FIXTURE);
  await app.evaluate(
    (_electron, args) => (globalThis as any).__ccFaults.crashChild(args.command, args.file), // eslint-disable-line @typescript-eslint/no-explicit-any
    { command: process.execPath, file },
  );
  const stderr = await waitForGroup(
    (x) => x.source === 'child:e2e-crash' && x.kind === 'child-stderr',
  );
  expect(stderr).toMatchObject({ origin: 'child', name: 'Error', message: 'e2e child crash' });
  expect(topProjectFrame(stderr)).toMatchObject({
    file: CHILD_FIXTURE,
    line: markerLine(CHILD_FIXTURE, 'E2E_MARK_CHILD_THROW'),
  });
  const exit = await waitForGroup((x) => x.source === 'child:e2e-crash' && x.kind === 'child-exit');
  expect(exit.message).toBe('Exited with code 1');
});

test('a refused IPC call is recorded without its payload', async () => {
  const outcome = await page.evaluate(async () => {
    try {
      await window.api.errors.reportRenderer({ kind: 'nope', secret: 'payload-value' } as never);
      return 'accepted';
    } catch (e) {
      return (e as Error).message;
    }
  });
  expect(outcome).toContain('invalid-request');
  const g = await waitForGroup((x) => x.source === 'ipc:errors:report-renderer');
  expect(g).toMatchObject({ origin: 'ipc', kind: 'ipc-failure' });
  expect(JSON.stringify(g)).not.toContain('payload-value');
});

test('the same error is one group with a counter', async () => {
  for (let i = 0; i < 2; i++) {
    await app.evaluate(() => (globalThis as any).__ccFaults.uncaught()); // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  await expect
    .poll(
      async () => (await waitForGroup((x) => x.message === 'e2e main uncaught exception')).count,
    )
    .toBe(3);
});

test('secrets and personal paths never reach the Console, the log or the report', async () => {
  await app.evaluate(
    (_electron, secret) => (globalThis as any).__ccFaults.uncaughtWithSecret(secret), // eslint-disable-line @typescript-eslint/no-explicit-any
    FAKE_KEY,
  );
  const g = await waitForGroup((x) => x.message.startsWith('e2e leaked'));
  expect(g.message).toContain('<redacted:anthropic-key>');
  expect(JSON.stringify(g)).not.toContain(FAKE_KEY);
  expect(JSON.stringify(g)).not.toContain(FAKE_HOME_PATH);

  // the Console (status bar counter, then the panel)
  await expect(page.getByTestId('status-error-count')).not.toHaveText('0');
  await page.getByTestId('status-errors').click();
  await expect(page.getByTestId('error-console')).toBeVisible();
  const projectFrame = page.getByTestId('error-frame').first();
  await expect(projectFrame).toContainText('apps/desktop/');
  await expect(page.getByTestId('error-console')).not.toContainText(FAKE_KEY);

  // "copy report": written to the clipboard by the main process
  await page.getByTestId('error-copy').click();
  await expect(page.getByTestId('error-notice')).toContainText('copied');
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(clip).toContain('Control Center error report');
  expect(clip).toContain('[main] uncaught-exception');
  expect(clip).toContain('<redacted:anthropic-key>');
  expect(clip).not.toContain(FAKE_KEY);
  expect(clip).not.toContain('someone');

  // the JSONL log: every line is JSON, errors are there, secrets are not
  const logDir = join(userData, 'logs');
  const files = readdirSync(logDir).filter((f) => f.endsWith('.jsonl'));
  expect(files).toContain('control-center.jsonl');
  const text = files.map((f) => readFileSync(join(logDir, f), 'utf8')).join('');
  const entries = text
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { level: string; source: string; event: string });
  expect(entries.some((e) => e.source === 'main' && e.event === 'uncaught-exception')).toBe(true);
  expect(entries.some((e) => e.source === 'renderer' && e.event === 'window-error')).toBe(true);
  expect(entries.some((e) => e.source === 'child:e2e-crash')).toBe(true);
  expect(text).not.toContain(FAKE_KEY);
  expect(text).not.toContain('someone');
});

test('"clear" empties the Console', async () => {
  await page.getByTestId('error-clear').click();
  await expect(page.getByTestId('error-group')).toHaveCount(0);
  await expect(page.getByTestId('status-error-count')).toHaveText('0');
});
