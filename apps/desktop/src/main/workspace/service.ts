import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, win32 } from 'node:path';
import {
  MAX_RECENT_WORKSPACES,
  RecentWorkspaceRootsSchema,
  type WorkspaceDto,
  type WorkspaceState,
} from '@control-center/ipc-contract/workspace';
import { resolveWorkspaceRoot, type WorkspaceRoot } from './paths';

function workspaceId(root: string): string {
  return createHash('sha256').update(root).digest('hex');
}

function describeWorkspace(root: string): WorkspaceDto {
  return { id: workspaceId(root), root, name: win32.basename(root) || root };
}

async function readRecents(stateFile: string): Promise<string[]> {
  try {
    const data: unknown = JSON.parse(await readFile(stateFile, 'utf8'));
    const result = RecentWorkspaceRootsSchema.safeParse(data);
    return result.success ? [...new Set(result.data)] : [];
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function saveRecents(stateFile: string, roots: string[]): Promise<void> {
  await mkdir(dirname(stateFile), { recursive: true });
  const temporaryFile = stateFile + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temporaryFile, JSON.stringify(roots) + '\n', { flag: 'wx' });
    await rename(temporaryFile, stateFile);
  } catch (error) {
    await rm(temporaryFile, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function createWorkspaceService(stateFile: string) {
  let recent = await readRecents(stateFile);
  const last = recent[0];
  const restored = last ? await resolveWorkspaceRoot(last) : null;
  let active = restored === last ? restored : null;
  let pending = Promise.resolve();

  function state(): WorkspaceState {
    return {
      active: active ? describeWorkspace(active) : null,
      recent: recent.map(describeWorkspace),
    };
  }

  async function activate(root: WorkspaceRoot): Promise<WorkspaceState> {
    const updated = [root, ...recent.filter((path) => path !== root)].slice(
      0,
      MAX_RECENT_WORKSPACES,
    );
    await saveRecents(stateFile, updated);
    recent = updated;
    active = root;
    return state();
  }

  function enqueue(change: () => Promise<WorkspaceState | null>): Promise<WorkspaceState | null> {
    const next = pending.then(change);
    pending = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  return {
    state,
    /** The directory comes from the main process's native picker. */
    openSelectedFolder(selected: string) {
      return enqueue(async () => {
        const root = await resolveWorkspaceRoot(selected);
        return root ? activate(root) : null;
      });
    },
    selectRecent(id: string) {
      return enqueue(async () => {
        const saved = recent.find((path) => workspaceId(path) === id);
        if (!saved) return null;
        const root = await resolveWorkspaceRoot(saved);
        // A stored root that now resolves elsewhere must be selected again in the picker.
        return root === saved ? activate(root) : null;
      });
    },
  };
}
