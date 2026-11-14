// Turns one raw recording (stream-json lines + hook captures) into a Replay.
// Timing comes from the hooks (PreToolUse/PostToolUse), with the stream-json timestamps as fallback;
// agents, errors and permission denials come from the stream. Absolute paths are made relative to
// the session cwd, the home directory is masked, and no file content is kept.
import type { OpKind, Outcome, Replay, ReplayAgent, ReplayOp } from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const time = (v: unknown): number | undefined => {
  const s = str(v);
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : t;
};

/** How long a denied permission request is shown as waiting, since `claude -p` denies at once. */
export const SIMULATED_WAIT_MS = 6000;

const KIND: Record<string, OpKind> = {
  Read: 'read',
  Glob: 'search',
  Grep: 'search',
  Edit: 'write',
  MultiEdit: 'write',
  Write: 'write',
  NotebookEdit: 'write',
  Bash: 'shell',
  PowerShell: 'shell',
  Agent: 'agent',
  Task: 'agent',
};

export function makeSanitizer(cwd: string) {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const forms = cwd ? [cwd, cwd.replace(/\\/g, '/')] : [];
  const cwdRe = forms.length ? new RegExp(`(${forms.map(esc).join('|')})`, 'gi') : null;
  const homeRe = /[A-Z]:[\\/]Users[\\/][^\\/\s"'`]+/gi;
  const text = (s: string) => {
    let out = cwdRe ? s.replace(cwdRe, '.') : s;
    out = out.replace(homeRe, '~');
    return out;
  };
  const path = (p: string) => {
    let out = text(p).replace(/\\/g, '/');
    if (out === '.') return '.';
    if (out.startsWith('./')) out = out.slice(2);
    return out;
  };
  return { text, path };
}

interface ToolUse {
  id: string;
  name: string;
  input: Obj;
  parent: string | null;
  at?: number;
}
interface ToolResult {
  isError: boolean;
  text: string;
  at?: number;
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content))
    return content.map((c) => (isObj(c) ? (str(c.text) ?? '') : '')).join('\n');
  return '';
}

function countPatch(patch: unknown): { add: number; del: number } | undefined {
  if (!Array.isArray(patch)) return undefined;
  let add = 0;
  let del = 0;
  for (const h of patch) {
    if (!isObj(h) || !Array.isArray(h.lines)) continue;
    for (const l of h.lines) {
      if (typeof l !== 'string') continue;
      if (l.startsWith('+')) add++;
      else if (l.startsWith('-')) del++;
    }
  }
  return { add, del };
}

const lineCount = (s: string) => (s === '' ? 0 : s.replace(/\n$/, '').split('\n').length);

/** "fail 1" (node --test), "2 failing" (mocha), "1 failed" (vitest/jest). */
export function failingCount(output: string): number {
  const m =
    /(?:^|\n)\s*(?:ℹ\s*)?fail\s+([1-9]\d*)/i.exec(output) ??
    /\b([1-9]\d*)\s+(?:failing|failed)\b/i.exec(output);
  return m ? Number(m[1]) : 0;
}

