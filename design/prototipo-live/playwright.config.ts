// Screenshot tests of the Live prototype states. They replay the raw recordings in
// packages/fixtures/raw/, which are not in git: on a machine without them the tests skip.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, defineConfig } from '@playwright/test';

/**
 * The Chromium build this Playwright version expects, or else the newest one already installed
 * (PW_CHROMIUM_PATH overrides both). Avoids a forced browser download for a throwaway prototype.
 */
function chromiumPath(): string | undefined {
  if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH;
  if (existsSync(chromium.executablePath())) return undefined;
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  if (!existsSync(root)) return undefined;
  const builds = readdirSync(root)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
  for (const b of builds) {
    const exe = join(root, b, 'chrome-win64', 'chrome.exe');
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

export default defineConfig({
  testDir: 'e2e',
  snapshotPathTemplate: '{testDir}/screenshots/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    colorScheme: 'dark',
    launchOptions: { executablePath: chromiumPath() },
  },
  webServer: {
    command: 'npx vite',
    url: 'http://127.0.0.1:5174/fixtures/index.json',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
