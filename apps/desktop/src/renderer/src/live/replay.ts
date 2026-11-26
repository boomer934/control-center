import type { AgentEvent, AgentId, ToolKind } from '@control-center/event-schema';
import type { GitCheckpoint } from '@control-center/ipc-contract';
import { HOLD_MS, MapActivity, type ResolveFile, type ViewOptions } from './activity';

export type ReplayRecord =
  | { kind: 'events'; events: readonly AgentEvent[] }
  | { kind: 'checkpoint'; checkpoint: GitCheckpoint }
  | { kind: 'prompt' | 'checkpoint-warning' };

type TimedEvent = { at: number; event: AgentEvent };

export function timedEvents(records: readonly ReplayRecord[]): TimedEvent[] {
  return records
    .flatMap((record) =>
      record.kind === 'events'
        ? record.events.map((event) => ({ event, at: Date.parse(event.timestamp) }))
        : [],
    )
    .sort((a, b) => a.at - b.at);
}

/** Fold only the events that had happened at the playhead. Forward seeks reuse the prefix. */
export class ReplayActivity {
  private readonly events: TimedEvent[];
  private activity: MapActivity;
  private cursor = 0;
  private last = -Infinity;
  private readonly resolveFile: ResolveFile | undefined;

  constructor(
    records: readonly ReplayRecord[],
    events = timedEvents(records),
    resolveFile?: ResolveFile,
  ) {
    this.events = events;
    this.resolveFile = resolveFile;
    this.activity = new MapActivity(resolveFile);
  }

  viewAt(at: number, options?: ViewOptions) {
    if (at < this.last) {
      this.activity = new MapActivity(this.resolveFile);
      this.cursor = 0;
    }
    this.last = at;
    const batch: AgentEvent[] = [];
    while (this.cursor < this.events.length && this.events[this.cursor]!.at <= at) {
      batch.push(this.events[this.cursor++]!.event);
    }
    this.activity.apply(batch);
    return this.activity.viewAt(at, options);
  }
}

export interface TimelineMark {
  id: string;
  label: string;
  at: number;
  end?: number;
  tone: ToolKind | 'neutral' | 'error' | 'waiting';
  glyph?: string;
  checkpoint?: GitCheckpoint;
  event?: AgentEvent;
  nodeId?: string;
}

function mapNode(event: AgentEvent): string | undefined {
  if (event.type === 'error.detected')
    return event.file?.external === false ? `f:${event.file.path}` : undefined;
  if ((event.type === 'file.read' || event.type === 'file.written') && !event.file.external)
    return `f:${event.file.path}`;
  if (event.type === 'mcp.called') return `t:mcp:${event.server}`;
  if (event.type !== 'tool.called') return undefined;
  if (event.kind === 'shell') return `t:cmd:${event.toolUseId}`;
  if (event.kind === 'web') return `t:web:${event.toolUseId}`;
  if ((event.kind === 'read' || event.kind === 'write') && event.target) return `f:${event.target}`;
}

interface Lane {
  id: AgentId;
  name: string;
  parent?: AgentId;
  marks: TimelineMark[];
}

export interface Timeline {
  lanes: (Lane & { depth: number })[];
  stops: number[];
  start: number;
  end: number;
}

function point(event: AgentEvent): Pick<TimelineMark, 'label' | 'tone' | 'glyph'> | undefined {
  switch (event.type) {
    case 'session.started':
      return { label: 'Turn started', tone: 'neutral', glyph: 'i-play' };
    case 'session.ended':
      return {
        label: event.ok ? 'Turn completed' : 'Turn ended',
        tone: event.ok ? 'neutral' : 'error',
        glyph: event.ok ? 's-done' : 's-error',
      };
    case 'agent.spawned':
      return { label: `Started ${event.name}`, tone: 'neutral', glyph: 'i-branch' };
    case 'agent.finished':
      return {
        label: event.ok ? 'Agent finished' : 'Agent failed',
        tone: event.ok ? 'neutral' : 'error',
        glyph: event.ok ? 's-done' : 's-error',
      };
    case 'permission.requested':
      return { label: 'Permission requested', tone: 'waiting' };
    case 'permission.resolved':
      return {
        label: `Permission ${event.decision}`,
        tone: event.decision === 'allowed' ? 'neutral' : 'error',
        glyph: event.decision === 'allowed' ? 's-done' : 's-error',
      };
    case 'error.detected':
      return {
        label: `Error · ${event.message.length > 80 ? `${event.message.slice(0, 79)}…` : event.message}`,
        tone: 'error',
        glyph: 's-error',
      };
    case 'file.read':
      return { label: `Read ${event.file.path}`, tone: 'read' };
    case 'file.written':
      return { label: `Wrote ${event.file.path}`, tone: 'write' };
    default:
      return undefined;
  }
}

