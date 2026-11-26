// The stack trace parsers of phase 5e against the fixtures in packages/fixtures/stacks: each
// language must find its error, the right culprit file and line, and valid frames.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  detectErrors,
  errorDetectedSchema,
  originOfCommand,
  SCHEMA_VERSION,
  type ErrorDraft,
} from '@control-center/event-schema';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'stacks');
const CWD = 'C:\\dev\\shop';
const load = (name: string) => readFileSync(join(DIR, name), 'utf8');
const detect = (name: string, origin: ErrorDraft['origin'] = 'terminal') =>
  detectErrors(load(name), { cwd: CWD, origin });

const asEvent = (draft: ErrorDraft) => ({
  schemaVersion: SCHEMA_VERSION,
  id: 'e',
  sessionId: 's',
  seq: 0,
  timestamp: new Date(0).toISOString(),
  source: 'app' as const,
  provider: 'claude' as const,
  agentId: 'main' as const,
  type: 'error.detected' as const,
  ...draft,
});

const CASES: {
  fixture: string;
  language: ErrorDraft['language'];
  message: RegExp;
  file?: { path: string; external: boolean };
  line?: number;
  column?: number;
  origin?: ErrorDraft['origin'];
}[] = [
  {
    fixture: 'node-cjs.txt',
    language: 'node',
    message: /^TypeError: Cannot read properties of undefined \(reading 'reduce'\)$/,
    file: { path: 'src/lib/price.js', external: false },
    line: 2,
    column: 21,
  },
  {
    fixture: 'node-esm.txt',
    language: 'node',
    message: /^Error: ENOENT: no such file or directory, open '\.[\\/]missing\.json'$/,
    file: { path: 'src/esm.mjs', external: false },
    line: 2,
    column: 44,
  },
  {
    fixture: 'tsc.txt',
    language: 'node',
    message: /^TS2322: Type 'string' is not assignable/,
    file: { path: 'ts/a.ts', external: false },
    line: 1,
    column: 14,
  },
  {
    fixture: 'tsc-pretty.txt',
    language: 'node',
    message: /^TS2322: /,
    file: { path: 'ts/a.ts', external: false },
    line: 1,
    column: 14,
  },
  {
    fixture: 'python.txt',
    language: 'python',
    message: /^ValueError: invalid literal for int\(\)/,
    file: { path: 'app/models.py', external: false },
    line: 2,
  },
  {
    fixture: 'go-panic.txt',
    language: 'go',
    message: /^panic: runtime error: index out of range \[3\] with length 2$/,
    file: { path: 'internal/stock/stock.go', external: false },
    line: 4,
  },
  {
    fixture: 'go-build.txt',
    language: 'go',
    message: /^undefined: missing$/,
    file: { path: 'internal/stock/stock.go', external: false },
    line: 4,
    column: 9,
  },
  {
    fixture: 'rust-panic.txt',
    language: 'rust',
    message: /^index out of bounds: the len is 2 but the index is 3$/,
    file: { path: 'src/stock.rs', external: false },
    line: 2,
    column: 5,
  },
  {
    fixture: 'rust-compile.txt',
    language: 'rust',
    message: /^error\[E0425\]: cannot find value `missing` in this scope$/,
    file: { path: 'src/stock.rs', external: false },
    line: 2,
    column: 12,
  },
  {
    fixture: 'browser-chrome.txt',
    language: 'browser',
    message: /^TypeError: Cannot read properties of null \(reading 'map'\)$/,
    file: { path: 'src/components/CartList.tsx', external: false },
    line: 14,
    column: 23,
  },
  {
    fixture: 'browser-firefox.txt',
    language: 'browser',
    message: /^TypeError: items is null$/,
    file: { path: 'src/components/CartList.tsx', external: false },
    line: 14,
  },
  {
    fixture: 'docker-compose.txt',
    language: 'python',
    message: /^ValueError: /,
    // a container path: outside the workspace, matched by suffix on the map
    file: { path: '/app/app/models.py', external: true },
    line: 2,
    origin: 'docker',
  },
  {
    fixture: 'vite-dev.txt',
    language: 'node',
    message: /^Unexpected "}"$/,
    file: { path: 'src/main.tsx', external: false },
    line: 8,
    column: 4,
  },
];

