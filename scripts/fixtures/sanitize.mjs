// Fixture sanitizer (phase 2).
//
//   node scripts/fixtures/sanitize.mjs           raw/ → sanitized/, then runs the check
//   node scripts/fixtures/sanitize.mjs --check   only checks sanitized/ (used in CI)
//
// Raw recordings (packages/fixtures/raw/, git-ignored) contain file contents, personal paths and
// whatever the agent printed. The sanitizer is an allowlist: for every kind of stream-json line and
// hook payload it rebuilds a new object with only the keys the normalizers need, then cleans every
// string (workspace and home paths, user name, host name, e-mail addresses, secrets). File contents
// are replaced by placeholder lines, so line counts and `+`/`-` diff counts stay true.
//
// The check scans sanitized/ for secrets, personal paths, forbidden keys, high-entropy strings and,
// on the recording machine, the local user name, host name and git identity. Exit code 1 on findings.
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { homedir, hostname, userInfo } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findSecrets, redactSecrets } from '../../packages/event-schema/src/redact.ts';

export const SESSION_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/i;
export const FAKE_WORKSPACE = 'C:\\fixtures\\workspace';
export const FAKE_HOME = 'C:\\Users\\user';
export const PLACEHOLDER_LINE = '<redacted>';
const MAX_TEXT = 4000;
const MAX_SHORT = 1000;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RAW_DIR = join(repoRoot, 'packages', 'fixtures', 'raw');
export const SANITIZED_DIR = join(repoRoot, 'packages', 'fixtures', 'sanitized');

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------- identity of the recording machine

