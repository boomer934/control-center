import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/release/**',
      '**/coverage/**',
      '**/test-results/**',
      'CHANGELOG.md',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  security.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Never weaken Electron isolation: see docs/memoria/SICUREZZA.md
      'no-restricted-properties': [
        'error',
        {
          property: 'nodeIntegration',
          message: 'nodeIntegration is forbidden. Expose APIs through the typed preload bridge.',
        },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Static design mockups (phase 1c) run in the browser, not in Node.
    files: ['design/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // IPC goes only through @control-center/ipc-contract: raw IPC modules are allowed in the
    // two bridge files and nowhere else. See docs/memoria/SICUREZZA.md.
    files: ['apps/desktop/src/**/*.{ts,tsx}'],
    ignores: ['apps/desktop/src/main/ipc.ts', 'apps/desktop/src/preload/index.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              importNames: ['ipcMain', 'ipcRenderer', 'contextBridge'],
              message:
                'Raw IPC is only allowed in src/main/ipc.ts and src/preload/index.ts. Add a method to @control-center/ipc-contract instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // The renderer is sandboxed web content: no Electron, no Node, only window.api.
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'electron',
              message: 'The renderer reaches the main process only via window.api.',
            },
          ],
          patterns: [
            { group: ['node:*'], message: 'The renderer has no Node.js: use window.api.' },
            {
              group: ['@control-center/ipc-contract/main', '@control-center/ipc-contract/preload'],
              message:
                'The renderer may import only types and schemas from @control-center/ipc-contract.',
            },
          ],
        },
      ],
    },
  },
  {
    // Playwright specs run page.evaluate callbacks in the renderer.
    files: ['apps/desktop/e2e/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
);
