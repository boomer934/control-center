import { mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectIndexer } from './indexer.ts';
import {
  applyProjectDelta,
  ProjectDeltaSchema,
  ProjectSnapshotSchema,
  type ProjectFile,
  type ProjectSnapshot,
} from './schema.ts';
import { removeWorkspace, tempWorkspace, WASM_DIR, writeTree } from './test-utils.ts';

const PROJECT: Record<string, string> = {
  // ── TS/JS with a path alias, a workspace package and Next.js ──
  'package.json': JSON.stringify({
    name: 'demo',
    dependencies: { next: '16.0.0', react: '19.0.0', lodash: '4.0.0' },
  }),
  'tsconfig.json': `{
    // comments and trailing commas, as tsconfig allows
    "compilerOptions": {
      "baseUrl": ".",
      "paths": { "@/*": ["src/*"], },
    },
  }`,
  '.gitignore': 'dist/\n*.log\n',
  'src/index.ts': [
    "import { a } from './lib/a';",
    "import b from '@/lib/b.js';",
    "export * from './lib';",
    "import type { Props } from './components/Button';",
    "const lazy = await import('./lazy');",
    "const fp = require('lodash/fp');",
    "import legacy = require('./legacy');",
    "import { readFile } from 'node:fs';",
    "import missing from './missing';",
  ].join('\n'),
  'src/lib/a.ts': 'export const a = 1;\n',
  'src/lib/b.ts': "import { a } from './a';\nexport default a;\n",
  'src/lib/index.ts': "export * from './a';\nexport * from './b';\n",
  'src/lib/a.test.ts': "import { a } from './a';\n",
  'src/lazy.tsx': "import React from 'react';\nexport const Lazy = () => <div />;\n",
  'src/legacy.ts': 'export = 1;\n',
  'src/components/Button.tsx': 'export interface Props {}\nexport const Button = () => null;\n',
  'src/app/page.tsx':
    "import { Card } from '@acme/ui';\nimport { Button } from '../components/Button';\n",
  'packages/ui/package.json': JSON.stringify({
    name: '@acme/ui',
    exports: { '.': './src/index.ts', './card': './src/card.ts' },
  }),
  'packages/ui/src/index.ts': "export * from './card';\n",
  'packages/ui/src/card.ts': 'export const Card = 1;\n',
  'web/main.mjs': "import '../src/lib/a.js';\nimport cjs from './old.cjs';\n",
  'web/old.cjs': "module.exports = require('./data.json');\n",
  'web/data.json': '{}',
  // ── Ignored ──
  'dist/out.js': "import '../src/index';\n",
  'debug.log': 'noise',
  'node_modules/lodash/index.js': '',
  // ── Python ──
  'app/__init__.py': '',
  'app/main.py': [
    'import os',
    'import app.services.billing',
    'from .models import User',
    'from . import utils',
    'from app.services import billing, missing_name',
    'import numpy as np',
  ].join('\n'),
  'app/models.py': 'class User: pass\n',
  'app/utils.py': 'from .models import User\n',
  'app/services/__init__.py': '',
  'app/services/billing.py': 'from ..models import User\n',
  // ── Go ──
  'go.mod': 'module example.com/demo\n\ngo 1.25\n',
  'cmd/demo/main.go': [
    'package main',
    'import (',
    '  "fmt"',
    '  store "example.com/demo/internal/store"',
    ')',
  ].join('\n'),
  'internal/store/store.go': 'package store\n',
  'internal/store/store_test.go': 'package store\nimport "testing"\n',
  // ── Rust ──
  'rs/Cargo.toml': '[package]\nname = "demo"\n',
  'rs/src/main.rs': [
    'mod config;',
    'mod net;',
    'mod inline { pub fn f() {} }',
    'use crate::net::client::Client;',
    'use serde::Deserialize;',
    'use std::{io, fs as filesystem};',
  ].join('\n'),
  'rs/src/config.rs': 'pub struct Config;\n',
  'rs/src/net/mod.rs': 'pub mod client;\nuse self::client::Client;\n',
  'rs/src/net/client.rs': 'use super::super::config::Config;\npub struct Client;\n',
};

let root: string;
let indexer: ProjectIndexer | undefined;

afterEach(async () => {
  indexer?.dispose();
  indexer = undefined;
  if (root) await removeWorkspace(root);
});

