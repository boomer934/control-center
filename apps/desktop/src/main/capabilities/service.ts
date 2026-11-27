// The capability inventory behind `capabilities:*` (phase 5h): kept in
// `<userData>/capabilities.json`, validated when read, written whole through a temporary file.
// The providers record what their CLI reported (`record`) or that it could not be read
// (`unavailable`); every change bumps the revision and calls `onChanged`.
import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm, writeFile, type FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ErrorInput } from '@control-center/app-log';
import type {
  Capability,
  CapabilityAgent,
  CapabilityList,
  CapabilityMarkSeenResult,
} from '@control-center/ipc-contract';
import { readLimited } from '../claude/models';
import {
  applyRead,
  CapabilitySnapshotSchema,
  EMPTY_SNAPSHOT,
  markSeen,
  markUnavailable,
  toCapabilityList,
  type CapabilitySnapshot,
} from './inventory';

/** 4096 entries of at most ~1 KiB each, with room to spare. */
export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

export interface CapabilityServiceDeps {
  /** `<userData>/capabilities.json`. */
  file: string;
  report: (input: ErrorInput) => unknown;
  onChanged?: (revision: number) => void;
  now?: () => Date;
}

/** The snapshot on disk; a missing, oversized or invalid file reads as empty. */
export async function readSnapshot(
  file: string,
): Promise<{ snapshot: CapabilitySnapshot; invalid: boolean }> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(file, 'r');
    const text = await readLimited(handle, MAX_SNAPSHOT_BYTES);
    const parsed =
      text === undefined ? undefined : CapabilitySnapshotSchema.safeParse(JSON.parse(text));
    return parsed?.success
      ? { snapshot: parsed.data, invalid: false }
      : { snapshot: EMPTY_SNAPSHOT, invalid: true };
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    return { snapshot: EMPTY_SNAPSHOT, invalid: !missing };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { flag: 'wx' });
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function createCapabilityService(deps: CapabilityServiceDeps) {
  const now = deps.now ?? (() => new Date());
  let snapshot: CapabilitySnapshot = EMPTY_SNAPSHOT;
  const report = (name: string, message: string) =>
    deps.report({ origin: 'main', source: 'capabilities', kind: 'capabilities', name, message });
  // every change runs after the load and after the change before it
  let queue: Promise<unknown> = readSnapshot(deps.file).then((read) => {
    snapshot = read.snapshot;
    if (read.invalid)
      report(
        'CapabilitySnapshotInvalid',
        'The saved capability list could not be read: it starts again',
      );
  });

  function change(update: (current: CapabilitySnapshot) => CapabilitySnapshot): Promise<void> {
    const run = queue.then(async () => {
      const next = update(snapshot);
      if (next === snapshot) return;
      snapshot = next;
      deps.onChanged?.(snapshot.revision);
      await writeJsonAtomic(deps.file, snapshot).catch(() =>
        report('CapabilitySnapshotNotSaved', 'The capability list could not be saved'),
      );
    });
    queue = run.catch(() => undefined);
    return run;
  }

  return {
    async list(): Promise<CapabilityList> {
      await queue;
      return toCapabilityList(snapshot);
    },
    /** Version of the last successful read of `agent`, once the snapshot is loaded. */
    async lastRead(
      agent: CapabilityAgent,
    ): Promise<{ version: string | null; readAt: string } | undefined> {
      await queue;
      const record = snapshot.agents.find((a) => a.agent === agent);
      return record?.readAt ? { version: record.version, readAt: record.readAt } : undefined;
    },
    record(
      agent: CapabilityAgent,
      version: string | null,
      read: readonly Capability[],
    ): Promise<void> {
      return change((current) => applyRead(current, agent, version, read, now()));
    },
    unavailable(agent: CapabilityAgent): Promise<void> {
      return change((current) => markUnavailable(current, agent));
    },
    async markSeen(
      agent: CapabilityAgent | undefined,
      revision: number,
    ): Promise<CapabilityMarkSeenResult> {
      let result: CapabilityMarkSeenResult = 'stale';
      await change((current) => {
        const marked = markSeen(current, agent, revision, now());
        result = marked.result;
        return marked.snapshot;
      });
      return result;
    },
  };
}
export type CapabilityService = ReturnType<typeof createCapabilityService>;
