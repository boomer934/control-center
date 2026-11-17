import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { WorkspaceStateSchema } from '@control-center/ipc-contract/workspace';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkspaceService } from './service';

describe.skipIf(process.platform !== 'win32')('workspace recents', () => {
  let temporaryDirectory: string | undefined;

  async function makeWorkspaceFixture() {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'cc-workspace-recents-'));
    const first = join(temporaryDirectory, 'First');
    const second = join(temporaryDirectory, 'Second');
    await mkdir(first);
    await mkdir(second);
    return {
      first: await realpath(first),
      second: await realpath(second),
      stateFile: join(temporaryDirectory, 'data', 'workspaces.json'),
    };
  }

  afterEach(async () => {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  });

  it('restores the active folder, keeps stable ids, and moves reopened folders to the front', async () => {
    const { first, second, stateFile } = await makeWorkspaceFixture();
    const service = await createWorkspaceService(stateFile);
    expect(service.state()).toEqual({ active: null, recent: [] });

    const openedFirst = await service.openSelectedFolder(first);
    const id = openedFirst?.active?.id;
    if (!id) throw new Error('Expected an active workspace');
    await service.openSelectedFolder(second);
    await expect(service.openSelectedFolder(first.toUpperCase())).resolves.toMatchObject({
      active: { id, root: first, name: 'First' },
      recent: [{ root: first }, { root: second }],
    });

    const reopened = await createWorkspaceService(stateFile);
    expect(WorkspaceStateSchema.parse(reopened.state())).toEqual(service.state());
    const secondId = reopened.state().recent[1]?.id;
    if (!secondId) throw new Error('Expected a second workspace');
    await expect(reopened.selectRecent('0'.repeat(64))).resolves.toBeNull();
    await expect(reopened.selectRecent(secondId)).resolves.toMatchObject({
      active: { root: second },
      recent: [{ root: second }, { root: first }],
    });
  });

  it('refuses a recent folder that was replaced by a junction', async () => {
    const { first, second, stateFile } = await makeWorkspaceFixture();
    const service = await createWorkspaceService(stateFile);
    const opened = await service.openSelectedFolder(first);
    const id = opened?.active?.id;
    if (!id) throw new Error('Expected an active workspace');
    await rm(first, { recursive: true });
    await symlink(second, first, 'junction');

    const reopened = await createWorkspaceService(stateFile);
    expect(reopened.state()).toMatchObject({ active: null, recent: [{ root: first }] });
    await expect(reopened.selectRecent(id)).resolves.toBeNull();
    await expect(reopened.openSelectedFolder(first)).resolves.toMatchObject({
      active: { root: second },
    });
  });

  it('serializes concurrent selections and recovers after a write fails', async () => {
    const { first, second, stateFile } = await makeWorkspaceFixture();
    const service = await createWorkspaceService(stateFile);
    await writeFile(dirname(stateFile), '');
    await expect(service.openSelectedFolder(first)).rejects.toThrow();
    expect(service.state()).toEqual({ active: null, recent: [] });
    await rm(dirname(stateFile));

    const [openedFirst, openedSecond] = await Promise.all([
      service.openSelectedFolder(first),
      service.openSelectedFolder(second),
    ]);
    expect(openedFirst?.active?.root).toBe(first);
    expect(openedSecond?.active?.root).toBe(second);
    expect(JSON.parse(await readFile(stateFile, 'utf8'))).toEqual([second, first]);
  });

  it('recovers from an invalid saved file and ignores missing directories', async () => {
    const { first, stateFile } = await makeWorkspaceFixture();
    await mkdir(dirname(stateFile));
    await writeFile(stateFile, JSON.stringify({ unexpected: [first] }));
    const service = await createWorkspaceService(stateFile);
    expect(service.state()).toEqual({ active: null, recent: [] });
    await expect(service.openSelectedFolder(join(first, 'missing'))).resolves.toBeNull();
    await expect(service.openSelectedFolder(first)).resolves.toMatchObject({
      active: { root: first },
    });
  });
});