async function open(files: Record<string, string>) {
  root = await tempWorkspace(files);
  indexer = new ProjectIndexer({ root, wasmDir: WASM_DIR });
  const first = await indexer.start();
  await indexer.idle();
  indexer.flush();
  return { first, model: indexer.snapshot() };
}

const byPath = (snapshot: ProjectSnapshot) =>
  new Map(snapshot.files.map((file) => [file.path, file]));
const edges = (file: ProjectFile | undefined) => ({
  imports: file?.imports,
  importDirs: file?.importDirs,
  externals: file?.externals,
});

describe('ProjectIndexer on a multi-language workspace', () => {
  it('lists the files that are not ignored and builds the import graph', async () => {
    const { first, model } = await open(PROJECT);
    expect(ProjectSnapshotSchema.parse(model)).toEqual(model);
    expect(first.status).toBe('indexing');
    expect(model.status).toBe('ready');
    expect(model.progress.indexed).toBe(model.progress.parseable);

    const files = byPath(model);
    expect([...files.keys()]).not.toContain('dist/out.js');
    expect([...files.keys()]).not.toContain('debug.log');
    expect([...files.keys()].some((path) => path.startsWith('node_modules/'))).toBe(false);
    expect(files.get('.gitignore')?.language).toBeNull();

    expect(edges(files.get('src/index.ts'))).toEqual({
      imports: [
        'src/components/Button.tsx',
        'src/lazy.tsx',
        'src/legacy.ts',
        'src/lib/a.ts',
        'src/lib/b.ts',
        'src/lib/index.ts',
      ],
      importDirs: [],
      externals: ['lodash', 'node:fs'],
    });
    expect(files.get('src/app/page.tsx')?.imports).toEqual([
      'packages/ui/src/index.ts',
      'src/components/Button.tsx',
    ]);
    expect(files.get('web/main.mjs')?.imports).toEqual(['src/lib/a.ts', 'web/old.cjs']);
    expect(files.get('web/old.cjs')?.imports).toEqual(['web/data.json']);

    expect(edges(files.get('app/main.py'))).toEqual({
      imports: [
        'app/models.py',
        'app/services/__init__.py',
        'app/services/billing.py',
        'app/utils.py',
      ],
      importDirs: [],
      externals: ['numpy', 'os'],
    });
    expect(files.get('app/services/billing.py')?.imports).toEqual(['app/models.py']);

    expect(edges(files.get('cmd/demo/main.go'))).toEqual({
      imports: [],
      importDirs: ['internal/store'],
      externals: ['fmt'],
    });

    expect(edges(files.get('rs/src/main.rs'))).toEqual({
      imports: ['rs/src/config.rs', 'rs/src/net/client.rs', 'rs/src/net/mod.rs'],
      importDirs: [],
      externals: ['serde', 'std'],
    });
    expect(files.get('rs/src/net/mod.rs')?.imports).toEqual(['rs/src/net/client.rs']);
    expect(files.get('rs/src/net/client.rs')?.imports).toEqual(['rs/src/config.rs']);
  });

  it('assigns roles from the framework plugins', async () => {
    const { model } = await open(PROJECT);
    const files = byPath(model);
    expect(files.get('src/app/page.tsx')?.roles).toEqual(['page']);
    expect(files.get('src/components/Button.tsx')?.roles).toEqual(['component']);
    expect(files.get('src/lib/a.test.ts')?.roles).toEqual(['test']);
    expect(files.get('internal/store/store_test.go')?.roles).toEqual(['test']);
    expect(files.get('package.json')?.roles).toEqual(['config']);
    expect(files.get('src/index.ts')?.roles).toEqual(['entry']);
    expect(files.get('rs/src/main.rs')?.roles).toEqual(['entry']);
    expect(files.get('app/models.py')?.roles).toEqual(['schema']);
  });

  it('does not follow junctions or symbolic links out of the workspace', async () => {
    const outside = await tempWorkspace({ 'secret.ts': "import './x';\n" });
    try {
      root = await tempWorkspace({ 'src/a.ts': '' });
      await symlink(outside, join(root, 'linked'), 'junction');
      indexer = new ProjectIndexer({ root, wasmDir: WASM_DIR });
      const model = await indexer.start();
      expect(model.files.map((file) => file.path)).toEqual(['src/a.ts']);
    } finally {
      await removeWorkspace(outside);
    }
  });

  it('ignores watcher paths through a junction created after the scan', async () => {
    const outside = await tempWorkspace({ 'secret.ts': '', 'deep/more.ts': '' });
    try {
      root = await tempWorkspace({ 'src/a.ts': '' });
      indexer = new ProjectIndexer({ root, wasmDir: WASM_DIR });
      await indexer.start();
      await symlink(outside, join(root, 'linked'), 'junction');
      await indexer.refresh(['linked', 'linked/secret.ts', 'linked/deep', 'linked/deep/more.ts']);
      await indexer.idle();
      expect(indexer.snapshot().files.map((file) => file.path)).toEqual(['src/a.ts']);
    } finally {
      await removeWorkspace(outside);
    }
  });

  it('stops at the file limit and says so', async () => {
    root = await tempWorkspace({ 'a.ts': '', 'b.ts': '', 'c/d.ts': '' });
    indexer = new ProjectIndexer({ root, wasmDir: WASM_DIR, maxFiles: 2 });
    const model = await indexer.start();
    expect(model.truncated).toBe(true);
    expect(model.files.map((file) => file.path)).toEqual(['a.ts', 'b.ts']);
  });
});

