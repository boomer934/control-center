// What the agents did to the project, folded from AgentEvents (phase 5b). `MapActivity` keeps the
// tool calls of a session as operations; `viewAt(t)` says what the map shows at instant t. The
// view is a pure function of the events seen so far and of t, so the replay of phase 5c can ask
// for any instant, and the live map asks for "now".
import type {
  AgentEvent,
  AgentId,
  DetectedError,
  FailureReason,
  FileRef,
  ToolKind,
} from '@control-center/event-schema';
import { isProjectPath } from '@control-center/project-model/schema';

/** The semantic states of docs/memoria/DESIGN.md ("waiting" is waiting-user). */
export type MapState = 'idle' | 'reading' | 'writing' | 'running' | 'waiting' | 'error' | 'done';

/**
 * Real tool calls last about 100 ms: an operation stays visibly active at least this long, or a
 * live map would only flicker (same rule as the 1d prototype).
 */
export const HOLD_MS = 900;
/** The done trail fades after this (cycle-trail-delay + cycle-trail-done). */
export const TRAIL_MS = 700;
/** A finished command or MCP node stays on the map this long, then leaves. */
export const TEMP_LINGER_MS = 4000;

type Outcome = 'ok' | FailureReason;

interface Op {
  id: string;
  agent: AgentId;
  kind: ToolKind;
  target: string | null;
  start: number;
  end?: number;
  outcome?: Outcome;
  detail?: string;
  /** Workspace files the call read or wrote. */
  files: string[];
  /** Workspace files a search returned. */
  matches: string[];
  write: boolean;
  diff?: { add: number; del: number };
  waitingSince?: number;
  waitingUntil?: number;
  /** Id of the temporary node (command, MCP server, web) the call lights up. */
  temp?: string;
}

export type AgentKind = 'claude' | 'sub' | 'local';

interface AgentRecord {
  id: AgentId;
  name: string;
  code: string;
  kind: AgentKind;
  start: number;
  /**
   * When the agent was at work. The app runs `claude -p` once per message (ADR 0009), so the
   * main agent of a chat has one run per turn, each from `session.started` to `session.ended`.
   */
  runs: { start: number; end?: number }[];
  ops: Op[];
  configurations: { at: number; model: string | undefined; effort: string | undefined }[];
}

export type TempKind = 'command' | 'mcp' | 'web';

/** An error of the project on a file (phase 5e). */
interface ErrorMark {
  at: number;
  line?: number;
  message: string;
  /** The agent command whose output showed it, as `commandKey` reads it. */
  command?: string;
}

/** A command without its pipes and redirections: `npm test 2>&1 | tail -40` → `npm test`. */
export function commandKey(target: string | null): string | undefined {
  const head = target?.split(/\s*(?:\|\|?|&&|;)\s*/)[0];
  const key = head?.replace(/\s+\d*>>?(?:&\d+|\s*\S+)/g, '').trim();
  return key || undefined;
}

/** Finds the map file of an error's culprit; undefined: not a file of this project. */
export type ResolveFile = (file: FileRef) => string | undefined;

const workspaceOnly: ResolveFile = (file) => (file.external ? undefined : file.path);

const MAX_ERROR_NAME = 18;

/** "TypeError", "TS2322", "error[E0425]", "panic": the name of an error, for the node. */
export function errorName(message: string): string {
  // `AssertionError [ERR_ASSERTION]: …` names AssertionError; `error[E0425]: …` keeps its code.
  const name =
    /^(?:Uncaught\s+)?([\w.$]+(?:\[\w+\])?)(?:\s\[[\w-]+\])?:/.exec(message)?.[1] ?? message;
  // The note sits beside the file name on a narrow node: keep it short (full text in the title).
  return name.length > MAX_ERROR_NAME ? `${name.slice(0, MAX_ERROR_NAME - 1)}…` : name;
}

interface TempRecord {
  id: string;
  kind: TempKind;
  label: string;
  ops: Op[];
}

export interface NodeActivity {
  state: MapState;
  reads: number;
  writes: number;
  diff?: { add: number; del: number };
  /** Short status on the node: "not found", "1 failing", "0:04". */
  note?: string;
  /** Inside the done trail. */
  fresh: boolean;
  /** Changes with every new read, so the node pulses once per event (never in a loop). */
  pulse?: string;
}

export interface TempView extends NodeActivity {
  id: string;
  kind: TempKind;
  label: string;
}

