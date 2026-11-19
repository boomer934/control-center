import { execFile } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  GitOidSchema,
  GitPathSchema,
  type GitError,
  type GitPatch,
} from '@control-center/ipc-contract';
import { findOnPath } from '../claude/cli';
import { isPlainSegment } from '../workspace/paths';

const NULL_DEVICE = process.platform === 'win32' ? 'NUL' : '/dev/null';
const MAX_OUTPUT = 8 * 1024 * 1024;
const PATCH_LIMIT = 250_000;
export const DIFF_FLAGS = [
  '--no-ext-diff',
  '--no-textconv',
  '--no-color',
  '--no-renames',
  '--ignore-submodules=all',
];

export class GitFailure extends Error {
  constructor(readonly reason: GitError) {
    super(reason);
  }
}

export function fail(reason: GitError): never {
  throw new GitFailure(reason);
}

export function oid(text: string): string {
  const value = GitOidSchema.safeParse(text.trim());
  if (!value.success) fail('failed');
  return value.data;
}

export function patch(text: string): GitPatch {
  return { text: text.slice(0, PATCH_LIMIT), truncated: text.length > PATCH_LIMIT };
}

export function nulList(text: string): string[] {
  return text ? text.slice(0, -1).split('\0') : [];
}

export function pathInput(paths: readonly string[]): string {
  return paths.map((name) => name + '\0').join('');
}

export type RunGit = (
  args: string[],
  options?: { index?: string; input?: string; allowOne?: boolean; commitHooks?: boolean },
) => Promise<string>;

function runner(cwd: string): RunGit {
  const executable = findOnPath(process.platform === 'win32' ? ['git.exe'] : ['git']);
  if (!executable) fail('git-unavailable');
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^(GIT_|ELECTRON_)/i.test(key)),
  );
  Object.assign(env, {
    GIT_LITERAL_PATHSPECS: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_LAZY_FETCH: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
  });
  // The commit takes no pathspec. Its hooks run their own Git commands, which should
  // match the user's terminal, where glob pathspecs keep their usual meaning.
  const { GIT_LITERAL_PATHSPECS: _literal, ...hookEnv } = env;
  return (args, { index, input, allowOne, commitHooks } = {}) =>
    new Promise((accept, reject) => {
      const child = execFile(
        executable,
        [
          '--no-pager',
          '-c',
          'core.fsmonitor=false',
          '-c',
          'core.protectNTFS=true',
          '-c',
          'core.protectHFS=true',
          '-c',
          'log.showSignature=false',
          ...(commitHooks ? [] : ['-c', `core.hooksPath=${NULL_DEVICE}`]),
          '-c',
          'maintenance.auto=false',
          '-c',
          'gc.auto=0',
          '-c',
          'submodule.recurse=false',
          ...(index ? ['-c', 'core.splitIndex=false'] : []),
          ...args,
        ],
        {
          cwd,
          env: index ? { ...env, GIT_INDEX_FILE: index } : commitHooks ? hookEnv : env,
          windowsHide: true,
          // Hooks such as linters can run for minutes. Killing Git mid-commit would leave
          // index.lock behind, so the commit gets a longer budget than the other commands.
          timeout: commitHooks ? 300_000 : 30_000,
          maxBuffer: MAX_OUTPUT,
          encoding: 'utf8',
        },
        (error, stdout) => {
          // Error messages from Git can contain paths, URLs and arbitrary repository content.
          if (!error || (allowOne && error.code === 1)) accept(stdout);
          else if (commitHooks && error.code === 1) reject(new GitFailure('hook-failed'));
          else if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
            reject(new GitFailure('too-large'));
          else reject(new GitFailure('failed'));
        },
      );
      child.stdin?.on('error', () => undefined);
      child.stdin?.end(input);
    });
}

