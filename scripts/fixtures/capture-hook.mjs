// Claude Code hook recorder for raw fixtures (phase 2, used early to unblock 1d).
//
// Configure it as a `command` hook in a *test project* (never in ~/.claude):
//   node "<repo>/scripts/fixtures/capture-hook.mjs"
// and set VERNIER_HOOKS_SESSION=<name> in the environment of the `claude` process.
// Every hook payload received on stdin is appended as one JSON line to
//   packages/fixtures/raw/<name>.hooks.jsonl
//
// The output always stays inside packages/fixtures/raw/ (git-ignored): the session
// name is validated, symlinks are refused, and the script always exits 0 so a
// recording problem never alters the agent session being recorded.
import { appendFileSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SESSION_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/i;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rawDir = join(repoRoot, 'packages', 'fixtures', 'raw');

function fail(message) {
  process.stderr.write(`[capture-hook] ${message}\n`);
  process.exit(0);
}

function readStdin() {
  return new Promise((resolveRead, rejectRead) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolveRead(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', rejectRead);
  });
}

function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function targetFile(session) {
  if (!SESSION_NAME.test(session))
    fail(`invalid VERNIER_HOOKS_SESSION: ${JSON.stringify(session)}`);

  mkdirSync(rawDir, { recursive: true });
  if (isSymlink(rawDir)) fail('packages/fixtures/raw is a symlink: refusing to write');

  const realRaw = realpathSync(rawDir);
  const file = resolve(realRaw, `${session}.hooks.jsonl`);
  if (dirname(file) !== realRaw || !file.startsWith(realRaw + sep)) {
    fail('output path escapes packages/fixtures/raw');
  }
  if (isSymlink(file)) fail(`${session}.hooks.jsonl is a symlink: refusing to write`);
  return file;
}

try {
  const session = process.env.VERNIER_HOOKS_SESSION ?? 'unnamed';
  const file = targetFile(session);
  const input = await readStdin();

  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    payload = { unparsed: input };
  }

  const line = JSON.stringify({ capturedAt: new Date().toISOString(), payload });
  appendFileSync(file, `${line}\n`, { encoding: 'utf8', flag: 'a' });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
