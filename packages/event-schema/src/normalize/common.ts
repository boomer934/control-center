// Shared pieces of the normalizers: the event log that numbers and stamps events, tool
// classification, and the small parsers both Claude sources need.
import type { AgentEvent, AgentId, Provider, Source, ToolKind } from '../schema';
import { SCHEMA_VERSION } from '../schema';
import { makeTextCleaner, toFileRef, type FileRef } from '../path';

export interface NormalizeContext {
  sessionId: string;
  /** Workspace root as recorded by the agent. Read from the recording when omitted. */
  cwd?: string;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Stamped = 'schemaVersion' | 'id' | 'seq' | 'sessionId' | 'source' | 'provider';
export type EventDraft = DistributiveOmit<AgentEvent, Stamped> & { provider?: Provider };

export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
export const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
export const int = (v: unknown): number => {
  const n = num(v);
  return n === undefined || n < 0 ? 0 : Math.round(n);
};

/** Parses a timestamp into canonical ISO form, or undefined. */
export function iso(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

export const EPOCH = new Date(0).toISOString();

/** Collects events of one source, numbering them and keeping timestamps non-decreasing. */
export class EventLog {
  readonly events: AgentEvent[] = [];
  private last = EPOCH;

  constructor(
    private readonly sessionId: string,
    private readonly source: Source,
    private readonly provider: Provider,
  ) {}

  push(draft: EventDraft): AgentEvent {
    const timestamp = draft.timestamp < this.last ? this.last : draft.timestamp;
    this.last = timestamp;
    const seq = this.events.length;
    const event = {
      schemaVersion: SCHEMA_VERSION,
      id: `${this.sessionId}:${this.source}:${seq}`,
      sessionId: this.sessionId,
      seq,
      source: this.source,
      provider: this.provider,
      ...draft,
      timestamp,
    } as AgentEvent;
    this.events.push(event);
    return event;
  }
}

const KIND: Record<string, ToolKind> = {
  Read: 'read',
  NotebookRead: 'read',
  Glob: 'search',
  Grep: 'search',
  LS: 'search',
  Edit: 'write',
  MultiEdit: 'write',
  Write: 'write',
  NotebookEdit: 'write',
  Bash: 'shell',
  PowerShell: 'shell',
  Agent: 'agent',
  Task: 'agent',
  WebFetch: 'web',
  WebSearch: 'web',
};

export function toolKind(name: string): ToolKind {
  if (name.startsWith('mcp__')) return 'mcp';
  return KIND[name] ?? 'other';
}

/** `mcp__server__tool` → { server, tool }. */
export function parseMcpName(name: string): { server: string; tool: string } | undefined {
  const parts = name.split('__');
  if (parts[0] !== 'mcp' || parts.length < 3 || !parts[1]) return undefined;
  const tool = parts.slice(2).join('__');
  return tool ? { server: parts[1], tool } : undefined;
}

/** File path argument of a file tool, if any. */
export const filePathOf = (input: Obj): string | undefined =>
  str(input.file_path) ?? str(input.notebook_path);

/** Cleaners bound to one workspace. */
export function makeTools(cwd: string) {
  const text = makeTextCleaner(cwd);
  const file = (p: string): FileRef => toFileRef(cwd, p);
  /** One-line description of what a tool call is about. */
  const target = (name: string, input: Obj): string | null => {
    const kind = toolKind(name);
    const fp = filePathOf(input);
    if ((kind === 'read' || kind === 'write') && fp) return file(fp).path;
    if (kind === 'shell') return text(str(input.command) ?? '') || null;
    if (kind === 'agent') return text(str(input.description) ?? '') || null;
    if (kind === 'search') {
      const pattern = text(str(input.pattern) ?? '');
      const where = str(input.path);
      return where ? `${pattern} in ${file(where).path}` : pattern || null;
    }
    if (kind === 'web') return text(str(input.url) ?? str(input.query) ?? '') || null;
    return null;
  };
  return { text, file, target };
}

/** Files a search returned: `filenames`, or the `path:line:` prefixes of Grep content output. */
export function searchedFiles(response: Obj): string[] {
  const out = new Set<string>();
  if (Array.isArray(response.filenames))
    for (const f of response.filenames) if (typeof f === 'string' && f) out.add(f);
  const content = str(response.content);
  if (content)
    for (const line of content.split('\n')) {
      const m = /^(.+?):\d+[:-]/.exec(line);
      if (m?.[1]) out.add(m[1]);
    }
  return [...out];
}

/** Session totals: the sum of `modelUsage` over every model (subagents included). */
export function sessionUsage(result: Obj): {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
} {
  const models = isObj(result.modelUsage) ? Object.values(result.modelUsage).filter(isObj) : [];
  if (models.length > 0) {
    const sum = (k: string) => models.reduce((s, m) => s + int(m[k]), 0);
    return {
      inputTokens: sum('inputTokens'),
      outputTokens: sum('outputTokens'),
      cacheReadTokens: sum('cacheReadInputTokens'),
      cacheCreationTokens: sum('cacheCreationInputTokens'),
    };
  }
  const u = isObj(result.usage) ? result.usage : {};
  return {
    inputTokens: int(u.input_tokens),
    outputTokens: int(u.output_tokens),
    cacheReadTokens: int(u.cache_read_input_tokens),
    cacheCreationTokens: int(u.cache_creation_input_tokens),
  };
}

/** "fail 1" (node --test), "2 failing" (mocha), "1 failed" (vitest/jest). */
export function failingCount(output: string): number {
  const m =
    /(?:^|\n)\s*(?:ℹ\s*)?fail\s+([1-9]\d*)/i.exec(output) ??
    /\b([1-9]\d*)\s+(?:failing|failed)\b/i.exec(output);
  return m ? Number(m[1]) : 0;
}

/** Classifies the error text of a failed tool call. */
export function failureReason(message: string): 'not-found' | 'interrupted' | 'failed' {
  if (/does not exist|not found|no such file|ENOENT|cannot find/i.test(message)) return 'not-found';
  if (/interrupted|aborted by user/i.test(message)) return 'interrupted';
  return 'failed';
}

/** Text of a tool_result `content` (a string or a list of text blocks). */
export function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content))
    return content.map((c) => (isObj(c) ? (str(c.text) ?? '') : '')).join('\n');
  return '';
}

