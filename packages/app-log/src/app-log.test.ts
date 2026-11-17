import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTextCleaner } from '@control-center/event-schema';
import {
  createErrorReporter,
  createLogger,
  describeError,
  ErrorStore,
  formatReport,
  normalizeFile,
  parseErrorHead,
  parseStack,
} from './index';

const ROOT = 'C:/Users/dev/work/control-center';
const clean = makeTextCleaner(ROOT);
// Assembled at run time: no secret-shaped literal in the repository (gitleaks). Not a real key.
const SECRET = ['sk-', 'ant-', 'api03-', 'x'.repeat(28)].join('');

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'cc-log-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('stack parsing', () => {
  const stack = [
    'Error: boom',
    `    at triggerUncaught (file:///C:/Users/dev/work/control-center/apps/desktop/src/main/faults.ts:12:9)`,
    '    at Immediate.<anonymous> (C:\\Users\\dev\\work\\control-center\\apps\\desktop\\src\\main\\other.ts:3:1)',
    '    at parse (C:\\Users\\dev\\work\\control-center\\node_modules\\.pnpm\\zod@4\\node_modules\\zod\\index.js:5:7)',
    '    at process.processImmediate (node:internal/timers:491:21)',
    '    at async run (/home/ann/elsewhere/lib.ts:1:2)',
    '    at new Promise (<anonymous>)',
    '    at app://control-center/assets/index-ab12.js:1:2345',
  ].join('\n');

  it('makes project paths relative and classifies frames', () => {
    const frames = parseStack(stack, ROOT);
    expect(frames[0]).toEqual({
      fn: 'triggerUncaught',
      file: 'apps/desktop/src/main/faults.ts',
      line: 12,
      column: 9,
      kind: 'project',
    });
    expect(frames[1]).toMatchObject({ file: 'apps/desktop/src/main/other.ts', kind: 'project' });
    expect(frames[2]).toMatchObject({ file: 'node_modules/zod/index.js', kind: 'dependency' });
    expect(frames[3]).toMatchObject({ file: 'node:internal/timers', kind: 'internal' });
    expect(frames[4]).toMatchObject({ fn: 'run', file: '~/elsewhere/lib.ts', kind: 'project' });
    expect(frames[5]).toMatchObject({ file: '<anonymous>', kind: 'internal', line: null });
    expect(frames[6]).toMatchObject({
      fn: null,
      file: 'app://control-center/assets/index-ab12.js',
    });
  });

  it('shortens build-machine sources of a packaged app and masks the home', () => {
    expect(normalizeFile('D:/ci/build/apps/desktop/src/main/x.ts', ROOT)).toBe(
      'apps/desktop/src/main/x.ts',
    );
    expect(normalizeFile('C:/Users/other/stuff/lib.ts', ROOT)).toBe('~/stuff/lib.ts');
    expect(normalizeFile('http://127.0.0.1:5173/src/App.tsx?t=17', ROOT)).toBe(
      'http://127.0.0.1:5173/src/App.tsx',
    );
  });

  it('finds the error head in raw child stderr', () => {
    const text =
      'file:///x.ts:3\n  throw new Error("boom");\n  ^\n\nError: boom\n    at x (y.ts:1:1)\n';
    expect(parseErrorHead(text)).toEqual({ name: 'Error', message: 'boom' });
    // the stderr of a Windows child ends its lines with \r\n
    expect(parseErrorHead(text.replace(/\n/g, '\r\n'))).toEqual({ name: 'Error', message: 'boom' });
    expect(parseErrorHead('just a warning\n')).toEqual({
      name: 'Error',
      message: 'just a warning',
    });
  });

  it('ignores terminal colour codes (Node colours a crash when FORCE_COLOR is set)', () => {
    const esc = String.fromCharCode(27);
    const colored = `Error: boom\n    at crash ${esc}[90m(C:/Users/dev/work/control-center/a.ts:5:9${esc}[39m)${esc}[90m`;
    expect(parseStack(colored, ROOT)[0]).toMatchObject({ fn: 'crash', file: 'a.ts', line: 5 });
    expect(parseErrorHead(`${esc}[31mTypeError: x${esc}[39m`)).toEqual({
      name: 'TypeError',
      message: 'x',
    });
  });

  it('describes non-Error throwables', () => {
    expect(describeError('oops')).toMatchObject({ name: 'NonError', message: 'oops' });
    expect(describeError(new TypeError('bad')).name).toBe('TypeError');
  });
});

