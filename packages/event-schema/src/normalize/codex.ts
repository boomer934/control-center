// Live normalizer of one Codex session (phase 5f, ADR 0017/0018): the notifications of `codex
// app-server` (JSON-RPC over stdio) arrive one at a time and leave as AgentEvents.
//
// This is the minimal normalizer the main process ships with the session: turns, messages,
// commands, file changes, MCP and web calls, approvals, token usage and provider reroutes. The
// full mapping (subagents, plans, reasoning, richer search results) belongs to phase 5f.2.
//
// A session is a series of turns on one thread: each turn opens with `session.started` (on the
// server's `turn/started`) and closes with `session.ended` (on `turn/completed`, or when the app
// gives up on it), and `seq` keeps counting across turns, as in LiveClaudeSession.
import { modelIdSchema, effortSchema, SCHEMA_VERSION, type AgentEvent } from '../schema';
import type { ErrorDraft } from '../stack';
import { EPOCH, failingCount, isObj, makeTools, num, short, str, type Obj } from './common';
import type { LiveSessionContext, RunConfig } from './live';

type Draft = AgentEvent extends infer E
  ? E extends AgentEvent
    ? Omit<E, 'schemaVersion' | 'id' | 'seq' | 'sessionId' | 'source' | 'provider' | 'agentId'>
    : never
  : never;

interface Turn {
  /** The server's id of the turn, once known (response of `turn/start` or `turn/started`). */
  id?: string;
  /** What the user chose for this turn (absent: the CLI's configuration). */
  config: RunConfig;
  /** What the turn actually runs with, as far as the app knows. */
  effective: RunConfig;
  cliVersion?: string;
  started: boolean;
  ended: boolean;
  /** Calls opened by `item/started` and not closed yet, by item id. */
  open: Map<string, { tool: string; kind: string }>;
  /** Item ids already reported as finished. */
  done: Set<string>;
}

const validModel = (v: unknown) => modelIdSchema.safeParse(v).data;
const validEffort = (v: unknown) => effortSchema.safeParse(v).data;

/** `+`/`-` line counts of a unified diff; the whole text counts as added for a new file. */
export function countDiff(diff: string, created: boolean): { add: number; del: number } {
  let add = 0;
  let del = 0;
  const lines = diff.replace(/\n$/, '').split('\n');
  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) add++;
    else if (line.startsWith('-')) del++;
  }
  if (created && add === 0 && del === 0 && diff !== '') add = lines.length;
  return { add, del };
}

/** Text of a `userMessage` item: its text inputs, joined. */
function userText(item: Obj): string {
  if (!Array.isArray(item.content)) return '';
  return item.content
    .map((c) => (isObj(c) && c.type === 'text' ? (str(c.text) ?? '') : ''))
    .filter(Boolean)
    .join('\n');
}

export class LiveCodexSession {
  private seq = 0;
  private last = EPOCH;
  private turn: Turn | undefined;
  private config: RunConfig | undefined;
  private readonly tools: ReturnType<typeof makeTools>;

  constructor(private readonly ctx: LiveSessionContext) {
    this.tools = makeTools(ctx.cwd);
  }

  get count(): number {
    return this.seq;
  }

  /** The choice of the session's earlier turns, when it resumes from the history. */
  restoreConfig(config: RunConfig): void {
    this.config = { model: config.model, effort: config.effort };
  }

  /**
   * The app sends `turn/start`. `config`: the user's choice (absent fields: the CLI decides);
   * `effective`: what the turn runs with. Nothing is emitted until the server confirms the turn:
   * a turn the server refuses changes nothing.
   */
  startTurn(
    at: string,
    config: RunConfig,
    effective: RunConfig = config,
    cliVersion?: string,
  ): AgentEvent[] {
    const out = this.turn ? this.endTurn(at) : [];
    this.turn = {
      config: { model: config.model, effort: config.effort },
      effective: { model: effective.model, effort: effective.effort },
      cliVersion,
      started: false,
      ended: false,
      open: new Map(),
      done: new Set(),
    };
    return out;
  }

  /** The id the server gave the turn (the response of `turn/start`). */
  bindTurn(turnId: string, at: string): AgentEvent[] {
    const turn = this.turn;
    if (!turn || turn.ended) return [];
    turn.id ??= turnId;
    const out: AgentEvent[] = [];
    if (turn.id === turnId) this.ensureStarted(turn, at, out);
    return out;
  }

