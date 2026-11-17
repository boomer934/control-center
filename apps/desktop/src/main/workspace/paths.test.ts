import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveWorkspaceFile, resolveWorkspaceRoot } from './paths';

function fakeFs(aliases: ReadonlyMap<string, string> = new Map()) {
  return {
    realpath: vi.fn(async (path: string) => aliases.get(path) ?? path),
    isDirectory: vi.fn(async () => true),
    isFile: vi.fn(async () => true),
    sameDirectory: vi.fn(async () => false),
  };
}

describe('workspace paths', () => {
  it('canonicalizes the selected folder and requires a directory', async () => {
    const fs = fakeFs(new Map([['C:\\picked', 'C:\\Projects\\App']]));
    await expect(resolveWorkspaceRoot('C:/picked/', fs)).resolves.toBe('C:\\Projects\\App');
    fs.isDirectory.mockResolvedValueOnce(false);
    await expect(resolveWorkspaceRoot('C:/picked/', fs)).resolves.toBeNull();
    await expect(resolveWorkspaceRoot('picked', fs)).resolves.toBeNull();
  });

  it('rejects traversal, other drives, adjacent folders and ambiguous syntax before I/O', async () => {
    const fs = fakeFs();
    const workspace = await resolveWorkspaceRoot('C:\\Projects\\App', fs);
    if (!workspace) throw new Error('Expected a workspace');
    fs.realpath.mockClear();
    for (const file of [
      '../outside.txt',
      'src/../../outside.txt',
      'C:\\Projects\\App-other\\file.txt',
      'D:\\Projects\\App\\file.txt',
      'C:src\\file.txt',
      '\\Projects\\App\\file.txt',
      '\\\\server\\share\\file.txt',
      '\\\\server',
      '\\\\?\\C:\\Projects\\App\\file.txt',
      '\\\\.\\C:\\Projects\\App\\file.txt',
      'file.txt:stream',
      'file.txt\0',
      'NUL.txt',
      'LPT².txt',
      'src.\\file.txt',
      '.',
    ]) {
      await expect(resolveWorkspaceFile(workspace, file, fs), file).resolves.toBeNull();
    }
    expect(fs.realpath).not.toHaveBeenCalled();
  });

  it('uses real paths and refuses symlinks outside the workspace, including case-sensitive siblings', async () => {
    const root = 'C:\\Projects\\App';
    const fs = fakeFs(
      new Map([
        [root + '\\inside-link', root + '\\file.txt'],
        [root + '\\outside-link', 'C:\\Projects\\Outside\\file.txt'],
        [root + '\\case-link', 'C:\\Projects\\app\\file.txt'],
      ]),
    );
    const workspace = await resolveWorkspaceRoot(root, fs);
    if (!workspace) throw new Error('Expected a workspace');
    await expect(resolveWorkspaceFile(workspace, 'inside-link', fs)).resolves.toBe(
      root + '\\file.txt',
    );
    fs.isFile.mockClear();
    await expect(resolveWorkspaceFile(workspace, 'outside-link', fs)).resolves.toBeNull();
    await expect(resolveWorkspaceFile(workspace, 'case-link', fs)).resolves.toBeNull();
    expect(fs.isFile).not.toHaveBeenCalled();
  });

  it('accepts a case alias only when the filesystem identifies the same directory', async () => {
    const fs = fakeFs();
    const root = 'C:\\Projects\\App';
    const workspace = await resolveWorkspaceRoot(root, fs);
    if (!workspace) throw new Error('Expected a workspace');
    const differentlyCased = 'C:\\PROJECTS\\APP\\src\\file.txt';
    await expect(resolveWorkspaceFile(workspace, differentlyCased, fs)).resolves.toBeNull();
    fs.sameDirectory.mockResolvedValueOnce(true);
    await expect(resolveWorkspaceFile(workspace, differentlyCased, fs)).resolves.toBe(
      differentlyCased,
    );
    expect(fs.sameDirectory).toHaveBeenCalledWith(root, 'C:\\PROJECTS\\APP');
  });

  it('supports the selected UNC share and refuses other UNC shares before I/O', async () => {
    const fs = fakeFs();
    const workspace = await resolveWorkspaceRoot('\\\\server\\share', fs);
    if (!workspace) throw new Error('Expected a workspace');
    const file = '\\\\server\\share\\src\\file.txt';
    await expect(resolveWorkspaceFile(workspace, 'src/file.txt', fs)).resolves.toBe(file);
    await expect(resolveWorkspaceFile(workspace, file, fs)).resolves.toBe(file);
    fs.realpath.mockClear();
    await expect(
      resolveWorkspaceFile(workspace, '\\\\server\\share-two\\file.txt', fs),
    ).resolves.toBeNull();
    await expect(
      resolveWorkspaceFile(workspace, '\\\\other\\share\\file.txt', fs),
    ).resolves.toBeNull();
    expect(fs.realpath).not.toHaveBeenCalled();
  });
});

describe.skipIf(process.platform !== 'win32')('workspace paths on Windows', () => {
  let fixture: string | undefined;

  afterEach(async () => {
    if (fixture) await rm(fixture, { force: true, recursive: true });
    fixture = undefined;
  });

  it('resolves regular files and internal junctions and rejects external or replaced roots', async () => {
    // tmpdir() can be an 8.3 short path (RUNNER~1) on CI; canonicalize it so the case alias below
    // differs only by case, not by spelling.
    fixture = await realpath(await mkdtemp(join(tmpdir(), 'cc-workspace-paths-')));
    const directory = join(fixture, 'App');
    const src = join(directory, 'src');
    const outside = join(fixture, 'Outside');
    await mkdir(src, { recursive: true });
    await mkdir(outside);
    const file = join(src, 'file.txt');
    await writeFile(file, '');
    await writeFile(join(outside, 'file.txt'), '');
    await symlink(src, join(directory, 'internal'), 'junction');
    await symlink(outside, join(directory, 'external'), 'junction');
    const workspace = await resolveWorkspaceRoot(directory);
    if (!workspace) throw new Error('Expected a workspace');

    await expect(resolveWorkspaceFile(workspace, 'src/file.txt')).resolves.toBe(
      await realpath(file),
    );
    // The volume determines whether this case alias exists and how realpath spells it.
    const alias = file.toUpperCase();
    const canonicalAlias = await realpath(alias).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    await expect(resolveWorkspaceFile(workspace, alias)).resolves.toBe(canonicalAlias);
    await expect(resolveWorkspaceFile(workspace, 'internal/file.txt')).resolves.toBe(
      await realpath(file),
    );
    await expect(resolveWorkspaceFile(workspace, 'external/file.txt')).resolves.toBeNull();
    await expect(resolveWorkspaceFile(workspace, 'missing.txt')).resolves.toBeNull();
    await expect(resolveWorkspaceFile(workspace, 'src')).resolves.toBeNull();

    await rm(directory, { recursive: true });
    await symlink(outside, directory, 'junction');
    await expect(resolveWorkspaceFile(workspace, 'file.txt')).resolves.toBeNull();
  });
});
