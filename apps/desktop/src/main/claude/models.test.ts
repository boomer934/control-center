import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FileHandle } from 'node:fs/promises';
import {
  claudeCatalog,
  claudeConfigArgs,
  MAX_SETTINGS_BYTES,
  readClaudeDefaults,
  readLimited,
  safeModelId,
} from './models';

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

  it('bounds the read by what it reads, not by an earlier size check', async () => {
    // the descriptor reports a small file, then the file keeps growing while it is read
    const grower = {
      stat: async () => ({ isFile: () => true, size: 10 }),
      read: async (buffer: Buffer, offset: number, length: number) => {
        buffer.fill(0x61, offset, offset + length);
        return { bytesRead: length, buffer };
      },
    } as unknown as FileHandle;
    await expect(readLimited(grower, 64)).resolves.toBeUndefined();
    const notFile = {
      stat: async () => ({ isFile: () => false, size: 1 }),
    } as unknown as FileHandle;
    await expect(readLimited(notFile, 64)).resolves.toBeUndefined();
    const exact = JSON.stringify({ model: 'opus' }).padEnd(MAX_SETTINGS_BYTES, ' ');
    await expect(readClaudeDefaults(home(exact))).resolves.toEqual({ model: 'opus', effort: null });
    await expect(readClaudeDefaults(home(`${exact} `))).resolves.toEqual({
      model: null,
      effort: null,
    });
  });

  it('keeps credential-like model ids out of the catalog and the events', async () => {
    const key = `sk-ant-${'a'.repeat(30)}`;
    expect(safeModelId(key)).toBeNull();
    expect(safeModelId('claude-opus-5-5[1m]')).toBe('claude-opus-5-5[1m]');
    await expect(readClaudeDefaults(home(JSON.stringify({ model: key })))).resolves.toEqual({
      model: null,
      effort: null,
    });
    const catalog = claudeCatalog({ model: key, effort: null }, { model: key, effort: null });
    expect(JSON.stringify(catalog)).not.toContain('sk-ant');
  });

  it('takes a saved choice only if the catalog offers it', () => {
    const none = { model: null, effort: null };
    expect(claudeCatalog(none, { model: 'sonnet', effort: 'max' }).current).toEqual({
      model: 'sonnet',
      effort: 'max',
    });
    expect(claudeCatalog(none, { model: 'claude-x-9', effort: null }).current).toEqual(none);
    expect(claudeCatalog(none, { model: 'opus', effort: 'ultra' }).current).toEqual(none);
    // a full name is offered only when the user's settings configure it
    const configured = { model: 'claude-x-9', effort: null };
    expect(claudeCatalog(configured, configured).current).toEqual(configured);
  });

  it('offers the models the CLI listed, with their own efforts, instead of the aliases', () => {
    const none = { model: null, effort: null };
    const discovered = [
      { id: 'opus', label: 'Opus 5.5', efforts: ['low', 'high'] },
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', efforts: [] },
    ];
    const catalog = claudeCatalog({ model: 'claude-custom', effort: null }, none, discovered);
    expect(catalog.models.map((m) => m.id)).toEqual([
      'opus',
      'claude-haiku-4-5-20251001',
      'claude-custom',
    ]);
    // a saved effort the listed model does not take is not restored
    expect(claudeCatalog(none, { model: 'opus', effort: 'xhigh' }, discovered).current).toEqual(
      none,
    );
    expect(claudeCatalog(none, { model: 'opus', effort: 'high' }, discovered).current).toEqual({
      model: 'opus',
      effort: 'high',
    });
    // an empty list is no list: the aliases
    expect(claudeCatalog(none, none, []).models.map((m) => m.id)).toContain('sonnet');
  });
});
