import { open, stat } from 'node:fs/promises';
import { beforeEach, expect, it, vi } from 'vitest';
import { resolveWorkspaceFile, type WorkspaceRoot } from './paths';
import { readSourceLocation } from './source';

vi.mock('node:fs/promises', () => ({ open: vi.fn(), stat: vi.fn() }));
vi.mock('./paths', () => ({ resolveWorkspaceFile: vi.fn() }));

const root = 'C:\\workspace' as WorkspaceRoot;

beforeEach(() => vi.resetAllMocks());

it.each(['.env', 'config\\.Env.local'])(
  'rejects the requested name %s before opening',
  async (path) => {
    vi.mocked(resolveWorkspaceFile).mockResolvedValue(`${root}\\config.txt`);

    await expect(readSourceLocation(root, path, 1)).resolves.toBeNull();
    expect(open).not.toHaveBeenCalled();
  },
);

it.each([
  ['a symlink', 'config.txt', '.env'],
  ['a Windows short name', 'ENV~1.LOC', '.env.local'],
])('rejects %s when the canonical name starts with .env', async (_alias, path, name) => {
  vi.mocked(resolveWorkspaceFile).mockResolvedValue(`${root}\\${name}`);

  await expect(readSourceLocation(root, path, 1)).resolves.toBeNull();
  expect(resolveWorkspaceFile).toHaveBeenCalledWith(root, path);
  expect(open).not.toHaveBeenCalled();
});

it('reads environment.ts', async () => {
  const file = `${root}\\src\\environment.ts`;
  const content = 'export const environment = "test";\n';
  const stats = { isFile: () => true, size: BigInt(Buffer.byteLength(content)), dev: 1n, ino: 2n };
  vi.mocked(resolveWorkspaceFile).mockResolvedValue(file);
  vi.mocked(stat).mockResolvedValue(stats as Awaited<ReturnType<typeof stat>>);
  vi.mocked(open).mockResolvedValue({
    stat: vi.fn().mockResolvedValue(stats),
    read: vi
      .fn()
      .mockImplementationOnce(async (buffer: Buffer) => ({
        bytesRead: buffer.write(content),
      }))
      .mockResolvedValue({ bytesRead: 0 }),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Awaited<ReturnType<typeof open>>);

  await expect(readSourceLocation(root, 'src/environment.ts', 1)).resolves.toBe(content);
  expect(open).toHaveBeenCalledExactlyOnceWith(file, 'r');
});

it('rejects a source file with no inode identity before reading bytes', async () => {
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
