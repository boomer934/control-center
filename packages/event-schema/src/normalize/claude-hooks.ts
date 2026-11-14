// Claude Code hook payloads â†’ AgentEvents.
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

export function normalizeClaudeHooks(
  records: readonly unknown[],
  ctx: NormalizeContext,
): AgentEvent[] {
  const hooks = records
    .filter(isObj)
    .map((r) => ({ at: iso(r.capturedAt), p: isObj(r.payload) ? r.payload : ({} as Obj) }));
  const cwd = ctx.cwd ?? hooks.map((h) => str(h.p.cwd)).find((c) => c !== undefined) ?? '';
  const { text, file, target } = makeTools(cwd);
  const log = new EventLog(ctx.sessionId, 'hooks', 'claude');

  // Subagent hooks carry Claude's own `agent_id`; AgentEvents key subagents by the tool call that
  // spawned them. The link is in the PostToolUse of that Agent call (`tool_response.agentId`).
  const spawnedBy = new Map<string, string>();
  for (const { p } of hooks) {
    const res = isObj(p.tool_response) ? p.tool_response : undefined;
    const id = str(p.tool_use_id);
    const agent = str(res?.agentId);
    if (p.hook_event_name === 'PostToolUse' && id && agent) spawnedBy.set(agent, id);
  }
  const running: string[] = []; // Agent tool calls still running, for unlinked subagent hooks
  const agentOf = (p: Obj): AgentId => {
    const a = str(p.agent_id);
    if (!a) return 'main';
    const parent = spawnedBy.get(a) ?? (running.length === 1 ? running[0] : undefined);
    return parent ? `sub:${parent}` : 'main';
  };

  const stopRunning = (id: string) => {
    const i = running.indexOf(id);
    if (i >= 0) running.splice(i, 1);
  };

  const called = new Map<string, { name: string; input: Obj; at: string; agentId: AgentId }>();
  let now = hooks.map((h) => h.at).find((t) => t !== undefined) ?? EPOCH;

  for (const { at, p } of hooks) {
    now = at ?? now;
    const ev = str(p.hook_event_name);
    const agentId = agentOf(p);
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
          running.push(id);
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
        if (kind === 'agent') stopRunning(id);
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
        if (kind === 'agent') stopRunning(id);
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
  return log.events;
}

function durationSince(start: string | undefined, end: string): number | undefined {
  if (!start) return undefined;
  return Math.max(0, Date.parse(end) - Date.parse(start));
}
