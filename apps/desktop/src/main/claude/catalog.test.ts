// The Claude catalog from `initialize` (phase 5h): the recorded answer, hostile answers, the probe
// against the fake `claude`, and the cache file.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ErrorInput } from '@control-center/app-log';
import { FAKE_CLAUDE, SANITIZED_DIR } from '@control-center/fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import { parseClaudeInitialize, probeClaude, readCatalogCache, writeCatalogCache } from './catalog';

const recorded = () =>
  JSON.parse(readFileSync(join(SANITIZED_DIR, 'claude-initialize.control.jsonl'), 'utf8')).response
    .response as Record<string, unknown>;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'cc-catalog-'));
  dirs.push(d);
  return d;
};

describe('Claude catalog from initialize (phase 5h)', () => {
  it('reads every model with its own efforts, without `default`', () => {
    const found = parseClaudeInitialize(recorded());
    expect(found?.version).toBe('2.1.326');
    const ids = found?.models.map((m) => m.id);
    expect(ids).toHaveLength(13);
    expect(ids).not.toContain('default');
    const byId = new Map(found?.models.map((m) => [m.id, m]));
    expect(byId.get('opus')).toEqual({
      id: 'opus',
      label: 'Opus 5.5',
      efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    });
    // the fixed list offered xhigh to every model: Haiku 4.5 takes none, the 4.6 models no xhigh
    expect(byId.get('claude-haiku-4-5-20251001')?.efforts).toEqual([]);
    expect(byId.get('claude-opus-4-6')?.efforts).toEqual(['low', 'medium', 'high', 'max']);
  });

  it('lists commands, agents, output styles and protocol capabilities as capabilities', () => {
    const caps = parseClaudeInitialize(recorded())?.capabilities ?? [];
    const kinds = (k: string) => caps.filter((c) => c.kind === k).map((c) => c.id);
    expect(kinds('model')).toHaveLength(13);
    expect(kinds('command')).toEqual(['deep-research', 'clear', 'fast']);
    expect(kinds('agent')).toContain('general-purpose');
    expect(kinds('output-style')).toContain('Explanatory');
    expect(kinds('capability')).toContain('ui_surface_v1');
    expect(caps.find((c) => c.id === 'clear')?.label).toBe('/clear [name]');
    expect(caps.find((c) => c.id === 'opus')?.tags).toContain('effort:xhigh');
    // a long description is cut, never longer than the contract allows
    const guide = caps.find((c) => c.id === 'claude-code-guide');
    expect(guide?.description?.length).toBeLessThanOrEqual(500);
    expect(guide?.description?.endsWith('…')).toBe(true);
  });

  it('keeps nothing of the account, the folders or any field it does not name', () => {
    const answer = {
      ...recorded(),
      account: { email: 'someone@example.invalid', organization: 'Org' },
      user_output_styles_dir: 'C:\\Users\\someone\\.claude\\output-styles',
      pid: 4242,
    };
    const text = JSON.stringify(parseClaudeInitialize(answer));
    expect(text).not.toMatch(/someone|example\.invalid|Org"|output-styles|4242/);
  });

  it('drops hostile values and cleans the text it keeps', () => {
    const found = parseClaudeInitialize({
      claude_code_version: '2.1.326; rm -rf',
      models: [
        { value: '--dangerous', supportsEffort: true },
        { value: 'sk-ant-api03-' + 'A'.repeat(90), supportsEffort: true },
        {
          value: 'opus',
          displayName: 'Opus\n\tfor C:\\Users\\someone\\x',
          supportsEffort: true,
          supportedEffortLevels: ['high', '--x', 'ultra plus'],
        },
        { value: 'opus', displayName: 'twice' },
        'not an object',
      ],
      commands: [{ name: 'two words' }, { name: 'ok', description: 'token=ghp_' + 'a'.repeat(36) }],
      capabilities: ['ui_surface_v1', 42, ''],
    });
    expect(found?.version).toBeNull();
    expect(found?.models).toEqual([{ id: 'opus', label: 'Opus for ~\\x', efforts: ['high'] }]);
    expect(found?.capabilities.map((c) => c.id)).toEqual(['opus', 'ok', 'ui_surface_v1']);
    expect(JSON.stringify(found)).not.toContain('ghp_');
    expect(JSON.stringify(found)).not.toContain('someone');
  });

  it('says which kinds the answer listed, so a missing field removes nothing', () => {
    expect(parseClaudeInitialize(recorded())?.kinds).toEqual([
      'model',
      'command',
      'agent',
      'output-style',
      'capability',
    ]);
    expect(parseClaudeInitialize({ claude_code_version: '2.1.330' })?.kinds).toEqual([]);
    expect(parseClaudeInitialize({ models: [] })?.kinds).toEqual(['model']);
  });

  it('is not an answer when the shape is wrong', () => {
    expect(parseClaudeInitialize(null)).toBeUndefined();
    expect(parseClaudeInitialize({ models: 'opus' })).toBeUndefined();
  });
});

describe('Claude catalog probe', () => {
  const reports: ErrorInput[] = [];
  const program = { command: process.execPath, args: [FAKE_CLAUDE] };
  const env = (extra: Record<string, string> = {}) => ({ ...process.env, ...extra });

  it('asks the fake claude for initialize and reads its answer', async () => {
    const found = await probeClaude({
      claude: program,
      cwd: tempDir(),
      env: env({ FAKE_CLAUDE_VERSION: '2.1.330' }),
      report: (r) => reports.push(r),
    });
    expect(found?.version).toBe('2.1.330');
    expect(found?.models.length).toBe(13);
  });

  it('gives up after the timeout when no answer comes, and ends the process', async () => {
    const started = Date.now();
    const found = await probeClaude({
      claude: program,
      cwd: tempDir(),
      env: env({ FAKE_CLAUDE_INIT: 'silent' }),
      report: (r) => reports.push(r),
      timeoutMs: 500,
    });
    expect(found).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('counts every line against the output limit, not only the unfinished one', async () => {
    const script = join(tempDir(), 'chatty.mjs');
    // many complete lines, none of them the answer, then silence
    writeFileSync(
      script,
      [
        "const line = JSON.stringify({ type: 'system', text: 'x'.repeat(1000) }) + '\\n';",
        'for (let i = 0; i < 5000; i++) process.stdout.write(line);',
        'setInterval(() => {}, 1000);',
      ].join('\n'),
    );
    const started = Date.now();
    const found = await probeClaude({
      claude: { command: process.execPath, args: [script] },
      cwd: tempDir(),
      env: env(),
      report: () => undefined,
      timeoutMs: 20_000,
    });
    expect(found).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  it('ends at once when aborted, and never starts when already aborted', async () => {
    const controller = new AbortController();
    const probe = probeClaude({
      claude: program,
      cwd: tempDir(),
      env: env({ FAKE_CLAUDE_INIT: 'silent' }),
      report: () => undefined,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 200);
    const started = Date.now();
    await expect(probe).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(10_000);
    await expect(
      probeClaude({
        claude: { command: join(tempDir(), 'missing.exe'), args: [] },
        cwd: tempDir(),
        env: env(),
        report: () => undefined,
        signal: controller.signal,
      }),
    ).resolves.toBeUndefined();
  });

  it('is undefined when the program cannot start', async () => {
    const found = await probeClaude({
      claude: { command: join(tempDir(), 'missing.exe'), args: [] },
      cwd: tempDir(),
      env: env(),
      report: () => undefined,
      timeoutMs: 5000,
    });
    expect(found).toBeUndefined();
  });
});

describe('Claude catalog cache', () => {
  it('round-trips the models and ignores an invalid file', async () => {
    const file = join(tempDir(), 'agent-catalog.json');
    await expect(readCatalogCache(file)).resolves.toBeUndefined();
    const claude = {
      version: '2.1.326',
      readAt: '2026-11-27T10:00:00.000Z',
      models: [{ id: 'opus', label: 'Opus 5.5', efforts: ['high'] }],
    };
    await writeCatalogCache(file, claude);
    await expect(readCatalogCache(file)).resolves.toEqual(claude);
    writeFileSync(file, JSON.stringify({ v: 1, claude: { ...claude, models: [{ id: '-x' }] } }));
    await expect(readCatalogCache(file)).resolves.toBeUndefined();
    writeFileSync(file, '{not json');
    await expect(readCatalogCache(file)).resolves.toBeUndefined();
  });
});
