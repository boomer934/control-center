// Finding `codex` (phase 5f.1, ADR 0018), started without a shell like `claude`:
//
// 1. the user's PATH, as a terminal would: `codex.exe`, or the npm shim `codex.cmd`, whose
//    `bin/codex.js` runs with Node (a `.cmd` cannot start without a shell);
// 2. the Codex desktop app (Microsoft Store package `OpenAI.Codex`, publisher id pinned), which
//    ships `app\resources\codex.exe`. Its folder under `WindowsApps` cannot be listed by a normal
//    user, so the package's full name is read from the per-user package repository in the
//    registry (`reg.exe query`, absolute path, fixed arguments) and the path is built from it.
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { delimiter, isAbsolute, join, win32 } from 'node:path';
import { findOnPath, type Program } from '../claude/cli';

/** Codex CLI versions the session and its normalizer were checked against (manual real run). */
export const TESTED_CODEX_VERSIONS: readonly string[] = ['0.171.0-alpha.13.2'];

/** The Store package of the Codex app, by OpenAI's publisher id. */
export const CODEX_PACKAGE =
  /^OpenAI\.Codex_(\d{1,5}(?:\.\d{1,5}){3})_(?:x64|arm64)__2p2nqsd0c76g0$/;

const PACKAGES_KEY =
  'HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages';

const isFile = (p: string) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

const compareVersions = (a: string, b: string) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 4; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

/**
 * The Codex app packages among the key names `reg query` printed, newest first. Anything that is
 * not exactly a package of the pinned publisher is ignored.
 */
export function codexPackages(regOutput: string): string[] {
  const found: { name: string; version: string }[] = [];
  for (const line of regOutput.split(/\r?\n/)) {
    const name = line.trim().split('\\').pop() ?? '';
    const match = CODEX_PACKAGE.exec(name);
    if (!match?.[1] || found.some((p) => p.name === name)) continue;
    found.push({ name, version: match[1] });
  }
  return found.sort((a, b) => compareVersions(b.version, a.version)).map((p) => p.name);
}

/** `codex.exe` inside a Store package, under the system's own Program Files. */
export function packagedCodexPath(packageName: string, env: NodeJS.ProcessEnv): string | undefined {
  if (!CODEX_PACKAGE.test(packageName)) return undefined;
  const programFiles = env.ProgramW6432 ?? env.ProgramFiles;
  if (!programFiles || !win32.isAbsolute(programFiles)) return undefined;
  return win32.join(programFiles, 'WindowsApps', packageName, 'app', 'resources', 'codex.exe');
}

/**
 * `codex` on the PATH, without a shell, or undefined. Like a terminal, the first usable entry
 * wins: an npm shim whose script or Node is missing does not stop the search.
 */
export function resolveCodexOnPath(env: NodeJS.ProcessEnv = process.env): Program | undefined {
  const path = env.Path ?? env.PATH ?? '';
  for (const entry of path.split(delimiter)) {
    const dir = entry.trim().replace(/^"(.*)"$/, '$1');
    // relative PATH entries would resolve against the app's own folder: never trust them
    if (!dir || !isAbsolute(dir)) continue;
    const exe = join(dir, 'codex.exe');
    if (isFile(exe)) return { command: exe, args: [] };
    if (!isFile(join(dir, 'codex.cmd'))) continue;
    // npm shim: <prefix>/codex.cmd → <prefix>/node_modules/@openai/codex/bin/codex.js
    const script = win32.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    const node = findOnPath(['node.exe'], env);
    if (node && existsSync(script)) return { command: node, args: [script] };
  }
  return undefined;
}

type RunReg = (file: string, args: readonly string[]) => Promise<string>;
const defaultRunReg: RunReg = (file, args) =>
  new Promise((resolve) => {
    execFile(
      file,
      [...args],
      { windowsHide: true, timeout: 5000, maxBuffer: 256 * 1024 },
      (error, stdout) => resolve(error ? '' : String(stdout)),
    );
  });

/** How to start `codex` without a shell: PATH first, then the Codex app; undefined if neither. */
export async function resolveCodex(
  env: NodeJS.ProcessEnv = process.env,
  runReg: RunReg = defaultRunReg,
  exists: (path: string) => boolean = isFile,
): Promise<Program | undefined> {
  const onPath = resolveCodexOnPath(env);
  if (onPath) return onPath;
  const systemRoot = env.SystemRoot ?? env.windir;
  if (process.platform !== 'win32' || !systemRoot || !win32.isAbsolute(systemRoot))
    return undefined;
  const reg = win32.join(systemRoot, 'System32', 'reg.exe');
  const output = await runReg(reg, ['query', PACKAGES_KEY, '/f', 'OpenAI.Codex_', '/k']);
  // newest first; a package whose executable is missing (half-removed, staged) is skipped
  for (const name of codexPackages(output)) {
    const path = packagedCodexPath(name, env);
    if (path && exists(path)) return { command: path, args: [] };
  }
  return undefined;
}

/** `vernier/0.171.0-alpha.13.2 (Windows …)` (the `initialize` user agent) → the CLI version. */
export function codexVersion(userAgent: string): string | undefined {
  const match = /^[^/\s]+\/(\d+\.\d+\.\d+[0-9A-Za-z.+-]*)/.exec(userAgent);
  return match?.[1]?.slice(0, 40);
}