  /** One server notification. Notifications of other turns (a resumed thread replays some) are dropped. */
  notification(method: string, params: unknown, at: string): AgentEvent[] {
    const turn = this.turn;
    const out: AgentEvent[] = [];
    if (!turn || turn.ended || !isObj(params)) return out;
    const turnId = str(params.turnId) ?? (isObj(params.turn) ? str(params.turn.id) : undefined);
    if (method === 'turn/started' && turnId) turn.id ??= turnId;
    if (turnId === undefined || turn.id === undefined || turnId !== turn.id) return out;
    this.ensureStarted(turn, at, out);
    switch (method) {
      case 'item/started':
        if (isObj(params.item)) this.itemStarted(turn, params.item, at, out);
        break;
      case 'item/completed':
        if (isObj(params.item)) this.itemCompleted(turn, params.item, at, out);
        break;
      case 'thread/tokenUsage/updated':
        this.usage(turn, params, at, out);
        break;
      case 'model/rerouted':
        this.rerouted(turn, params, at, out);
        break;
      case 'error':
        if (params.willRetry !== true && isObj(params.error)) {
          const message = this.tools.text(str(params.error.message) ?? '');
          if (message)
            this.emit(
              { type: 'notification', timestamp: at, kind: 'other', message: short(message) },
              out,
            );
        }
        break;
      case 'turn/completed':
        if (isObj(params.turn)) this.completed(turn, params.turn, at, out);
        break;
    }
    return out;
  }

  /** The server asks the user to approve a command or a file change of this turn. */
  approvalRequested(
    request: { toolUseId: string; tool: string; detail?: string },
    at: string,
  ): AgentEvent[] {
    const turn = this.turn;
    const out: AgentEvent[] = [];
    if (!turn || turn.ended) return out;
    this.ensureStarted(turn, at, out);
    this.emit(
      {
        type: 'permission.requested',
        timestamp: at,
        toolUseId: request.toolUseId,
        tool: request.tool,
        ...(request.detail ? { detail: short(this.tools.text(request.detail)) } : {}),
      },
      out,
    );
    return out;
  }

  /** The user answered an approval request (or the turn ended and the app cancelled it). */
  approvalResolved(
    request: { toolUseId: string; tool: string; decision: 'allowed' | 'denied' },
    at: string,
  ): AgentEvent[] {
    const out: AgentEvent[] = [];
    if (!this.turn || this.turn.ended) return out;
    this.emit(
      {
        type: 'permission.resolved',
        timestamp: at,
        toolUseId: request.toolUseId,
        tool: request.tool,
        decision: request.decision,
        by: 'user',
      },
      out,
    );
    return out;
  }

  /**
   * The app stops following the turn (the server died, `turn/start` failed): close what is open
   * and end the turn, if it started.
   */
  endTurn(at?: string, reason = 'process-exited'): AgentEvent[] {
    const turn = this.turn;
    this.turn = undefined;
    const out: AgentEvent[] = [];
    if (!turn || turn.ended || !turn.started) return out;
    const timestamp = at ?? this.last;
    this.closeOpen(turn, timestamp, out);
    turn.ended = true;
    this.emit({ type: 'session.ended', timestamp, ok: false, status: 'failed', reason }, out);
    return out;
  }

  /** Errors the app found in the workspace's output (phase 5e). */
  appErrors(drafts: readonly ErrorDraft[], at: string): AgentEvent[] {
    const out: AgentEvent[] = [];
    for (const draft of drafts)
      this.emit({ ...draft, type: 'error.detected', timestamp: at }, out, 'app');
    return out;
  }

  // ── turn lifecycle ──

  private ensureStarted(turn: Turn, at: string, out: AgentEvent[]): void {
    if (turn.started) return;
    turn.started = true;
    this.applyConfig(turn, at, out);
    const model = validModel(turn.effective.model);
    const effort = validEffort(turn.effective.effort);
    this.emit(
      {
        type: 'session.started',
        timestamp: at,
        ...(model ? { model } : {}),
        ...(effort ? { effort } : {}),
        ...(turn.cliVersion ? { cliVersion: turn.cliVersion } : {}),
      },
      out,
    );
  }

  /** A user change of model or effort, against the last turn that really started. */
  private applyConfig(turn: Turn, at: string, out: AgentEvent[]): void {
    const next = turn.config;
    const before = this.config;
    const changed =
      before === undefined
        ? next.model !== undefined || next.effort !== undefined
        : before.model !== next.model || before.effort !== next.effort;
    this.config = next;
    if (!changed) return;
    const model = validModel(next.model);
    const effort = validEffort(next.effort);
    const previousModel = validModel(before?.model);
    const previousEffort = validEffort(before?.effort);
    this.emit(
      {
        type: 'session.configChanged',
        timestamp: at,
        ...(model ? { model } : {}),
        ...(effort ? { effort } : {}),
        ...(previousModel ? { previousModel } : {}),
        ...(previousEffort ? { previousEffort } : {}),
        by: 'user',
      },
      out,
      'app',
    );
  }