export interface AgentPresence {
  id: AgentId;
  name: string;
  code: string;
  kind: AgentKind;
  state: MapState;
  /** What the chip says: "reading", "waits", "thinking", "delegating", "done". */
  label: string;
  model?: string | undefined;
  effort?: string | undefined;
  alive: boolean;
  calls: number;
  /** Map node the agent works on: `f:<path>` for a file, the temp id for a command. */
  target?: string;
  /** Time of the agent's latest event, to pick whom to follow. */
  lastActive: number;
  action?: { target: string | null; toolUseId: string; since: number };
}

export function configurationLabel({ model, effort }: Pick<AgentPresence, 'model' | 'effort'>) {
  if (model && effort) return `${model} · ${effort}`;
  return model ?? (effort && `Effort · ${effort}`);
}

export interface ActivityView {
  t: number;
  files: Map<string, NodeActivity>;
  temps: TempView[];
  agents: AgentPresence[];
}

export interface ViewOptions {
  /** The app has a permission request open (chat dock): the main agent waits for the user. */
  pendingPermission?: boolean;
}

const RANK: Record<MapState, number> = {
  idle: 0,
  done: 1,
  reading: 2,
  running: 3,
  writing: 4,
  error: 5,
  waiting: 6,
};

export const fileNodeId = (path: string) => `f:${path}`;

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const visibleEnd = (op: Op) =>
  op.end === undefined ? Infinity : Math.max(op.end, op.start + HOLD_MS);
const isActive = (op: Op, t: number) => op.start <= t && t < visibleEnd(op);
const isWaiting = (op: Op, t: number) =>
  op.waitingSince !== undefined &&
  op.waitingSince <= t &&
  t < Math.min(op.waitingUntil ?? Infinity, op.end ?? Infinity);

function activeState(op: Op, t: number): MapState {
  if (isWaiting(op, t)) return 'waiting';
  if (op.write) return 'writing';
  if (op.kind === 'read' || op.kind === 'search') return 'reading';
  if (op.kind === 'write') return 'writing';
  return 'running';
}

const REASON_NOTE: Record<FailureReason, string> = {
  'not-found': 'not found',
  denied: 'denied',
  'tests-failing': 'tests failing',
  interrupted: 'interrupted',
  failed: 'failed',
};

/** Two letters for an agent, with a digit when they collide (DESIGN.md: `C2`, `E2`). */
function agentCode(name: string, taken: Set<string>): string {
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  const base = (letters.slice(0, 2) || 'AG').padEnd(2, 'X');
  if (!taken.has(base)) return base;
  for (let i = 2; i < 10; i++) {
    const code = `${base[0]}${i}`;
    if (!taken.has(code)) return code;
  }
  return base;
}

export class MapActivity {
  private readonly ops = new Map<string, Op>();
  private readonly fileOps = new Map<string, Op[]>();
  private readonly temps = new Map<string, TempRecord>();
  private readonly agents = new Map<AgentId, AgentRecord>();
  private readonly codes = new Set<string>();
  private readonly fileErrors = new Map<string, ErrorMark[]>();
  private readonly errorKeys = new Set<string>();
  private readonly resolveFile: ResolveFile;
  private lastTime = 0;
  /** Grows by one with every batch of events that changed something. */
  revision = 0;

  constructor(resolveFile: ResolveFile = workspaceOnly) {
    this.resolveFile = resolveFile;
  }

  /** Files the session touched (errors included), in the order they were first touched. */
  touched(): string[] {
    const out = [...this.fileOps.keys()];
    for (const path of this.fileErrors.keys()) if (!this.fileOps.has(path)) out.push(path);
    return out;
  }

  /**
   * Errors found outside a session (the integrated terminal). The same error can also reach the
   * map as an `error.detected` of the session: it counts once.
   */
  applyErrors(errors: readonly (DetectedError & { at: string })[]): void {
    let changed = false;
    for (const error of errors) changed = this.addError(error, Date.parse(error.at)) || changed;
    if (changed) this.revision++;
  }

  private addError(error: DetectedError, at: number): boolean {
    const op = error.toolUseId ? this.ops.get(error.toolUseId) : undefined;
    const command = op?.kind === 'shell' ? commandKey(op.target) : undefined;
    if (!error.file || !Number.isFinite(at)) return false;
    const path = this.resolveFile(error.file);
    if (!path) return false;
    const key = `${at}\u0000${error.message}\u0000${path}:${error.line ?? ''}`;
    if (this.errorKeys.has(key)) return false;
    this.errorKeys.add(key);
    const marks = this.fileErrors.get(path) ?? [];
    marks.push({
      at,
      ...(error.line ? { line: error.line } : {}),
      message: error.message,
      ...(command ? { command } : {}),
    });
    marks.sort((a, b) => a.at - b.at);
    this.fileErrors.set(path, marks);
    this.lastTime = Math.max(this.lastTime, at);
    return true;
  }

