// Development mode: the renderer comes from the Vite dev server (HMR, React Refresh) under the
// dev CSP, and the IPC sender check accepts the loopback dev origin. `electron-vite dev` would
// also start its own Electron (which holds the single-instance lock), so the test starts only
// the renderer dev server, with the same config, and launches the built main process itself.
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { rendererConfig } from '../../electron.vite.config';
import { APP_DIR, cleanEnv } from '../launch';

let server: ViteDevServer | undefined;
let app: ElectronApplication | undefined;
let page: Page;
let devUrl: string;

test.beforeAll(async () => {
  server = await createServer({
    ...rendererConfig,
    configFile: false,
    logLevel: 'warn',
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const local = server.resolvedUrls?.local[0];
  if (!local) throw new Error('Vite dev server has no local URL');
  devUrl = local;

  app = await _electron.launch({
    args: [APP_DIR],
    cwd: APP_DIR,
    env: cleanEnv({ ELECTRON_RENDERER_URL: devUrl }),
  });
  page = await app.firstWindow();
});

test.afterAll(async () => {
  await app?.close();
  await server?.close();
});

test('the dev renderer loads, renders React and passes the IPC sender check', async () => {
  await expect(page.getByTestId('app-info')).toBeVisible({ timeout: 30_000 });
  expect(page.url()).toBe(devUrl);
});

test('the dev server responses carry the dev CSP (loopback websocket, never eval)', async () => {
  const csp = await page.evaluate(async () => {
    const res = await fetch(location.href);
    return res.headers.get('content-security-policy') ?? '';
  });
  const origin = new URL(devUrl).origin;
  expect(csp).toContain(`connect-src 'self' ${origin.replace('http:', 'ws:')}`);
  expect(csp).not.toContain('unsafe-eval');
  expect(csp).not.toContain('https:');
});

test('navigation to another loopback port is still blocked in dev', async () => {
  await page.evaluate(() => {
    window.location.href = 'http://127.0.0.1:1/';
  });
  await page.waitForTimeout(300);
  const url = await app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.webContents.getURL(),
  );
  expect(url).toBe(devUrl);
});
