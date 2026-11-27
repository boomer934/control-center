import { open, stat } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { resolveWorkspaceFile, type WorkspaceRoot } from './paths';
import { readSourceLocation } from './source';

vi.mock('node:fs/promises', () => ({ open: vi.fn(), stat: vi.fn() }));
vi.mock('./paths', () => ({ resolveWorkspaceFile: vi.fn() }));

it('rejects a source file with no inode identity before reading bytes', async () => {
  const root = 'C:\\workspace' as WorkspaceRoot;
  vi.mocked(resolveWorkspaceFile).mockResolvedValue('C:\\workspace\\src\\cart.js');
  const stats = { isFile: () => true, size: 4n, dev: 1n, ino: 0n };
  const read = vi.fn().mockResolvedValue({ bytesRead: 0 });
  const close = vi.fn().mockResolvedValue(undefined);
  vi.mocked(stat).mockResolvedValue(stats as Awaited<ReturnType<typeof stat>>);
  vi.mocked(open).mockResolvedValue({
    stat: vi.fn().mockResolvedValue(stats),
    read,
    close,
  } as unknown as Awaited<ReturnType<typeof open>>);

  await expect(readSourceLocation(root, 'src/cart.js', 1)).resolves.toBeNull();
  expect(read).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});
