// killTree: one teardown per run. A failed taskkill is retried once, then reported and the run's
// own process killed; no attempt names a PID whose process has exited (Windows reuses PIDs).
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  killTree,
  TASKKILL_NOT_FOUND,
  TASKKILL_TIMEOUT_MS,
  type RunTaskkill,
  type TaskkillError,
  type TaskkillOptions,
} from './kill-tree';

/** A run's process that exits only when told to. */
function fakeChild() {
  const child = Object.assign(new EventEmitter(), {
    pid: 4242,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    killed: false,
    kill() {
      child.killed = true;
      return true;
    },
    exit(code = 0) {
      child.exitCode = code;
      child.emit('exit', code, null);
    },
  });
  return child;
}

interface Attempt {
  args: string[];
  options: TaskkillOptions;
  answer: (error: TaskkillError | null) => void;
  killed: boolean;
}

/** A taskkill that answers when the test says so. */
function fakeTaskkill() {
  const attempts: Attempt[] = [];
  const run: RunTaskkill = (_file, args, options, callback) => {
    const attempt: Attempt = { args, options, answer: callback, killed: false };
    attempts.push(attempt);
    return {
      kill: () => {
        attempt.killed = true;
      },
    };
  };
  return { attempts, run };
}

const asChild = (c: ReturnType<typeof fakeChild>) => c as unknown as ChildProcess;
const win = { platform: 'win32' as const, retryMs: 5 };

describe('killTree (Windows logic)', () => {
  it('runs one taskkill on the tree, with a timeout, and reports nothing when it works', async () => {
    const child = fakeChild();
    const { attempts, run } = fakeTaskkill();
    let failures = 0;
    const teardown = killTree(asChild(child), () => failures++, { ...win, run });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.args).toEqual(['/PID', '4242', '/T', '/F']);
    expect(attempts[0]?.options).toEqual({ windowsHide: true, timeout: TASKKILL_TIMEOUT_MS });
    attempts[0]?.answer(null);
    await teardown.done;
    expect(attempts).toHaveLength(1);
    expect(failures).toBe(0);
    expect(child.killed).toBe(false);
  });

  it('takes code 128 (process already gone) as done: no retry, no report', async () => {
    const child = fakeChild();
    const { attempts, run } = fakeTaskkill();
    let failures = 0;
    const teardown = killTree(asChild(child), () => failures++, { ...win, run });
    attempts[0]?.answer({ code: TASKKILL_NOT_FOUND });
    await teardown.done;
    await new Promise((r) => setTimeout(r, 30));
    expect(attempts).toHaveLength(1);
    expect(failures).toBe(0);
  });

  it('retries a timed-out taskkill once', async () => {
    const child = fakeChild();
    const { attempts, run } = fakeTaskkill();
    let failures = 0;
    const teardown = killTree(asChild(child), () => failures++, { ...win, run });
    attempts[0]?.answer({ code: null }); // execFile's error when the timeout killed taskkill
    await expect.poll(() => attempts.length).toBe(2);
    attempts[1]?.answer(null);
    await teardown.done;
    expect(failures).toBe(0);
  });

  it('after a second failure reports once and kills the process itself', async () => {
    const child = fakeChild();
    const { attempts, run } = fakeTaskkill();
    let failures = 0;
    const teardown = killTree(asChild(child), () => failures++, { ...win, run });
    attempts[0]?.answer({ code: 1 });
    await expect.poll(() => attempts.length).toBe(2);
    attempts[1]?.answer({ code: 1 });
    await teardown.done;
    await new Promise((r) => setTimeout(r, 30));
    expect(attempts).toHaveLength(2);
    expect(failures).toBe(1);
    expect(child.killed).toBe(true);
  });

  it('cancels the retry when the process exits: its PID may be reused', async () => {
    const child = fakeChild();
    const { attempts, run } = fakeTaskkill();
    let failures = 0;
    const teardown = killTree(asChild(child), () => failures++, {
      ...win,
      run,
      retryMs: 50,
    });
    attempts[0]?.answer({ code: 1 });
    child.exit();
    await teardown.done;
    await new Promise((r) => setTimeout(r, 100));
    expect(attempts).toHaveLength(1);
    expect(failures).toBe(1); // the tree may not be ended: say so
    expect(child.killed).toBe(false);
  });

  it('does not retry when the process exited while taskkill was running', async () => {
    const child = fakeChild();
    const { attempts, run } = fakeTaskkill();
    let failures = 0;
    const teardown = killTree(asChild(child), () => failures++, { ...win, run });
    child.exit();
    attempts[0]?.answer({ code: 1 });
    await teardown.done;
    await new Promise((r) => setTimeout(r, 30));
    expect(attempts).toHaveLength(1);
    expect(failures).toBe(1);
  });

  it('starts no taskkill for a process that has exited already', async () => {
    const child = fakeChild();
    child.exitCode = 0;
    const { attempts, run } = fakeTaskkill();
    let failures = 0;
    await killTree(asChild(child), () => failures++, { ...win, run }).done;
    expect(attempts).toHaveLength(0);
    expect(failures).toBe(0);
  });

  it('abandon stops the running taskkill, reports and kills the process', async () => {
    const child = fakeChild();
    const { attempts, run } = fakeTaskkill();
    let failures = 0;
    const teardown = killTree(asChild(child), () => failures++, { ...win, run });
    teardown.abandon();
    await teardown.done;
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.killed).toBe(true);
    expect(failures).toBe(1);
    expect(child.killed).toBe(true);
    attempts[0]?.answer({ code: 1 }); // a late answer changes nothing
    await new Promise((r) => setTimeout(r, 30));
    expect(attempts).toHaveLength(1);
    expect(failures).toBe(1);
  });

  it('abandon after a successful teardown does nothing', async () => {
    const child = fakeChild();
    const { attempts, run } = fakeTaskkill();
    let failures = 0;
    const teardown = killTree(asChild(child), () => failures++, { ...win, run });
    attempts[0]?.answer(null);
    await teardown.done;
    teardown.abandon();
    expect(failures).toBe(0);
    expect(child.killed).toBe(false);
  });

  it('cancel stops a pending retry without reporting', async () => {
    const child = fakeChild();
    const { attempts, run } = fakeTaskkill();
    let failures = 0;
    const teardown = killTree(asChild(child), () => failures++, { ...win, run, retryMs: 50 });
    attempts[0]?.answer({ code: 1 });
    teardown.cancel();
    await teardown.done;
    await new Promise((r) => setTimeout(r, 100));
    expect(attempts).toHaveLength(1);
    expect(failures).toBe(0);
  });

  describe('synchronously, when the app quits', () => {
    const syncRunner = (statuses: Array<number | null | undefined>) => {
      const calls: TaskkillOptions[] = [];
      const runSync = (_f: string, _a: string[], options: TaskkillOptions) => {
        calls.push(options);
        const status = statuses[calls.length - 1];
        if (status !== undefined) throw Object.assign(new Error('taskkill'), { status });
      };
      return { calls, runSync };
    };

    it('stops at the first success', () => {
      const child = fakeChild();
      const { calls, runSync } = syncRunner([undefined]);
      let failures = 0;
      killTree(asChild(child), () => failures++, { ...win, wait: true, runSync });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ timeout: TASKKILL_TIMEOUT_MS });
      expect(failures).toBe(0);
    });

    it('takes code 128 as done', () => {
      const child = fakeChild();
      const { calls, runSync } = syncRunner([TASKKILL_NOT_FOUND]);
      let failures = 0;
      killTree(asChild(child), () => failures++, { ...win, wait: true, runSync });
      expect(calls).toHaveLength(1);
      expect(failures).toBe(0);
    });

    it('retries a timeout once, then reports and kills the process', () => {
      const child = fakeChild();
      const { calls, runSync } = syncRunner([null, 1]);
      let failures = 0;
      killTree(asChild(child), () => failures++, { ...win, wait: true, runSync });
      expect(calls).toHaveLength(2);
      expect(failures).toBe(1);
      expect(child.killed).toBe(true);
    });
  });
});