describe('ProjectIndexer incremental updates', () => {
  async function replay(paths: string[] | 'all', base: ProjectSnapshot) {
    await indexer!.refresh(paths);
    await indexer!.idle();
    const delta = indexer!.flush();
    if (!delta) return base;
    expect(ProjectDeltaSchema.parse(delta)).toEqual(delta);
    const next = applyProjectDelta(base, delta);
    expect(next).not.toBeNull();
    // A delta applied to the previous snapshot gives the same model as a fresh snapshot.
    expect(next).toEqual(indexer!.snapshot());
    return next!;
  }

  it('follows added, changed, removed and renamed files', async () => {
    let { model } = await open(PROJECT);

    await writeTree(root, {
      'src/lib/c.ts': 'export const c = 3;\n',
      'src/lib/a.ts': "import { c } from './c';\nexport const a = c;\n",
    });
    model = await replay(['src/lib/c.ts', 'src/lib/a.ts'], model);
    let files = byPath(model);
    expect(files.get('src/lib/a.ts')?.imports).toEqual(['src/lib/c.ts']);

    await rm(join(root, 'src', 'lib', 'b.ts'));
    model = await replay(['src/lib/b.ts'], model);
    files = byPath(model);
    expect(files.has('src/lib/b.ts')).toBe(false);
    expect(files.get('src/index.ts')?.imports).not.toContain('src/lib/b.ts');
    expect(files.get('src/lib/index.ts')?.imports).toEqual(['src/lib/a.ts']);

    // The import of a missing file starts to resolve when the file appears.
    await writeFile(join(root, 'src', 'missing.ts'), 'export default 0;\n');
    model = await replay(['src/missing.ts'], model);
    expect(byPath(model).get('src/index.ts')?.imports).toContain('src/missing.ts');

    await rename(join(root, 'packages', 'ui'), join(root, 'packages', 'kit'));
    model = await replay(['packages/ui', 'packages/kit'], model);
    files = byPath(model);
    expect([...files.keys()].some((path) => path.startsWith('packages/ui/'))).toBe(false);
    expect(files.has('packages/kit/src/card.ts')).toBe(true);
    // The package keeps its name, so the import resolves to the new folder.
    expect(files.get('src/app/page.tsx')?.imports).toContain('packages/kit/src/index.ts');
  });

  it('applies a changed .gitignore and changed path aliases', async () => {
    let { model } = await open(PROJECT);

    await writeFile(join(root, '.gitignore'), 'dist/\n*.log\napp/\n');
    model = await replay(['.gitignore'], model);
    expect(model.files.some((file) => file.path.startsWith('app/'))).toBe(false);
    expect(model.files.some((file) => file.path === 'dist/out.js')).toBe(false);

    await writeFile(
      join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { paths: { '@/*': ['web/*'] } } }),
    );
    model = await replay(['tsconfig.json'], model);
    expect(byPath(model).get('src/index.ts')?.imports).not.toContain('src/lib/b.ts');
  });

  it('rescans everything when asked', async () => {
    let { model } = await open({ 'a.ts': "import './b';\n" });
    await mkdir(join(root, 'deep', 'er'), { recursive: true });
    await writeFile(join(root, 'b.ts'), '');
    await writeFile(join(root, 'deep', 'er', 'c.ts'), "import '../../a';\n");
    model = await replay('all', model);
    const files = byPath(model);
    expect(files.get('a.ts')?.imports).toEqual(['b.ts']);
    expect(files.get('deep/er/c.ts')?.imports).toEqual(['a.ts']);
  });
});
