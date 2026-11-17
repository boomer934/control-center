// Finding the programs a Claude session needs: the `claude` CLI and, for the hooks bridge, Node.
//
// Both are looked up on the user's PATH, as a terminal would, and started without a shell: the
// native installer gives `claude.exe`; an npm install gives a `claude.cmd` shim, which cannot be
// started without a shell, so its `cli.js` is run with Node instead.
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, win32 } from 'node:path';

export interface Program {
  command: string;
  /** Arguments that come before the app's own (e.g. the script of an npm install). */
  args: readonly string[];
}

/**
 * Claude Code versions the normalizers were checked against: the recorded fixtures (2.1.322) and
 * the manual smoke run of `real-claude.smoke.test.ts` (2.1.326).
 */
export const TESTED_CLAUDE_VERSIONS: readonly string[] = ['2.1.322', '2.1.326'];

/** The hook script runs from TypeScript source: Node strips the types by itself from 22.18. */
export const MIN_NODE_FOR_HOOKS: readonly [number, number] = [22, 18];

const isFile = (p: string) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Absolute path of the first `names` entry found in a PATH directory, in PATH order. */
export function findOnPath(
  names: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const path = env.Path ?? env.PATH ?? '';
  for (const dir of path.split(delimiter)) {
    const d = dir.trim().replace(/^"(.*)"$/, '$1');
    // relative PATH entries would resolve against the app's own folder: never trust them
    if (!d || !isAbsolute(d)) continue;
    for (const name of names) {
      const candidate = join(d, name);
      if (isFile(candidate)) return candidate;
    }
  }
  return undefined;
}

/** How to start `claude` without a shell, or undefined if it is not installed. */
export function resolveClaude(env: NodeJS.ProcessEnv = process.env): Program | undefined {
  const found = findOnPath(['claude.exe', 'claude.cmd'], env);
  if (!found) return undefined;
  if (found.toLowerCase().endsWith('.exe')) return { command: found, args: [] };
  // npm shim: <prefix>/claude.cmd → <prefix>/node_modules/@anthropic-ai/claude-code/cli.js
  const script = win32.join(
    dirname(found),
    'node_modules',
    '@anthropic-ai',
    'claude-code',
    'cli.js',
  );
  const node = findOnPath(['node.exe'], env);
  if (!node || !existsSync(script)) return undefined;
  return { command: node, args: [script] };
}

/** `v22.18.0` → [22, 18]. */
export function parseNodeVersion(text: string): [number, number] | undefined {
  const m = /^v?(\d+)\.(\d+)\./.exec(text.trim());
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

export const nodeCanRunHooks = (version: readonly [number, number]): boolean =>
  version[0] > MIN_NODE_FOR_HOOKS[0] ||
  (version[0] === MIN_NODE_FOR_HOOKS[0] && version[1] >= MIN_NODE_FOR_HOOKS[1]);

/** Node on PATH, if it is recent enough to run the hook script. */
export function resolveHookNode(env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  const node = findOnPath(['node.exe'], env);
  if (!node) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    execFile(node, ['--version'], { windowsHide: true, timeout: 5000 }, (error, stdout) => {
      const version = error ? undefined : parseNodeVersion(stdout);
      resolve(version && nodeCanRunHooks(version) ? node : undefined);
    });
  });
}
