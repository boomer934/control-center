// Dev server for the phase 1d prototype. The raw recordings stay in packages/fixtures/raw/
// (git-ignored): this plugin normalizes them on request, so only relative paths and counts ever
// reach the page, and nothing derived from them is written to disk.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { normalize, parseJsonl } from './src/replay/normalize';

const here = dirname(fileURLToPath(import.meta.url));
const RAW = resolve(here, '../../packages/fixtures/raw');

function fixtures(): Plugin {
  return {
    name: 'raw-fixtures',
    configureServer(server) {
      server.middlewares.use('/fixtures/', (req, res) => {
        const send = (code: number, body: unknown) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        const url = req.url ?? '';
        if (url === '/index.json' || url === '/') {
          const list = existsSync(RAW)
            ? readdirSync(RAW)
                .map((f) => /^sessione-(\d{2})\.jsonl$/.exec(f)?.[1])
                .filter((n): n is string => !!n)
                .sort()
            : [];
          return send(200, list);
        }
        // only two-digit ids: no path ever comes from the request
        const id = /^\/(\d{2})\.json$/.exec(url)?.[1];
        if (!id) return send(404, { error: 'unknown fixture' });
        const stream = join(RAW, `sessione-${id}.jsonl`);
        const hooks = join(RAW, `sessione-${id}.hooks.jsonl`);
        if (!existsSync(stream)) return send(404, { error: `sessione-${id} not recorded here` });
        const replay = normalize(
          `sessione-${id}`,
          parseJsonl(readFileSync(stream, 'utf8')),
          existsSync(hooks) ? parseJsonl(readFileSync(hooks, 'utf8')) : [],
        );
        return send(200, replay);
      });
    },
  };
}

export default defineConfig({
  root: here,
  plugins: [react(), fixtures()],
  server: {
    port: 5174,
    strictPort: true,
    host: '127.0.0.1',
    // the prototype reuses the real tokens and components from design/sistema
    fs: { allow: [resolve(here, '..')] },
  },
});