export function buildTimeline(records: readonly ReplayRecord[]): Timeline | undefined {
  const events = timedEvents(records);
  const lanes = new Map<AgentId, Lane>();
  const calls = new Map<string, { mark: TimelineMark; target: string | null }>();
  const laneFor = (id: AgentId): Lane => {
    const existing = lanes.get(id);
    if (existing) return existing;
    const lane = {
      id,
      name: id === 'main' ? 'Claude' : id.startsWith('ollama:') ? id.slice(7) : 'Subagent',
      marks: [],
    };
    lanes.set(id, lane);
    return lane;
  };
  let start = events[0]?.at ?? Infinity;
  let end = events.at(-1)?.at ?? -Infinity;

  for (const { at, event } of events) {
    const id = event.id;
    const lane = laneFor(event.agentId);
    const call = 'toolUseId' in event && event.toolUseId ? calls.get(event.toolUseId) : undefined;
    if (event.type === 'agent.spawned') {
      lane.name = event.name;
      lane.parent = event.parentAgentId;
      laneFor(event.parentAgentId);
    }
    if (event.type === 'tool.called') {
      if (call) continue;
      const mark: TimelineMark = {
        id,
        at,
        label: event.target ? `${event.tool} · ${event.target}` : event.tool,
        tone: event.kind,
        event,
        nodeId: mapNode(event),
      };
      lane.marks.push(mark);
      calls.set(event.toolUseId, { mark, target: event.target });
      continue;
    }
    if (call && (event.type === 'tool.completed' || event.type === 'tool.failed')) {
      call.mark.end ??= at;
    }
    if (event.type === 'mcp.called' && call) call.mark.nodeId = mapNode(event);
    if (event.type === 'tool.failed') {
      lane.marks.push({
        id,
        at,
        label: `Tool failed · ${event.detail ?? event.reason}`,
        tone: 'error',
        event,
        nodeId: call?.mark.nodeId,
      });
      continue;
    }
    // The call already shows an ordinary Read/Edit and its target. Keep additional file
    // events, including matches from tools whose target was a command or search pattern.
    if (
      ((event.type === 'file.read' && call?.mark.tone === 'read') ||
        (event.type === 'file.written' && call?.mark.tone === 'write')) &&
      call.target === event.file.path
    ) {
      continue;
    }
    const mark = point(event);
    if (mark)
      lane.marks.push({ id, at, event, nodeId: mapNode(event) ?? call?.mark.nodeId, ...mark });
  }
  for (const record of records) {
    if (record.kind !== 'checkpoint') continue;
    const { checkpoint } = record;
    const at = Date.parse(checkpoint.at);
    start = Math.min(start, at);
    end = Math.max(end, at);
    laneFor('main').marks.push({
      id: checkpoint.id,
      label: 'Git checkpoint',
      at,
      tone: 'neutral',
      glyph: 'i-git',
      checkpoint,
    });
  }
  if (!Number.isFinite(start)) return undefined;

  const ordered: Timeline['lanes'] = [];
  const visited = new Set<AgentId>();
  const children = new Map<AgentId, Lane[]>();
  for (const lane of lanes.values()) {
    if (!lane.parent) continue;
    const siblings = children.get(lane.parent) ?? [];
    siblings.push(lane);
    children.set(lane.parent, siblings);
  }
  const append = (lane: Lane, depth: number) => {
    if (visited.has(lane.id)) return;
    visited.add(lane.id);
    if (lane.marks.length)
      ordered.push({ ...lane, depth, marks: lane.marks.sort((a, b) => a.at - b.at) });
    for (const child of children.get(lane.id) ?? []) append(child, depth + 1);
  };
  const main = lanes.get('main');
  if (main) append(main, 0);
  for (const lane of lanes.values()) if (!lane.parent) append(lane, 0);
  for (const lane of lanes.values()) append(lane, 0);

  return {
    lanes: ordered,
    start,
    // Match the map's minimum visible hold so the end of a short turn can settle.
    end: end + HOLD_MS,
    stops: [...new Set(ordered.flatMap((lane) => lane.marks.map((mark) => mark.at)))].sort(
      (a, b) => a - b,
    ),
  };
}

export function elapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
