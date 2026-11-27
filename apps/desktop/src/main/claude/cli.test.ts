import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findOnPath,
  nodeCanRunHooks,
  parseNodeVersion,
  resolveClaude,
  resolveHookNode,
} from './cli';
import {
  createSessionDir,
  hookCommand,
  hookSettings,
  removeStaleSessions,
  SESSIONS_DIR,
} from './session-files';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function temp(): string {
  const d = mkdtempSync(join(tmpdir(), 'cc-cli-'));
  dirs.push(d);
  return d;
}
function touch(file: string): string {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, '');
  return file;
}

describe('programs on PATH', () => {
  it('finds the first match in PATH order and ignores relative entries', () => {
    const a = temp();
    const b = temp();
    touch(join(b, 'claude.exe'));
    touch(join('.', 'node_modules', '.cc-test', 'claude.exe'));
    dirs.push(join('.', 'node_modules', '.cc-test'));
    const env = { Path: ['node_modules\\.cc-test', a, b].join(';') };
    expect(findOnPath(['claude.exe'], env)).toBe(join(b, 'claude.exe'));
    expect(findOnPath(['claude.exe'], { Path: 'node_modules\\.cc-test' })).toBeUndefined();
  });

  it('starts the native claude directly and an npm install through node', () => {
    const native = temp();
    touch(join(native, 'claude.exe'));
    expect(resolveClaude({ Path: native })).toEqual({
      command: join(native, 'claude.exe'),
      args: [],
    });

    const npm = temp();
    const nodeDir = temp();
    touch(join(npm, 'claude.cmd'));
    touch(join(nodeDir, 'node.exe'));
    // the shim alone, without its script, is not enough
    expect(resolveClaude({ Path: `${npm};${nodeDir}` })).toBeUndefined();
    const script = touch(join(npm, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'));
    expect(resolveClaude({ Path: `${npm};${nodeDir}` })).toEqual({
      command: join(nodeDir, 'node.exe'),
      args: [script],
    });
    expect(resolveClaude({ Path: temp() })).toBeUndefined();
  });

  it('runs hooks only with a Node that strips types by itself', async () => {
    expect(parseNodeVersion('v22.18.0\n')).toEqual([22, 18]);
    expect(parseNodeVersion('garbage')).toBeUndefined();
    expect(nodeCanRunHooks([22, 18])).toBe(true);
    expect(nodeCanRunHooks([22, 17])).toBe(false);
    expect(nodeCanRunHooks([20, 30])).toBe(false);
    expect(nodeCanRunHooks([26, 0])).toBe(true);
    await expect(resolveHookNode({ Path: temp() })).resolves.toBeUndefined();
  });
});

describe('session files', () => {
  const runner = { node: 'C:\\Program Files\\nodejs\\node.exe', script: 'C:\\app\\bin.ts' };
  const config = {
    v: 1 as const,
    pipe: `\\\\.\\pipe\\control-center-${'a'.repeat(32)}`,
    token: 'b'.repeat(64),
  };
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';

  it('quotes the hook command with forward slashes', () => {
    expect(hookCommand(runner, 'C:\\data\\s\\bridge.json')).toBe(
      '"C:/Program Files/nodejs/node.exe" "C:/app/bin.ts" "C:/data/s/bridge.json"',
    );
  });

  it.each([
    'C:\\a"b\\bridge.json',
    'C:\\%TEMP%\\bridge.json',
    'C:\\$HOME\\bridge.json',
    'C:\\a`b\\bridge.json',
    'relative\\bridge.json',
    '\\\\server\\share\\bridge.json',
  ])('refuses a path a shell would interpret: %s', (bridge) => {
    expect(hookCommand(runner, bridge)).toBeUndefined();
  });

  it('hooks every event the app reads, tool hooks for every tool', () => {
    const settings = hookSettings('"n" "s" "b"') as {
      hooks: Record<string, Array<Record<string, unknown>>>;
    };
    expect(Object.keys(settings.hooks)).toEqual(
      expect.arrayContaining([
        'SessionStart',
        'PreToolUse',
        'PostToolUse',
        'PostToolUseFailure',
        'Notification',
        'SessionEnd',
      ]),
    );
    expect(settings.hooks.PreToolUse?.[0]).toMatchObject({
      matcher: '*',
      hooks: [{ type: 'command', command: '"n" "s" "b"' }],
    });
    expect(settings.hooks.SessionStart?.[0]).not.toHaveProperty('matcher');
  });

  it('writes the bridge file only when asked, never a settings file, and removes it', async () => {
    const data = temp();
    const files = await createSessionDir(data, id);
    expect(files.bridgeFile).toBe(join(files.dir, 'bridge.json'));
    expect(readdirSync(files.dir)).toEqual([]);
    await files.writeBridge(config);
    expect(JSON.parse(readFileSync(files.bridgeFile, 'utf8'))).toEqual(config);
    await expect(files.writeBridge(config)).rejects.toThrow();
    expect(readdirSync(files.dir)).toEqual(['bridge.json']);
    await expect(createSessionDir(data, id)).rejects.toThrow();
    await files.remove();
    expect(existsSync(files.dir)).toBe(false);
  });

  it('passes the hooks as inline JSON that a shell-free argv keeps intact', () => {
    const command = hookCommand(runner, 'C:\\data\\s\\bridge.json');
    expect(command).toBeDefined();
    const inline = JSON.stringify(hookSettings(command ?? ''));
    expect(inline.startsWith('{')).toBe(true);
    expect(inline).not.toContain(config.token);
    expect(JSON.parse(inline)).toEqual(hookSettings(command ?? ''));
  });

  it('accepts only UUID session ids', async () => {
    await expect(createSessionDir(temp(), '..\\escape')).rejects.toThrow('Invalid session id');
  });

  it('removes the folders a crash left behind, and nothing else', async () => {
    const data = temp();
    await (await createSessionDir(data, id)).writeBridge(config);
    mkdirSync(join(data, SESSIONS_DIR, 'keep-me'));
    await expect(removeStaleSessions(data)).resolves.toEqual({ removed: 1, failed: 0 });
    expect(existsSync(join(data, SESSIONS_DIR, id))).toBe(false);
    expect(existsSync(join(data, SESSIONS_DIR, 'keep-me'))).toBe(true);
    await expect(removeStaleSessions(temp())).resolves.toEqual({ removed: 0, failed: 0 });
  });
});
