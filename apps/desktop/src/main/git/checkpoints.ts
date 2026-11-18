import { randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitCheckpointSchema, type GitCheckpoint } from '@control-center/ipc-contract';
import {
  checkFilters,
  checkPath,
  DIFF_FLAGS,
  fail,
  nulList,
  oid,
  patch,
  pathInput,
  type RunGit,
} from './repository';

export const checkpointRef = (workspace: string, id: string) =>
  `refs/control-center/checkpoints/${workspace}/${id}`;
const recoveryPrefix = (workspace: string) => `refs/control-center/recovery/${workspace}/`;

export interface Trees {
  index: string;
  worktree: string;
}

export interface Snapshot extends Trees {
  head: string;
  branch: string;
}

export async function head(git: RunGit) {
  return (
    await git(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], { allowOne: true })
  ).trim();
}

export async function branch(git: RunGit) {
  return (await git(['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowOne: true })).trim();
}

/** A private index captures staging separately from the contents actually on disk. */
export async function withSnapshot<T>(
  git: RunGit,
  use: (snapshot: Snapshot, index: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'vernier-git-'));
  const index = join(directory, 'index');
  try {
    const [actual, currentHead, currentBranch] = await Promise.all([
      git(['rev-parse', '--path-format=absolute', '--git-path', 'index']).then((value) =>
        value.trimEnd(),
      ),
      head(git),
      branch(git),
    ]);
    try {
      if (!(await lstat(actual)).isFile()) fail('unsupported');
      await copyFile(actual, index);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await git(['read-tree', '--empty'], { index });
    }
    if (await git(['ls-files', '--unmerged', '-z'], { index })) fail('unsupported');
    const indexTree = oid(await git(['write-tree'], { index }));
    // Discard stat data, skip-worktree and assume-unchanged flags before reading working files.
    await rm(index);
    await git(['read-tree', indexTree], { index });
    const names = await git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      index,
    });
    await checkFilters(git, names);
    await git(['add', '--all', '--', '.'], { index });
    const worktree = oid(await git(['write-tree'], { index }));
    return await use(
      { index: indexTree, worktree, head: currentHead, branch: currentBranch },
      index,
    );
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

export async function saveCheckpoint(
  git: RunGit,
  workspace: string,
  trees: Trees,
  recovery = false,
): Promise<GitCheckpoint> {
  const id = randomUUID();
  const identity = [
    '-c',
    'user.name=Control Center',
    '-c',
    'user.email=checkpoint@control-center.invalid',
  ];
  const index = oid(
    await git([...identity, 'commit-tree', trees.index, '--no-gpg-sign', '-m', 'Checkpoint index']),
  );
  const worktree = oid(
    await git([
      ...identity,
      'commit-tree',
      trees.worktree,
      '--no-gpg-sign',
      '-p',
      index,
      '-m',
      'Checkpoint working tree',
    ]),
  );
  const ref = recovery ? recoveryPrefix(workspace) + id : checkpointRef(workspace, id);
  await git(['update-ref', ref, worktree, '0'.repeat(worktree.length)]);
  return { id, at: new Date().toISOString() };
}

export async function listRecovery(git: RunGit, workspace: string): Promise<GitCheckpoint[]> {
  const prefix = recoveryPrefix(workspace);
  const rows = await git([
    'for-each-ref',
    '--count=30',
    '--sort=-committerdate',
    '--format=%(refname)%00%(committerdate:iso-strict)',
    prefix,
  ]);
  return rows
    .trimEnd()
    .split('\n')
    .flatMap((row) => {
      const [ref, date] = row.split('\0');
      if (!ref?.startsWith(prefix) || !date || !Number.isFinite(Date.parse(date))) return [];
      const parsed = GitCheckpointSchema.safeParse({
        id: ref.slice(prefix.length),
        at: new Date(date).toISOString(),
      });
      return parsed.success ? [parsed.data] : [];
    });
}

export async function readCheckpoint(git: RunGit, workspace: string, id: string): Promise<Trees> {
  const ref = checkpointRef(workspace, id);
  const commit =
    (await git(['rev-parse', '--verify', '--quiet', ref], { allowOne: true })).trim() ||
    (
      await git(['rev-parse', '--verify', '--quiet', recoveryPrefix(workspace) + id], {
        allowOne: true,
      })
    ).trim();
  if (!commit) fail('stale');
  const worktree = oid(await git(['rev-parse', '--verify', `${oid(commit)}^{tree}`]));
  const index = oid(await git(['rev-parse', '--verify', `${commit}^1^{tree}`]));
  return { index, worktree };
}

export async function changedPaths(git: RunGit, from: string, to: string, name?: string) {
  return nulList(
    await git([
      'diff',
      ...DIFF_FLAGS,
      '--ignore-submodules=none',
      '--name-only',
      '-z',
      from,
      to,
      '--',
      ...(name ? [name] : []),
    ]),
  );
}

export async function restorePlan(
  git: RunGit,
  root: string,
  current: Trees,
  target: Trees,
  name?: string,
) {
  if (name) await checkPath(root, name, true);
  const [worktree, index] = await Promise.all([
    changedPaths(git, current.worktree, target.worktree, name),
    changedPaths(git, current.index, target.index, name),
  ]);
  const affected = new Set([...worktree, ...index]);
  const changedOnDisk = new Set(worktree);
  const files = Array.from(affected).sort();
  if (files.length > 5000) fail('too-large');
  if (name && files.some((file) => file !== name)) fail('unsupported');
  // Inspect the raw modes. A gitlink or symlink cannot be materialized by a restore.
  const readModes = async (tree: string) => {
    if (!files.length) return new Set<string>();
    const entries = nulList(await git(['ls-tree', '-r', '-z', tree]));
    return new Set(
      entries.flatMap((entry) => {
        const separator = entry.indexOf('\t');
        const name = entry.slice(separator + 1);
        if (!affected.has(name)) return [];
        if (!/^100(?:644|755) blob /.test(entry.slice(0, separator))) fail('unsupported');
        return [name];
      }),
    );
  };
  const [present] = await Promise.all([
    readModes(current.worktree),
    readModes(target.worktree),
    readModes(current.index),
    readModes(target.index),
  ]);
  for (const file of files) {
    // An ignored file may occupy a path which the snapshot sees as absent.
    if ((await checkPath(root, file, changedOnDisk.has(file))) && !present.has(file)) fail('stale');
  }
  const input = pathInput(worktree);
  await checkFilters(git, input);
  await checkFilters(git, input, target.worktree);
  return { worktree, index, files };
}

export async function compareTrees(git: RunGit, from: string, to: string, name?: string) {
  if (from === to) return patch('');
  return patch(
    await git([
      'diff',
      ...DIFF_FLAGS,
      '--src-prefix=a/',
      '--dst-prefix=b/',
      from,
      to,
      '--',
      ...(name ? [name] : []),
    ]),
  );
}

export async function applyRestore(
  git: RunGit,
  target: Trees,
  plan: Awaited<ReturnType<typeof restorePlan>>,
  scratchIndex: string,
): Promise<void> {
  // The scratch index knows about current untracked files as well, so restore can remove
  // files added after the checkpoint without using clean or changing the real index.
  const args = ['--pathspec-from-file=-', '--pathspec-file-nul'];
  if (plan.worktree.length) {
    await git(['restore', `--source=${target.worktree}`, '--worktree', ...args], {
      index: scratchIndex,
      input: pathInput(plan.worktree),
    });
  }
  if (plan.index.length) {
    await git(['restore', `--source=${target.index}`, '--staged', ...args], {
      input: pathInput(plan.index),
    });
  }
}
