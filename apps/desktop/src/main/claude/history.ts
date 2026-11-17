import {
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  writeFileSync,
} from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
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
  const directory = (workspaceId: string) => join(base, workspaceKey.parse(workspaceId));
  const file = (workspaceId: string, id: string) =>
    join(directory(workspaceId), historyId.parse(id) + '.jsonl');

  function ensureDirectory(workspaceId: string) {
    for (const path of [base, directory(workspaceId)]) {
      mkdirSync(path, { recursive: true });
      if (!lstatSync(path).isDirectory()) throw new Error('Invalid Claude history directory');
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
      let created = resume;
      let disabled = false;
      let checkTail = resume;
      return (record: Record) => {
        if (disabled || (!created && record.kind !== 'prompt')) return;
        try {
          ensureDirectory(workspaceId);
          const path = file(workspaceId, id);
          if (created && !lstatSync(path).isFile()) throw new Error('Invalid Claude history file');
          const fd = openSync(path, created ? (checkTail ? 'a+' : 'a') : 'ax', 0o600);
          try {
            const first = created
              ? ''
              : JSON.stringify({
                  version: 1,
                  title:
                    record.kind === 'prompt'
                      ? record.text.replace(/\s+/g, ' ').trim().slice(0, 120)
                      : '',
                }) + '\n';
            const { size } = fstatSync(fd);
            const tail = Buffer.alloc(1, 10);
            if (checkTail && size > 0) readSync(fd, tail, 0, 1, size - 1);
            // A preceding process may have stopped in the middle of a line.
            const line = first + (tail[0] === 10 ? '' : '\n') + JSON.stringify(record) + '\n';
            if (size + Buffer.byteLength(line) > MAX_HISTORY_BYTES)
              throw new Error('Claude history size limit reached');
            writeFileSync(fd, line);
            created = true;
            checkTail = false;
          } finally {
            closeSync(fd);
          }
        } catch {
          disabled = true;
          failed();
        }
      };
    },

    async list(workspaceId: string): Promise<ClaudeHistorySummary[]> {
      if (!(await exists(workspaceId))) return [];
      const dir = directory(workspaceId);
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
      if (!(await exists(workspaceId))) return null;
      const path = file(workspaceId, id);
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
