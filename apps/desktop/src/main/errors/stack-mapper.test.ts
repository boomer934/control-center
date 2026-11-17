import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createStackMapper } from './stack-mapper';

// Two generated lines: line 1 → source line 1, line 2 → source line 2 (column 0 of both).
const MAP = JSON.stringify({
  version: 3,
  file: 'index.js',
  sources: ['../../src/main/a.ts'],
  names: [],
  mappings: 'AAAA;AACA',
});

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A fake `out/` with a main bundle map and a renderer bundle map. */
function fakeBuild() {
  const root = mkdtempSync(join(tmpdir(), 'cc-map-'));
  dirs.push(root);
  const out = join(root, 'out');
  mkdirSync(join(out, 'main'), { recursive: true });
  mkdirSync(join(out, 'renderer', 'assets'), { recursive: true });
  writeFileSync(join(out, 'main', 'index.js'), '');
  writeFileSync(join(out, 'main', 'index.js.map'), MAP);
  writeFileSync(join(out, 'renderer', 'assets', 'index-x.js'), '');
  writeFileSync(join(out, 'renderer', 'assets', 'index-x.js.map'), MAP);
  return { root, out };
}

describe('createStackMapper', () => {
  it('maps a main-process bundle frame to its TypeScript source', () => {
    const { root, out } = fakeBuild();
    const mapper = createStackMapper({ builtRoot: out, rendererSourceRoot: root, devOrigin: null });
    const bundle = join(out, 'main', 'index.js');
    const stack = [
      'Error: boom',
      `    at triggerIt (${bundle}:2:5)`,
      `    at ${bundle}:1:9`,
      '    at process.processImmediate (node:internal/timers:491:21)',
    ].join('\n');
    const source = resolve(out, 'main', '../../src/main/a.ts');
    expect(mapper.map(stack).split('\n')).toEqual([
      'Error: boom',
      `    at triggerIt (${source}:2:1)`,
      `    at ${source}:1:1`,
      '    at process.processImmediate (node:internal/timers:491:21)',
    ]);
  });

  it('maps app:// renderer frames, also with file: URLs for the bundle', () => {
    const { root, out } = fakeBuild();
    const mapper = createStackMapper({ builtRoot: out, rendererSourceRoot: root, devOrigin: null });
    const source = resolve(out, 'renderer/assets', '../../src/main/a.ts');
    expect(mapper.map('    at App (app://control-center/assets/index-x.js:2:3)')).toBe(
      `    at App (${source}:2:1)`,
    );
  });

  it('leaves frames it cannot map alone', () => {
    const { root, out } = fakeBuild();
    const mapper = createStackMapper({ builtRoot: out, rendererSourceRoot: root, devOrigin: null });
    for (const line of [
      '    at x (app://control-center/assets/missing.js:1:1)',
      `    at y (${join(root, 'elsewhere.js')}:1:1)`,
      '    at z (https://example.com/a.js:1:1)',
      '    at new Promise (<anonymous>)',
      'Error: not a frame (a.js:1:1)',
    ]) {
      expect(mapper.map(line)).toBe(line);
    }
  });

  it('never reads a map outside the build, whatever the frame says', () => {
    const { root, out } = fakeBuild();
    const reads: string[] = [];
    const mapper = createStackMapper({
      builtRoot: out,
      rendererSourceRoot: root,
      devOrigin: null,
      readMap: (p) => {
        reads.push(p);
        return MAP;
      },
    });
    mapper.map('    at a (app://control-center/../../../etc/passwd:1:1)');
    mapper.map('    at b (app://control-center/assets/%2e%2e/%2e%2e/%2e%2e/x.js:1:1)');
    mapper.map(`    at c (${join(root, 'outside.js')}:1:1)`);
    expect(reads).toEqual([]);
  });

  it('maps dev-server module URLs to the renderer sources', () => {
    const { root, out } = fakeBuild();
    const sources = join(root, 'src', 'renderer');
    const mapper = createStackMapper({
      builtRoot: out,
      rendererSourceRoot: sources,
      devOrigin: 'http://127.0.0.1:5173',
    });
    expect(mapper.map('    at App (http://127.0.0.1:5173/src/App.tsx?t=12:7:3)')).toBe(
      `    at App (${join(sources, 'src', 'App.tsx')}:7:3)`,
    );
    const other = '    at q (http://127.0.0.1:9999/src/App.tsx:7:3)';
    expect(mapper.map(other)).toBe(other);
  });
});
