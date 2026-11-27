// The temporary files of one Claude session, in the app's data folder (never in ~/.claude or in
// the workspace). The only file is `bridge.json` (pipe name and token, read by the hook script);
// the hooks themselves go to `claude --settings` as inline JSON, so no settings file exists on
// disk. The folder is removed when the session closes; folders left by a crash are removed the
// next time the app starts.
import { lstat, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BRIDGE_FILE, type BridgeConfig, type HookEventName } from '@control-center/hooks-bridge';

export const SESSIONS_DIR = 'claude-sessions';
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Retries for removing a folder a process may still hold for a moment (EBUSY, EPERM). */
const RM_OPTIONS = { recursive: true, force: true, maxRetries: 5, retryDelay: 100 } as const;

/** How Claude Code starts the hook script. */
export interface HookRunner {
  node: string;
  script: string;
}

/** The hooks the app listens to; tool hooks match every tool. */
const HOOKS: ReadonlyArray<[HookEventName, boolean]> = [
  ['SessionStart', false],
  ['UserPromptSubmit', false],
  ['PreToolUse', true],
  ['PostToolUse', true],
  ['PostToolUseFailure', true],
  ['Notification', false],
  ['Stop', false],
  ['SubagentStop', false],
  ['SessionEnd', false],
];

/**
 * Claude Code runs a hook command through a shell (Git Bash or cmd on Windows), so each path is
 * double-quoted with forward slashes, and a path with a character either shell would interpret
 * inside quotes is refused rather than escaped.
 */
const SHELL_SAFE = /^[A-Za-z]:[\\/][^"%$`!\r\n\0^&|<>]*$/;

export function hookCommand(runner: HookRunner, bridgeFile: string): string | undefined {
  const parts = [runner.node, runner.script, bridgeFile];
  if (!parts.every((p) => SHELL_SAFE.test(p))) return undefined;
  return parts.map((p) => `"${p.replace(/\\/g, '/')}"`).join(' ');
}

export function hookSettings(command: string): object {
  const hooks: Record<string, unknown[]> = {};
  for (const [event, tools] of HOOKS) {
    const entry = { hooks: [{ type: 'command', command, timeout: 10 }] };
    hooks[event] = [tools ? { matcher: '*', ...entry } : entry];
  }
  return { hooks };
}

export interface SessionFiles {
  dir: string;
  /** Where the hook script reads the pipe name and token, once `writeBridge` has run. */
  bridgeFile: string;
  /** Writes `bridge.json`: call it only once the pipe is listening. */
  writeBridge(config: BridgeConfig): Promise<void>;
  remove(): Promise<void>;
}

/** Creates the session's own folder, empty. */
export async function createSessionDir(dataDir: string, sessionId: string): Promise<SessionFiles> {
  if (!SESSION_ID.test(sessionId)) throw new Error('Invalid session id');
  const root = join(dataDir, SESSIONS_DIR);
  await mkdir(root, { recursive: true });
  if ((await lstat(root)).isSymbolicLink()) throw new Error('Sessions folder is a link');
  const dir = join(root, sessionId);
  await mkdir(dir); // fails if it exists: a session folder is never reused
  const bridgeFile = join(dir, BRIDGE_FILE);
  return {
    dir,
    bridgeFile,
    writeBridge: (config) =>
      writeFile(bridgeFile, JSON.stringify(config), { flag: 'wx', mode: 0o600 }),
    remove: () => rm(dir, RM_OPTIONS),
  };
}

export interface StaleCleanup {
  removed: number;
  /** Folders that could not be removed (still held by a process, permissions). */
  failed: number;
}

/** Removes session folders left behind (the app crashed or was killed). */
export async function removeStaleSessions(dataDir: string): Promise<StaleCleanup> {
  const root = join(dataDir, SESSIONS_DIR);
  let names: string[];
  try {
    if ((await lstat(root)).isSymbolicLink()) return { removed: 0, failed: 0 };
    names = await readdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { removed: 0, failed: 0 };
    throw error;
  }
  const stale = names.filter((n) => SESSION_ID.test(n));
  const results = await Promise.allSettled(stale.map((n) => rm(join(root, n), RM_OPTIONS)));
  const failed = results.filter((r) => r.status === 'rejected').length;
  return { removed: stale.length - failed, failed };
}
