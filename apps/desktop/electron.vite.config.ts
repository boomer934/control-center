import { resolve } from 'node:path';
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

/** Renderer config, exported so the dev-mode E2E can start the same Vite dev server. */
export const rendererConfig = {
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react(), cspMeta()],
  build: {
    // Vite would inline small assets as data: URLs; keep every asset a file of the app origin.
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
  },
} satisfies UserConfig;

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } },
    },
  },
  renderer: rendererConfig,
});