export function normalize(name: string, stream: unknown[], hooks: unknown[]): Replay {
  const lines = stream.filter(isObj);
  const hookLines = hooks
    .filter(isObj)
    .map((h) => ({ at: time(h.capturedAt), p: isObj(h.payload) ? h.payload : {} }));

  const init = lines.find((l) => l.type === 'system' && l.subtype === 'init');
  const cwd = str(init?.cwd) ?? str(hookLines.find((h) => str(h.p.cwd))?.p.cwd) ?? '';
  const clean = makeSanitizer(cwd);

  // --- tool calls, results and denials from the stream ---
  const uses: ToolUse[] = [];
  const results = new Map<string, ToolResult>();
  const denied = new Set<string>();
  let summary = '';
  let blocked = false;
  let resultLine: Obj | undefined;
  for (const l of lines) {
    const at = time(l.timestamp);
    const msg = isObj(l.message) ? l.message : undefined;
    const content = Array.isArray(msg?.content) ? msg.content : [];
    if (l.type === 'assistant') {
      for (const c of content) {
        if (!isObj(c) || c.type !== 'tool_use') continue;
        const id = str(c.id);
        const nm = str(c.name);
        if (!id || !nm) continue;
        uses.push({
          id,
          name: nm,
          input: isObj(c.input) ? c.input : {},
          parent: str(l.parent_tool_use_id) ?? null,
          at,
        });
      }
    } else if (l.type === 'user') {
      for (const c of content) {
        if (!isObj(c) || c.type !== 'tool_result') continue;
        const id = str(c.tool_use_id);
        if (id) results.set(id, { isError: c.is_error === true, text: resultText(c.content), at });
      }
    } else if (l.type === 'system' && l.subtype === 'permission_denied') {
      const id = str(l.tool_use_id);
      if (id) denied.add(id);
    } else if (l.type === 'system' && l.subtype === 'post_turn_summary') {
      summary = str(l.status_detail) ?? summary;
      blocked = l.status_category === 'blocked';
    } else if (l.type === 'result') {
      resultLine = l;
    }
  }

  // --- precise timing from the hooks ---
  const pre = new Map<string, number>();
  const post = new Map<string, { at?: number; res: unknown }>();
  let promptAt: number | undefined;
  let stopAt: number | undefined;
  let prompt = '';
  for (const h of hookLines) {
    const ev = h.p.hook_event_name;
    const id = str(h.p.tool_use_id);
    if (ev === 'UserPromptSubmit') {
      promptAt ??= h.at;
      prompt ||= str(h.p.prompt) ?? '';
    } else if (ev === 'Stop' || ev === 'SessionEnd') stopAt = h.at ?? stopAt;
    else if (ev === 'PreToolUse' && id && h.at !== undefined) pre.set(id, h.at);
    else if (ev === 'PostToolUse' && id) post.set(id, { at: h.at, res: h.p.tool_response });
  }

  const firstStream = lines.map((l) => time(l.timestamp)).find((t) => t !== undefined);
  const t0 = promptAt ?? hookLines.find((h) => h.at !== undefined)?.at ?? firstStream ?? 0;
  const rel = (t: number | undefined) => Math.max(0, (t ?? t0) - t0);

  // --- ops ---
  const ops: ReplayOp[] = uses.map((u) => {
    const kind = KIND[u.name] ?? 'other';
    const r = results.get(u.id);
    const p = post.get(u.id);
    const res = isObj(p?.res) ? p.res : {};
    const start = rel(pre.get(u.id) ?? u.at);
    const end = Math.max(start, rel(p?.at ?? r?.at ?? pre.get(u.id) ?? u.at));
    const filePath = str(u.input.file_path) ?? str(u.input.notebook_path);
    let target: string | null = null;
    const matches: string[] = [];
    if ((kind === 'read' || kind === 'write') && filePath) target = clean.path(filePath);
    else if (kind === 'shell') target = clean.text(str(u.input.command) ?? '');
    else if (kind === 'agent') target = clean.text(str(u.input.description) ?? '');
    else if (kind === 'search') {
      const pat = str(u.input.pattern) ?? '';
      const where = str(u.input.path);
      target = where ? `${pat} in ${clean.path(where)}` : pat;
      const names = Array.isArray(res.filenames) ? res.filenames : [];
      for (const f of names) if (typeof f === 'string') matches.push(clean.path(f));
      const body = str(res.content);
      if (body)
        for (const line of body.split('\n')) {
          const m = /^(.+?):\d+:/.exec(line);
          if (m?.[1]) matches.push(clean.path(m[1]));
        }
    }

    let outcome: Outcome = 'ok';
    let reason: string | undefined;
    if (denied.has(u.id)) {
      outcome = 'denied';
      reason = 'denied';
    } else if (r?.isError) {
      outcome = 'error';
      reason = /does not exist|not found|no such file/i.test(r.text) ? 'not found' : 'failed';
    } else if (kind === 'shell') {
      const out = str(res.stdout) ?? r?.text ?? '';
      const n = failingCount(out);
      if (n > 0) {
        outcome = 'error';
        reason = `${n} failing`;
      }
    }

    let diff: ReplayOp['diff'];
    if (kind === 'write' && outcome === 'ok') {
      diff = countPatch(res.structuredPatch);
      if ((!diff || diff.add + diff.del === 0) && res.type === 'create')
        diff = { add: lineCount(str(u.input.content) ?? ''), del: 0 };
    }

    return {
      id: u.id,
      agent: u.parent ? `sub:${u.parent}` : 'main',
      tool: u.name,
      kind,
      target,
      matches: [...new Set(matches)],
      start,
      end,
      outcome,
      ...(reason ? { reason } : {}),
      ...(diff ? { diff } : {}),
    };
  });
  ops.sort((a, b) => a.start - b.start || a.end - b.end);

  let duration = Math.max(rel(stopAt), ...ops.map((o) => o.end + 500), 1000);

  // --- denied requests: show them as a waiting block (claude -p denies them at once) ---
  const simulated: string[] = [];
  for (const op of ops) {
    if (op.outcome !== 'denied' || op.end - op.start >= SIMULATED_WAIT_MS) continue;
    const delta = SIMULATED_WAIT_MS - (op.end - op.start);
    const pivot = op.start;
    for (const o of ops) {
      if (o === op) continue;
      if (o.start > pivot) o.start += delta;
      if (o.end > pivot) o.end += delta;
    }
    op.end = op.start + SIMULATED_WAIT_MS;
    op.simulatedWait = true;
    duration += delta;
    if (!simulated.includes('wait')) simulated.push('wait');
  }

  // --- agents ---
  const agents: ReplayAgent[] = [
    { id: 'main', code: 'CL', name: 'Claude', kind: 'claude', start: 0, end: duration },
  ];
  const used = new Set(['CL']);
  for (const op of ops) {
    if (op.kind !== 'agent') continue;
    const u = uses.find((x) => x.id === op.id);
    const nm = str(u?.input.subagent_type) ?? 'agent';
    let code =
      nm
        .replace(/[^a-z]/gi, '')
        .slice(0, 2)
        .toUpperCase() || 'SA';
    for (let i = 2; used.has(code); i++) code = `${code[0]}${i}`;
    used.add(code);
    agents.push({
      id: `sub:${op.id}`,
      code,
      name: nm,
      kind: 'sub',
      ...(op.target ? { task: op.target } : {}),
      start: op.start,
      end: op.end,
      parentOp: op.id,
    });
  }

  const files = new Set<string>();
  for (const op of ops) {
    if ((op.kind === 'read' || op.kind === 'write') && op.target) files.add(op.target);
    for (const m of op.matches) files.add(m);
  }

  const usage = isObj(resultLine?.usage) ? resultLine.usage : {};
  const tokens = Object.entries(usage)
    .filter(([k]) => k.endsWith('_tokens'))
    .reduce((s, [, v]) => s + (num(v) ?? 0), 0);

  return {
    name,
    prompt: clean.text(prompt),
    duration,
    agents,
    ops,
    files: [...files].filter((f) => !f.startsWith('~') && !f.startsWith('..')).sort(),
    result: {
      ok: resultLine?.is_error !== true && !blocked,
      summary: clean.text(summary),
      tokens,
      costUsd: num(resultLine?.total_cost_usd) ?? 0,
    },
    simulated,
  };
}

/** Parses a JSONL text, skipping blank or malformed lines. */
export function parseJsonl(text: string): unknown[] {
  const out: unknown[] = [];
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
