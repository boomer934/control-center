import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  codexVersion,
  newestCodexPackage,
  packagedCodexPath,
  resolveCodex,
  resolveCodexOnPath,
} from './cli';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'cc-codex-cli-'));
  dirs.push(d);
  return d;
};

const KEY =
  'HKEY_CURRENT_USER\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages';
const REG = [
  '',
  `${KEY}\\OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt`,
  `${KEY}\\OpenAI.Codex_26.1120.6357.0_x64__2p2nqsd0c76g0`,
  `${KEY}\\OpenAI.Codex_26.999.1.0_x64__2p2nqsd0c76g0`,
  `${KEY}\\OpenAI.Codex_27.1.0.0_x64__0000000000000`,
  `${KEY}\\OpenAI.Codex_26.1120.6357.0_x64__2p2nqsd0c76g0\\..\\Evil`,
  'Fine della ricerca: 4 corrispondenze trovate.',
].join('\r\n');

describe('Codex app package', () => {
  it('picks the newest package of the pinned publisher only', () => {
    expect(newestCodexPackage(REG)).toBe('OpenAI.Codex_26.1120.6357.0_x64__2p2nqsd0c76g0');
    expect(newestCodexPackage('')).toBeUndefined();
  });

  it('builds the path under Program Files and refuses anything else', () => {
    const env = { ProgramW6432: 'C:\\Program Files', ProgramFiles: 'C:\\Program Files (x86)' };
    expect(packagedCodexPath('OpenAI.Codex_26.1120.6357.0_x64__2p2nqsd0c76g0', env)).toBe(
      'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1120.6357.0_x64__2p2nqsd0c76g0\\app\\resources\\codex.exe',
    );
    expect(packagedCodexPath('..\\..\\Windows', env)).toBeUndefined();
    expect(
      packagedCodexPath('OpenAI.Codex_26.1120.6357.0_x64__2p2nqsd0c76g0', {
        ProgramFiles: 'relative',
      }),
    ).toBeUndefined();
  });
});

describe('resolveCodex', () => {
  it('prefers codex.exe on the PATH, and skips relative PATH entries', async () => {
    const dir = temp();
    writeFileSync(join(dir, 'codex.exe'), '');
    const env = { Path: `relative;${dir}`, SystemRoot: 'C:\\Windows' };
    expect(resolveCodexOnPath(env)).toEqual({ command: join(dir, 'codex.exe'), args: [] });
    let asked = false;
    await resolveCodex(env, async () => ((asked = true), REG));
    expect(asked).toBe(false);
  });

  it('runs the npm shim script with node', () => {
    const bin = temp();
    const node = temp();
    writeFileSync(join(bin, 'codex.cmd'), '');
    writeFileSync(join(node, 'node.exe'), '');
    const script = join(bin, 'node_modules', '@openai', 'codex', 'bin');
    mkdirSync(script, { recursive: true });
    writeFileSync(join(script, 'codex.js'), '');
    expect(resolveCodexOnPath({ Path: `${bin};${node}` })).toEqual({
      command: join(node, 'node.exe'),
      args: [join(script, 'codex.js')],
    });
    expect(resolveCodexOnPath({ Path: bin })).toBeUndefined();
  });

  it.skipIf(process.platform !== 'win32')('falls back to the Codex app package', async () => {
    const calls: { file: string; args: readonly string[] }[] = [];
    const env = { Path: '', SystemRoot: 'C:\\Windows', ProgramW6432: 'C:\\Program Files' };
    const found = await resolveCodex(
      env,
      async (file, args) => (calls.push({ file, args }), REG),
      (p) => p.endsWith('codex.exe'),
    );
    expect(found?.command).toBe(
      'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1120.6357.0_x64__2p2nqsd0c76g0\\app\\resources\\codex.exe',
    );
    expect(calls).toEqual([
      {
        file: 'C:\\Windows\\System32\\reg.exe',
        args: [
          'query',
          expect.stringContaining('AppModel\\Repository\\Packages'),
          '/f',
          'OpenAI.Codex_',
          '/k',
        ],
      },
    ]);
    expect(
      await resolveCodex(
        env,
        async () => REG,
        () => false,
      ),
    ).toBeUndefined();
    expect(await resolveCodex(env, async () => '')).toBeUndefined();
  });
});

describe('codexVersion', () => {
  it('reads the version from the initialize user agent', () => {
    expect(codexVersion('vernier/0.171.0-alpha.13.2 (Windows 10.0.26200; x86_64) xterm')).toBe(
      '0.171.0-alpha.13.2',
    );
    expect(codexVersion('garbage')).toBeUndefined();
  });
});