const lineCount = (s: string) => (s === '' ? 0 : s.replace(/\n$/, '').split('\n').length);

/** `+`/`-` counts of a file tool response, falling back to the line count of a created file. */
export function diffOf(
  input: Obj,
  response: Obj,
): { op: 'create' | 'edit'; diff?: { add: number; del: number } } {
  const op = response.type === 'create' ? 'create' : 'edit';
  let add = 0;
  let del = 0;
  let hunks = 0;
  if (Array.isArray(response.structuredPatch)) {
    for (const h of response.structuredPatch) {
      if (!isObj(h) || !Array.isArray(h.lines)) continue;
      hunks++;
      for (const l of h.lines) {
        if (typeof l !== 'string') continue;
        if (l.startsWith('+')) add++;
        else if (l.startsWith('-')) del++;
      }
    }
  }
  if (hunks === 0 && op === 'create') {
    const content = str(input.content) ?? str(response.content);
    if (content !== undefined) return { op, diff: { add: lineCount(content), del: 0 } };
  }
  return hunks > 0 ? { op, diff: { add, del } } : { op };
}

/** Agent id of a line of a subagent (`parent_tool_use_id`), or main. */
export const agentOf = (parentToolUseId: unknown): AgentId => {
  const p = str(parentToolUseId);
  return p ? `sub:${p}` : 'main';
};

/** Short form of a message, for `detail` fields. */
export const short = (s: string, max = 300) => (s.length > max ? `${s.slice(0, max)}…` : s);
