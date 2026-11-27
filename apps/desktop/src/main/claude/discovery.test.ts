// When the app reads the Claude catalog (phase 5h): once per run, only when the CLI version
// changed or the last read is old, with the cache for the first sessions and the fallback.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ErrorInput } from '@control-center/app-log';
import { FAKE_CLAUDE } from '@control-center/fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCapabilityService } from '../capabilities/service';
import type { ClaudeDiscovery, ProbeOptions } from './catalog';
import { createClaudeDiscovery, readClaudeVersion } from './discovery';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const opus = { id: 'opus', label: 'Opus 5.5', efforts: ['high'] };
const found = (version: string): ClaudeDiscovery => ({
  version,
  models: [opus],
  capabilities: [{ agent: 'claude', kind: 'model', id: 'opus', label: 'Opus 5.5', tags: [] }],
  kinds: ['model'],
});

function setup(
  options: { program?: () => boolean; answer?: ClaudeDiscovery; version?: string } = {},
) {
  const dataDir = mkdtempSync(join(tmpdir(), 'cc-discovery-'));
  dirs.push(dataDir);
  const reports: ErrorInput[] = [];
  let clock = Date.UTC(2026, 10, 27, 10);
  const capabilities = createCapabilityService({
    file: join(dataDir, 'capabilities.json'),
    report: (r) => reports.push(r),
    now: () => new Date(clock),
  });
  const probe = vi.fn(async (_options: ProbeOptions) => options.answer);
  const version = vi.fn(async () => options.version ?? '2.1.326');
  const make = () =>
    createClaudeDiscovery({
      dataDir,
      report: (r) => reports.push(r),
      program: async () =>
        options.program?.() === false ? undefined : { command: 'claude', args: [] },
      capabilities,
      probe,
      version,
      now: () => new Date(clock),
      firstWaitMs: 1000,
    });
  return { make, probe, version, reports, capabilities, advance: (ms: number) => (clock += ms) };
}

describe('Claude discovery', () => {
  it('reads the CLI once per run, then offers the cached models at the next start', async () => {
    const t = setup({ answer: found('2.1.326') });
    const first = t.make();
    await expect(first.models()).resolves.toEqual([opus]);
    await first.models();
    expect(t.probe).toHaveBeenCalledTimes(1);
    expect((await t.capabilities.list()).entries.map((e) => e.id)).toEqual(['opus']);

    // same version, recent read: no probe, the cache answers
    const second = t.make();
    await expect(second.models()).resolves.toEqual([opus]);
    expect(t.probe).toHaveBeenCalledTimes(1);
    expect(t.version).toHaveBeenCalledTimes(1);
  });

  it('reads again when the version changed or the last read is a day old', async () => {
    const t = setup({ answer: found('2.1.326') });
    await t.make().refresh();
    t.version.mockResolvedValueOnce('2.1.330');
    await t.make().refresh();
    expect(t.probe).toHaveBeenCalledTimes(2);
    t.advance(25 * 60 * 60 * 1000);
    await t.make().refresh();
    expect(t.probe).toHaveBeenCalledTimes(3);
  });

  it('falls back when the CLI is missing or does not answer, and says so once', async () => {
    const missing = setup({ program: () => false });
    await expect(missing.make().models()).resolves.toBeUndefined();
    expect(missing.probe).not.toHaveBeenCalled();
    expect((await missing.capabilities.list()).agents[0]?.state).toBe('unavailable');

    const silent = setup();
    await expect(silent.make().models()).resolves.toBeUndefined();
    await expect(silent.make().models()).resolves.toBeUndefined();
    expect(silent.reports.filter((r) => r.name === 'ClaudeCatalogUnavailable')).toHaveLength(2);
  });
});

describe('Claude discovery after the CLI was unreachable', () => {
  it('reads again when the CLI is back, even with the same version and a recent read', async () => {
    let installed = true;
    const t = setup({ answer: found('2.1.326'), program: () => installed });
    await t.make().refresh();
    installed = false;
    await t.make().refresh();
    expect((await t.capabilities.list()).agents[0]?.state).toBe('unavailable');
    installed = true;
    await t.make().refresh();
    expect(t.probe).toHaveBeenCalledTimes(2);
    expect((await t.capabilities.list()).agents[0]?.state).toBe('ready');
  });

  it('stops a running probe on close and records nothing after it', async () => {
    const t = setup();
    let seen: AbortSignal | undefined;
    t.probe.mockImplementationOnce(
      (options: ProbeOptions) =>
        new Promise<undefined>((resolve) => {
          seen = options.signal;
          options.signal?.addEventListener('abort', () => resolve(undefined));
        }),
    );
    const discovery = t.make();
    void discovery.refresh();
    await vi.waitFor(() => expect(seen).toBeDefined());
    await discovery.close();
    expect(seen?.aborted).toBe(true);
    expect(t.reports.filter((r) => r.name === 'ClaudeCatalogUnavailable')).toEqual([]);
    expect((await t.capabilities.list()).agents[0]?.state).toBe('not-read');
    // nothing starts once closed
    await discovery.refresh();
    expect(t.probe).toHaveBeenCalledTimes(1);
  });
});

describe('readClaudeVersion', () => {
  it('reads the version of the fake claude, and null when it cannot run', async () => {
    const env = { ...process.env, FAKE_CLAUDE_VERSION: '2.1.330' };
    await expect(
      readClaudeVersion({ command: process.execPath, args: [FAKE_CLAUDE] }, env),
    ).resolves.toBe('2.1.330');
    await expect(
      readClaudeVersion({ command: 'Z:\\missing.exe', args: [] }, env),
    ).resolves.toBeNull();
  });
});
