// Combines the stream-json and hook events of one Claude Code session into a single ordered list.
//
// The stream is the reference for *what* happened (it knows denials, tool errors, agents and
// usage); the hooks are the reference for *when* (PreToolUse/PostToolUse are stamped as they
// happen). Events present in both are kept once, with the stream's content and the hooks' time.
// Events only the hooks know (Notification, a tool the stream never reported) are added.
import type { AgentEvent, EventOf } from '../schema';

type ToolTerminal = EventOf<'tool.completed'> | EventOf<'tool.failed'>;

const later = (a: string, b: string) => (a > b ? a : b);
const earlier = (a: string, b: string) => (a < b ? a : b);

export function mergeClaudeSession(
  stream: readonly AgentEvent[],
  hooks: readonly AgentEvent[],
  ctx: { sessionId: string },
): AgentEvent[] {
  // --- what the hooks know, by key ---
  const hookCalled = new Map<string, EventOf<'tool.called'>>();
  const hookTerminal = new Map<string, ToolTerminal>();
  const hookFinished = new Map<string, EventOf<'agent.finished'>>();
  let hookStart: EventOf<'session.started'> | undefined;
  let hookEnd: EventOf<'session.ended'> | undefined;
  for (const e of hooks) {
    if (e.type === 'tool.called') hookCalled.set(e.toolUseId, e);
    else if (e.type === 'tool.completed' || e.type === 'tool.failed')
      hookTerminal.set(e.toolUseId, e);
    else if (e.type === 'agent.finished') hookFinished.set(e.agentId, e);
    else if (e.type === 'session.started') hookStart ??= e;
    else if (e.type === 'session.ended') hookEnd = e;
  }

  // --- stream events, re-timed with the hooks ---
  const out: AgentEvent[] = [];
  const calledAt = new Map<string, string>();
  const terminalAt = new Map<string, string>();
  const seen = {
    called: new Set<string>(),
    terminal: new Set<string>(),
    files: new Set<string>(),
    spawned: new Set<string>(),
    finished: new Set<string>(),
    mcp: new Set<string>(),
    users: new Set<string>(),
    session: new Set<string>(),
  };

  for (const e of stream) {
    switch (e.type) {
      case 'tool.called': {
        const ts = hookCalled.get(e.toolUseId)?.timestamp ?? e.timestamp;
        calledAt.set(e.toolUseId, ts);
        seen.called.add(e.toolUseId);
        out.push({ ...e, timestamp: ts });
        break;
      }
      case 'agent.spawned':
      case 'mcp.called': {
        const id = e.toolUseId;
        const ts = (id && calledAt.get(id)) || e.timestamp;
        if (e.type === 'agent.spawned') seen.spawned.add(e.agentId);
        else seen.mcp.add(e.toolUseId);
        out.push({ ...e, timestamp: ts });
        break;
      }
      case 'tool.completed':
      case 'tool.failed': {
        const hook = hookTerminal.get(e.toolUseId);
        const start = calledAt.get(e.toolUseId);
        const ts = later(hook?.timestamp ?? e.timestamp, start ?? e.timestamp);
        const durationMs =
          hook?.durationMs ??
          (start ? Math.max(0, Date.parse(ts) - Date.parse(start)) : e.durationMs);
        terminalAt.set(e.toolUseId, ts);
        seen.terminal.add(e.toolUseId);
        // a subagent's tool results reach the stream without their structured response
        const files =
          e.type === 'tool.completed' && !e.files && hook?.type === 'tool.completed'
            ? hook.files
            : undefined;
        out.push({
          ...e,
          timestamp: ts,
          ...(durationMs !== undefined ? { durationMs } : {}),
          ...(files ? { files } : {}),
        });
        break;
      }
      case 'file.read':
      case 'file.written':
        seen.files.add(`${e.type}:${e.toolUseId}`);
        out.push({ ...e, timestamp: terminalAt.get(e.toolUseId) ?? e.timestamp });
        break;
      case 'agent.finished': {
        seen.finished.add(e.agentId);
        // SubagentStop is the moment the subagent ended; the Agent tool returns just after
        const spawnedBy = e.agentId.startsWith('sub:') ? e.agentId.slice(4) : '';
        const ts =
          hookFinished.get(e.agentId)?.timestamp ?? terminalAt.get(spawnedBy) ?? e.timestamp;
        out.push({ ...e, timestamp: ts });
        break;
      }
      case 'permission.requested':
      case 'permission.resolved': {
        const start = e.toolUseId ? calledAt.get(e.toolUseId) : undefined;
        out.push({ ...e, timestamp: start ? later(e.timestamp, start) : e.timestamp });
        break;
      }
      case 'message.user':
        seen.users.add(`${e.agentId}\u0000${e.text}`);
        out.push(e);
        break;
      case 'session.started':
        seen.session.add(e.type);
        out.push({
          ...e,
          timestamp: hookStart ? earlier(hookStart.timestamp, e.timestamp) : e.timestamp,
        });
        break;
      case 'session.ended':
        seen.session.add(e.type);
        out.push({
          ...e,
          timestamp: hookEnd ? later(hookEnd.timestamp, e.timestamp) : e.timestamp,
          ...(e.reason === undefined && hookEnd?.reason ? { reason: hookEnd.reason } : {}),
        });
        break;
      case 'error.detected':
        // shown by the command's output: right after the call ended
        out.push({
          ...e,
          timestamp: (e.toolUseId && terminalAt.get(e.toolUseId)) || e.timestamp,
        });
        break;
      default:
        out.push(e);
    }
  }

  // --- what only the hooks know ---
  for (const e of hooks) {
    const keep = (() => {
      switch (e.type) {
        case 'tool.called':
          return !seen.called.has(e.toolUseId);
        case 'tool.completed':
        case 'tool.failed':
          return !seen.terminal.has(e.toolUseId);
        case 'file.read':
        case 'file.written':
          return !seen.files.has(`${e.type}:${e.toolUseId}`);
        case 'agent.spawned':
          return !seen.spawned.has(e.agentId);
        case 'agent.finished':
          return !seen.finished.has(e.agentId);
        case 'mcp.called':
          return !seen.mcp.has(e.toolUseId);
        case 'message.user':
          return !seen.users.has(`${e.agentId}\u0000${e.text}`);
        case 'session.started':
        case 'session.ended':
          return !seen.session.has(e.type);
        default:
          return true;
      }
    })();
    if (keep) out.push(e);
  }

  // --- calls nobody closed ---
  // A call the user refused at an interactive prompt gets a PreToolUse and nothing else (no
  // PostToolUse, no PostToolUseFailure, no stream to report the denial): close it when the
  // session ends, so the timeline never keeps a call open.
  const closedIds = new Set<string>();
  for (const e of out)
    if (e.type === 'tool.completed' || e.type === 'tool.failed') closedIds.add(e.toolUseId);
  const endAt = [...out].reverse().find((e) => e.type === 'session.ended')?.timestamp;
  for (const e of [...out]) {
    if (e.type !== 'tool.called' || e.kind === 'agent' || closedIds.has(e.toolUseId)) continue;
    const { kind: _kind, tool: _tool, target: _target, ...common } = e;
    out.push({
      ...common,
      type: 'tool.failed',
      timestamp: endAt ? later(endAt, e.timestamp) : e.timestamp,
      reason: 'interrupted',
      detail: 'no result before the session ended',
    } as AgentEvent);
  }

  // --- one timeline: stable sort by time, then renumber ---
  const ordered = out
    .map((e, i) => ({ e, i }))
    .sort((a, b) =>
      a.e.timestamp < b.e.timestamp ? -1 : a.e.timestamp > b.e.timestamp ? 1 : a.i - b.i,
    )
    .map(({ e }) => e);
  // session.started first and session.ended last, whatever their clocks say
  const first = ordered.findIndex((e) => e.type === 'session.started');
  if (first > 0) ordered.unshift(...ordered.splice(first, 1));
  const end = ordered.findIndex((e) => e.type === 'session.ended');
  if (end >= 0 && end < ordered.length - 1) ordered.push(...ordered.splice(end, 1));

  let last = '';
  return ordered.map((e, seq) => {
    const timestamp = e.timestamp < last ? last : e.timestamp;
    last = timestamp;
    return { ...e, seq, id: `${ctx.sessionId}:${seq}`, timestamp };
  });
}