export async function openRepository(root: string): Promise<RunGit | null> {
  const marker = join(root, '.git');
  const metadata = await lstat(marker).catch(missing);
  if (!metadata) return null;
  if (metadata.isSymbolicLink() || (!metadata.isFile() && !metadata.isDirectory()))
    fail('unsupported');
  const git = runner(root);
  const [top, local, shared] = (
    await git([
      'rev-parse',
      '--path-format=absolute',
      '--show-toplevel',
      '--git-dir',
      '--git-common-dir',
    ])
  )
    .trimEnd()
    .split(/\r?\n/);
  if (!top || !local || !shared) fail('unsupported');
  if (relative(root, await realpath(top.trimEnd())) !== '') fail('unsupported');
  const [gitDir, commonDir] = await Promise.all([realpath(local), realpath(shared)]);
  if (metadata.isDirectory()) {
    if (relative(marker, gitDir) !== '' || relative(marker, commonDir) !== '') fail('unsupported');
  } else {
    // Linked worktrees have a back-reference in <common-dir>/worktrees/<name>/gitdir.
    // An arbitrary gitfile must not give the panel write access to another index or branch.
    if (relative(join(commonDir, 'worktrees'), dirname(gitDir)) !== '') fail('unsupported');
    const backlink = join(gitDir, 'gitdir');
    const link = await lstat(backlink).catch(missing);
    if (!link?.isFile() || link.size > 8192) fail('unsupported');
    const destination = (await readFile(backlink, 'utf8')).trimEnd();
    if (relative(marker, resolve(gitDir, destination)) !== '') fail('unsupported');
  }
  return withoutFilters(git);
}

export async function checkWritable(git: RunGit): Promise<void> {
  const sparse = await git(['config', '--type=bool', '--get', 'core.sparseCheckout'], {
    allowOne: true,
  });
  if (sparse.trim() === 'true') fail('unsupported');
}

async function withoutFilters(git: RunGit): Promise<RunGit> {
  const keys = await git(
    [
      'config',
      '--null',
      '--name-only',
      '--get-regexp',
      '^filter[.].*[.](clean|smudge|process|required)$',
    ],
    { allowOne: true },
  );
  const overrides = nulList(keys).flatMap((key) => [
    '-c',
    key + (key.endsWith('.required') ? '=false' : '='),
  ]);
  return (args, options) => git([...overrides, ...args], options);
}

export async function checkFilters(git: RunGit, names: string, tree?: string): Promise<void> {
  if (!names) return;
  const attrs = nulList(
    await git(['check-attr', ...(tree ? [`--source=${tree}`] : []), '-z', '--stdin', 'filter'], {
      input: names,
    }),
  );
  for (let i = 2; i < attrs.length; i += 3) {
    if (attrs[i] !== 'unspecified' && attrs[i] !== 'unset') fail('unsupported');
  }
}

function missing(error: unknown): null {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
  throw error;
}

/** Git paths are literal and relative. Never traverse junctions, symlinks or device aliases. */
export async function checkPath(root: string, name: string, write = false): Promise<boolean> {
  const parts = name.split('/');
  if (
    !GitPathSchema.safeParse(name).success ||
    isAbsolute(name) ||
    parts.some(
      (part) => !part || !isPlainSegment(part) || /^[.]{1,2}$|^\.git$|[\\\ufffd]/iu.test(part),
    )
  )
    fail('unsupported');
  let directory = root;
  for (const [position, part] of parts.entries()) {
    directory = join(directory, part);
    const stat = await lstat(directory).catch(missing);
    if (!stat) return false;
    if (stat.isSymbolicLink()) fail('unsupported');
    if (position === parts.length - 1) {
      if (!stat.isFile() || (write && stat.nlink > 1)) fail('unsupported');
      return true;
    }
    if (!stat.isDirectory() || (await lstat(join(directory, '.git')).catch(missing))) {
      fail('unsupported');
    }
  }
  return false;
}

export async function untrackedDiff(root: string, git: RunGit, name: string) {
  if (!(await checkPath(root, name))) fail('stale');
  return git(['diff', '--no-index', ...DIFF_FLAGS, '--', '/dev/null', name], { allowOne: true });
}
