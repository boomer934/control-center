import { execFileSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitStatusSchema } from '@control-center/ipc-contract';
import { checkpointRef, restorePlan, saveCheckpoint } from './checkpoints';
import { openRepository } from './repository';
import { createGitService, statusFiles } from './service';

const workspaceId = 'a'.repeat(64);
let root: string;
let directory: string;
let service: ReturnType<typeof createGitService>;
const ctx = () => ({ root, workspaceId, owner: 1, active: () => true, busy: () => false });
function git(...args: string[]) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trimEnd();
}
const write = (name: string, content: string) => writeFile(join(root, name), content + '\n');
const read = (name: string) => readFile(join(root, name), 'utf8');
const ok = <T>(result: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

it('keeps the first 5000 valid status rows and counts invalid and excess rows', async () => {
  const rows = Array.from({ length: 5002 }, (_, index) => `?? file-${index}.txt`);
  rows.splice(1, 0, ' M ' + 'x'.repeat(4097));
  const git = vi.fn().mockResolvedValue(rows.join('\0') + '\0');
  const result = await statusFiles(git);
  expect(result.files).toHaveLength(5000);
  expect(result.files[1]?.path).toBe('file-1.txt');
  expect(result.files.at(-1)?.path).toBe('file-4999.txt');
  expect(result.omitted).toBe(3);
});

beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'cc-git-test-')));
  root = join(directory, 'Project');
  await mkdir(root);
  git('init', '-b', 'workspace-test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Git Test');
  git('config', 'core.autocrlf', 'false');
  git('config', 'commit.gpgsign', 'false');
  service = createGitService();
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true, maxRetries: 3 });
});

async function initialCommit() {
  await write('tracked.txt', 'original');
  await write('.gitignore', 'ignored.txt');
  git('add', '.');
  git('commit', '-m', 'Initial commit');
  return git('rev-parse', 'HEAD');
}

async function checkpoint() {
  const result = await service.checkpoint(root, workspaceId, () => true, true);
  if (!result) throw new Error('Expected a Git checkpoint');
  return result;
}

