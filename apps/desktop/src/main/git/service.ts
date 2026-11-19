import { randomUUID } from 'node:crypto';
import { GitPathSchema, type GitDiffTarget, type GitError } from '@control-center/ipc-contract';
import {
  applyRestore,
  branch,
  compareTrees,
  head,
  listRecovery,
  readCheckpoint,
  restorePlan,
  saveCheckpoint,
  validateRestorePaths,
  withSnapshot,
  type RestorePlan,
  type Snapshot,
  type Trees,
} from './checkpoints';
import {
  checkFilters,
  checkPath,
  checkWritable,
  DIFF_FLAGS,
  fail,
  GitFailure,
  nulList,
  oid,
  openRepository,
  patch,
  pathInput,
  untrackedDiff,
  type RunGit,
} from './repository';

interface Context {
  root: string;
  workspaceId: string;
  owner: number;
  active(): boolean;
  busy(): boolean;
}

const PREVIEW_TTL = 5 * 60_000;

interface Preview {
  token: string;
  expires: number;
  root: string;
  workspaceId: string;
  current: Snapshot;
  target: Trees;
  plan: RestorePlan;
}

export async function statusFiles(git: RunGit, path?: string) {
  const output = await git([
    'status',
    '--porcelain=v1',
    '-z',
    '--no-renames',
    '--untracked-files=all',
    '--ignore-submodules=all',
    '--',
    ...(path ? [path] : []),
  ]);
  const entries = nulList(output);
  const files = [];
  for (const entry of entries) {
    const name = entry.slice(3);
    if (!GitPathSchema.safeParse(name).success) continue;
    files.push({ index: entry[0]!, worktree: entry[1]!, path: name });
    if (files.length === 5000) break;
  }
  return { files, omitted: entries.length - files.length };
}

async function commits(git: RunGit, currentHead: string) {
  if (!currentHead) return [];
  const parts = nulList(
    await git([
      'log',
      '-z',
      '-n',
      '30',
      '--no-notes',
      '--format=%H%x00%cI%x00%s',
      currentHead,
      '--',
    ]),
  );
  const rows = [];
  for (let i = 0; i < parts.length; i += 3) {
    const [hash, at, subject] = parts.slice(i, i + 3);
    if (!hash || !at || subject === undefined) fail('failed');
    rows.push({ oid: oid(hash), at, subject: subject.slice(0, 1000) });
  }
  return rows;
}

function sameSnapshot(a: Snapshot, b: Snapshot) {
  return (
    a.head === b.head && a.branch === b.branch && a.index === b.index && a.worktree === b.worktree
  );
}

function code(error: unknown): GitError {
  return error instanceof GitFailure ? error.reason : 'failed';
}