describe('ErrorStore', () => {
  const base = {
    origin: 'main',
    source: 'main',
    kind: 'uncaught-exception',
    name: 'Error',
  } as const;

  it('groups repeated errors and counts them', () => {
    const store = new ErrorStore({ projectRoot: ROOT, clean });
    const stack = 'Error: x\n    at f (C:/Users/dev/work/control-center/apps/desktop/src/a.ts:1:1)';
    store.record({ ...base, message: 'request 12 failed', stack });
    const g = store.record({ ...base, message: 'request 345 failed', stack });
    expect(g.count).toBe(2);
    expect(store.list()).toHaveLength(1);
    store.record({ ...base, message: 'something else', stack });
    expect(store.list()).toHaveLength(2);
    expect(store.revision).toBe(3);
  });

  it('keeps a bounded number of groups, dropping the least recently seen', () => {
    const store = new ErrorStore({ projectRoot: ROOT, clean, maxGroups: 3 });
    for (const m of ['a', 'b', 'c', 'd']) store.record({ ...base, message: m });
    expect(store.list().map((g) => g.message)).toEqual(['d', 'c', 'b']);
    expect(store.clear()).toBe(3);
    expect(store.list()).toEqual([]);
  });

  it('redacts secrets and masks home paths in message and frames', () => {
    const store = new ErrorStore({ projectRoot: ROOT, clean });
    const g = store.record({
      ...base,
      message: `failed with ${SECRET} in C:\\Users\\dev\\private\\file.txt`,
      stack: 'Error\n    at C:/Users/other/lib.ts:1:1',
    });
    expect(g.message).not.toContain('sk-ant');
    expect(g.message).toContain('<redacted:anthropic-key>');
    expect(g.message).toContain('~');
    expect(g.message).not.toContain('C:\\Users');
    expect(g.frames[0]?.file).toBe('~/lib.ts');
  });

  it('notifies every change with the new revision, until unsubscribed', () => {
    const store = new ErrorStore({ projectRoot: ROOT, clean });
    const seen: number[] = [];
    const off = store.onChange((rev) => seen.push(rev));
    store.record({ ...base, message: 'a' });
    store.record({ ...base, message: 'a' });
    store.clear();
    off();
    store.record({ ...base, message: 'b' });
    expect(seen).toEqual([1, 2, 3]);
  });

  it('keeps recording when a change listener throws', () => {
    const store = new ErrorStore({ projectRoot: ROOT, clean });
    const seen: number[] = [];
    store.onChange(() => {
      throw new Error('reader bug');
    });
    store.onChange((rev) => seen.push(rev));
    expect(() => store.record({ ...base, message: 'a' })).not.toThrow();
    expect(store.list()).toHaveLength(1);
    expect(seen).toEqual([1]);
  });
});

describe('logger', () => {
  it('writes redacted JSONL', () => {
    const dir = tmp();
    const logger = createLogger({ dir, clean, now: () => new Date('2026-11-17T10:00:00Z') });
    logger.error('main', 'boom', {
      message: `token ${SECRET}`,
      apiKey: 'plain-value-not-a-pattern',
      nested: { path: 'C:\\Users\\dev\\secret\\x.txt' },
    });
    logger.debug('main', 'ignored below min level');
    const lines = readFileSync(logger.file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({ ts: '2026-11-17T10:00:00.000Z', level: 'error', source: 'main' });
    const text = lines[0]!;
    expect(text).not.toContain('sk-ant');
    expect(text).not.toContain('plain-value-not-a-pattern');
    expect(text).not.toContain('C:\\\\Users');
    expect(entry.data.apiKey).toBe('<redacted:field>');
  });

  it('rotates files and keeps at most maxFiles', () => {
    const dir = tmp();
    const logger = createLogger({ dir, clean, maxBytes: 300, maxFiles: 3 });
    for (let i = 0; i < 30; i++) logger.info('main', 'tick', { i });
    const files = readdirSync(dir).sort();
    expect(files).toEqual([
      'control-center.1.jsonl',
      'control-center.2.jsonl',
      'control-center.jsonl',
    ]);
    for (const f of files) {
      for (const line of readFileSync(join(dir, f), 'utf8').trim().split('\n')) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    }
    const newest = JSON.parse(readFileSync(logger.file, 'utf8').trim().split('\n').at(-1)!);
    expect(newest.data.i).toBe(29);
  });

  it('never throws, even when the directory cannot be created', () => {
    const logger = createLogger({ dir: join(tmp(), 'a\0b'), clean });
    expect(() => logger.error('main', 'x')).not.toThrow();
  });
});

describe('reporter and report', () => {
  it('logs and counts, and the report is redacted', () => {
    const dir = tmp();
    const logger = createLogger({ dir, clean });
    const store = new ErrorStore({ projectRoot: ROOT, clean });
    const report = createErrorReporter({ logger, store });
    report({
      origin: 'child',
      source: 'child:fake',
      kind: 'child-exit',
      name: 'Error',
      message: `exit; env had ${SECRET}`,
      stack: 'Error\n    at f (C:/Users/dev/work/control-center/apps/desktop/e2e/c.ts:4:2)',
    });
    const logged = readFileSync(logger.file, 'utf8');
    expect(logged).toContain('apps/desktop/e2e/c.ts');
    expect(logged).not.toContain('sk-ant');

    const text = formatReport(
      store.list(),
      {
        app: 'Control Center',
        version: '0.0.0',
        electron: '45',
        platform: 'win32',
        generatedAt: new Date('2026-11-17T10:00:00Z'),
      },
      // a cleaner that knows nothing: the report must clean again on its own through `clean`
      clean,
    );
    expect(text).toContain('[child:fake] child-exit');
    expect(text).toContain('at f (apps/desktop/e2e/c.ts:4:2)');
    expect(text).not.toContain('sk-ant');
  });

  it('says so when there is nothing to report', () => {
    const text = formatReport(
      [],
      { app: 'A', version: '1', electron: '2', platform: 'p', generatedAt: new Date(0) },
      clean,
    );
    expect(text).toContain('No errors recorded.');
  });
});
