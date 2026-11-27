// The capability service (phase 5h): the snapshot file, change notifications and mark-seen.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ErrorInput } from '@control-center/app-log';
import { afterEach, describe, expect, it } from 'vitest';
import { createCapabilityService } from './service';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function setup(content?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'cc-capabilities-'));
  dirs.push(dir);
  const file = join(dir, 'capabilities.json');
  if (content !== undefined) writeFileSync(file, content);
  const reports: ErrorInput[] = [];
  const changes: number[] = [];
  let minute = 0;
  const make = () =>
    createCapabilityService({
      file,
      report: (r) => reports.push(r),
      onChanged: (revision) => changes.push(revision),
      now: () => new Date(Date.UTC(2026, 10, 27, 10, minute++)),
    });
  return { file, reports, changes, make };
}
const cap = (id: string) => ({
  agent: 'claude' as const,
  kind: 'command' as const,
  id,
  label: id,
  tags: [],
});

describe('capability service', () => {
  it('saves every change and reads it back at the next start', async () => {
    const { file, changes, make } = setup();
    const service = make();
    await expect(service.list()).resolves.toMatchObject({ revision: 0, entries: [] });
    await service.record('claude', '2.1.326', [cap('a')]);
    await service.record('claude', '2.1.330', [cap('a'), cap('b')]);
    expect(changes).toEqual([1, 2]);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ v: 1, revision: 2 });

    const again = make();
    const list = await again.list();
    expect(list.entries.map((e) => [e.id, e.status])).toEqual([
      ['a', 'seen'],
      ['b', 'new'],
    ]);
    await expect(again.lastRead('claude')).resolves.toMatchObject({ version: '2.1.330' });
    await expect(again.lastRead('codex')).resolves.toBeUndefined();
    await expect(again.markSeen('claude', 1)).resolves.toBe('stale');
    await expect(again.markSeen('claude', list.revision)).resolves.toBe('marked');
    expect((await again.list()).entries.every((e) => e.status === 'seen')).toBe(true);
  });

  it('starts again from an invalid file and says so', async () => {
    const { reports, make } = setup(
      JSON.stringify({ v: 1, revision: 1, agents: [], entries: [{ id: '-' }] }),
    );
    await expect(make().list()).resolves.toMatchObject({ revision: 0 });
    expect(reports.map((r) => r.name)).toEqual(['CapabilitySnapshotInvalid']);
  });

  it('does not notify when nothing changed', async () => {
    const { changes, make } = setup();
    const service = make();
    await service.unavailable('codex');
    await service.unavailable('codex');
    expect(changes).toEqual([1]);
  });
});
