#!/usr/bin/env node
// A stand-in for the `claude` CLI, for tests only: the CI never calls the real service.
//
// It accepts the flags the app passes (`-p --input-format stream-json --output-format stream-json
// --verbose [--settings <file>] [--resume <id>]`), reads one user message from stdin, then
// replays a sanitized recording: stream-json lines on stdout and, at their recorded moments, the
// hook commands of `--settings` with the recorded payloads on stdin, through a shell, one at a
// time, as Claude Code does. The recorded workspace path becomes the current folder.
//
// Environment:
//   FAKE_CLAUDE_FIXTURE   name of a recording in ../sanitized (required)
//   FAKE_CLAUDE_MODE      normal (default) | hang (stops after the first tool call and waits)
//                         | crash (exits 3 halfway) | permissions (bidirectional chat fixture)
//   FAKE_CLAUDE_VERSION   version reported in the init line (default: the recorded one)
//   FAKE_CLAUDE_ARGV_LOG  file to which the received arguments are appended, one JSON per run
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const RECORDED_CWD = 'C:\\fixtures\\workspace';
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const argv = process.argv.slice(2);

if (argv.includes('--version')) {
  process.stdout.write(`${process.env.FAKE_CLAUDE_VERSION ?? '2.1.322'} (Claude Code)\n`);
  process.exit(0);
}

const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

function readJsonl(file) {
  const url = new URL(`../sanitized/${file}`, import.meta.url);
  let text;
  try {
    text = readFileSync(url, 'utf8');
  } catch {
    return [];
  }
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

/** Replaces the recorded workspace path in every string, and the session id when resuming. */
function relocate(value, cwd, sessionId) {
  // Stack traces print the path with forward slashes too (file:///C:/fixtures/workspace/…).
  if (typeof value === 'string')
    return value
      .split(RECORDED_CWD)
      .join(cwd)
      .split(RECORDED_CWD.replaceAll('\\', '/'))
      .join(cwd.replaceAll('\\', '/'));
  if (Array.isArray(value)) return value.map((v) => relocate(v, cwd, sessionId));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value))
      out[k] = k === 'session_id' && sessionId ? sessionId : relocate(v, cwd, sessionId);
    return out;
  }
  return value;
}

function hookCommands(settingsFile, event) {
  if (!settingsFile) return [];
  const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
  return (settings.hooks?.[event] ?? []).flatMap((m) => m.hooks ?? []).map((h) => h.command);
}

function runHook(command, payload) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    child.stderr.resume();
    child.on('error', () => resolve());
    child.on('close', () => resolve());
    child.stdin.end(JSON.stringify(payload));
  });
}

const iso = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : undefined);

const emit = (message) => process.stdout.write(JSON.stringify(message) + '\n');

async function permissionTurn(lines, message, resume) {
  if (flag('--permission-prompt-tool') !== 'stdio' || !argv.includes('--include-partial-messages'))
    throw new Error('Expected stdio permissions and partial messages');
  const prompt = message.message.content[0]?.text;
  const session_id = resume ?? 'fake-chat-session';
  const assistant = (content) => emit({ type: 'assistant', message: { content }, session_id });
  emit({ type: 'system', subtype: 'init', session_id, claude_code_version: '2.1.322' });
  emit({
    type: 'stream_event',
    parent_tool_use_id: null,
    event: {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'Waiting for approval. ' },
    },
  });

  const requests =
    prompt === 'Continue the saved chat'
      ? [['echo repeat', 'allow']]
      : prompt === 'Stop this turn'
        ? [['echo waiting', 'deny']]
        : [
            [`echo once ${'x'.repeat(17 * 1024)}`, 'allow'],
            ['echo refused', 'deny'],
            ['echo repeat', 'allow'],
            ['echo repeat', 'allow'],
            ['echo changed', 'allow'],
          ];
  for (const [i, [command, behavior]] of requests.entries()) {
    const id = `tool-chat-${i}`;
    const request_id = `request-${i}`;
    const input = { file_path: `${process.cwd()}\\example.txt`, command };
    assistant([{ type: 'tool_use', name: 'Bash', id, input }]);
    emit({
      type: 'control_request',
      request_id,
      request: { subtype: 'can_use_tool', tool_name: 'Bash', input, tool_use_id: id },
    });
    const line = await lines.next();
    const received = line.done ? null : JSON.parse(line.value);
    if (
      received?.type !== 'control_response' ||
      received.response?.subtype !== 'success' ||
      received.response?.request_id !== request_id ||
      received.response?.response?.behavior !== behavior ||
      (behavior === 'allow' &&
        JSON.stringify(received.response.response.updatedInput) !== JSON.stringify(input))
    )
      throw new Error(`Unexpected decision on request ${i}`);
    emit({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: id,
            content: behavior,
            is_error: behavior === 'deny',
          },
        ],
      },
    });
  }

  assistant([
    {
      type: 'text',
      text: resume
        ? 'Resumed **saved session**.'
        : 'Finished **the turn**.\n\n```js\nconst result = true;\n```\n\n<img src="https://example.invalid/pixel">\n\n[link](https://example.invalid/)\n\napi_key=synthetic-secret-password',
    },
  ]);
  emit({ type: 'result', subtype: 'success', is_error: false, session_id });
}

