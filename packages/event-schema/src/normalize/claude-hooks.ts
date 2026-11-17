// Claude Code hook payloads → AgentEvents.
//
// Records are `{ capturedAt, payload }`: hooks carry no timestamp of their own, so the receiver
// (scripts/fixtures/capture-hook.mjs today, the hooks bridge in phase 4) stamps them on arrival.
// Hooks give precise start and end times of every tool call, subagent ends and the `Notification`
// that tells when the agent waits for the user.
import type { AgentEvent, AgentId } from '../schema';
import {
  diffOf,
  EPOCH,
  EventLog,
  failingCount,
  failureReason,
  filePathOf,
  isObj,
  iso,
  makeTools,
  num,
  parseMcpName,
  searchedFiles,
  short,
  str,
  toolKind,
  type NormalizeContext,
  type Obj,
} from './common';

type HookRecord = { at: string | undefined; p: Obj };

export interface HooksNormalizerOptions {
  /** Timestamp used until a record carries one (the batch normalizer passes the first one). */
  startAt?: string;
  /** Claude `agent_id` → tool use id of the Agent call that spawned it, when known in advance. */
  links?: ReadonlyMap<string, string>;
  /**
   * Live mode: a subagent hook whose spawning Agent call is ambiguous (several running) is held
   * until `learn` links it, instead of being attributed to the main agent.
   */
  holdAmbiguous?: boolean;
}

/**
 * Incremental hooks normalizer: one `{ capturedAt, payload }` record in, the AgentEvents it
 * produces out. `normalizeClaudeHooks` feeds it a whole recording.
 */
export class ClaudeHooksNormalizer {
  private readonly log: EventLog;
  private cleaners: ReturnType<typeof makeTools>;
  private cwdKnown: boolean;
  private now: string;
  private readonly holdAmbiguous: boolean;
  // Subagent hooks carry Claude's own `agent_id`; AgentEvents key subagents by the tool call that
  // spawned them. The link is in the PostToolUse of that Agent call (`tool_response.agentId`), or
  // in the stream (`parent_tool_use_id`), which the live session passes to `learn`.
  private readonly spawnedBy: Map<string, string>;
  private readonly agentOfTool = new Map<string, string>(); // tool_use_id → Claude agent_id
  private readonly running: string[] = []; // Agent tool calls still running
  private readonly called = new Map<
    string,
    { name: string; input: Obj; at: string; agentId: AgentId }
  >();
  private held: HookRecord[] = [];

  constructor(ctx: NormalizeContext, options: HooksNormalizerOptions = {}) {
    this.log = new EventLog(ctx.sessionId, 'hooks', 'claude');
    this.cleaners = makeTools(ctx.cwd ?? '');
    this.cwdKnown = ctx.cwd !== undefined;
    this.now = options.startAt ?? EPOCH;
    this.spawnedBy = new Map(options.links);
    this.holdAmbiguous = options.holdAmbiguous ?? false;
  }

  /** Normalizes one hook record. */
  push(raw: unknown): AgentEvent[] {
    if (!isObj(raw)) return [];
    const record = { at: iso(raw.capturedAt), p: isObj(raw.payload) ? raw.payload : ({} as Obj) };
    const from = this.log.events.length;
    this.take(record);
    return this.log.events.slice(from);
  }

  /** The stream reported tool call `toolUseId` as made by `agentId`: link its Claude agent. */
  learn(toolUseId: string, agentId: AgentId): AgentEvent[] {
    const claudeAgent = this.agentOfTool.get(toolUseId);
    if (!claudeAgent || !agentId.startsWith('sub:') || this.spawnedBy.has(claudeAgent)) return [];
    this.spawnedBy.set(claudeAgent, agentId.slice(4));
    return this.release(false);
  }

  /** Releases every held record, attributing what is still ambiguous to the main agent. */
  flush(): AgentEvent[] {
    return this.release(true);
  }

