// Phase 5a end to end: opening a workspace starts the project model worker in the main process;
// the Live view shows the files and import links, and follows changes on disk.
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from '../launch';

let app: ElectronApplication;
let page: Page;
let fixture: string;

test.beforeEach(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'cc-project-e2e-'));
  const workspace = join(fixture, 'Project');
  await mkdir(join(workspace, 'src'), { recursive: true });
  await writeFile(join(workspace, '.gitignore'), 'build/\n');
  await writeFile(join(workspace, 'src', 'main.ts'), "import { a } from './a';\nimport 'react';\n");
  await writeFile(join(workspace, 'src', 'a.ts'), "export { b as a } from './b';\n");
  await writeFile(join(workspace, 'src', 'b.ts'), 'export const b = 1;\n');
  await mkdir(join(workspace, 'build'));
  await writeFile(join(workspace, 'build', 'out.js'), "require('../src/main');\n");
  ({ app, page } = await launchApp({ userDataDir: join(fixture, 'user-data') }));
  const folder = await realpath(workspace);
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, folder);
  await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
  await page.getByRole('dialog', { name: 'Switch workspace' }).getByText('Open folder…').click();
  await expect(page.getByTestId('status-bar')).toContainText('Project');
});

test.afterEach(async () => {
  await app?.close();
  await rm(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('shows the project model of the workspace and follows changes', async () => {
  const model = page.getByTestId('project-model');
  // .gitignore, src/main.ts, src/a.ts, src/b.ts; build/ is ignored.
  await expect(model).toHaveText('4 files · 2 import links', { timeout: 15_000 });

  await writeFile(join(fixture, 'Project', 'src', 'c.ts'), "import './main';\nimport './b';\n");
  await expect(model).toHaveText('5 files · 4 import links', { timeout: 15_000 });
});

test('pushes project updates only through the contract channel', async () => {
  await expect(page.getByTestId('project-model')).toContainText('import links', {
    timeout: 15_000,
  });
  const result = await page.evaluate(async () => {
    const state = await window.api.workspace.getState();
    const id = state.active?.id;
    if (!id) return null;
    const opened = await window.api.project.open({ workspaceId: id });
    if (!opened.ok) return null;
    return {
      files: opened.snapshot.files.map((file) => file.path),
      main: opened.snapshot.files.find((file) => file.path === 'src/main.ts'),
    };
  });
  expect(result?.files).toEqual(['.gitignore', 'src/a.ts', 'src/b.ts', 'src/main.ts']);
  expect(result?.main).toMatchObject({
    imports: ['src/a.ts'],
    externals: ['react'],
    indexed: true,
  });
  // An unknown workspace id gets nothing.
  const other = await page.evaluate(() => window.api.project.open({ workspaceId: 'a'.repeat(64) }));
  expect(other).toEqual({ ok: false, error: 'workspace-unavailable' });
});
