// What a production build contains (release/win-unpacked, built by `pnpm package:dir`, which
// runs electron-vite without `--mode e2e`). An asar archive stores its files uncompressed behind
// a JSON header that lists every path, offset and size, so the tests read the archive directly.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { APP_DIR } from '../launch';

const ASAR = join(APP_DIR, 'release', 'win-unpacked', 'resources', 'app.asar');

test.skip(process.platform !== 'win32', 'The packaged build is Windows-only until v1');
test.beforeAll(() => {
  if (!existsSync(ASAR)) throw new Error(`Missing ${ASAR}: run "pnpm package:dir" first`);
});

interface AsarNode {
  files?: Record<string, AsarNode>;
  size?: number;
  offset?: string;
}

/** Every file of the archive as `[path, contents]`. */
function readAsar(path: string): Array<[string, Buffer]> {
  const buf = readFileSync(path);
  // Chromium Pickle layout: [4: pickle size][4: header pickle size][4: json pickle][4: json length]
  const base = 8 + buf.readUInt32LE(4);
  const jsonLength = buf.readUInt32LE(12);
  const header = JSON.parse(buf.subarray(16, 16 + jsonLength).toString('utf8')) as AsarNode;
  const out: Array<[string, Buffer]> = [];
  const walk = (node: AsarNode, prefix: string) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      const p = `${prefix}/${name}`;
      if (child.files) walk(child, p);
      else if (child.offset !== undefined && child.size !== undefined) {
        const start = base + Number(child.offset);
        out.push([p, buf.subarray(start, start + child.size)]);
      }
    }
  };
  walk(header, '');
  return out;
}

test('the production code has no E2E fault injectors', () => {
  const files = readAsar(ASAR);
  const code = files.filter(([p]) => p.startsWith('/out/') && p.endsWith('.js'));
  // main, preload and the renderer bundle
  expect(code.map(([p]) => p).sort()).toEqual([
    expect.stringMatching(/^\/out\/main\/index\.js$/),
    expect.stringMatching(/^\/out\/preload\/index\.js$/),
    expect.stringMatching(/^\/out\/renderer\/assets\/index-[\w-]+\.js$/),
  ]);
  for (const [p, bytes] of code) {
    const text = bytes.toString('utf8');
    expect(text, p).not.toContain('__ccFaults');
    expect(text, p).not.toContain('e2e main uncaught exception');
    expect(text, p).not.toContain('e2e renderer window error');
    expect(text, p).not.toContain('E2E_MARK');
  }
});

test('source maps ship inside the package, so the Errors Console can map stacks', () => {
  const names = readAsar(ASAR).map(([p]) => p);
  expect(names).toContain('/out/main/index.js.map');
  expect(names).toContain('/out/preload/index.js.map');
  expect(names.some((p) => /^\/out\/renderer\/assets\/index-[\w-]+\.js\.map$/.test(p))).toBe(true);
});

test('node-pty ships unpacked with its native ConPTY module and worker', () => {
  const pty = join(ASAR + '.unpacked', 'node_modules', 'node-pty');
  expect(existsSync(join(pty, 'lib', 'worker', 'conoutSocketWorker.js'))).toBe(true);
  const rebuilt = existsSync(join(pty, 'build', 'Release', 'conpty.node'));
  const usingPrebuild = process.env.CC_USE_PREBUILT_PTY === '1';
  expect(
    rebuilt || (usingPrebuild && existsSync(join(pty, 'prebuilds', 'win32-x64', 'conpty.node'))),
  ).toBe(true);
});
