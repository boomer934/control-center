import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import { parseJsonc, parsePackageJson, emptyConfig } from './config.ts';
import { IgnoreRules } from './ignore-rules.ts';
import { ProjectIndexer } from './indexer.ts';
import { expandUse, languageOf } from './languages.ts';
import { WorkerMessageSchema, type WorkerMessage } from './protocol.ts';
import { packageName } from './resolve.ts';
import {
  applyProjectDelta,
  isProjectPath,
  type ProjectFile,
  type ProjectSnapshot,
} from './schema.ts';
import { removeWorkspace, tempWorkspace, WASM_DIR, writeTree } from './test-utils.ts';
import { watchTree, type WatchBatch } from './watch.ts';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await removeWorkspace(root);
});
async function workspace(files: Record<string, string>) {
  const root = await tempWorkspace(files);
  roots.push(root);
  return root;
}

describe('helpers', () => {
  it('accepts only clean relative project paths', () => {
    for (const ok of ['a', 'a/b.ts', '.github/x.yml', 'a b/c'])
      expect(isProjectPath(ok)).toBe(true);
    for (const bad of ['', '/a', 'a/', 'a//b', './a', 'a/../b', '..', 'C:/a', 'a\\b', 'a\u0007'])
      expect(isProjectPath(bad), bad).toBe(false);
  });

  it('expands Rust use trees', () => {
    expect(expandUse('crate::a::{b,c::{d,e},self}')).toEqual([
      ['crate', 'a', 'b'],
      ['crate', 'a', 'c', 'd'],
      ['crate', 'a', 'c', 'e'],
      ['crate', 'a'],
    ]);
    expect(expandUse('super::*')).toEqual([['super']]);
  });

  it('reads tsconfig-style JSON without breaking strings', () => {
    expect(parseJsonc('{ "url": "https://x//y", /* c */ "a": [1, 2,], // end\n }')).toEqual({
      url: 'https://x//y',
      a: [1, 2],
    });
    expect(parseJsonc('{ broken')).toBeNull();
  });

  it('reads package exports with conditions', () => {
    const config = emptyConfig();
    parsePackageJson(
      JSON.stringify({ name: 'p', exports: { '.': { types: './t.d.ts', import: './i.js' } } }),
      'pkg',
      config,
    );
    expect(config.packages[0]?.exports.get('.')).toBe('./t.d.ts');
  });

  it('names external packages and languages', () => {
    expect(packageName('@scope/pkg/sub')).toBe('@scope/pkg');
    expect(packageName('lodash/fp')).toBe('lodash');
    expect(languageOf('a/b.MTS')).toBe('typescript');
    expect(languageOf('README.md')).toBeNull();
    expect(languageOf('.ts')).toBeNull();
  });

  it('applies nested .gitignore files relative to their folder', async () => {
    const root = await workspace({
      '.gitignore': '*.log\n',
      'a/.gitignore': 'build/\n!keep.log\n',
    });
    const rules = await IgnoreRules.load(root);
    await rules.enter('a');
    expect(rules.ignored('x.log', false)).toBe(true);
    expect(rules.ignored('a/keep.log', false)).toBe(true); // the root rule still applies
    expect(rules.ignored('a/build', true)).toBe(true);
    expect(rules.ignored('a/build/x.ts', false)).toBe(true);
    expect(rules.ignored('build/x.ts', false)).toBe(false);
    expect(rules.ignored('node_modules/x/y.js', false)).toBe(true);
  });

  it('refuses a delta that does not follow the snapshot', () => {
    const snapshot: ProjectSnapshot = {
      version: 1,
      revision: 3,
      status: 'ready',
      truncated: false,
      progress: { indexed: 0, parseable: 0 },
      files: [],
    };
    const delta = {
      revision: 5,
      status: 'ready' as const,
      truncated: false,
      progress: { indexed: 0, parseable: 0 },
      upsert: [],
      remove: [],
    };
    expect(applyProjectDelta(snapshot, delta)).toBeNull();
    expect(applyProjectDelta(snapshot, { ...delta, revision: 4 })?.revision).toBe(4);
  });
});