  private release(force: boolean): AgentEvent[] {
    const from = this.log.events.length;
    const held = this.held;
    this.held = [];
    for (const r of held) {
      if (force || this.agentOf(r.p) !== undefined) this.process(r);
      else this.held.push(r);
    }
    return this.log.events.slice(from);
  }

  /** `undefined`: a subagent hook that cannot be attributed yet. */
  private agentOf(p: Obj): AgentId | undefined {
    const a = str(p.agent_id);
    if (!a) return 'main';
    const parent =
      this.spawnedBy.get(a) ?? (this.running.length === 1 ? this.running[0] : undefined);
    if (parent) return `sub:${parent}`;
    return this.holdAmbiguous ? undefined : 'main';
  }

  private take(r: HookRecord): void {
    const { p } = r;
    if (!this.cwdKnown && str(p.cwd)) {
      this.cwdKnown = true;
      this.cleaners = makeTools(str(p.cwd) ?? '');
    }
    const a = str(p.agent_id);
    const id = str(p.tool_use_id);
    if (a && id) this.agentOfTool.set(id, a);
    const res = isObj(p.tool_response) ? p.tool_response : undefined;
    const spawned = str(res?.agentId);
    if (p.hook_event_name === 'PostToolUse' && id && spawned) this.spawnedBy.set(spawned, id);
    // keep the order of one agent's hooks: once one is held, the next ones wait too
    const waiting = a !== undefined && this.held.some((h) => str(h.p.agent_id) === a);
    if (waiting || this.agentOf(p) === undefined) {
      this.held.push(r);
      if (spawned) this.release(false);
      return;
    }
    this.process(r);
    if (spawned) this.release(false);
  }

  private stopRunning(id: string): void {
    const i = this.running.indexOf(id);
    if (i >= 0) this.running.splice(i, 1);
  }

