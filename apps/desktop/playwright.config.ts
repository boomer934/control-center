// E2E tests of the desktop app with Playwright's _electron.
//   app       → the electron-vite build (out/) run by the Electron binary from node_modules;
//   packaged  → the unpacked electron-builder output (release/), where the Fuses are applied.
//               Playwright cannot attach to it (the inspector is fused off), so those tests
//               read the fuse wire and probe the binary from outside.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  projects: [
    { name: 'app', testDir: 'e2e/app' },
    { name: 'packaged', testDir: 'e2e/packaged' },
  ],
});
