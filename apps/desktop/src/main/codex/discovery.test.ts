// When the app reads what Codex offers (phase 5h.2): once per run, only when the CLI version
// changed, the last read is old or a session heard of new skills; and the probe itself, against
// the fake app-server, which answers only the session methods.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ErrorInput } from '@control-center/app-log';
import { FAKE_CODEX } from '@control-center/fixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCapabilityService } from '../capabilities/service';
import {
  createCodexDiscovery,
  probeCodex,
  readCodexVersion,
  type CodexDiscovery,
  type CodexProbeOptions,
} from './discovery';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0))
    rmSync(d, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'cc-codex-discovery-'));
  dirs.push(dir);
  return dir;
};

const found = (version: string): CodexDiscovery => ({
  version,
  entries: [{ agent: 'codex', kind: 'feature', id: 'fast_mode', label: 'Fast', tags: [] }],
  kinds: ['feature'],
});

function setup(options: { program?: () => boolean; answer?: CodexDiscovery } = {}) {
  const dataDir = tempDir();
  const reports: ErrorInput[] = [];
  let clock = Date.UTC(2026, 10, 27, 10);
  const capabilities = createCapabilityService({
    file: join(dataDir, 'capabilities.json'),
    report: (r) => reports.push(r),
    now: () => new Date(clock),
  });
  const probe = vi.fn(async (_options: CodexProbeOptions) => options.answer);
  const version = vi.fn(async () => '0.171.0-alpha.13.2');
  const make = () =>
    createCodexDiscovery({
      dataDir,
      report: (r) => reports.push(r),
      program: async () =>
        options.program?.() === false ? undefined : { command: 'codex', args: [] },
      capabilities,
      probe,
      version,
      now: () => new Date(clock),
    });
  return {
    dataDir,
    make,
    probe,
    version,
    reports,
    capabilities,
    advance: (ms: number) => (clock += ms),
  };
}

describe('Codex discovery', () => {
  it('reads Codex once per run, in a folder of the app, and records the inventory', async () => {
    const t = setup({ answer: found('0.171.0-alpha.13.2') });
    const discovery = t.make();
    await discovery.refresh();
    await discovery.refresh();
    expect(t.probe).toHaveBeenCalledTimes(1);
    expect(t.probe.mock.calls[0]?.[0].cwd).toBe(t.dataDir);
    const list = await t.capabilities.list();
    expect(list.agents.find((a) => a.agent === 'codex')).toMatchObject({
      state: 'ready',
      version: '0.171.0-alpha.13.2',
    });
    expect(list.entries.map((e) => e.id)).toEqual(['fast_mode']);

    // next start, same version, recent read: no probe
    await t.make().refresh();
    expect(t.probe).toHaveBeenCalledTimes(1);
    // a day later it reads again
    t.advance(25 * 60 * 60 * 1000);
    await t.make().refresh();
    expect(t.probe).toHaveBeenCalledTimes(2);
  });

  it('reads again after a session heard of new skills, even with a fresh read', async () => {
    const t = setup({ answer: found('0.171.0-alpha.13.2') });
    const discovery = t.make();
    await discovery.refresh();
    discovery.invalidate();
    discovery.invalidate();
    await new Promise((r) => setTimeout(r, 0));
    await discovery.refresh();
    await discovery.refresh();
    expect(t.probe).toHaveBeenCalledTimes(2);
  });

  it('marks Codex unavailable when it is missing or does not answer, warning once', async () => {
    const missing = setup({ program: () => false });
    await missing.make().refresh();
    expect(missing.probe).not.toHaveBeenCalled();
    expect((await missing.capabilities.list()).agents.find((a) => a.agent === 'codex')?.state).toBe(
      'unavailable',
    );

    const silent = setup();
    const discovery = silent.make();
    await discovery.refresh();
    discovery.invalidate();
    await new Promise((r) => setTimeout(r, 0));
    await discovery.refresh();
    expect(silent.probe).toHaveBeenCalledTimes(2);
    expect(silent.reports.filter((r) => r.name === 'CodexCapabilitiesUnavailable')).toHaveLength(1);
  });

  it('starts nothing once closed', async () => {
    const t = setup({ answer: found('0.171.0-alpha.13.2') });
    const discovery = t.make();
    await discovery.close();
    await discovery.refresh();
    expect(t.probe).not.toHaveBeenCalled();
  });
});

describe('probeCodex', () => {
  const node = { command: process.execPath, args: [FAKE_CODEX] };

  it('reads what the server answers and leaves out the methods it does not know', async () => {
    const log = join(tempDir(), 'sent.jsonl');
    const reports: ErrorInput[] = [];
    const read = await probeCodex({
      codex: node,
      cwd: tempDir(),
      env: { ...process.env, FAKE_CODEX_LOG: log },
      report: (r) => reports.push(r),
      timeoutMs: 20_000,
    });
    expect(read?.version).toBe('0.171.0-alpha.13.2');
    // the fake answers model/list only: every other kind keeps its last known entries
    expect(read?.kinds).toEqual(['model']);
    expect(read?.entries.length).toBeGreaterThan(0);
    const { readFileSync } = await import('node:fs');
    const methods = readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((l) => (JSON.parse(l) as { method?: string }).method);
    expect(methods).not.toContain('thread/start');
    expect(methods).not.toContain('account/read');
    expect(methods.slice(0, 2)).toEqual(['initialize', 'initialized']);
  }, 30_000);

  it('answers undefined when the program cannot start', async () => {
    const read = await probeCodex({
      codex: { command: join(tempDir(), 'missing.exe'), args: [] },
      cwd: tempDir(),
      env: process.env,
      report: () => undefined,
    });
    expect(read).toBeUndefined();
  });

  it('reads the version of `codex --version`', async () => {
    const script = join(tempDir(), 'v.cjs');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(script, "process.stdout.write('codex-cli 0.171.0-alpha.13.2\\n')");
    await expect(
      readCodexVersion({ command: process.execPath, args: [script] }, process.env),
    ).resolves.toBe('0.171.0-alpha.13.2');
  });
});
