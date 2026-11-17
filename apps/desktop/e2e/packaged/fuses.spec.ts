// Electron Fuses of the packaged app (release/win-unpacked, built by `pnpm package:dir`).
// Playwright cannot attach to this binary (the inspector is fused off), so the tests read the
// fuse wire and probe the executable from outside.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FuseState, FuseV1Options, getCurrentFuseWire } from '@electron/fuses';
import { expect, test } from '@playwright/test';
import { APP_DIR, cleanEnv } from '../launch';

const UNPACKED = join(APP_DIR, 'release', 'win-unpacked');
const EXE_NAME = 'Control Center.exe';
const EXE = join(UNPACKED, EXE_NAME);

test.skip(process.platform !== 'win32', 'The packaged build is Windows-only until v1');
test.beforeAll(() => {
  if (!existsSync(EXE)) throw new Error(`Missing ${EXE}: run "pnpm package:dir" first`);
});

interface Probe {
  /** Still running when the observation window ended (i.e. it started as the GUI app). */
  running: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** Starts the executable, watches it for `ms`, then kills the whole process tree. */
async function probe(
  exe: string,
  args: string[],
  env: Record<string, string>,
  ms: number,
): Promise<Probe> {
  const child = spawn(exe, args, { env: cleanEnv(env), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
  child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
  const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  const result = await Promise.race([
    exited.then((code) => ({ running: false, exitCode: code })),
    new Promise<{ running: true; exitCode: null }>((resolve) =>
      setTimeout(() => resolve({ running: true, exitCode: null }), ms),
    ),
  ]);
  if (result.running && child.pid) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    await exited;
  }
  return { ...result, stdout, stderr };
}

test('the fuse wire has the values of the security checklist', async () => {
  const wire = await getCurrentFuseWire(EXE);
  expect({
    runAsNode: wire[FuseV1Options.RunAsNode],
    nodeOptionsEnv: wire[FuseV1Options.EnableNodeOptionsEnvironmentVariable],
    nodeCliInspect: wire[FuseV1Options.EnableNodeCliInspectArguments],
    asarIntegrity: wire[FuseV1Options.EnableEmbeddedAsarIntegrityValidation],
    onlyAsar: wire[FuseV1Options.OnlyLoadAppFromAsar],
    cookieEncryption: wire[FuseV1Options.EnableCookieEncryption],
    fileProtocolPrivileges: wire[FuseV1Options.GrantFileProtocolExtraPrivileges],
  }).toEqual({
    runAsNode: FuseState.DISABLE,
    nodeOptionsEnv: FuseState.DISABLE,
    nodeCliInspect: FuseState.DISABLE,
    asarIntegrity: FuseState.ENABLE,
    onlyAsar: FuseState.ENABLE,
    cookieEncryption: FuseState.ENABLE,
    fileProtocolPrivileges: FuseState.DISABLE,
  });
});

test('the app is packaged as an asar archive only', () => {
  expect(existsSync(join(UNPACKED, 'resources', 'app.asar'))).toBe(true);
  expect(existsSync(join(UNPACKED, 'resources', 'app'))).toBe(false);
});

test('ELECTRON_RUN_AS_NODE does not turn the app into a Node.js runtime', async () => {
  const r = await probe(
    EXE,
    ['-e', 'process.stdout.write("RAN_AS_NODE"); process.exit(7)'],
    { ELECTRON_RUN_AS_NODE: '1' },
    5000,
  );
  expect(r.stdout).not.toContain('RAN_AS_NODE');
  // It started as the GUI app (and stayed up) instead of running the script and exiting.
  expect(r.running).toBe(true);
});

test('--inspect does not open a debugger on the main process', async () => {
  const r = await probe(EXE, ['--inspect=0', '--inspect-brk=0'], {}, 5000);
  expect(r.stderr).not.toMatch(/Debugger listening/i);
  expect(r.running).toBe(true);
});

test('NODE_OPTIONS cannot preload code into the main process', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cc-fuses-'));
  try {
    const marker = join(dir, 'marker.txt');
    const script = join(dir, 'inject.js');
    writeFileSync(script, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'injected');`);
    const r = await probe(EXE, [], { NODE_OPTIONS: `--require "${script}"` }, 5000);
    expect(existsSync(marker)).toBe(false);
    expect(r.running).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a tampered app.asar is refused (embedded ASAR integrity)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cc-asar-'));
  try {
    const copy = join(dir, 'app');
    cpSync(UNPACKED, copy, { recursive: true });
    // Control: the untouched copy starts and stays up.
    const control = await probe(join(copy, EXE_NAME), [], {}, 5000);
    expect(control.running).toBe(true);

    const asar = join(copy, 'resources', 'app.asar');
    const bytes = readFileSync(asar);
    // Change a harmless log event name in the main bundle: without the integrity check the app
    // would start normally, so a refusal can only come from the check.
    const needle = Buffer.from('app-start');
    const at = bytes.indexOf(needle);
    expect(at, 'marker string not found in app.asar').toBeGreaterThan(0);
    Buffer.from('app-sTart').copy(bytes, at);
    writeFileSync(asar, bytes);

    const r = await probe(join(copy, EXE_NAME), [], {}, 10_000);
    expect(r.running).toBe(false);
    expect(r.exitCode).not.toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