  private completed(turn: Turn, info: Obj, at: string, out: AgentEvent[]): void {
    const status = str(info.status);
    this.closeOpen(turn, at, out);
    turn.ended = true;
    const durationMs = num(info.durationMs);
    const error = isObj(info.error) ? this.tools.text(str(info.error.message) ?? '') : '';
    const ok = status === 'completed';
    this.emit(
      {
        type: 'session.ended',
        timestamp: at,
        ok,
        status: ok ? 'completed' : 'failed',
        ...(status === 'interrupted'
          ? { reason: 'interrupted' }
          : !ok
            ? { reason: short(error || 'failed', 200) }
            : {}),
        ...(durationMs !== undefined && durationMs >= 0 ? { durationMs } : {}),
        turns: 1,
      },
      out,
    );
  }

  private closeOpen(turn: Turn, timestamp: string, out: AgentEvent[]): void {
    for (const id of turn.open.keys()) {
      turn.done.add(id);
      this.emit(
        {
          type: 'tool.failed',
          timestamp,
          toolUseId: id,
          reason: 'interrupted',
          detail: 'no result before the turn ended',
        },
        out,
      );
    }
    turn.open.clear();
  }

  // ── items ──

  /** What a tool item is, for `tool.called`; undefined: not a tool call. */
  private describe(
    item: Obj,
  ):
    | { tool: string; kind: 'shell' | 'write' | 'mcp' | 'web' | 'other'; target: string | null }
    | undefined {
    switch (item.type) {
      case 'commandExecution': {
        const actions = Array.isArray(item.commandActions) ? item.commandActions.filter(isObj) : [];
        const inner = actions.map((a) => str(a.command) ?? '').filter(Boolean);
        const command = inner.length > 0 ? inner.join(' && ') : (str(item.command) ?? '');
        return { tool: 'shell', kind: 'shell', target: this.tools.text(command) || null };
      }
      case 'fileChange': {
        const changes = Array.isArray(item.changes) ? item.changes.filter(isObj) : [];
        const first = str(changes[0]?.path);
        return {
          tool: 'apply_patch',
          kind: 'write',
          target: first ? this.tools.file(first).path : null,
        };
      }
      case 'mcpToolCall': {
        const server = str(item.server) ?? '';
        const tool = str(item.tool) ?? '';
        return server && tool
          ? { tool: `mcp__${server}__${tool}`, kind: 'mcp', target: null }
          : undefined;
      }
      case 'webSearch':
        return {
          tool: 'web_search',
          kind: 'web',
          target: this.tools.text(str(item.query) ?? '') || null,
        };
      case 'dynamicToolCall': {
        const tool = str(item.tool);
        return tool ? { tool, kind: 'other', target: null } : undefined;
      }
      default:
        return undefined;
    }
  }

  private itemStarted(turn: Turn, item: Obj, at: string, out: AgentEvent[]): void {
    const id = str(item.id);
    if (!id || turn.open.has(id) || turn.done.has(id)) return;
    const call = this.describe(item);
    if (!call) return;
    turn.open.set(id, { tool: call.tool, kind: call.kind });
    this.emit({ type: 'tool.called', timestamp: at, toolUseId: id, ...call }, out);
    if (call.kind === 'mcp') {
      const server = str(item.server) ?? '';
      const tool = str(item.tool) ?? '';
      this.emit({ type: 'mcp.called', timestamp: at, toolUseId: id, server, tool }, out);
    }
  }

