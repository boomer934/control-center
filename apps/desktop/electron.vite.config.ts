import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin, UserConfig } from 'vite';
import { buildCsp } from './src/main/security/csp';

/**
 * Production builds also carry the CSP as a <meta> tag (the app:// protocol sends it as a header
 * too): defence in depth if index.html is ever loaded some other way. Dev uses the header only,
 * because Vite's dev preamble needs a slightly wider policy.
 */
function cspMeta(): Plugin {
  return {
    name: 'control-center-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp({ meta: true }) },
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}

/** The renderer's fault injectors exist only in a build made with `--mode e2e`. */
const faultsDefine = (enabled: boolean) => ({ __CC_E2E_FAULTS__: JSON.stringify(enabled) });

/** Renderer config, exported so the dev-mode E2E can start the same Vite dev server. */
export const rendererConfigFor = (e2eFaults: boolean) =>
  ({
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), tailwindcss(), cspMeta()],
    define: faultsDefine(e2eFaults),
    build: {
      // Source maps ship with the app: the main process maps renderer stacks to TypeScript.
      sourcemap: true,
      // Vite would inline small assets as data: URLs; keep every asset a file of the app origin.
      assetsInlineLimit: 0,
      modulePreload: { polyfill: false },
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
    },
  }) satisfies UserConfig;

export const rendererConfig = rendererConfigFor(false);

export default defineConfig(({ mode }) => {
  const e2eFaults = mode === 'e2e';
  return {
    main: {
      resolve: {
        // The fault injectors of the E2E tests exist only in the `e2e` build.
        alias: {
          '#e2e-faults': resolve(
            __dirname,
            e2eFaults ? 'src/main/errors/faults.ts' : 'src/main/errors/faults-off.ts',
          ),
        },
      },
      build: {
        sourcemap: true,
        rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
      },
    },
    preload: {
      build: {
        sourcemap: true,
        rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } },
      },
    },
    renderer: rendererConfigFor(e2eFaults),
  };
});