// The real taskkill, on Windows only.
const systemRoot = process.env.SystemRoot;
const dirs: string[] = [];
afterEach(() => {
  process.env.SystemRoot = systemRoot;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Points killTree at a System32 without taskkill.exe. */
function brokenTaskkill() {
  const dir = mkdtempSync(join(tmpdir(), 'cc-kill-'));
  dirs.push(dir);
  process.env.SystemRoot = dir;
}

const sleeper = () =>
  spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60_000)'], { windowsHide: true });

describe.runIf(process.platform === 'win32')('killTree (real taskkill)', () => {
  it('ends the process tree and reports nothing when taskkill works', async () => {
    const child = sleeper();
    let failures = 0;
    const closed = new Promise((r) => child.on('close', r));
    const teardown = killTree(child, () => failures++);
    await Promise.all([closed, teardown.done]);
    expect(failures).toBe(0);
  });

  it('retries a taskkill that cannot run, then reports it and kills the process itself', async () => {
    const child = sleeper(); // before: Node itself needs a real SystemRoot to start
    brokenTaskkill();
    let failures = 0;
    const closed = new Promise((r) => child.on('close', r));
    const teardown = killTree(child, () => failures++);
    await Promise.all([closed, teardown.done]);
    expect(failures).toBe(1);
  });

  it('does the same synchronously when the app quits', async () => {
    const child = sleeper();
    brokenTaskkill();
    let failures = 0;
    const closed = new Promise((r) => child.on('close', r));
    killTree(child, () => failures++, { wait: true });
    expect(failures).toBe(1);
    await closed;
  });
});
