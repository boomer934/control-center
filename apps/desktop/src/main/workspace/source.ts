import { open, stat } from 'node:fs/promises';
import { MAX_SOURCE_BYTES } from '@control-center/ipc-contract';
import { resolveWorkspaceFile, type WorkspaceRoot } from './paths';

export async function readSourceLocation(
  root: WorkspaceRoot,
  path: string,
  line: number,
): Promise<string | null> {
  try {
    const file = await resolveWorkspaceFile(root, path);
    if (!file) return null;
    const handle = await open(file, 'r');
    try {
      const opened = await handle.stat({ bigint: true });
      if (!opened.isFile() || opened.size > BigInt(MAX_SOURCE_BYTES)) return null;

      // Check the open handle against the canonical workspace file before reading any bytes.
      const confirmed = await resolveWorkspaceFile(root, path);
      if (confirmed !== file) return null;
      const current = await stat(confirmed, { bigint: true });
      if (current.dev !== opened.dev || current.ino !== opened.ino) return null;

      // A file that grows during this read still cannot exceed the response limit.
      const buffer = Buffer.alloc(Number(opened.size) + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length !== Number(opened.size)) return null;
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
      if (text.includes('\0') || text.split(/\r\n|\r|\n/).length < line) return null;
      return text;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}
