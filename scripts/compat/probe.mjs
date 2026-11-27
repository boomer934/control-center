// Usage: node scripts/compat/probe.mjs --claude 2.1.326 --codex 0.171.0-alpha.13.2
/* eslint-disable security/detect-non-literal-fs-filename, security/detect-object-injection -- Fixed package names, probe-owned paths and parsed inventories. */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, stripVTControlCharacters } from 'node:util';
import { collectProtocol, compareProtocol, schemaFiles } from './protocol.mjs';

const compat = JSON.parse(
  readFileSync(new URL('../../packages/agent-compat/compat.json', import.meta.url), 'utf8'),
);
const snapshotUrl = new URL('../../packages/agent-compat/codex-protocol.json', import.meta.url);
// Checked only after limiting the version to 80 characters; separators cannot match identifiers.
const exactVersion =
  // eslint-disable-next-line security/detect-unsafe-regex
  /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2}(?:-[a-zA-Z0-9]+(?:[.-][a-zA-Z0-9]+)*)?$/;
const packageNames = { claude: '@anthropic-ai/claude-code', codex: '@openai/codex' };
const requiredClaudeFlags = [
  '-p',
  '--input-format',
  '--output-format',
  '--resume',
  '--model',
  '--effort',
  '--permission-prompt-tool',
  '--settings',
  '--verbose',
  '--include-partial-messages',
];
const unstyle = stripVTControlCharacters;

export function parseVersions(args) {
  const { values, tokens } = parseArgs({
    args,
    options: { claude: { type: 'string' }, codex: { type: 'string' } },
    tokens: true,
  });
  if (
    tokens.length !== Object.keys(values).length ||
    tokens.length === 0 ||
    Object.values(values).some((version) => version.length > 80 || !exactVersion.test(version))
  ) {
    throw new Error('Pass one exact version per CLI.');
  }
  return values;
}

export function checkClaudeHelp(help, hiddenPermissionFlag = false) {
  const flags = new Set(hiddenPermissionFlag ? ['--permission-prompt-tool'] : []);
  let effortHelp = '';
  let inEffort = false;
  for (const line of unstyle(help).split(/\r?\n/)) {
    if (line.length > 512) continue;
    // eslint-disable-next-line security/detect-unsafe-regex
    const match = /^ {2}(-[a-zA-Z]|--[a-z][\w-]*)(?:, (--[a-z][\w-]*))?(?=[ \t]|$)/.exec(line);
    if (match) {
      flags.add(match[1]);
      if (match[2]) flags.add(match[2]);
      inEffort = match[1] === '--effort';
    }
    if (inEffort && effortHelp.length < 512) effortHelp += ` ${line.trim()}`;
  }
  const list = /\(([^()]+)\)/
    .exec(effortHelp)?.[1]
    ?.split(',')
    .map((level) => level.trim());
  const efforts = [
    ...new Set(list?.every((level) => /^[a-z][a-z\d-]{0,23}$/.test(level)) ? list : []),
  ];
  const missingFlags = requiredClaudeFlags.filter((flag) => !flags.has(flag));
  const removedEfforts = compat.claude.fallbackEfforts.filter(
    (effort) => !efforts.includes(effort),
  );
  return {
    status:
      missingFlags.length > 0
        ? 'broken'
        : removedEfforts.length > 0 || efforts.length > 8
          ? 'changed'
          : 'compatible',
    missingFlags,
    efforts,
    removedEfforts,
  };
}

export function parseFeatures(output) {
  const features = new Map();
  for (const raw of unstyle(output).trim().split(/\r?\n/)) {
    if (raw.length > 240 || features.size >= 4096) throw new Error('feature list exceeds limit');
    const match = /^([a-z][a-z0-9_.-]{0,127})\s+([a-z][a-z -]{0,39}?)\s+(true|false)$/.exec(
      raw.trim(),
    );
    if (!match || features.has(match[1])) throw new Error('unexpected feature list');
    features.set(match[1], { stage: match[2], enabled: match[3] === 'true' });
  }
  return Object.fromEntries([...features].sort(([a], [b]) => a.localeCompare(b, 'en')));
}