  /** Time of the latest event seen (ms since the epoch), 0 before any. */
  latest(): number {
    return this.lastTime;
  }

  apply(events: readonly AgentEvent[]): void {
    if (!events.length) return;
    for (const event of events) this.applyOne(event);
    this.revision++;
  }

  private agent(id: AgentId, at: number): AgentRecord {
    let agent = this.agents.get(id);
    if (!agent) {
      const kind: AgentKind = id === 'main' ? 'claude' : id.startsWith('ollama:') ? 'local' : 'sub';
      const name =
        id === 'main' ? 'Claude' : kind === 'local' ? id.slice('ollama:'.length) : 'Subagent';
      const code = agentCode(id === 'main' ? 'CL' : name, this.codes);
      this.codes.add(code);
      agent = {
        id,
        name,
        code,
        kind,
        start: at,
        runs: [{ start: at }],
        ops: [],
        configurations: [],
      };
      this.agents.set(id, agent);
    }
    return agent;
  }

  /** New work after the agent ended (the next turn of a chat) opens a new run. */
  private resume(agent: AgentRecord, at: number): void {
    agent.start = Math.min(agent.start, at);
    const first = agent.runs[0]!;
    first.start = Math.min(first.start, at);
    const last = agent.runs.at(-1)!;
    if (last.end !== undefined && at > last.end) agent.runs.push({ start: at });
  }

  private finish(agent: AgentRecord, at: number): void {
    const last = agent.runs.at(-1)!;
    last.end = Math.max(last.end ?? at, at);
  }

  private linkFile(op: Op, path: string, list: 'files' | 'matches'): void {
    if (!op[list].includes(path)) op[list].push(path);
    const ops = this.fileOps.get(path) ?? [];
    if (!ops.includes(op)) {
      ops.push(op);
      this.fileOps.set(path, ops);
    }
  }

  private openOp(agentId: AgentId): Op | undefined {
    const ops = this.agents.get(agentId)?.ops ?? [];
    for (let i = ops.length - 1; i >= 0; i--) if (ops[i]!.end === undefined) return ops[i];
    return undefined;
  }

  private applyOne(event: AgentEvent): void {
    const at = Date.parse(event.timestamp);
    if (!Number.isFinite(at)) return;
    // An error belongs to a file, not to an agent's presence (no chip for it).
    if (event.type === 'error.detected') {
      this.addError(event, at);
      return;
    }
    this.lastTime = Math.max(this.lastTime, at);
    const agent = this.agent(event.agentId, at);
    switch (event.type) {
      case 'tool.called': {
        if (this.ops.has(event.toolUseId)) return;
        this.resume(agent, at);
        const op: Op = {
          id: event.toolUseId,
          agent: event.agentId,
          kind: event.kind,
          target: event.target,
          start: at,
          files: [],
          matches: [],
          write: false,
        };
        // A new call means the agent got its answer: a permission it waited for is settled.
        for (const other of agent.ops)
          if (other.waitingSince !== undefined && other.waitingUntil === undefined)
            other.waitingUntil = at;
        this.ops.set(op.id, op);
        agent.ops.push(op);
        // file.read and file.written come after the call ends: the target lights the file up
        // while the call runs (and keeps a failed read, "not found", on the map).
        if ((event.kind === 'read' || event.kind === 'write') && isFileTarget(event.target))
          this.linkFile(op, event.target, 'files');
        if (event.kind === 'shell' || event.kind === 'web') {
          const id = `t:${event.kind === 'shell' ? 'cmd' : 'web'}:${op.id}`;
          const label = (event.kind === 'shell' ? '$ ' : '') + (event.target ?? event.tool);
          this.temps.set(id, {
            id,
            kind: event.kind === 'shell' ? 'command' : 'web',
            label,
            ops: [op],
          });
          op.temp = id;
        }
        return;
      }
      case 'mcp.called': {
        const op = this.ops.get(event.toolUseId);
        if (!op) return;
        const id = `t:mcp:${event.server}`;
        const temp = this.temps.get(id) ?? { id, kind: 'mcp', label: event.server, ops: [] };
        temp.ops.push(op);
        this.temps.set(id, temp);
        op.temp = id;
        return;
      }
      case 'file.read':
      case 'file.written': {
        if (event.file.external) return;
        const op = this.ops.get(event.toolUseId);
        if (!op) return;
        this.linkFile(op, event.file.path, 'files');
        if (event.type === 'file.written') {
          op.write = true;
          if (event.diff) {
            const d = op.diff ?? { add: 0, del: 0 };
            op.diff = { add: d.add + event.diff.add, del: d.del + event.diff.del };
          }
        }
        return;
      }
      case 'tool.completed': {
        const op = this.ops.get(event.toolUseId);
        if (!op || op.end !== undefined) return;
        op.end = at;
        op.outcome = 'ok';
        for (const file of event.files ?? [])
          if (!file.external) this.linkFile(op, file.path, 'matches');
        return;
      }
      case 'tool.failed': {
        const op = this.ops.get(event.toolUseId);
        if (!op || op.end !== undefined) return;
        op.end = at;
        op.outcome = event.reason;
        if (event.detail) op.detail = event.detail;
        return;
      }
      case 'permission.requested': {
        const op = event.toolUseId ? this.ops.get(event.toolUseId) : this.openOp(event.agentId);
        if (op && op.end === undefined && op.waitingSince === undefined) op.waitingSince = at;
        return;
      }
      case 'permission.resolved': {
        const op = event.toolUseId ? this.ops.get(event.toolUseId) : this.openOp(event.agentId);
        if (op && op.waitingSince !== undefined && op.waitingUntil === undefined)
          op.waitingUntil = at;
        return;
      }
      case 'agent.spawned': {
        if (agent.kind === 'sub' && agent.name !== event.name) {
          agent.name = event.name;
          this.codes.delete(agent.code);
          agent.code = agentCode(event.name, this.codes);
          this.codes.add(agent.code);
        }
        this.resume(agent, at);
        return;
      }
      case 'agent.finished':
        this.finish(agent, at);
        return;
      case 'session.started':
      case 'session.configChanged':
        if (event.type === 'session.started') this.resume(agent, at);
        if (event.provider === 'claude')
          agent.configurations.push({ at, model: event.model, effort: event.effort });
        return;
      case 'session.ended':
        this.finish(agent, at);
        for (const op of this.ops.values())
          if (op.end === undefined) {
            op.end = at;
            op.outcome = 'interrupted';
          }
        return;
      default:
        return;
    }
  }

