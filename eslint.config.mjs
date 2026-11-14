import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/coverage/**', 'CHANGELOG.md'],
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
);