// These tests spawn multiple real Git processes, which take longer on Windows CI.
describe('Git workspace on temporary repositories', { timeout: 20_000 }, () => {
  it('shows branch and status, reads literal file and commit diffs, and commits only staged files', async () => {
    await initialCommit();
    const name = '-- café.txt';
    await write(name, 'untracked line');
    await write('tracked.txt', 'working changes');
    const status = await service.status(ctx());
    expect(GitStatusSchema.safeParse(status).success).toBe(true);
    expect(ok(status)).toMatchObject({
      branch: 'workspace-test',
      files: expect.arrayContaining([
        { path: name, index: '?', worktree: '?' },
        { path: 'tracked.txt', index: ' ', worktree: 'M' },
      ]),
      commits: [{ subject: 'Initial commit' }],
    });
    const diff = (staged: boolean) => service.diff(ctx(), { kind: 'file', path: name, staged });
    expect(ok(await diff(false)).text).toContain('+untracked line');
    ok(await service.stage(ctx(), name, true));
    expect(ok(await diff(true)).text).toContain('+untracked line');
    ok(await service.stage(ctx(), name, false));
    expect(git('diff', '--cached', '--name-only')).toBe('');
    ok(await service.stage(ctx(), name, true));
    ok(await service.commit(ctx(), 'Add Unicode file'));
    expect(git('status', '--short')).toBe(' M tracked.txt');
    const [commit] = ok(await service.status(ctx())).commits;
    expect(commit?.subject).toBe('Add Unicode file');
    expect(ok(await service.diff(ctx(), { kind: 'commit', oid: commit!.oid })).text).toContain(
      '+untracked line',
    );
  });

  it('restores staged, working and untracked state with long ref paths and keeps HEAD intact', async () => {
    if (process.platform === 'win32') {
      const deepParent = join(directory, 'nested'.repeat(9), 'workspace'.repeat(6));
      await mkdir(deepParent, { recursive: true });
      const nestedRoot = join(deepParent, 'Project');
      await rename(root, nestedRoot);
      root = nestedRoot;
      git('config', 'core.longpaths', 'false');
      const ref = checkpointRef(workspaceId, '00000000-0000-4000-8000-000000000000');
      expect(join(root, '.git', ref + '.lock').length).toBeGreaterThan(260);
    }
    const originalHead = await initialCommit();
    await write('tracked.txt', 'staged before');
    git('add', 'tracked.txt');
    await write('tracked.txt', 'working before');
    await write('untracked.txt', 'draft before');
    await write('ignored.txt', 'private');
    git('config', 'commit.gpgsign', 'true');
    git('config', 'gpg.program', 'unavailable-test-program');
    const before = git('status', '--porcelain');
    const saved = await checkpoint();
    expect(git('status', '--porcelain')).toBe(before);
    expect(git('stash', 'list')).toBe('');

    await write('tracked.txt', 'staged after');
    git('add', 'tracked.txt');
    await write('tracked.txt', 'working after');
    await write('new.txt', 'new file');
    await write('ignored.txt', 'changed private');
    await rm(join(root, 'untracked.txt'));

    const preview = ok(await service.preview(ctx(), saved.id));
    expect(preview.files).toEqual(['new.txt', 'tracked.txt', 'untracked.txt']);
    expect(preview.worktree.text).toContain('+working before');
    expect(preview.index.text).toContain('+staged before');
    expect(await service.restore({ ...ctx(), owner: 2 }, preview.token)).toEqual({
      ok: false,
      error: 'stale',
    });
    const recovery = ok(await service.restore(ctx(), preview.token));
    expect(recovery).toBeTruthy();
    expect(await service.restore(ctx(), preview.token)).toEqual({ ok: false, error: 'stale' });
    expect(await read('tracked.txt')).toBe('working before\n');
    expect(git('show', ':tracked.txt')).toBe('staged before');
    expect(await read('untracked.txt')).toBe('draft before\n');
    expect(await read('ignored.txt')).toBe('changed private\n');
    await expect(read('new.txt')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(git('rev-parse', 'HEAD')).toBe(originalHead);
    expect(git('branch', '--show-current')).toBe('workspace-test');
    expect(git('stash', 'list')).toBe('');
    expect(ok(await service.status(ctx())).recovery).toContainEqual({
      id: recovery!.id,
      at: expect.any(String),
    });
    ok(await service.restore(ctx(), ok(await service.preview(ctx(), recovery!.id)).token));
    expect(await read('new.txt')).toBe('new file\n');
    expect(git('show', ':tracked.txt')).toBe('staged after');
  });

  it('runs commit hooks, keeps their output private, and refuses signed commits before hooks run', async () => {
    const original = await initialCommit();
    await mkdir(join(root, 'hooks'));
    git('config', 'core.hooksPath', 'hooks');
    const hook = join(root, 'hooks', 'pre-commit');
    await writeFile(hook, '#!/bin/sh\necho private-hook-output >&2\nexit 13\n', { mode: 0o755 });
    await write('tracked.txt', 'staged');
    ok(await service.stage(ctx(), 'tracked.txt', true));
    // A checkpoint creates refs, but must not run the repository hook.
    const referenceHook = join(root, 'hooks', 'reference-transaction');
    await writeFile(referenceHook, '#!/bin/sh\nexit 14\n', { mode: 0o755 });
    await checkpoint();
    await rm(referenceHook);
    expect(await service.commit(ctx(), 'Hook rejects this')).toEqual({
      ok: false,
      error: 'hook-failed',
    });
    expect(git('rev-parse', 'HEAD')).toBe(original);
    // Hooks see the user's usual pathspec semantics, not the app's literal ones.
    await writeFile(hook, '#!/bin/sh\necho "ran ${GIT_LITERAL_PATHSPECS:-glob}" > hook-marker\n', {
      mode: 0o755,
    });
    git('config', 'commit.gpgsign', 'true');
    expect(await service.commit(ctx(), 'Signed commit')).toEqual({
      ok: false,
      error: 'signing-required',
    });
    await expect(read('hook-marker')).rejects.toMatchObject({ code: 'ENOENT' });
    git('config', 'commit.gpgsign', 'false');
    ok(await service.commit(ctx(), 'Allowed by the hook'));
    expect(await read('hook-marker')).toBe('ran glob\n');
  });

  it(
    'prunes checkpoints and recoveries to the newest 20 and 30 refs for each workspace',
    { timeout: 60_000 },
    async () => {
      await initialCommit();
      const run = (await openRepository(root))!;
      const tree = git('rev-parse', 'HEAD^{tree}');
      const trees = { index: tree, worktree: tree };
      const other = 'b'.repeat(64);
      const separate = await saveCheckpoint(run, other, trees);
      for (const [recovery, count, limit] of [
        [false, 25, 20],
        [true, 32, 30],
      ] as const) {
        const saved = [];
        for (let i = 0; i < count; i += 1) {
          saved.push((await saveCheckpoint(run, workspaceId, trees, recovery)).id);
        }
        const prefix = `refs/control-center/${recovery ? 'recovery' : 'checkpoints'}/${workspaceId}/`;
        const actual = git('for-each-ref', '--format=%(refname)', prefix)
          .split('\n')
          .map((ref) => ref.slice(prefix.length));
        expect(actual.sort()).toEqual(saved.slice(-limit).sort());
        if (recovery) {
          expect(ok(await service.status(ctx())).recovery.map(({ id }) => id)).toEqual(
            saved.slice(-limit).reverse(),
          );
        }
      }
      expect(git('rev-parse', '--verify', checkpointRef(other, separate.id))).toBeTruthy();
    },
  );

  it('reads tree modes only for changed paths and checks all four trees', async () => {
    await initialCommit();
    const git = vi.fn(async ([command, ...args]: string[]) => {
      if (command === 'diff') return 'tracked.txt\0';
      if (command === 'ls-tree') {
        const mode = args.includes('target-index') ? '120000' : '100644';
        return `${mode} blob object\ttracked.txt\0`;
      }
      throw new Error('Unexpected Git command');
    });
    await expect(
      restorePlan(
        git,
        root,
        { index: 'current-index', worktree: 'current-worktree' },
        { index: 'target-index', worktree: 'target-worktree' },
      ),
    ).rejects.toMatchObject({ reason: 'unsupported' });
    expect(git.mock.calls.filter(([args]) => args[0] === 'ls-tree').map(([args]) => args)).toEqual(
      ['current-worktree', 'target-worktree', 'current-index', 'target-index'].map((tree) => [
        'ls-tree',
        '-r',
        '-z',
        tree,
        '--',
        'tracked.txt',
      ]),
    );
  });

  it('revalidates ignored files after preview even when both snapshot trees still match', async () => {
    await initialCommit();
    await write('private.txt', 'included before');
    const saved = await checkpoint();
    await rm(join(root, 'private.txt'));
    await write('.git/info/exclude', 'private.txt');
    const preview = ok(await service.preview(ctx(), saved.id));
    await write('private.txt', 'ignored after preview');
    expect(await service.restore(ctx(), preview.token)).toEqual({ ok: false, error: 'stale' });
    expect(await read('private.txt')).toBe('ignored after preview\n');
  });

  it('restores a single path and requires a fresh preview after further edits', async () => {
    await initialCommit();
    const saved = await checkpoint();
    await write('tracked.txt', 'modified');
    await write('unrelated.txt', 'keep this');
    const { token } = ok(await service.preview(ctx(), saved.id, 'tracked.txt'));
    await write('tracked.txt', 'edited again');
    expect(await service.restore(ctx(), token)).toEqual({ ok: false, error: 'stale' });
    const scoped = ok(await service.preview(ctx(), saved.id, 'tracked.txt'));
    expect(scoped.files).toEqual(['tracked.txt']);
    ok(await service.restore(ctx(), scoped.token));
    expect(await read('tracked.txt')).toBe('original\n');
    expect(await read('unrelated.txt')).toBe('keep this\n');
  });

  it('supports a repository before its first commit', async () => {
    const saved = await checkpoint();
    await write('draft.txt', 'first file');
    ok(await service.stage(ctx(), 'draft.txt', true));
    const preview = ok(await service.preview(ctx(), saved.id));
    ok(await service.restore(ctx(), preview.token));
    expect(ok(await service.status(ctx()))).toMatchObject({ head: null, files: [], commits: [] });
  });

  it('refuses path traversal, repository filters and writes while Claude is active', async () => {
    await initialCommit();
    await writeFile(join(directory, 'outside.txt'), 'private outside');
    await symlink(directory, join(root, 'junction'), 'junction');
    for (const path of [
      '../outside.txt',
      'junction/outside.txt',
      '.git/config',
      'tracked.txt:stream',
    ]) {
      expect(await service.stage(ctx(), path, true)).toEqual({ ok: false, error: 'unsupported' });
    }
    await rm(join(root, 'junction'));
    git('config', 'filter.external.clean', 'exit 13');
    git('config', 'filter.external.required', 'true');
    await write('.gitattributes', '*.txt filter=external');
    await write('tracked.txt', 'filtered');
    expect((await service.status(ctx())).ok).toBe(true);
    expect(await service.stage(ctx(), 'tracked.txt', true)).toEqual({
      ok: false,
      error: 'unsupported',
    });
    await expect(checkpoint()).rejects.toMatchObject({ reason: 'unsupported' });
    expect(await service.stage({ ...ctx(), busy: () => true }, 'tracked.txt', true)).toEqual({
      ok: false,
      error: 'busy',
    });
    expect(git('diff', '--cached', '--name-only')).toBe('');
  });

  it('leaves the repository unchanged when a later ignored file occupies a restore target', async () => {
    await initialCommit();
    await write('private.txt', 'included before');
    const saved = await checkpoint();
    await write('.gitignore', 'private.txt');
    await write('private.txt', 'ignored now');
    expect(await service.preview(ctx(), saved.id)).toEqual({ ok: false, error: 'stale' });
    expect(await read('private.txt')).toBe('ignored now\n');
  });

  it('accepts native linked worktrees and rejects a gitfile borrowing another repository', async () => {
    await initialCommit();
    const linked = join(directory, 'linked');
    git('worktree', 'add', '--detach', linked);
    const detached = { ...ctx(), root: await realpath(linked), workspaceId: 'b'.repeat(64) };
    expect(ok(await service.status(detached)).branch).toBeNull();
    const saved = await service.checkpoint(detached.root, detached.workspaceId, () => true, true);
    expect(saved).toBeTruthy();
    expect(await service.preview(ctx(), saved!.id)).toEqual({ ok: false, error: 'stale' });

    const fake = join(directory, 'fake');
    await mkdir(fake);
    await writeFile(join(fake, '.git'), `gitdir: ${join(root, '.git')}\n`);
    expect(await service.status({ ...ctx(), root: fake })).toEqual({
      ok: false,
      error: 'unsupported',
    });
  });
});
