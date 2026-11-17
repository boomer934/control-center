import { lstat, mkdir, open, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  ClaudeHistoryRecordSchema,
  type ClaudeHistoryRecord,
  type ClaudeHistorySummary,
} from '@control-center/ipc-contract/claude';
import { z } from 'zod';

export const ClaudeNativeSessionId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const sessionIdRecord = z.strictObject({ kind: z.literal('resume'), id: ClaudeNativeSessionId });
const historyId = z.uuid();
const workspaceKey = z.string().regex(/^[a-f0-9]{64}$/);
const header = z.strictObject({ version: z.literal(1), title: z.string().max(120) });
type Record = ClaudeHistoryRecord | z.infer<typeof sessionIdRecord>;

const MAX_HISTORY_BYTES = 12 * 1024 * 1024;
const MAX_HISTORY_SESSIONS = 25;

function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function parse(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

export function createClaudeHistory(dataDir: string) {
  const base = join(dataDir, 'claude-history');
  const writes = new Map<string, Promise<void>>();
  const directory = (workspaceId: string) => join(base, workspaceKey.parse(workspaceId));
  const file = (workspaceId: string, id: string) =>
    join(directory(workspaceId), historyId.parse(id) + '.jsonl');

  async function ensureDirectory(workspaceId: string) {
    for (const path of [base, directory(workspaceId)]) {
      await mkdir(path, { recursive: true });
      if (!(await lstat(path)).isDirectory()) throw new Error('Invalid Claude history directory');
    }
  }

  async function exists(workspaceId: string) {
    try {
      return (
        (await lstat(base)).isDirectory() && (await lstat(directory(workspaceId))).isDirectory()
      );
    } catch (error) {
      if (missing(error)) return false;
      throw error;
    }
  }

  return {
    writer(workspaceId: string, id: string, resume: boolean, failed: () => void) {
      const path = file(workspaceId, id);
      let started = resume;
      let created = resume;
      let queuedBytes = 0;
      let accepting = true;
      let disabled = false;
      let checkTail = resume;
      let queue = Promise.resolve();
      return (record: Record) => {
        if (disabled || !accepting || (!started && record.kind !== 'prompt')) return;
        const first = !started && record.kind === 'prompt';
        started = true;
        const metadata = first
          ? JSON.stringify({
              version: 1,
              title: record.text.replace(/\s+/g, ' ').trim().slice(0, 120),
            }) + '\n'
          : '';
        const line = metadata + JSON.stringify(record) + '\n';
        const bytes = Buffer.byteLength(line);
        // Bound the backlog even when the filesystem is slower than the incoming stream.
        const overflow = queuedBytes + bytes > MAX_HISTORY_BYTES;
        if (overflow) accepting = false;
        else queuedBytes += bytes;

        const append = queue.then(async () => {
          if (disabled) return;
          if (overflow) throw new Error('Claude history size limit reached');
          await ensureDirectory(workspaceId);
          if (created && !(await lstat(path)).isFile())
            throw new Error('Invalid Claude history file');
          const handle = await open(path, created ? (checkTail ? 'a+' : 'a') : 'ax', 0o600);
          try {
            const { size } = await handle.stat();
            const tail = Buffer.alloc(1, 10);
            if (checkTail && size > 0) await handle.read(tail, 0, 1, size - 1);
            // A preceding process may have stopped in the middle of a line.
            const separator = tail[0] === 10 ? '' : '\n';
            if (size + bytes + separator.length > MAX_HISTORY_BYTES)
              throw new Error('Claude history size limit reached');
            await handle.writeFile(separator + line);
            created = true;
            checkTail = false;
          } finally {
            await handle.close();
          }
        });
        const settled = append
          .catch(() => {
            disabled = true;
            failed();
          })
          .finally(() => {
            if (!overflow) queuedBytes -= bytes;
            if (writes.get(path) === settled) writes.delete(path);
          });
        queue = settled;
        writes.set(path, settled);
      };
    },

    async flush(workspaceId: string, id: string) {
      await writes.get(file(workspaceId, id));
    },

    async list(workspaceId: string): Promise<ClaudeHistorySummary[]> {
      const dir = directory(workspaceId);
      await Promise.all(
        [...writes].filter(([path]) => dirname(path) === dir).map(([, write]) => write),
      );
      if (!(await exists(workspaceId))) return [];
      const summaries = [];
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const id = entry.name.slice(0, -6);
        if (!entry.isFile() || !entry.name.endsWith('.jsonl') || !historyId.safeParse(id).success)
          continue;
        const path = file(workspaceId, id);
        const info = await lstat(path).catch((error: unknown) => {
          if (!missing(error)) throw error;
        });
        if (info?.isFile()) summaries.push({ id, updatedAt: info.mtime.toISOString() });
      }
      summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const result = [];
      for (const summary of summaries.slice(0, MAX_HISTORY_SESSIONS)) {
        const handle = await open(file(workspaceId, summary.id), 'r');
        try {
          const buffer = Buffer.alloc(1024);
          const { bytesRead } = await handle.read(buffer);
          const metadata = header.safeParse(
            parse(buffer.toString('utf8', 0, bytesRead).split('\n')[0] ?? ''),
          );
          if (metadata.success) result.push({ ...summary, title: metadata.data.title });
        } finally {
          await handle.close();
        }
      }
      return result;
    },

    async read(workspaceId: string, id: string) {
      const path = file(workspaceId, id);
      await writes.get(path);
      if (!(await exists(workspaceId))) return null;
      try {
        if (!(await lstat(path)).isFile()) return null;
        const handle = await open(path, 'r');
        try {
          const { size } = await handle.stat();
          if (size > MAX_HISTORY_BYTES) return null;
          const buffer = Buffer.alloc(size);
          const { bytesRead } = await handle.read(buffer, 0, size, 0);
          const [first, ...lines] = buffer.toString('utf8', 0, bytesRead).split('\n');
          if (!first || !header.safeParse(parse(first)).success) return null;
          let resume: string | undefined;
          const records: ClaudeHistoryRecord[] = [];
          for (const line of lines) {
            if (!line) continue;
            const value = parse(line);
            const meta = sessionIdRecord.safeParse(value);
            if (meta.success) {
              resume = meta.data.id;
              continue;
            }
            const record = ClaudeHistoryRecordSchema.safeParse(value);
            if (record.success) records.push(record.data);
          }
          return { records, resume };
        } finally {
          await handle.close();
        }
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },
  };
}
