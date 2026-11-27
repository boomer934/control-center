// killTree's failure path: a taskkill that cannot run is retried, then reported, and the run's
// own process is killed anyway.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { killTree } from './session';

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

describe.runIf(process.platform === 'win32')('killTree', () => {
  it('ends the process tree and reports nothing when taskkill works', async () => {
    const child = sleeper();
    let failures = 0;
    const closed = new Promise((r) => child.on('close', r));
    killTree(child, () => failures++);
    await closed;
    expect(failures).toBe(0);
  });

  it('retries a failed taskkill, then reports it and kills the process itself', async () => {
    const child = sleeper(); // before: Node itself needs a real SystemRoot to start
    brokenTaskkill();
    let failures = 0;
    const closed = new Promise((r) => child.on('close', r));
    killTree(child, () => failures++);
    await closed;
    expect(failures).toBe(1);
  });

  it('does the same synchronously when the app quits', async () => {
    const child = sleeper(); // before: Node itself needs a real SystemRoot to start
    brokenTaskkill();
    let failures = 0;
    const closed = new Promise((r) => child.on('close', r));
    killTree(child, () => failures++, true);
    expect(failures).toBe(1);
    await closed;
  });
});