  /** Earliest instant after t at which viewAt changes without new events (hold, trail, linger). */
  nextChange(t: number): number | undefined {
    let next = Infinity;
    const consider = (time: number) => {
      if (time > t && time < next) next = time;
    };
    for (const op of this.ops.values()) {
      if (op.end === undefined) continue;
      const end = visibleEnd(op);
      consider(end);
      consider(end + TRAIL_MS);
      if (op.temp) consider(end + TEMP_LINGER_MS);
    }
    return next === Infinity ? undefined : next;
  }

  viewAt(t: number, options: ViewOptions = {}): ActivityView {
    const pending = options.pendingPermission ? this.openOp('main') : undefined;
    const files = new Map<string, NodeActivity>();
    for (const [path, ops] of this.fileOps) {
      const node = this.withErrors(this.fold(ops, t, pending), ops, this.fileErrors.get(path), t);
      if (node) files.set(path, node);
    }
    for (const [path, marks] of this.fileErrors) {
      if (this.fileOps.has(path)) continue;
      const node = this.withErrors(undefined, [], marks, t);
      if (node) files.set(path, node);
    }

    const temps: TempView[] = [];
    for (const temp of this.temps.values()) {
      const started = temp.ops.filter((op) => op.start <= t);
      if (!started.length) continue;
      const lastEnd = Math.max(...started.map(visibleEnd));
      if (t >= lastEnd + TEMP_LINGER_MS) continue;
      const node = this.fold(started, t, pending);
      if (node) temps.push({ ...node, id: temp.id, kind: temp.kind, label: temp.label });
    }

    const agents: AgentPresence[] = [];
    for (const agent of this.agents.values()) {
      if (agent.start > t) continue;
      const mine = agent.ops.filter((op) => op.start <= t);
      const alive = agent.runs.some(
        (run) =>
          run.start <= t &&
          t < (run.end === undefined ? Infinity : Math.max(run.end, run.start + HOLD_MS)),
      );
      const active = mine.filter((op) => isActive(op, t));
      const stateOf = (op: Op) => (op === pending ? 'waiting' : activeState(op, t));
      const op = active.sort((a, b) => RANK[stateOf(b)] - RANK[stateOf(a)] || b.start - a.start)[0];
      let state: MapState = 'idle';
      let label = alive ? 'thinking' : 'done';
      if (op) {
        state = op.kind === 'agent' ? 'running' : stateOf(op);
        label = op.kind === 'agent' ? 'delegating' : state === 'waiting' ? 'waits' : state;
      } else if (!alive) state = 'done';
      if (alive && agent.id === 'main' && options.pendingPermission && !op) {
        state = 'waiting';
        label = 'waits';
      }
      const focus = op ?? (alive ? mine.at(-1) : undefined);
      const target = focus && focus.kind !== 'agent' ? targetOf(focus) : undefined;
      const last = mine.at(-1);
      const config = agent.configurations.findLast((item) => item.at <= t);
      agents.push({
        id: agent.id,
        name: agent.name,
        code: agent.code,
        kind: agent.kind,
        ...(config && { model: config.model, effort: config.effort }),
        state,
        label,
        alive,
        calls: mine.length,
        ...(target ? { target } : {}),
        ...(op && {
          action: {
            target: op.target,
            toolUseId: op.id,
            since: state === 'waiting' ? (op.waitingSince ?? op.start) : op.start,
          },
        }),
        lastActive: Math.max(agent.start, last ? Math.min(t, visibleEnd(last)) : agent.start),
      });
    }

    return { t, files, temps, agents };
  }