describe('stack trace parsers on the fixtures', () => {
  for (const c of CASES)
    it(`${c.fixture}: ${c.language}`, () => {
      const found = detect(c.fixture);
      expect(found).toHaveLength(1);
      const [error] = found as [ErrorDraft];
      expect(error.language).toBe(c.language);
      expect(error.message).toMatch(c.message);
      expect(error.file).toEqual(c.file);
      expect(error.line).toBe(c.line);
      expect(error.column).toBe(c.column);
      expect(error.origin).toBe(c.origin ?? 'terminal');
      const parsed = errorDetectedSchema.safeParse(asEvent(error));
      expect(parsed.success, parsed.error?.message).toBe(true);
    });

  it('keeps frames innermost first and skips runtime internals', () => {
    const [node] = detect('node-cjs.txt');
    expect(node!.frames.map((f) => `${f.file.path}:${f.line}`)).toEqual([
      'src/lib/price.js:2',
      'src/cart.js:3',
      'src/cart.js:5',
    ]);
    const [python] = detect('python.txt');
    expect(python!.frames.map((f) => f.fn)).toEqual(['parse', 'run', '<module>']);
    const [rust] = detect('rust-panic.txt');
    // the panic location, then the backtrace (std frames stay, as external)
    expect(rust!.frames[0]).toMatchObject({ file: { path: 'src/stock.rs' }, line: 2 });
    expect(rust!.frames.some((f) => f.fn === 'inventory::main')).toBe(true);
  });

  it('finds every error of a longer output, in order', () => {
    const text = [load('python.txt'), 'some log line', load('node-cjs.txt'), load('go-build.txt')];
    const found = detectErrors(text.join('\n'), { cwd: CWD, origin: 'command', toolUseId: 't1' });
    expect(found.map((e) => e.language)).toEqual(['python', 'node', 'go']);
    expect(found.every((e) => e.toolUseId === 't1' && e.origin === 'command')).toBe(true);
  });

  it('reads a real Vite 8 dev server: Oxc diagnostics and its own stacks', () => {
    const found = detect('vite8-dev.txt', 'dev-server');
    const located = found.filter((e) => e.file && !e.file.external);
    // the dependency scan and each request of the broken module report it
    expect(located.length).toBeGreaterThanOrEqual(2);
    for (const error of located)
      expect(error).toMatchObject({
        language: 'node',
        message: 'PARSE_ERROR: Unexpected token',
        file: { path: 'src/main.ts', external: false },
        line: 3,
        column: 13,
        origin: 'dev-server',
      });
    // Vite's own stacks are all in node_modules: no culprit, and a readable message
    for (const error of found.filter((e) => !e.file || e.file.external)) {
      expect(error.file).toBeUndefined();
      expect(error.message).toMatch(/error/i);
      expect(error.message).not.toMatch(/^(?:File|Plugin):|^[^A-Za-z]*$/);
    }
  });

  it('reads a message printed over several lines (node --test)', () => {
    const text = [
      '✖ total with a 10% discount (0.7178ms)',
      '  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:',
      '  ',
      '  1090 !== 990',
      '  ',
      '      at TestContext.<anonymous> (file:///C:/dev/shop/test/cart.test.js:10:10)',
      '      at Test.run (node:internal/test_runner/test:1402:25)',
    ].join('\n');
    const [error] = detectErrors(text, { cwd: CWD, origin: 'test' });
    expect(error).toMatchObject({
      message: 'AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: 1090 !== 990',
      file: { path: 'test/cart.test.js', external: false },
      line: 10,
    });
  });

  it('reads a pseudo console screen drawn with cursor moves (ConPTY)', () => {
    const screen =
      '\u001b[?25l\u001b[3;1H                    ^\u001b[4;1H\u001b[5;1HTypeError:\u001b[1Cboom\u001b[K' +
      '\u001b[6;1H    at total (C:\\dev\\shop\\src\\lib\\price.js:2:21)\u001b[?25h';
    const [error] = detectErrors(screen, { cwd: CWD, origin: 'terminal' });
    expect(error).toMatchObject({ message: 'TypeError: boom', line: 2 });
  });

  it('stays fast on hostile output (long lines, many frames)', () => {
    const line = `  at ${' ('.repeat(60_000)}`;
    const many = `Error: x\n${'    at f (C:\\dev\\shop\\a.js:1:1)\n'.repeat(5000)}`;
    const start = Date.now();
    detectErrors(`${line}\n${'x'.repeat(200_000)}:1:1\n${many}`, { cwd: CWD, origin: 'terminal' });
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('ignores ordinary output', () => {
    const quiet = 'Compiling...\nError count: 0\n    at the end of the day\nDone in 1.2s\n';
    expect(detectErrors(quiet, { cwd: CWD, origin: 'terminal' })).toEqual([]);
    expect(detect('vite-dev.txt').length).toBe(1);
  });

  it('redacts secrets and the workspace root in messages', () => {
    const text = `Error: token sk-ant-api03-${'a'.repeat(40)} rejected for C:\\dev\\shop\\x\n    at f (C:\\dev\\shop\\src\\a.js:1:1)\n`;
    const [error] = detectErrors(text, { cwd: CWD, origin: 'terminal' });
    expect(error!.message).not.toContain('sk-ant-api03');
    expect(error!.message).not.toContain('C:\\dev\\shop');
  });

  it('classifies agent commands', () => {
    expect(originOfCommand('docker compose logs api')).toBe('docker');
    expect(originOfCommand('pnpm test -- cart')).toBe('test');
    expect(originOfCommand('npx vitest run')).toBe('test');
    expect(originOfCommand('npm run dev')).toBe('dev-server');
    expect(originOfCommand('node src/cart.js')).toBe('command');
    expect(originOfCommand(null)).toBe('command');
  });
});