export function createGitService() {
  const locks = new Set<string>();
  const previews = new Map<number, Preview>();

  async function access<T>(ctx: Context, exclusive: boolean, run: (git: RunGit) => Promise<T>) {
    const reason = (error: GitError) => ({ ok: false as const, error });
    if (!ctx.active()) return reason('workspace-unavailable');
    if (locks.has(ctx.root) || (exclusive && ctx.busy())) return reason('busy');
    if (exclusive) locks.add(ctx.root);
    try {
      const git = await openRepository(ctx.root);
      if (!git) return reason('not-repository');
      if (!ctx.active()) return reason('workspace-unavailable');
      if (exclusive) await checkWritable(git);
      return { ok: true as const, value: await run(git) };
    } catch (error) {
      return reason(code(error));
    } finally {
      if (exclusive) locks.delete(ctx.root);
    }
  }

  function checkActive(ctx: Context) {
    if (!ctx.active()) fail('workspace-unavailable');
    if (ctx.busy()) fail('busy');
  }

  return {
    clearOwner(owner: number) {
      previews.delete(owner);
    },
    async checkpoint(root: string, workspaceId: string, active: () => boolean, create: boolean) {
      if (locks.has(root)) fail('busy');
      locks.add(root);
      try {
        if (!active()) fail('workspace-unavailable');
        if (!create) return null;
        const git = await openRepository(root);
        if (!git) return null;
        await checkWritable(git);
        return await withSnapshot(git, (state) => {
          if (!active()) fail('workspace-unavailable');
          return saveCheckpoint(git, workspaceId, state);
        });
      } finally {
        locks.delete(root);
      }
    },
    status: (ctx: Context) =>
      access(ctx, false, async (git) => {
        const currentHead = await head(git);
        const [name, changes, recent, recovery] = await Promise.all([
          branch(git),
          statusFiles(git),
          commits(git, currentHead),
          listRecovery(git, ctx.workspaceId),
        ]);
        return {
          branch: name || null,
          head: currentHead || null,
          ...changes,
          commits: recent,
          recovery,
        };
      }),
    diff: (ctx: Context, target: GitDiffTarget) =>
      access(ctx, false, async (git) => {
        if (target.kind === 'commit') {
          const currentHead = await head(git);
          if (!(await commits(git, currentHead)).some((entry) => entry.oid === target.oid))
            fail('stale');
          return patch(
            await git([
              'show',
              ...DIFF_FLAGS,
              '--format=',
              '--no-notes',
              '--diff-merges=first-parent',
              target.oid,
              '--',
            ]),
          );
        }
        await checkPath(ctx.root, target.path);
        const { files } = await statusFiles(git, target.path);
        const row = files.find((file) => file.path === target.path);
        if (!row) fail('stale');
        if (row.index === '?' && !target.staged) {
          return patch(await untrackedDiff(ctx.root, git, target.path));
        }
        return patch(
          await git([
            'diff',
            ...DIFF_FLAGS,
            ...(target.staged ? ['--cached'] : []),
            '--',
            target.path,
          ]),
        );
      }),
    stage: (ctx: Context, path: string, staged: boolean) =>
      access(ctx, true, async (git) => {
        await checkPath(ctx.root, path);
        const { files } = await statusFiles(git, path);
        if (!files.some((file) => file.path === path)) fail('stale');
        if (staged) {
          await checkFilters(git, pathInput([path]));
          checkActive(ctx);
          await git(['add', '--', path]);
        } else {
          const source = (await head(git)) || oid(await git(['mktree'], { input: '' }));
          checkActive(ctx);
          await git(['restore', '--staged', `--source=${source}`, '--', path]);
        }
        return null;
      }),
    commit: (ctx: Context, message: string) =>
      access(ctx, true, async (git) => {
        if (!(await git(['diff', ...DIFF_FLAGS, '--cached', '--name-only', '-z', '--']))) {
          fail('nothing-staged');
        }
        // A commit from the panel is always a normal commit of the existing index.
        const interrupted = await git(['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], {
          allowOne: true,
        });
        if (interrupted) fail('unsupported');
        const signing = await git(['config', '--type=bool', '--get', 'commit.gpgsign'], {
          allowOne: true,
        });
        if (signing.trim() === 'true') fail('signing-required');
        checkActive(ctx);
        await git(['commit', '--cleanup=verbatim', '--file=-'], {
          input: message,
          commitHooks: true,
        });
        return null;
      }),
    preview: (ctx: Context, id: string, path?: string) =>
      access(ctx, true, async (git) => {
        previews.delete(ctx.owner);
        const target = await readCheckpoint(git, ctx.workspaceId, id);
        return withSnapshot(git, async (current) => {
          const plan = await restorePlan(git, ctx.root, current, target, path);
          const [worktree, index] = await Promise.all([
            compareTrees(git, current.worktree, target.worktree, path),
            compareTrees(git, current.index, target.index, path),
          ]);
          checkActive(ctx);
          const token = randomUUID();
          previews.set(ctx.owner, {
            token,
            expires: Date.now() + PREVIEW_TTL,
            root: ctx.root,
            workspaceId: ctx.workspaceId,
            current,
            target,
            plan,
          });
          return { token, files: plan.files, worktree, index };
        });
      }),
    restore: (ctx: Context, token: string) =>
      access(ctx, true, async (git) => {
        const preview = previews.get(ctx.owner);
        if (
          !preview ||
          preview.token !== token ||
          preview.expires <= Date.now() ||
          preview.root !== ctx.root ||
          preview.workspaceId !== ctx.workspaceId
        )
          fail('stale');
        previews.delete(ctx.owner);
        return withSnapshot(git, async (current, scratch) => {
          if (!sameSnapshot(current, preview.current)) fail('stale');
          const { plan } = preview;
          if (!plan.files.length) return null;
          // Ignored files and attributes can change without changing either snapshot tree.
          await validateRestorePaths(git, ctx.root, preview.target, plan);
          checkActive(ctx);
          const recovery = await saveCheckpoint(git, ctx.workspaceId, current, true);
          checkActive(ctx);
          try {
            await applyRestore(git, preview.target, plan, scratch);
          } catch {
            fail('restore-incomplete');
          }
          return recovery;
        });
      }),
  };
}