function gitConfig(key) {
  try {
    return execFileSync('git', ['config', '--get', key], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/** Personal identifiers of this machine. Empty strings are ignored everywhere. */
export function localIdentity() {
  let username = '';
  try {
    username = userInfo().username;
  } catch {
    // no user info (some containers): only the generic rules apply
  }
  return {
    home: homedir(),
    username,
    hostname: hostname(),
    gitName: gitConfig('user.name'),
    gitEmail: gitConfig('user.email'),
  };
}

// ------------------------------------------------------------------------------- string cleaning

/** Every textual form a Windows path can take in a recording: `\`, `/`, `\\`, `/c/...`. */
function pathForms(p) {
  const back = p.replace(/\//g, '\\');
  const drive = /^([A-Za-z]):\\(.*)$/.exec(back);
  return [
    back,
    back.replace(/\\/g, '/'),
    back.replace(/\\/g, '\\\\'),
    drive ? `/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, '/')}` : '',
  ];
}

/** Replaces each form of `from` with the matching form of `to`, case-insensitively. */
function pathReplacer(from, to) {
  const toForms = pathForms(to);
  const pairs = pathForms(from)
    .map((f, i) => [f, toForms[i] || to])
    .filter(([f], i, all) => f.length > 3 && all.findIndex(([g]) => g === f) === i);
  // longest first, so `C:\\a` is not half-replaced by the `C:\a` form
  pairs.sort((a, b) => b[0].length - a[0].length);
  return (s) => {
    let out = s;
    for (const [f, t] of pairs) out = out.replace(new RegExp(escapeRe(f), 'gi'), () => t);
    return out;
  };
}

/**
 * Builds the string cleaner for one session. `cwd` is the recorded workspace, `id` the machine
 * identity from localIdentity() (tests pass a fake one).
 */
export function makeCleaner(cwd, id) {
  const steps = [];
  if (cwd) steps.push(pathReplacer(cwd, FAKE_WORKSPACE));
  if (id.home) steps.push(pathReplacer(id.home, FAKE_HOME));
  // any other user's home, in every separator form
  steps.push((s) =>
    s
      .replace(
        /([A-Za-z]:(?:\\{1,2}|\/)Users(?:\\{1,2}|\/))(?!user\b|Public\b)[^\\/\s"'`:;,]+/gi,
        '$1user',
      )
      .replace(/(\/(?:home|Users)\/)(?!user\b)[^/\s"'`:;,]+/g, '$1user'),
  );
  const words = [
    [id.gitEmail, 'user@example.com'],
    [id.gitName, 'user'],
    [id.username, 'user'],
    [id.hostname, 'host'],
  ]
    .filter(([w]) => w && w.length >= 3)
    // longest first: a host name like "ADA-LAPTOP" must go before the user name "ada" it contains
    .sort((a, b) => b[0].length - a[0].length);
  for (const [w, to] of words) {
    const re = new RegExp(`(?<![A-Za-z0-9])${escapeRe(w)}(?![A-Za-z0-9])`, 'gi');
    steps.push((s) => s.replace(re, to));
  }
  steps.push((s) =>
    s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) =>
      /@(?:example\.com|anthropic\.com)$/i.test(m) ? m : 'user@example.com',
    ),
  );
  steps.push(redactSecrets);
  return (s, max = MAX_TEXT) => {
    let out = s;
    for (const step of steps) out = step(out);
    return out.length > max ? `${out.slice(0, max)}…[truncated]` : out;
  };
}

/** Replaces each line with a placeholder, keeping the line count and the trailing newline. */
export function redactLines(s) {
  if (typeof s !== 'string' || s === '') return s;
  const trailing = s.endsWith('\n');
  const body = trailing ? s.slice(0, -1) : s;
  return (
    body
      .split('\n')
      .map(() => PLACEHOLDER_LINE)
      .join('\n') + (trailing ? '\n' : '')
  );
}

/** Keeps the diff marker of each patch line (`+`, `-`, ` `, `\`) and drops the text. */
function redactPatch(patch) {
  if (!Array.isArray(patch)) return [];
  return patch.filter(isObj).map((h) => ({
    oldStart: h.oldStart,
    oldLines: h.oldLines,
    newStart: h.newStart,
    newLines: h.newLines,
    lines: Array.isArray(h.lines)
      ? h.lines.map((l) => (typeof l === 'string' ? `${l.slice(0, 1)}${PLACEHOLDER_LINE}` : ''))
      : [],
  }));
}

/** Grep output: keeps `path:line:` (the normalizers need the file), drops the matched text. */
function redactGrep(s, clean) {
  if (typeof s !== 'string') return s;
  return s
    .split('\n')
    .map((line) => {
      const m = /^(.+?):(\d+)[:-]/.exec(line);
      return m ? `${clean(m[1], MAX_SHORT)}:${m[2]}:${PLACEHOLDER_LINE}` : clean(line, MAX_SHORT);
    })
    .join('\n');
}

// ------------------------------------------------------------------------------ structural rules

const pick = (src, keys, map = {}) => {
  const out = {};
  if (!isObj(src)) return out;
  for (const k of keys) {
    if (!(k in src) || src[k] === undefined) continue;
    out[k] = map[k] ? map[k](src[k]) : src[k];
  }
  return out;
};

const prim = (v) => (v === null || typeof v === 'number' || typeof v === 'boolean' ? v : undefined);

const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

function usage(u) {
  return pick(u, [
    'input_tokens',
    'output_tokens',
    'cache_read_input_tokens',
    'cache_creation_input_tokens',
  ]);
}

/** Tool input: known keys only; file contents become placeholder lines. */
export function cleanToolInput(name, input, clean) {
  if (!isObj(input)) return {};
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (['content', 'old_string', 'new_string', 'new_source'].includes(k)) {
      out[k] = redactLines(v);
    } else if (k === 'edits' && Array.isArray(v)) {
      out[k] = v.filter(isObj).map((e) => ({
        old_string: redactLines(e.old_string),
        new_string: redactLines(e.new_string),
        ...(typeof e.replace_all === 'boolean' ? { replace_all: e.replace_all } : {}),
      }));
    } else if (typeof v === 'string') {
      out[k] = clean(v, k === 'command' ? MAX_TEXT : MAX_SHORT);
    } else if (prim(v) !== undefined) {
      out[k] = v;
    } else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
      out[k] = v.map((x) => clean(x, MAX_SHORT));
    }
    // nested objects of unknown tools are dropped: nothing reads them
  }
  return out;
}

/** Tool response (hook `tool_response` or stream `tool_use_result`). */
export function cleanToolResponse(name, r, clean) {
  if (typeof r === 'string') return clean(r);
  if (!isObj(r)) return null;
  if (SHELL_TOOLS.has(name)) {
    return pick(r, ['stdout', 'stderr', 'interrupted', 'isImage', 'noOutputExpected'], {
      stdout: (v) => clean(String(v)),
      stderr: (v) => clean(String(v)),
    });
  }
  if (name === 'Agent' || name === 'Task') {
    return {
      ...pick(r, [
        'agentId',
        'agentType',
        'status',
        'totalDurationMs',
        'totalTokens',
        'totalToolUseCount',
        'toolStats',
      ]),
      ...(isObj(r.usage) ? { usage: usage(r.usage) } : {}),
      content: Array.isArray(r.content)
        ? r.content.filter(isObj).map((c) => ({ type: 'text', text: clean(String(c.text ?? '')) }))
        : [],
    };
  }
  if (name === 'Grep') {
    return {
      ...pick(r, ['mode', 'numFiles', 'numLines', 'totalLines']),
      filenames: Array.isArray(r.filenames) ? r.filenames.map((f) => clean(String(f))) : [],
      ...(typeof r.content === 'string' ? { content: redactGrep(r.content, clean) } : {}),
    };
  }
  if (name === 'Glob') {
    return {
      ...pick(r, ['numFiles', 'totalMatches', 'truncated', 'countIsComplete', 'durationMs']),
      filenames: Array.isArray(r.filenames) ? r.filenames.map((f) => clean(String(f))) : [],
    };
  }
  if (FILE_TOOLS.has(name)) {
    const out = pick(r, ['type', 'userModified', 'replaceAll']);
    if (typeof r.filePath === 'string') out.filePath = clean(r.filePath);
    if (typeof r.content === 'string') out.content = redactLines(r.content);
    if (typeof r.oldString === 'string') out.oldString = redactLines(r.oldString);
    if (typeof r.newString === 'string') out.newString = redactLines(r.newString);
    if ('structuredPatch' in r) out.structuredPatch = redactPatch(r.structuredPatch);
    if (isObj(r.file)) {
      out.file = {
        ...pick(r.file, ['numLines', 'startLine', 'totalLines']),
        ...(typeof r.file.filePath === 'string' ? { filePath: clean(r.file.filePath) } : {}),
        ...(typeof r.file.content === 'string' ? { content: redactLines(r.file.content) } : {}),
      };
    }
    return out;
  }
  // unknown or MCP tool: primitives only
  const out = {};
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'string') out[k] = clean(v, MAX_SHORT);
    else if (prim(v) !== undefined) out[k] = v;
  }
  return out;
}

/** Text of a tool_result block, by tool. */
function cleanToolResultContent(name, content, clean, isError) {
  const one = (text) => {
    // an error is a message from the tool, not file content: keep it (cleaned)
    if (isError) return clean(text, MAX_SHORT);
    if (name === 'Read') return redactLines(text);
    if (name === 'Grep') return redactGrep(text, clean);
    return clean(text);
  };
  if (typeof content === 'string') return one(content);
  if (Array.isArray(content)) {
    return content
      .filter(isObj)
      .map((c) =>
        c.type === 'text'
          ? { type: 'text', text: one(String(c.text ?? '')) }
          : { type: String(c.type) },
      );
  }
  return '';
}

const BASE = ['type', 'subtype', 'uuid', 'session_id'];

/**
 * Sanitizes one stream-json line. `tools` maps tool_use ids to tool names and is filled while the
 * lines are processed in order.
 */
export function cleanStreamLine(line, clean, tools) {
  if (!isObj(line)) return null;
  const base = pick(line, BASE);
  const sub = line.subtype;
  switch (line.type) {
    case 'system':
      switch (sub) {
        case 'init':
          return {
            ...base,
            cwd: clean(String(line.cwd ?? '')),
            ...pick(line, ['model', 'permissionMode', 'claude_code_version', 'output_style']),
            // built-in tools only: MCP tool and server names reveal the user's connected accounts
            tools: Array.isArray(line.tools)
              ? line.tools.filter((t) => typeof t === 'string' && !t.startsWith('mcp__'))
              : [],
          };
        case 'permission_denied':
          return {
            ...base,
            ...pick(line, ['tool_name', 'tool_use_id', 'decision_reason_type']),
            message: clean(String(line.message ?? ''), MAX_SHORT),
          };
        case 'post_turn_summary':
          return {
            ...base,
            ...pick(line, ['status_category']),
            status_detail: clean(String(line.status_detail ?? ''), MAX_SHORT),
            needs_action: clean(String(line.needs_action ?? ''), MAX_SHORT),
          };
        case 'task_started':
        case 'task_progress':
        case 'task_notification':
        case 'task_updated':
          return {
            ...base,
            ...pick(line, [
              'task_id',
              'tool_use_id',
              'subagent_type',
              'task_type',
              'spawn_depth',
              'is_backgrounded',
              'last_tool_name',
              'status',
              'usage',
              'patch',
            ]),
            ...(typeof line.description === 'string'
              ? { description: clean(line.description, MAX_SHORT) }
              : {}),
            ...(typeof line.summary === 'string'
              ? { summary: clean(line.summary, MAX_SHORT) }
              : {}),
          };
        case 'thinking_tokens':
          return { ...base, ...pick(line, ['estimated_tokens', 'estimated_tokens_delta']) };
        default:
          // hook_started/hook_response (hook output), commands_changed (the user's commands),
          // ui_panes, task_summary…: kept as bare markers so the normalizers see unknown lines
          return base;
      }
    case 'assistant':
    case 'user': {
      const msg = isObj(line.message) ? line.message : {};
      const out = {
        ...base,
        ...pick(line, ['timestamp', 'parent_tool_use_id', 'agent_id', 'subagent_type']),
        ...(typeof line.task_description === 'string'
          ? { task_description: clean(line.task_description, MAX_SHORT) }
          : {}),
      };
      let content;
      if (typeof msg.content === 'string') content = clean(msg.content);
      else if (Array.isArray(msg.content)) {
        content = msg.content.filter(isObj).map((c) => {
          if (c.type === 'text') return { type: 'text', text: clean(String(c.text ?? '')) };
          if (c.type === 'thinking') return { type: 'thinking', thinking: PLACEHOLDER_LINE };
          if (c.type === 'tool_use') {
            const name = String(c.name ?? '');
            if (typeof c.id === 'string') tools.set(c.id, name);
            return {
              type: 'tool_use',
              id: c.id,
              name,
              input: cleanToolInput(name, c.input, clean),
            };
          }
          if (c.type === 'tool_result') {
            const name = tools.get(c.tool_use_id) ?? '';
            return {
              type: 'tool_result',
              tool_use_id: c.tool_use_id,
              ...(typeof c.is_error === 'boolean' ? { is_error: c.is_error } : {}),
              content: cleanToolResultContent(name, c.content, clean, c.is_error === true),
            };
          }
          return { type: String(c.type) };
        });
      } else content = [];
      out.message = {
        ...pick(msg, ['id', 'role', 'model', 'type', 'stop_reason']),
        ...(isObj(msg.usage) ? { usage: usage(msg.usage) } : {}),
        content,
      };
      if (Array.isArray(line.tool_result_meta)) {
        out.tool_result_meta = line.tool_result_meta.filter(isObj).map((m) => ({
          ...pick(m, ['id', 'non_execution_kind']),
          ...(isObj(m.permission_decision)
            ? {
                permission_decision: pick(m.permission_decision, [
                  'decision',
                  'reason_type',
                  'source',
                ]),
              }
            : {}),
        }));
      }
      if ('tool_use_result' in line) {
        const id = Array.isArray(msg.content)
          ? msg.content.find((c) => isObj(c) && c.type === 'tool_result')?.tool_use_id
          : undefined;
        out.tool_use_result = cleanToolResponse(tools.get(id) ?? '', line.tool_use_result, clean);
      }
      return out;
    }
    case 'result': {
      const modelUsage = {};
      if (isObj(line.modelUsage)) {
        for (const [model, u] of Object.entries(line.modelUsage)) {
          modelUsage[model] = pick(u, [
            'inputTokens',
            'outputTokens',
            'cacheReadInputTokens',
            'cacheCreationInputTokens',
            'costUSD',
          ]);
        }
      }
      return {
        ...base,
        ...pick(line, [
          'is_error',
          'duration_ms',
          'duration_api_ms',
          'num_turns',
          'stop_reason',
          'terminal_reason',
          'total_cost_usd',
        ]),
        result: clean(String(line.result ?? '')),
        usage: usage(line.usage),
        modelUsage,
        permission_denials: Array.isArray(line.permission_denials)
          ? line.permission_denials.filter(isObj).map((d) => ({
              ...pick(d, ['tool_name', 'tool_use_id']),
              tool_input: cleanToolInput(String(d.tool_name ?? ''), d.tool_input, clean),
            }))
          : [],
      };
    }
    default:
      // rate_limit_event and anything new: a bare marker
      return base;
  }
}

/** Sanitizes one `{capturedAt, payload}` hook record. */
export function cleanHookRecord(record, clean) {
  if (!isObj(record)) return null;
  const p = isObj(record.payload) ? record.payload : {};
  const tool = String(p.tool_name ?? '');
  const payload = {
    ...pick(p, [
      'hook_event_name',
      'session_id',
      'permission_mode',
      'tool_name',
      'tool_use_id',
      'agent_id',
      'agent_type',
      'duration_ms',
      'source',
      'reason',
      'stop_hook_active',
      'notification_type',
      'is_interrupt',
    ]),
  };
  if (typeof p.cwd === 'string') payload.cwd = clean(p.cwd);
  if ('tool_input' in p) payload.tool_input = cleanToolInput(tool, p.tool_input, clean);
  if ('tool_response' in p) payload.tool_response = cleanToolResponse(tool, p.tool_response, clean);
  for (const k of ['prompt', 'message', 'error', 'title']) {
    if (typeof p[k] === 'string') payload[k] = clean(p[k], MAX_SHORT);
  }
  if (typeof p.last_assistant_message === 'string')
    payload.last_assistant_message = clean(p.last_assistant_message, MAX_SHORT);
  return { capturedAt: record.capturedAt, payload };
}

// ------------------------------------------------------------------------------------- the check

/** Keys that must never appear in a sanitized fixture. */
export const FORBIDDEN_KEYS = new Set([
  'originalFile',
  'signature',
  'wire_tool_inputs',
  'transcript_path',
  'agent_transcript_path',
  'scratchpad_dir',
  'scratchpad_path',
  'memory_paths',
  'plugins',
  'skills',
  'slash_commands',
  'credential_expires_at',
  'messaging_socket_path',
  'output_file',
  'mcp_servers',
]);

const ID_LIKE = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^(?:toolu|srvtoolu|msg|req)_[A-Za-z0-9]+$/,
  /^[0-9a-f]{16,40}$/i,
];

