import { randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GitCheckpointSchema,
  GitPathSchema,
  type GitCheckpoint,
} from '@control-center/ipc-contract';
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

const checkpointPrefix = (workspace: string) => `refs/control-center/checkpoints/${workspace}/`;
export const checkpointRef = (workspace: string, id: string) => checkpointPrefix(workspace) + id;
const recoveryPrefix = (workspace: string) => `refs/control-center/recovery/${workspace}/`;
const CHECKPOINT_LIMIT = 20;
const RECOVERY_LIMIT = 30;

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
  const at = new Date().toISOString();
  const worktree = oid(
    await git([
      ...identity,
      'commit-tree',
      trees.worktree,
      '--no-gpg-sign',
      '-p',
      index,
      '-m',
      `Checkpoint working tree ${at}`,
    ]),
  );
  const prefix = recovery ? recoveryPrefix(workspace) : checkpointPrefix(workspace);
  const ref = prefix + id;
  await git(['update-ref', ref, worktree, '0'.repeat(worktree.length)]);
  const limit = recovery ? RECOVERY_LIMIT : CHECKPOINT_LIMIT;
  const older = (await checkpointRefs(git, prefix)).filter((entry) => entry.ref !== ref);
  for (const entry of older.slice(limit - 1)) {
    await git(['update-ref', '-d', entry.ref, entry.oid]);
  }
  return { id, at };
}

async function checkpointRefs(git: RunGit, prefix: string) {
  const rows = await git([
    'for-each-ref',
    // Git's commit date has second precision. The subject breaks ties for new checkpoints.
    '--sort=-subject',
    '--sort=-committerdate',
    '--format=%(refname)%00%(objectname)%00%(committerdate:iso-strict)%00%(subject)',
    prefix,
  ]);
  return rows
    .trimEnd()
    .split('\n')
    .flatMap((row) => {
      const [ref, object, date, subject] = row.split('\0');
      if (!ref?.startsWith(prefix) || !object || !date || !Number.isFinite(Date.parse(date)))
        return [];
      const timestamp = subject?.match(/^Checkpoint working tree (.+)$/)?.[1];
      const parsed = GitCheckpointSchema.safeParse({
        id: ref.slice(prefix.length),
        at: timestamp ?? new Date(date).toISOString(),
      });
      return parsed.success ? [{ ref, oid: oid(object), checkpoint: parsed.data }] : [];
    });
}

export async function listRecovery(git: RunGit, workspace: string): Promise<GitCheckpoint[]> {
  return (await checkpointRefs(git, recoveryPrefix(workspace)))
    .slice(0, RECOVERY_LIMIT)
    .map(({ checkpoint }) => checkpoint);
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

// Limit each invocation to fit the Windows command line even with quoted pathspecs.
function pathBatches(files: string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let size = 0;
  for (const file of files) {
    if (!GitPathSchema.safeParse(file).success) fail('unsupported');
    if (size + file.length + 1 > 10_000) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(file);
    size += file.length + 1;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export interface RestorePlan {
  worktree: string[];
  index: string[];
  files: string[];
  present: Set<string>;
}

export async function restorePlan(
  git: RunGit,
  root: string,
  current: Trees,
  target: Trees,
  name?: string,
): Promise<RestorePlan> {
  if (name) await checkPath(root, name, true);
  const [worktree, index] = await Promise.all([
    changedPaths(git, current.worktree, target.worktree, name),
    changedPaths(git, current.index, target.index, name),
  ]);
  const affected = new Set([...worktree, ...index]);
  const files = Array.from(affected).sort();
  if (files.length > 5000) fail('too-large');
  if (name && files.some((file) => file !== name)) fail('unsupported');
  const batches = pathBatches(files);
  // Inspect the raw modes. A gitlink or symlink cannot be materialized by a restore.
  const checkModes = async (tree: string, present?: Set<string>) => {
    for (const batch of batches) {
      for (const entry of nulList(await git(['ls-tree', '-r', '-z', tree, '--', ...batch]))) {
        const separator = entry.indexOf('\t');
        const name = entry.slice(separator + 1);
        if (!affected.has(name)) continue;
        if (!/^100(?:644|755) blob /.test(entry.slice(0, separator))) fail('unsupported');
        present?.add(name);
      }
    }
  };
  const present = new Set<string>();
  await Promise.all([
    checkModes(current.worktree, present),
    checkModes(target.worktree),
    checkModes(current.index),
    checkModes(target.index),
  ]);
  const plan = { worktree, index, files, present };
  await validateRestorePaths(git, root, target, plan);
  return plan;
}

export async function validateRestorePaths(
  git: RunGit,
  root: string,
  target: Trees,
  plan: RestorePlan,
) {
  const changedOnDisk = new Set(plan.worktree);
  for (const file of plan.files) {
    // An ignored file may occupy a path which the snapshot sees as absent.
    if ((await checkPath(root, file, changedOnDisk.has(file))) && !plan.present.has(file))
      fail('stale');
  }
  const input = pathInput(plan.worktree);
  await checkFilters(git, input);
  await checkFilters(git, input, target.worktree);
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
  plan: RestorePlan,
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
