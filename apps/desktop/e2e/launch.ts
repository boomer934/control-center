import { resolve } from 'node:path';
import { _electron, type ElectronApplication, type Page } from '@playwright/test';

export const APP_DIR = resolve(__dirname, '..');

/** Environment without the variables that would change how Electron starts. */
export function cleanEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (/^(ELECTRON_RENDERER_URL|ELECTRON_RUN_AS_NODE|NODE_OPTIONS)$/i.test(k)) continue;
    env[k] = v;
  }
  return { ...env, ...extra };
}

/** Starts the built app (out/) and waits until the renderer got its first IPC answer. */
export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await _electron.launch({ args: [APP_DIR], cwd: APP_DIR, env: cleanEnv() });
  const page = await app.firstWindow();
  await page.getByTestId('app-info').waitFor();
  return { app, page };
}
