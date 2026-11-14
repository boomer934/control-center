// Checks the raw session recordings in packages/fixtures/raw/.
//
// For every <name>.jsonl (Claude Code stream-json) and <name>.hooks.jsonl
// (written by capture-hook.mjs) it verifies that each line is valid JSON and
// prints what the recording contains. It then checks that the whole set covers
// the behaviours the Live View must render: file edits, shell commands,
// subagents, permission denials and errors.
//
// Usage: node scripts/fixtures/check-raw.mjs [--min <sessions>]   (default 5)
// Exit code 1 when a line is invalid, sessions are missing or coverage is incomplete.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rawDir = join(repoRoot, 'packages', 'fixtures', 'raw');

const minArg = process.argv.indexOf('--min');
const minSessions = minArg === -1 ? 5 : Number(process.argv[minArg + 1]);
if (!Number.isInteger(minSessions) || minSessions < 0) {
  console.error('--min expects a non-negative integer');
  process.exit(1);
}

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const SUBAGENT_TOOLS = new Set(['Agent', 'Task']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

const coverage = {
  'file edit (Edit/Write)': false,
  'shell command (Bash/PowerShell)': false,
  'subagent (Agent/Task or SubagentStop)': false,
  'permission denial': false,
  'tool error (is_error)': false,
};

let problems = 0;

function bump(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function format(map) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `${key}×${count}`)
    .join(', ');
}

function readLines(file) {
  const records = [];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.trim() === '') return;
    try {
      records.push(JSON.parse(line));
    } catch {
      problems += 1;
      console.error(`  ✗ ${file}:${index + 1} is not valid JSON`);
    }
  });
  return records;
}

function contentBlocks(record) {
  const content = record?.message?.content;
  return Array.isArray(content) ? content : [];
}

function checkStream(name) {
  const records = readLines(join(rawDir, `${name}.jsonl`));
  const types = new Map();
  const tools = new Map();
  let errors = 0;
  let denials = 0;

  for (const record of records) {
    bump(types, record.subtype ? `${record.type}/${record.subtype}` : String(record.type));
    for (const block of contentBlocks(record)) {
      if (block.type === 'tool_use') {
        bump(tools, block.name);
        if (EDIT_TOOLS.has(block.name)) coverage['file edit (Edit/Write)'] = true;
        // On Windows Claude Code may run shell commands through PowerShell instead of Bash.
        if (SHELL_TOOLS.has(block.name)) coverage['shell command (Bash/PowerShell)'] = true;
        if (SUBAGENT_TOOLS.has(block.name))
          coverage['subagent (Agent/Task or SubagentStop)'] = true;
      }
      if (block.type === 'tool_result' && block.is_error === true) errors += 1;
    }
    if (record.type === 'result' && Array.isArray(record.permission_denials)) {
      denials += record.permission_denials.length;
    }
  }

  if (errors > 0) coverage['tool error (is_error)'] = true;
  if (denials > 0) coverage['permission denial'] = true;

  console.log(`  stream: ${records.length} lines — ${format(types)}`);
  console.log(`  tools:  ${format(tools) || 'none'}`);
  console.log(`  tool errors: ${errors} · permission denials: ${denials}`);
  if (!records.some((record) => record.type === 'result')) {
    problems += 1;
    console.error('  ✗ no final `result` line: the recording looks truncated');
  }
}

function checkHooks(name) {
  const file = join(rawDir, `${name}.hooks.jsonl`);
  if (!existsSync(file)) {
    problems += 1;
    console.error(`  ✗ missing ${name}.hooks.jsonl`);
    return;
  }
  const records = readLines(file);
  const events = new Map();
  for (const record of records) {
    const event = record?.payload?.hook_event_name ?? 'unknown';
    const tool = record?.payload?.tool_name;
    bump(events, tool ? `${event}:${tool}` : event);
    if (event === 'SubagentStop') coverage['subagent (Agent/Task or SubagentStop)'] = true;
  }
  console.log(`  hooks:  ${records.length} lines — ${format(events)}`);
}

if (!existsSync(rawDir)) {
  console.error(`No recordings: ${rawDir} does not exist.`);
  process.exit(1);
}

const sessions = readdirSync(rawDir)
  .filter((file) => file.endsWith('.jsonl') && !file.endsWith('.hooks.jsonl'))
  .map((file) => file.slice(0, -'.jsonl'.length))
  .sort();

for (const name of sessions) {
  console.log(`\n${name}`);
  checkStream(name);
  checkHooks(name);
}

console.log(`\nSessions: ${sessions.length} (minimum ${minSessions})`);
if (sessions.length < minSessions) problems += 1;

console.log('Coverage:');
for (const [label, covered] of Object.entries(coverage)) {
  console.log(`  ${covered ? '✓' : '✗'} ${label}`);
  if (!covered && minSessions > 0) problems += 1;
}

if (problems > 0) {
  console.error(`\n${problems} problem(s) found.`);
  process.exit(1);
}
console.log('\nAll recordings are valid.');
