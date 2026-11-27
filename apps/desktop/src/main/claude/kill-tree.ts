// Ending a Claude run together with what it started (hook scripts, the commands of the agent's
// tools): on Windows killing the process alone would leave its children running in the workspace.
//
// `taskkill /T` follows the parent links that still exist, so a process whose parent already
// exited (or one started detached) escapes it; only a Job Object would hold the whole tree (see
// SICUREZZA.md). A failed taskkill is retried once, then reported and the run's own process
// killed. taskkill names the run by PID, and Windows reuses a PID once its process is gone: no
// attempt starts after the run's process has exited, and a pending retry is cancelled when it
// exits.
import { execFile, execFileSync, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

/** taskkill's exit code when the process is gone already: nothing left to end. */
export const TASKKILL_NOT_FOUND = 128;
export const TASKKILL_TIMEOUT_MS = 5000;
export const TASKKILL_RETRY_MS = 250;

/** What a failed taskkill reports: `code` from execFile, `status` from execFileSync. */
export interface TaskkillError {
  code?: unknown;
  status?: unknown;
}

export interface TaskkillOptions {
  windowsHide: true;
  timeout: number;
}

export type RunTaskkill = (
  file: string,
  args: string[],
  options: TaskkillOptions,
  callback: (error: TaskkillError | null) => void,
) => { kill(): unknown };

export type RunTaskkillSync = (
  file: string,
  args: string[],
  options: TaskkillOptions & { stdio: 'ignore' },
) => unknown;

export interface KillTreeOptions {
  /** The app is quitting: taskkill runs synchronously, an asynchronous one would never run. */
  wait?: boolean;
  /** Test seams. */
  platform?: NodeJS.Platform;
  run?: RunTaskkill;
  runSync?: RunTaskkillSync;
  retryMs?: number;
}

/** One teardown of one run. */
export interface Teardown {
  /** Settles when the teardown is over: taskkill succeeded, gave up, or was cancelled. */
  readonly done: Promise<void>;
  /** Stops the pending retry and the taskkill still running, without reporting anything. */
  cancel(): void;
  /**
   * Like cancel, then, if the run's process is still alive (or an attempt had already failed),
   * reports the failure and kills the run's own process.
   */
  abandon(): void;
}

const defaultRun: RunTaskkill = (file, args, options, callback) =>
  execFile(file, args, options, (error) => callback(error));
const defaultRunSync: RunTaskkillSync = (file, args, options) => execFileSync(file, args, options);

export function killTree(
  child: ChildProcess,
  onFailure: () => void,
  options: KillTreeOptions = {},
): Teardown {
  const alive = () => child.exitCode === null && child.signalCode === null;
  const pid = child.pid;
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32' || pid === undefined) {
    child.kill();
    return { done: Promise.resolve(), cancel: () => {}, abandon: () => {} };
  }
  // full path: never a taskkill found on PATH or in the workspace
  const taskkill = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe');
  const args = ['/PID', String(pid), '/T', '/F'];
  const settings: TaskkillOptions = { windowsHide: true, timeout: TASKKILL_TIMEOUT_MS };

  let finished = false;
  let failedOnce = false;
  let retry: NodeJS.Timeout | undefined;
  let running: { kill(): unknown } | undefined;
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => (resolveDone = resolve));

  const onExit = () => {
    // the PID may be reused from now on: a retry would name another process
    if (retry === undefined) return; // an attempt still running settles by itself
    clearTimeout(retry);
    retry = undefined;
    settle(true);
  };
  const cancel = () => {
    if (finished) return;
    finished = true;
    clearTimeout(retry);
    retry = undefined;
    running?.kill();
    running = undefined;
    child.off('exit', onExit);
    resolveDone();
  };
  /** Ends the teardown; `failed` reports it and kills the run's own process if still alive. */
  const settle = (failed: boolean) => {
    if (finished) return;
    const stillAlive = alive();
    cancel();
    if (!failed) return;
    try {
      onFailure();
    } finally {
      if (stillAlive) child.kill();
    }
  };

  if (options.wait) {
    const runSync = options.runSync ?? defaultRunSync;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!alive()) {
        settle(failedOnce);
        return { done, cancel, abandon: cancel };
      }
      try {
        runSync(taskkill, args, { ...settings, stdio: 'ignore' });
        settle(false);
        return { done, cancel, abandon: cancel };
      } catch (error) {
        if ((error as TaskkillError).status === TASKKILL_NOT_FOUND) {
          settle(false);
          return { done, cancel, abandon: cancel };
        }
        failedOnce = true;
      }
    }
    settle(true);
    return { done, cancel, abandon: cancel };
  }

  const run = options.run ?? defaultRun;
  const attempt = () => {
    retry = undefined;
    if (finished) return;
    if (!alive()) return settle(failedOnce);
    running = run(taskkill, args, settings, (error) => {
      running = undefined;
      if (finished) return;
      if (!error || error.code === TASKKILL_NOT_FOUND) return settle(false);
      if (failedOnce || !alive()) return settle(true);
      failedOnce = true;
      retry = setTimeout(attempt, options.retryMs ?? TASKKILL_RETRY_MS);
    });
  };
  child.on('exit', onExit);
  attempt();
  return {
    done,
    cancel,
    abandon: () => settle(failedOnce || alive()),
  };
}