function compareFeatures(baseline, current) {
  const added = Object.keys(current).filter((name) => !Object.hasOwn(baseline, name));
  const removed = Object.keys(baseline).filter((name) => !Object.hasOwn(current, name));
  const changed = Object.entries(baseline).flatMap(([name, before]) => {
    if (!Object.hasOwn(current, name)) return [];
    const after = current[name];
    return before.enabled === after.enabled && before.stage === after.stage
      ? []
      : [{ name, before, after }];
  });
  return { added, removed, changed };
}

export function checkCodex(baseline, schemas, listedFeatures) {
  const protocol = compareProtocol(baseline, collectProtocol(schemas));
  const features = compareFeatures(baseline.features, listedFeatures);
  const status =
    protocol.changedFields.length > 0
      ? 'broken'
      : protocol.removedMethods.length || features.removed.length || features.changed.length
        ? 'changed'
        : 'compatible';
  return { status, protocol, features };
}

function isolatedEnvironment(cwd) {
  // Pass only system values needed by Node and the OS. CLI credentials, npm configuration,
  // shell startup options and the user's configuration directories stay outside the probe.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      /^(path|systemroot|windir|comspec|pathext|programfiles(?:\(x86\))?|programdata)$/i.test(key),
    ),
  );
  return {
    ...env,
    HOME: cwd,
    USERPROFILE: cwd,
    APPDATA: cwd,
    LOCALAPPDATA: cwd,
    XDG_CONFIG_HOME: cwd,
    XDG_DATA_HOME: cwd,
    XDG_CACHE_HOME: cwd,
    CODEX_HOME: cwd,
    CLAUDE_CONFIG_DIR: cwd,
    TMPDIR: cwd,
    TEMP: cwd,
    TMP: cwd,
    NO_COLOR: '1',
    CI: '1',
    npm_config_userconfig: join(cwd, 'empty-user.npmrc'),
    npm_config_globalconfig: join(cwd, 'empty-global.npmrc'),
    npm_config_cache: join(cwd, 'npm-cache'),
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  };
}

function run(program, args, cwd, timeout = 30_000) {
  return new Promise((done) => {
    // All executables are npm or binaries from the two pinned official packages, with fixed argv.
    const child = execFile(
      program.command,
      [...program.args, ...args],
      {
        cwd,
        env: isolatedEnvironment(cwd),
        timeout,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) =>
        done({ code: error?.code ?? (error ? 'error' : 0), stdout, stderr }),
    );
    child.stdin?.end();
  });
}

function npmProgram() {
  if (process.platform !== 'win32') return { command: 'npm', args: [] };
  const paths = [
    dirname(process.execPath),
    ...(process.env.PATH ?? '').split(delimiter).filter(isAbsolute),
  ];
  const script = paths
    .map((path) => join(path, 'node_modules', 'npm', 'bin', 'npm-cli.js'))
    .find(existsSync);
  if (!script) throw new Error('npm launcher unavailable');
  return { command: process.execPath, args: [script] };
}

function cliProgram(provider, cwd) {
  const modules = join(cwd, 'node_modules');
  const platform = `${process.platform}-${process.arch}`;
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const bin = provider + suffix;
  if (provider === 'claude') {
    const native = join(modules, `@anthropic-ai/claude-code-${platform}`, bin);
    if (existsSync(native)) return { command: native, args: [] };
    // Older npm releases shipped a JavaScript launcher.
    const oldScript = join(modules, packageNames.claude, 'cli.js');
    if (existsSync(oldScript)) return { command: process.execPath, args: [oldScript] };
  } else {
    const cpu = { x64: 'x86_64', arm64: 'aarch64' }[process.arch];
    const os = { win32: 'pc-windows-msvc', linux: 'unknown-linux-musl', darwin: 'apple-darwin' }[
      process.platform
    ];
    const vendor = join(modules, `@openai/codex-${platform}`, 'vendor', `${cpu}-${os}`);
    for (const directory of ['bin', 'codex']) {
      const native = join(vendor, directory, bin);
      if (existsSync(native)) return { command: native, args: [] };
    }
    // Handles older bundled layouts through the publisher's platform resolver.
    const script = join(modules, packageNames.codex, 'bin', 'codex.js');
    if (existsSync(script)) return { command: process.execPath, args: [script] };
  }
  throw new Error('CLI launcher unavailable');
}