  private process({ at, p }: HookRecord): void {
    const { log, called } = this;
    const { text, file, target } = this.cleaners;
    this.now = at ?? this.now;
    const now = this.now;
    const ev = str(p.hook_event_name);
    const agentId = this.agentOf(p) ?? 'main';
    const id = str(p.tool_use_id);
    const name = str(p.tool_name) ?? '';
    const input = isObj(p.tool_input) ? p.tool_input : {};
    const kind = toolKind(name);

    switch (ev) {
      case 'SessionStart':
        log.push({ type: 'session.started', timestamp: now, agentId: 'main' });
        break;
      case 'UserPromptSubmit': {
        const t = text(str(p.prompt) ?? '');
        if (t) log.push({ type: 'message.user', timestamp: now, agentId, text: t });
        break;
      }
      case 'PreToolUse': {
        if (!id || !name) break;
        called.set(id, { name, input, at: now, agentId });
        log.push({
          type: 'tool.called',
          timestamp: now,
          agentId,
          toolUseId: id,
          tool: name,
          kind,
          target: target(name, input),
        });
        if (kind === 'agent') {
          this.running.push(id);
          const task = text(str(input.description) ?? '');
          const model = str(input.model);
          log.push({
            type: 'agent.spawned',
            timestamp: now,
            agentId: `sub:${id}`,
            parentAgentId: agentId,
            name: str(input.subagent_type) ?? 'agent',
            ...(task ? { task } : {}),
            ...(model ? { model } : {}),
            toolUseId: id,
          });
        } else if (kind === 'mcp') {
          const mcp = parseMcpName(name);
          if (mcp) log.push({ type: 'mcp.called', timestamp: now, agentId, toolUseId: id, ...mcp });
        }
        break;
      }
      case 'PostToolUse': {
        if (!id) break;
        const res = isObj(p.tool_response) ? p.tool_response : {};
        const durationMs = num(p.duration_ms) ?? durationSince(called.get(id)?.at, now);
        const base = {
          timestamp: now,
          agentId,
          toolUseId: id,
          ...(durationMs !== undefined ? { durationMs } : {}),
        };
        if (kind === 'agent') this.stopRunning(id);
        if (kind === 'shell') {
          const n = failingCount(str(res.stdout) ?? '');
          if (n > 0) {
            log.push({
              ...base,
              type: 'tool.failed',
              reason: 'tests-failing',
              detail: `${n} failing`,
            });
            break;
          }
        }
        const files = kind === 'search' ? searchedFiles(res).map(file) : [];
        log.push({ ...base, type: 'tool.completed', ...(files.length ? { files } : {}) });
        const fp = filePathOf(input);
        if (kind === 'read' && fp)
          log.push({ type: 'file.read', timestamp: now, agentId, toolUseId: id, file: file(fp) });
        if (kind === 'write' && fp)
          log.push({
            type: 'file.written',
            timestamp: now,
            agentId,
            toolUseId: id,
            file: file(fp),
            ...diffOf(input, res),
          });
        break;
      }
      case 'PostToolUseFailure': {
        if (!id) break;
        if (kind === 'agent') this.stopRunning(id);
        const error = str(p.error) ?? '';
        const detail = short(text(error));
        const durationMs = num(p.duration_ms) ?? durationSince(called.get(id)?.at, now);
        log.push({
          type: 'tool.failed',
          timestamp: now,
          agentId,
          toolUseId: id,
          reason: p.is_interrupt === true ? 'interrupted' : failureReason(error),
          ...(detail ? { detail } : {}),
          ...(durationMs !== undefined ? { durationMs } : {}),
        });
        break;
      }
      case 'SubagentStop':
        if (agentId !== 'main')
          log.push({ type: 'agent.finished', timestamp: now, agentId, ok: true });
        break;
      case 'Notification': {
        const message = text(str(p.message) ?? '');
        const type = str(p.notification_type) ?? '';
        const kind =
          type.includes('permission') || /permission/i.test(message)
            ? 'permission'
            : type.includes('idle') || /waiting for (your )?input/i.test(message)
              ? 'idle'
              : 'other';
        log.push({ type: 'notification', timestamp: now, agentId, kind, message });
        if (kind === 'permission')
          log.push({
            type: 'permission.requested',
            timestamp: now,
            agentId,
            ...(message ? { detail: short(message) } : {}),
          });
        break;
      }
      case 'SessionEnd': {
        const reason = str(p.reason);
        log.push({
          type: 'session.ended',
          timestamp: now,
          agentId: 'main',
          ok: true,
          ...(reason ? { reason } : {}),
        });
        break;
      }
      // Stop marks the end of a turn, not of the session: the Live view reads it from the
      // following events (idle notification or SessionEnd)
    }
  }
}

export function normalizeClaudeHooks(
  records: readonly unknown[],
  ctx: NormalizeContext,
): AgentEvent[] {
  const hooks = records
    .filter(isObj)
    .map((r) => ({ at: iso(r.capturedAt), p: isObj(r.payload) ? r.payload : ({} as Obj) }));
  const cwd = ctx.cwd ?? hooks.map((h) => str(h.p.cwd)).find((c) => c !== undefined) ?? '';
  const links = new Map<string, string>();
  for (const { p } of hooks) {
    const res = isObj(p.tool_response) ? p.tool_response : undefined;
    const id = str(p.tool_use_id);
    const agent = str(res?.agentId);
    if (p.hook_event_name === 'PostToolUse' && id && agent) links.set(agent, id);
  }
  const startAt = hooks.map((h) => h.at).find((t) => t !== undefined) ?? EPOCH;
  const normalizer = new ClaudeHooksNormalizer({ ...ctx, cwd }, { startAt, links });
  return records.filter(isObj).flatMap((r) => normalizer.push(r));
}

function durationSince(start: string | undefined, end: string): number | undefined {
  if (!start) return undefined;
  return Math.max(0, Date.parse(end) - Date.parse(start));
}
