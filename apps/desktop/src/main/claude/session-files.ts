// The temporary files of one Claude session, in the app's data folder (never in ~/.claude or in
// the workspace): `bridge.json` (pipe name and token, read by the hook script) and
// `settings.json` (the hooks, passed to `claude --settings`). They are removed when the session
// closes; folders left by a crash are removed at the next start.
import { lstat, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BRIDGE_FILE, type BridgeConfig, type HookEventName } from '@control-center/hooks-bridge';

export const SESSIONS_DIR = 'claude-sessions';
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
  /** `settings.json` for `--settings`, or undefined when the session runs without hooks. */
  settingsFile: string | undefined;
  remove(): Promise<void>;
}

/** Creates the session folder. `hooks` undefined: no hooks, no bridge file. */
export async function writeSessionFiles(
  dataDir: string,
  sessionId: string,
  hooks: { runner: HookRunner; config: BridgeConfig } | undefined,
): Promise<SessionFiles> {
  if (!SESSION_ID.test(sessionId)) throw new Error('Invalid session id');
  const root = join(dataDir, SESSIONS_DIR);
  await mkdir(root, { recursive: true });
  if ((await lstat(root)).isSymbolicLink()) throw new Error('Sessions folder is a link');
  const dir = join(root, sessionId);
  await mkdir(dir); // fails if it exists: a session folder is never reused
  const remove = () => rm(dir, { recursive: true, force: true });
  try {
    let settingsFile: string | undefined;
    const bridgeFile = join(dir, BRIDGE_FILE);
    const command = hooks && hookCommand(hooks.runner, bridgeFile);
    if (hooks && command) {
      await writeFile(bridgeFile, JSON.stringify(hooks.config), { flag: 'wx', mode: 0o600 });
      settingsFile = join(dir, 'settings.json');
      await writeFile(settingsFile, JSON.stringify(hookSettings(command), null, 2), {
        flag: 'wx',
        mode: 0o600,
      });
    }
    return { dir, settingsFile, remove };
  } catch (error) {
    await remove();
    throw error;
  }
}

/** Removes session folders left behind (the app crashed or was killed). Returns how many. */
export async function removeStaleSessions(dataDir: string): Promise<number> {
  const root = join(dataDir, SESSIONS_DIR);
  let names: string[];
  try {
    if ((await lstat(root)).isSymbolicLink()) return 0;
    names = await readdir(root);
  } catch {
    return 0;
  }
  const stale = names.filter((n) => SESSION_ID.test(n));
  await Promise.all(stale.map((n) => rm(join(root, n), { recursive: true, force: true })));
  return stale.length;
}