  /**
   * The latest error of a file turns its node red until a later write clears it (the agent or
   * the user fixed it); an operation running on the node still shows first.
   */
  private withErrors(
    node: NodeActivity | undefined,
    ops: readonly Op[],
    marks: readonly ErrorMark[] | undefined,
    t: number,
  ): NodeActivity | undefined {
    let last: ErrorMark | undefined;
    for (const mark of marks ?? []) if (mark.at <= t) last = mark;
    if (!last) return node;
    const error = last;
    const after = (op: Op) => op.end !== undefined && op.end > error.at && op.end <= t;
    // A later write to the file, or the same command passing again, clears the error.
    if (ops.some((op) => op.write && after(op))) return node;
    if (error.command)
      for (const op of this.ops.values())
        if (
          op.kind === 'shell' &&
          op.outcome === 'ok' &&
          after(op) &&
          commandKey(op.target) === error.command
        )
          return node;
    const base = node ?? { state: 'idle' as MapState, reads: 0, writes: 0, fresh: false };
    if (base.state !== 'idle' && base.state !== 'done' && base.state !== 'error') return base;
    const name = errorName(error.message);
    return {
      ...base,
      state: 'error',
      note: error.line ? `L${error.line} ${name}` : name,
      fresh: false,
      pulse: undefined,
    };
  }

  /** State of one map node from the operations that touched it, at instant t. */
  private fold(ops: readonly Op[], t: number, pending: Op | undefined): NodeActivity | undefined {
    let node: NodeActivity | undefined;
    let activeRank = -1;
    for (const op of ops) {
      if (op.start > t) continue;
      node ??= { state: 'idle', reads: 0, writes: 0, fresh: false };
      if (op.kind === 'read' || op.kind === 'search') node.reads++;
      if (op.write) node.writes++;
      if (op.diff) {
        const d = node.diff ?? { add: 0, del: 0 };
        node.diff = { add: d.add + op.diff.add, del: d.del + op.diff.del };
      }
      if (isActive(op, t)) {
        const state = op === pending ? 'waiting' : activeState(op, t);
        if (RANK[state] >= activeRank) {
          activeRank = RANK[state];
          node.state = state;
          node.pulse = state === 'reading' ? op.id : undefined;
          node.note =
            state === 'waiting'
              ? `waiting ${clock(t - (op.waitingSince ?? op.start))}`
              : op.kind === 'shell'
                ? clock(t - op.start)
                : undefined;
          node.fresh = false;
        }
      } else if (activeRank < 0) {
        const end = visibleEnd(op);
        if (op.outcome && op.outcome !== 'ok') {
          node.state = 'error';
          node.note = op.detail ?? REASON_NOTE[op.outcome];
          node.fresh = false;
        } else if (op.write || op.kind === 'write' || op.temp) {
          // A finished write (or a command that passed) clears an earlier error on the node.
          node.state = 'done';
          node.note = undefined;
          node.fresh = t - end < TRAIL_MS;
        } else if (node.state !== 'done' && node.state !== 'error') {
          node.state = 'idle'; // reads never clear a done write or an error
        }
      }
    }
    return node;
  }
}

/** A tool target that names one workspace file (not a pattern, a command or an outside path). */
function isFileTarget(target: string | null): target is string {
  return target !== null && !/[*?[\]{}]|\s(in|-)\s/.test(target) && isProjectPath(target);
}

function targetOf(op: Op): string | undefined {
  if (op.temp) return op.temp;
  const path = op.files[0] ?? op.matches[0];
  return path ? fileNodeId(path) : undefined;
}