  private itemCompleted(turn: Turn, item: Obj, at: string, out: AgentEvent[]): void {
    const id = str(item.id);
    if (!id || turn.done.has(id)) return;
    if (item.type === 'userMessage') {
      turn.done.add(id);
      const text = userText(item);
      if (text)
        this.emit({ type: 'message.user', timestamp: at, text: this.tools.text(text) }, out);
      return;
    }
    if (item.type === 'agentMessage') {
      turn.done.add(id);
      const text = str(item.text) ?? '';
      const model = validModel(turn.effective.model);
      if (text)
        this.emit(
          {
            type: 'message.assistant',
            timestamp: at,
            text: this.tools.text(text),
            ...(model ? { model } : {}),
          },
          out,
        );
      return;
    }
    if (!this.describe(item)) return;
    if (!turn.open.has(id)) this.itemStarted(turn, item, at, out);
    turn.open.delete(id);
    turn.done.add(id);
    const status = str(item.status);
    const durationMs = num(item.durationMs);
    const duration = durationMs !== undefined && durationMs >= 0 ? { durationMs } : {};
    if (status === 'declined') {
      this.emit(
        { type: 'tool.failed', timestamp: at, toolUseId: id, reason: 'denied', ...duration },
        out,
      );
      return;
    }
    if (status === 'failed' || (item.type === 'dynamicToolCall' && item.success === false)) {
      const output = str(item.aggregatedOutput) ?? '';
      const exit = num(item.exitCode);
      const error = isObj(item.error) ? (str(item.error.message) ?? '') : '';
      const detail = error || (exit !== undefined ? `exit ${exit}` : '');
      this.emit(
        {
          type: 'tool.failed',
          timestamp: at,
          toolUseId: id,
          reason: failingCount(output) > 0 ? 'tests-failing' : 'failed',
          ...(detail ? { detail: short(this.tools.text(detail), 200) } : {}),
          ...duration,
        },
        out,
      );
      return;
    }
    if (item.type === 'commandExecution') {
      const actions = Array.isArray(item.commandActions) ? item.commandActions.filter(isObj) : [];
      for (const action of actions) {
        const path = action.type === 'read' ? str(action.path) : undefined;
        if (path)
          this.emit(
            { type: 'file.read', timestamp: at, toolUseId: id, file: this.tools.file(path) },
            out,
          );
      }
      const exit = num(item.exitCode);
      if (exit !== undefined && exit !== 0) {
        const output = str(item.aggregatedOutput) ?? '';
        this.emit(
          {
            type: 'tool.failed',
            timestamp: at,
            toolUseId: id,
            reason: failingCount(output) > 0 ? 'tests-failing' : 'failed',
            detail: `exit ${exit}`,
            ...duration,
          },
          out,
        );
        return;
      }
    }
    if (item.type === 'fileChange' && Array.isArray(item.changes)) {
      for (const change of item.changes.filter(isObj)) {
        const path = str(change.path);
        if (!path) continue;
        const created = isObj(change.kind) && change.kind.type === 'add';
        const diff = str(change.diff);
        this.emit(
          {
            type: 'file.written',
            timestamp: at,
            toolUseId: id,
            file: this.tools.file(path),
            op: created ? 'create' : 'edit',
            ...(diff !== undefined ? { diff: countDiff(diff, created) } : {}),
          },
          out,
        );
      }
    }
    this.emit({ type: 'tool.completed', timestamp: at, toolUseId: id, ...duration }, out);
  }

  // ── usage and reroutes ──

  private usage(turn: Turn, params: Obj, at: string, out: AgentEvent[]): void {
    const usage =
      isObj(params.tokenUsage) && isObj(params.tokenUsage.last)
        ? params.tokenUsage.last
        : undefined;
    if (!usage) return;
    const n = (v: unknown) => {
      const x = num(v);
      return x === undefined || x < 0 ? 0 : Math.round(x);
    };
    const input = n(usage.inputTokens);
    const cached = Math.min(n(usage.cachedInputTokens), input);
    const model = validModel(turn.effective.model);
    this.emit(
      {
        type: 'usage.updated',
        timestamp: at,
        scope: 'message',
        ...(model ? { model } : {}),
        // Codex counts cached input inside `inputTokens`: split it like Claude's usage
        inputTokens: input - cached,
        outputTokens: n(usage.outputTokens),
        cacheReadTokens: cached,
        cacheCreationTokens: n(usage.cacheWriteInputTokens),
      },
      out,
    );
  }

  private rerouted(turn: Turn, params: Obj, at: string, out: AgentEvent[]): void {
    const model = validModel(params.toModel);
    const previousModel = validModel(params.fromModel) ?? validModel(turn.effective.model);
    if (!model) return;
    turn.effective = { ...turn.effective, model };
    const effort = validEffort(turn.effective.effort);
    this.emit(
      {
        type: 'session.configChanged',
        timestamp: at,
        model,
        ...(effort ? { effort } : {}),
        ...(previousModel ? { previousModel } : {}),
        by: 'provider',
      },
      out,
    );
  }

  private emit(draft: Draft, out: AgentEvent[], source: 'codex' | 'app' = 'codex'): void {
    const seq = this.seq++;
    const timestamp = draft.timestamp < this.last ? this.last : draft.timestamp;
    this.last = timestamp;
    out.push({
      ...draft,
      schemaVersion: SCHEMA_VERSION,
      id: `${this.ctx.sessionId}:${seq}`,
      sessionId: this.ctx.sessionId,
      seq,
      timestamp,
      source,
      provider: 'codex',
      agentId: 'main',
    } as AgentEvent);
  }
}