async function main() {
  const name = process.env.FAKE_CLAUDE_FIXTURE ?? '';
  if (!NAME.test(name)) {
    process.stderr.write('fake-claude: FAKE_CLAUDE_FIXTURE is missing or invalid\n');
    process.exit(2);
  }
  if (process.env.FAKE_CLAUDE_ARGV_LOG)
    appendFileSync(process.env.FAKE_CLAUDE_ARGV_LOG, `${JSON.stringify(argv)}\n`);
  const mode = process.env.FAKE_CLAUDE_MODE ?? 'normal';
  const settingsFile = flag('--settings');
  const resume = flag('--resume');
  const cwd = process.cwd();

  // one user message, as the app sends it
  const input = createInterface({ input: process.stdin });
  const lines = input[Symbol.asyncIterator]();
  const first = await lines.next();
  const message = first.done ? undefined : JSON.parse(first.value);
  if (message?.type !== 'user') {
    process.stderr.write('fake-claude: expected a stream-json user message on stdin\n');
    process.exit(2);
  }
  let stdinClosed = false;
  const closed = new Promise((resolve) => {
    input.on('close', () => {
      stdinClosed = true;
      resolve();
    });
  });
  if (mode === 'permissions') {
    await permissionTurn(lines, message, resume);
    await closed;
    return;
  }

  // the recording as one timeline, by the clocks of its two sources
  const stream = readJsonl(`${name}.jsonl`).map((l) => relocate(l, cwd, resume));
  const hooks = readJsonl(`${name}.hooks.jsonl`).map((h) => relocate(h, cwd, resume));
  let at = hooks.map((h) => iso(h.capturedAt)).find(Boolean) ?? '';
  const timeline = [];
  for (const line of stream) {
    at = iso(line.timestamp) ?? at;
    if (line.type === 'system' && line.subtype === 'init' && process.env.FAKE_CLAUDE_VERSION)
      line.claude_code_version = process.env.FAKE_CLAUDE_VERSION;
    timeline.push({ kind: 'stream', at, value: line });
  }
  for (const h of hooks) timeline.push({ kind: 'hook', at: iso(h.capturedAt) ?? at, value: h });
  const ordered = timeline
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.at < b.t.at ? -1 : a.t.at > b.t.at ? 1 : a.i - b.i))
    .map(({ t }) => t);

  for (const [i, item] of ordered.entries()) {
    if (mode === 'crash' && i >= ordered.length / 2) process.exit(3);
    if (item.kind === 'stream') {
      process.stdout.write(`${JSON.stringify(item.value)}\n`);
      const toolUse =
        item.value.type === 'assistant' &&
        item.value.message?.content?.some?.((c) => c.type === 'tool_use');
      if (mode === 'hang' && toolUse) await new Promise(() => {});
    } else {
      const payload = item.value.payload;
      for (const command of hookCommands(settingsFile, payload.hook_event_name))
        await runHook(command, payload);
    }
  }

  // like `claude -p`: wait for the end of the input, or give up shortly after a run without one
  if (!stdinClosed) await Promise.race([closed, new Promise((r) => setTimeout(r, 1000))]);
  process.exit(0);
}

main().catch((error) => {
  process.stderr.write(`fake-claude: ${error?.message ?? error}\n`);
  process.exit(1);
});
