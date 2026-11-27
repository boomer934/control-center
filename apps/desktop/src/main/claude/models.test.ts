import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { claudeCatalog, claudeConfigArgs, readClaudeDefaults } from './models';

const homes: string[] = [];
afterEach(() => {
  for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true });
});
function home(settings?: string | Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  homes.push(dir);
  if (settings !== undefined) {
    mkdirSync(join(dir, '.claude'));
    writeFileSync(join(dir, '.claude', 'settings.json'), settings);
  }
  return dir;
}

describe('Claude models and effort (phase 5f)', () => {
  it('reads model and effort from the user settings, and nothing else', async () => {
    const dir = home(JSON.stringify({ model: 'opus', effortLevel: 'max', apiKeyHelper: 'x' }));
    await expect(readClaudeDefaults(dir)).resolves.toEqual({ model: 'opus', effort: 'max' });
  });

  it('reads a missing, invalid, oversized or hostile settings file as not set', async () => {
    const none = { model: null, effort: null };
    await expect(readClaudeDefaults(home())).resolves.toEqual(none);
    await expect(readClaudeDefaults(home('{not json'))).resolves.toEqual(none);
    await expect(readClaudeDefaults(home('null'))).resolves.toEqual(none);
    await expect(
      readClaudeDefaults(home(JSON.stringify({ model: '--dangerously-skip', effortLevel: 'Max' }))),
    ).resolves.toEqual(none);
    const big = JSON.stringify({ model: 'opus', pad: 'x'.repeat(300 * 1024) });
    await expect(readClaudeDefaults(home(big))).resolves.toEqual(none);
  });

  it('offers the aliases plus a configured full model name', () => {
    const catalog = claudeCatalog(
      { model: 'claude-opus-5-5[1m]', effort: 'medium' },
      { model: null, effort: null },
    );
    expect(catalog.models.map((m) => m.id)).toEqual([
      'fable',
      'opus',
      'sonnet',
      'haiku',
      'claude-opus-5-5[1m]',
    ]);
    expect(catalog.models.every((m) => m.efforts.join() === 'low,medium,high,xhigh,max')).toBe(
      true,
    );
  });

  it('turns a choice into switches, and only a valid one', () => {
    expect(claudeConfigArgs({ model: null, effort: null })).toEqual([]);
    expect(claudeConfigArgs({ model: 'sonnet', effort: 'xhigh' })).toEqual([
      '--model',
      'sonnet',
      '--effort',
      'xhigh',
    ]);
    expect(() => claudeConfigArgs({ model: '--evil', effort: null })).toThrow();
  });
});
