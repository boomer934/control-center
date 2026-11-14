// What the Live view shows at a given instant of a replay. Pure: same replay + same t = same view.
import type { Replay, ReplayAgent, ReplayOp } from './types';

export type SemState = 'idle' | 'reading' | 'writing' | 'running' | 'waiting' | 'error' | 'done';

/**
 * Real tool calls last ~100 ms; an op stays visibly active at least this long (session time)
 * so that a 1x replay can be followed by eye. Documented in the prototype README.
 */
export const HOLD_MS = 900;
/** The done trail fades after this (matches cycle-trail-delay + cycle-trail-done). */
export const TRAIL_MS = 700;

export const visibleEnd = (op: ReplayOp) => Math.max(op.end, op.start + HOLD_MS);
export const isActive = (op: ReplayOp, t: number) => op.start <= t && t < visibleEnd(op);

export function opState(op: ReplayOp): SemState {
  if (op.outcome === 'denied') return 'waiting';
  if (op.kind === 'read' || op.kind === 'search') return 'reading';
  if (op.kind === 'write') return 'writing';
  return 'running';
}
/** State after the op has finished. */
function settled(op: ReplayOp): SemState {
  if (op.outcome !== 'ok') return 'error';
  if (op.kind === 'write') return 'done';
  return 'idle';
}

const RANK: Record<SemState, number> = {
  idle: 0,
  done: 1,
  reading: 2,
  running: 3,
  writing: 4,
  error: 5,
  waiting: 6,
};

export interface NodeView {
  id: string;
  state: SemState;
  reads: number;
  diff?: { add: number; del: number };
  /** Short status shown on the node ("not found", "1 failing", "0:04"). */
  note?: string;
  /** Inside the done trail window. */
  fresh: boolean;
  /** A new reading event started at this op (one pulse per event). */
  pulseKey?: string;
}

export interface AgentView {
  agent: ReplayAgent;
  state: SemState;
  /** Op the agent is on (active), or its last op while it thinks. */
  op?: ReplayOp;
  label: string;
  alive: boolean;
  calls: number;
}

export interface LiveView {
  t: number;
  files: Map<string, NodeView>;
  commands: Map<string, NodeView>;
  agents: AgentView[];
  /** Ops with start <= t. */
  past: number;
}

const fmt = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
export const clock = fmt;
export const clockFine = (ms: number) => `${fmt(ms)}.${Math.floor((ms % 1000) / 100)}`;

/** Map nodes an op lights up: its file, its search matches, or its command node. */
export function opTargets(op: ReplayOp): { files: string[]; command?: string } {
  if (op.kind === 'shell') return { files: [], command: op.id };
  const files = op.kind === 'read' || op.kind === 'write' ? (op.target ? [op.target] : []) : [];
  return { files: [...files, ...op.matches] };
}

export function viewAt(replay: Replay, t: number): LiveView {
  const files = new Map<string, NodeView>();
  const commands = new Map<string, NodeView>();
  for (const f of replay.files) files.set(f, { id: f, state: 'idle', reads: 0, fresh: false });
  for (const op of replay.ops)
    if (op.kind === 'shell')
      commands.set(op.id, { id: op.id, state: 'idle', reads: 0, fresh: false });

  // nodes with an active op: the most urgent active state wins and finished ops don't override it
  const activeRank = new Map<NodeView, number>();
  let past = 0;
  for (const op of replay.ops) {
    if (op.start > t) break;
    past++;
    const active = isActive(op, t);
    const { files: fs, command } = opTargets(op);
    const views = [
      ...fs.map((f) => files.get(f)),
      ...(command ? [commands.get(command)] : []),
    ].filter((v): v is NodeView => !!v);
    for (const v of views) {
      if (op.kind === 'read' || op.kind === 'search') v.reads++;
      if (active) {
        const s = opState(op);
        if ((activeRank.get(v) ?? -1) <= RANK[s]) {
          activeRank.set(v, RANK[s]);
          v.state = s;
          v.pulseKey = s === 'reading' ? op.id : undefined;
          v.note =
            op.outcome === 'denied'
              ? `waiting ${fmt(t - op.start)}`
              : op.kind === 'shell'
                ? fmt(t - op.start)
                : undefined;
        }
      } else if (!activeRank.has(v)) {
        const s = settled(op);
        if (s === 'error') {
          v.state = 'error';
          v.note = op.reason;
        } else if (s === 'done' || op.kind === 'shell') {
          // a finished write (or a command that passed) clears an earlier error on that node
          v.state = 'done';
          v.note = undefined;
          v.fresh = t - visibleEnd(op) < TRAIL_MS;
        } else if (v.state !== 'done' && v.state !== 'error') {
          v.state = 'idle'; // reads never clear a done write or an error
        }
      }
      if (op.diff) {
        const d = v.diff ?? { add: 0, del: 0 };
        v.diff = { add: d.add + op.diff.add, del: d.del + op.diff.del };
      }
    }
  }

  const agents: AgentView[] = replay.agents.map((agent) => {
    const mine = replay.ops.filter((o) => o.agent === agent.id && o.start <= t);
    const alive = agent.start <= t && t < Math.max(agent.end, agent.start + HOLD_MS);
    const activeOps = mine.filter((o) => isActive(o, t));
    const op = activeOps.sort((a, b) => RANK[opState(b)] - RANK[opState(a)])[0] ?? mine.at(-1);
    let state: SemState = 'idle';
    let label = alive ? 'thinking' : t < agent.start ? 'not started' : 'done';
    if (op && activeOps.includes(op)) {
      state = op.kind === 'agent' ? 'running' : opState(op);
      label = op.outcome === 'denied' ? 'waits' : state;
      if (op.kind === 'agent') label = 'delegating';
    } else if (!alive && t >= agent.end) state = 'done';
    return { agent, state, ...(op ? { op } : {}), label, alive, calls: mine.length };
  });

  return { t, files, commands, agents, past };
}