function entropy(s) {
  const counts = new Map();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

const preview = (s) => `${s.slice(0, 4)}…(${s.length} chars)`;

/**
 * Checks one JSON value. `id` is the machine identity (or null in CI, where only the generic
 * rules apply). Returns a list of findings `{ path, rule, preview }`, never the full value.
 */
export function checkValue(value, id) {
  const findings = [];
  const words = id
    ? [id.username, id.hostname, id.gitName, id.gitEmail].filter((w) => w && w.length >= 3)
    : [];
  const wordRes = words.map(
    (w) => new RegExp(`(?<![A-Za-z0-9])${escapeRe(w)}(?![A-Za-z0-9])`, 'i'),
  );
  const visit = (v, path) => {
    if (typeof v === 'string') {
      for (const s of findSecrets(v))
        findings.push({ path, rule: `secret:${s.label}`, preview: preview(v.slice(s.index)) });
      if (/[A-Za-z]:(?:\\{1,2}|\/)Users(?:\\{1,2}|\/)(?!user\b|Public\b)[^\\/\s"'`]/i.test(v))
        findings.push({ path, rule: 'home-path', preview: preview(v) });
      if (/\/(?:home|Users)\/(?!user\b)[^/\s"'`]/.test(v))
        findings.push({ path, rule: 'home-path', preview: preview(v) });
      if (
        /[A-Za-z0-9._%+-]+@(?!example\.com\b|anthropic\.com\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(v)
      )
        findings.push({ path, rule: 'email', preview: preview(v) });
      wordRes.forEach((re) => {
        if (re.test(v)) findings.push({ path, rule: 'local-identity', preview: preview(v) });
      });
      for (const tok of v.match(/[A-Za-z0-9+/_=-]{32,}/g) ?? []) {
        if (ID_LIKE.some((re) => re.test(tok))) continue;
        if (entropy(tok) >= 4.5)
          findings.push({ path, rule: 'high-entropy', preview: preview(tok) });
      }
      return;
    }
    if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${path}[${i}]`));
    else if (isObj(v)) {
      for (const [k, x] of Object.entries(v)) {
        if (FORBIDDEN_KEYS.has(k))
          findings.push({ path: `${path}.${k}`, rule: 'forbidden-key', preview: k });
        visit(x, `${path}.${k}`);
      }
    }
  };
  visit(value, '$');
  return findings;
}

/** Checks every .jsonl file in `dir`. Returns `{ files, findings }`. */
export function checkDir(dir, id) {
  const findings = [];
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.jsonl'))
        .sort()
    : [];
  for (const f of files) {
    const lines = readFileSync(join(dir, f), 'utf8').split(/\r?\n/);
    lines.forEach((text, i) => {
      if (!text.trim()) return;
      let value;
      try {
        value = JSON.parse(text);
      } catch {
        findings.push({ file: f, line: i + 1, path: '$', rule: 'invalid-json', preview: '' });
        return;
      }
      for (const x of checkValue(value, id)) findings.push({ file: f, line: i + 1, ...x });
    });
  }
  return { files, findings };
}

// ----------------------------------------------------------------------------------- file helpers

function parseJsonl(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // a truncated last line is expected when a recording is interrupted
    }
  }
  return out;
}

const toJsonl = (records) =>
  records
    .filter((r) => r !== null)
    .map((r) => JSON.stringify(r))
    .join('\n') + '\n';

function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Resolves `<dir>/<file>` and refuses anything outside `dir` or through a symlink. */
function safeFile(dir, file) {
  if (isSymlink(dir)) throw new Error(`${dir} is a symlink: refusing`);
  const real = realpathSync(dir);
  const target = resolve(real, file);
  if (dirname(target) !== real || !target.startsWith(real + sep))
    throw new Error(`${file} escapes ${dir}`);
  if (isSymlink(target)) throw new Error(`${file} is a symlink: refusing`);
  return target;
}

/** Sanitizes one recording (stream + optional hooks). Pure apart from `id`. */
export function sanitizeSession(streamRecords, hookRecords, id) {
  const init = streamRecords.find((l) => isObj(l) && l.type === 'system' && l.subtype === 'init');
  const cwd =
    (isObj(init) && typeof init.cwd === 'string' && init.cwd) ||
    hookRecords.map((h) => h?.payload?.cwd).find((c) => typeof c === 'string') ||
    '';
  const clean = makeCleaner(cwd, id);
  const tools = new Map();
  return {
    stream: streamRecords.map((l) => cleanStreamLine(l, clean, tools)),
    hooks: hookRecords.map((h) => cleanHookRecord(h, clean)),
  };
}

export function sanitizeAll(id = localIdentity()) {
  if (!existsSync(RAW_DIR)) throw new Error(`No recordings: ${RAW_DIR} does not exist.`);
  mkdirSync(SANITIZED_DIR, { recursive: true });
  const names = readdirSync(RAW_DIR)
    .filter((f) => f.endsWith('.jsonl') && !f.endsWith('.hooks.jsonl'))
    .map((f) => f.slice(0, -'.jsonl'.length))
    .filter((n) => SESSION_NAME.test(n))
    .sort();
  for (const name of names) {
    const rawStream = safeFile(RAW_DIR, `${name}.jsonl`);
    const rawHooksName = `${name}.hooks.jsonl`;
    const rawHooks = existsSync(join(RAW_DIR, rawHooksName))
      ? safeFile(RAW_DIR, rawHooksName)
      : null;
    const { stream, hooks } = sanitizeSession(
      parseJsonl(readFileSync(rawStream, 'utf8')),
      rawHooks ? parseJsonl(readFileSync(rawHooks, 'utf8')) : [],
      id,
    );
    writeFileSync(safeFile(SANITIZED_DIR, `${name}.jsonl`), toJsonl(stream), 'utf8');
    if (rawHooks) writeFileSync(safeFile(SANITIZED_DIR, rawHooksName), toJsonl(hooks), 'utf8');
    console.log(`  ✓ ${name}: ${stream.length} stream lines, ${hooks.length} hook records`);
  }
  return names;
}

// ------------------------------------------------------------------------------------------- CLI

function main() {
  const checkOnly = process.argv.includes('--check');
  const id = localIdentity();
  if (!checkOnly) {
    console.log('Sanitizing packages/fixtures/raw → packages/fixtures/sanitized');
    sanitizeAll(id);
  }
  const { files, findings } = checkDir(SANITIZED_DIR, id);
  console.log(`\nChecked ${files.length} sanitized file(s).`);
  for (const f of findings)
    console.error(`  ✗ ${f.file}:${f.line} ${f.path} — ${f.rule} ${f.preview}`);
  if (findings.length > 0) {
    console.error(`\n${findings.length} finding(s): the sanitized fixtures are not publishable.`);
    process.exit(1);
  }
  console.log('No secrets or personal data found.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
