import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      'design/prototipo-live/src/**/*.test.ts',
      'scripts/**/*.test.mjs',
    ],
    passWithNoTests: false,
  },
});