describe('watchTree', () => {
  it('reports changed paths relative to the root, in batches', async () => {
    const root = await workspace({ 'a.ts': '' });
    const batches: WatchBatch[] = [];
    const stop = watchTree(root, (batch) => batches.push(batch), { delayMs: 50 });
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await writeTree(root, { 'dir/b.ts': 'x', 'a.ts': 'y' });
      await expect
        .poll(() => batches.flatMap((batch) => (batch === 'all' ? ['*'] : batch)), {
          timeout: 5000,
        })
        .toEqual(expect.arrayContaining(['dir/b.ts', 'a.ts']));
    } finally {
      stop();
    }
  });
});

describe('project model worker', () => {
  it('sends a snapshot, then deltas for indexing and file changes', async () => {
    const root = await workspace({ 'a.ts': "import './b';\n", 'b.ts': '' });
    const worker = new Worker(new URL('./worker.ts', import.meta.url));
    const messages: WorkerMessage[] = [];
    worker.on('message', (message: unknown) => messages.push(WorkerMessageSchema.parse(message)));
    try {
      worker.postMessage({ type: 'start', root, wasmDir: WASM_DIR });
      let model: ProjectSnapshot | null = null;
      const current = () => {
        for (const message of messages.splice(0)) {
          if (message.type === 'snapshot') model = message.snapshot;
          else if (message.type === 'delta' && model)
            model = applyProjectDelta(model, message.delta);
        }
        return model;
      };
      const file = (path: string): ProjectFile | undefined =>
        current()?.files.find((entry) => entry.path === path);
      await expect.poll(() => file('a.ts')?.imports, { timeout: 10_000 }).toEqual(['b.ts']);

      await new Promise((resolve) => setTimeout(resolve, 200));
      await writeFile(join(root, 'c.ts'), "import './a';\n");
      await expect.poll(() => file('c.ts')?.imports, { timeout: 10_000 }).toEqual(['a.ts']);
      expect(model).not.toBeNull();
    } finally {
      await worker.terminate();
    }
  });
});

describe('performance', () => {
  // Phase 5a budget: the Live view opens a 5,000-file project in under 2 s (collapsed map). The
  // first snapshot is what it needs; imports arrive afterwards.
  it('opens a 5,000-file project in under 2 s', { timeout: 180_000 }, async () => {
    const files: Record<string, string> = { 'package.json': '{"name":"big"}' };
    for (let i = 0; i < 5000 - 1; i += 1) {
      const dir = `src/m${Math.floor(i / 50)}`;
      files[`${dir}/f${i}.ts`] = [
        `import { v${i - 1} } from '../m${Math.floor((i - 1) / 50)}/f${i - 1}';`,
        "import { useState } from 'react';",
        `export const v${i} = ${i};`,
        '// '.padEnd(400, 'x'),
      ].join('\n');
    }
    const root = await workspace(files);
    const indexer = new ProjectIndexer({ root, wasmDir: WASM_DIR });
    try {
      const start = performance.now();
      const snapshot = await indexer.start();
      const opened = performance.now() - start;
      await indexer.idle();
      const indexed = performance.now() - start;
      indexer.flush();
      const model = indexer.snapshot();
      console.info(
        `project model: 5,000 files listed in ${opened.toFixed(0)} ms, indexed in ${indexed.toFixed(0)} ms`,
      );
      expect(snapshot.files).toHaveLength(5000);
      expect(opened).toBeLessThan(2000);
      expect(model.progress).toEqual({ indexed: 4999, parseable: 4999 });
      expect(model.files.find((file) => file.path === 'src/m1/f50.ts')?.imports).toEqual([
        'src/m0/f49.ts',
      ]);
    } finally {
      indexer.dispose();
    }
  });
});