function readSchemas(out) {
  return Object.fromEntries(
    schemaFiles.map((name) => {
      const file = join(out, `${name}.json`);
      if (statSync(file).size > 8 * 1024 * 1024) throw new Error('protocol schema exceeds limit');
      return [name, JSON.parse(readFileSync(file, 'utf8'))];
    }),
  );
}

async function inspectInDirectory(provider, version, cwd) {
  let step = 'install';
  const failure = () => ({ version, status: 'broken', step });
  try {
    const installed = await run(
      npmProgram(),
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-save',
        '--package-lock=false',
        '--registry=https://registry.npmjs.org',
        `${packageNames[provider]}@${version}`,
      ],
      cwd,
      180_000,
    );
    if (installed.code !== 0) return failure();

    step = 'version';
    const cli = cliProgram(provider, cwd);
    const reported = await run(cli, ['--version'], cwd);
    const banner = unstyle(reported.stdout).trim();
    const expected = provider === 'claude' ? `${version} (Claude Code)` : `codex-cli ${version}`;
    if (reported.code !== 0 || banner !== expected) return failure();

    if (provider === 'claude') {
      step = 'help';
      const help = await run(cli, ['--help'], cwd);
      if (help.code !== 0) return failure();
      // A recognized option without its argument exits before Claude can start a session.
      const hidden = await run(cli, ['--permission-prompt-tool'], cwd);
      const recognized =
        hidden.code === 1 &&
        /option ['"]--permission-prompt-tool\s+<[^>]+>['"] argument missing/.test(
          unstyle(hidden.stderr),
        );
      return { version, ...checkClaudeHelp(help.stdout, recognized) };
    }

    step = 'features';
    const features = await run(cli, ['features', 'list'], cwd);
    if (features.code !== 0) return failure();
    const listedFeatures = parseFeatures(features.stdout);

    step = 'protocol';
    const out = join(cwd, 'schema');
    mkdirSync(out);
    const generated = await run(
      cli,
      ['app-server', 'generate-json-schema', '--out', out, '--experimental'],
      cwd,
    );
    if (generated.code !== 0) return failure();
    const baseline = JSON.parse(readFileSync(snapshotUrl, 'utf8'));
    return { version, ...checkCodex(baseline, readSchemas(out), listedFeatures) };
  } catch {
    // Child output can include arbitrary paths and text. The report names only the failed step.
    return failure();
  }
}

async function inspect(provider, version) {
  let step = 'prepare';
  try {
    const cwd = mkdtempSync(join(tmpdir(), 'vernier-compat-'));
    try {
      return await inspectInDirectory(provider, version, cwd);
    } finally {
      step = 'cleanup';
      rmSync(cwd, { recursive: true, force: true, maxRetries: 3 });
    }
  } catch {
    return { version, status: 'broken', step };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let versions;
  try {
    versions = parseVersions(process.argv.slice(2));
  } catch {
    process.stderr.write(
      'Usage: node scripts/compat/probe.mjs [--claude EXACT_VERSION] [--codex EXACT_VERSION]\n',
    );
    process.exit(64);
  }
  const providers = Object.fromEntries(
    await Promise.all(
      Object.entries(versions).map(async ([provider, version]) => [
        provider,
        await inspect(provider, version),
      ]),
    ),
  );
  const statuses = Object.values(providers).map(({ status }) => status);
  const status = ['broken', 'changed', 'compatible'].find((candidate) =>
    statuses.includes(candidate),
  );
  process.stdout.write(`${JSON.stringify({ status, providers }, null, 2)}\n`);
  process.exitCode = { compatible: 0, changed: 1, broken: 2 }[status];
}
