// Live merge of one Claude Code session: stream-json lines and hook records arrive one at a time,
// from two processes, and leave as one ordered AgentEvent list.
//
// It follows the rules of mergeClaudeSession, adapted to events that cannot be taken back once
// shown: the first source to report something wins and the other copy is dropped (both carry the
// same content; hooks are usually first and more precise in time). Subagent hooks whose spawning
// call is ambiguous wait for the stream's `parent_tool_use_id` (see ClaudeHooksNormalizer).
//
// A session is a series of runs (one `claude -p` process per turn, resumed with `--resume`): each
// run opens with `session.started` and closes with `session.ended`, and `seq` keeps counting
// across runs.
import { SCHEMA_VERSION, type AgentEvent, type EventOf } from '../schema';
import { ClaudeHooksNormalizer } from './claude-hooks';
import { ClaudeStreamNormalizer } from './claude-stream';
import { EPOCH } from './common';

export interface LiveSessionContext {
  sessionId: string;
  /** Workspace root the agent runs in. */
  cwd: string;
}

interface Run {
  stream: ClaudeStreamNormalizer;
  hooks: ClaudeHooksNormalizer;
  seen: Set<string>;
  open: Map<string, EventOf<'tool.called'>>;
  hookStart?: EventOf<'session.started'>;
  hookEnd?: EventOf<'session.ended'>;
  started: boolean;
  ended: boolean;
}

/** Key under which two copies of the same fact are recognized; undefined: always kept. */
function keyOf(e: AgentEvent): string | undefined {
  switch (e.type) {
    case 'tool.called':
      return `called:${e.toolUseId}`;
    case 'tool.completed':
    case 'tool.failed':
      return `terminal:${e.toolUseId}`;
    case 'file.read':
    case 'file.written':
      return `${e.type}:${e.toolUseId}`;
    case 'agent.spawned':
      return `spawned:${e.agentId}`;
    case 'agent.finished':
      return `finished:${e.agentId}`;
    case 'mcp.called':
      return `mcp:${e.toolUseId}`;
    case 'message.user':
      return `user:${e.agentId}\u0000${e.text}`;
    default:
      return undefined;
  }
}

export class LiveClaudeSession {
  private seq = 0;
  private last = EPOCH;
  private run: Run | undefined;
  private readonly ctx: LiveSessionContext;

  constructor(ctx: LiveSessionContext) {
    this.ctx = ctx;
  }

  /** Events emitted so far, in all runs. */
  get count(): number {
    return this.seq;
  }

  /** Starts a new run (a new `claude` process), ending the previous one if it is still open. */
  startRun(at?: string): AgentEvent[] {
    const out = this.run ? this.endRun(at) : [];
    const norm = { sessionId: this.ctx.sessionId, cwd: this.ctx.cwd };
    const startAt = at ?? (this.last === EPOCH ? undefined : this.last);
    this.run = {
      stream: new ClaudeStreamNormalizer(norm, { startAt }),
      hooks: new ClaudeHooksNormalizer(norm, { startAt, holdAmbiguous: true }),
      seen: new Set(),
      open: new Map(),
      started: false,
      ended: false,
    };
    return out;
  }

  /** One stream-json line of the current run. `at`: when it arrived (few lines carry a time). */
  stream(line: unknown, at: string): AgentEvent[] {
    const run = this.current(at);
    const out: AgentEvent[] = [];
    for (const e of run.stream.push(line, at)) {
      this.take(run, e, 'stream', out);
      if (e.type === 'tool.called' && e.agentId !== 'main')
        for (const h of run.hooks.learn(e.toolUseId, e.agentId)) this.take(run, h, 'hooks', out);
    }
    return out;
  }

  /** One hook record `{ capturedAt, payload }` of the current run. */
  hook(record: unknown): AgentEvent[] {
    const run = this.current();
    const out: AgentEvent[] = [];
    for (const e of run.hooks.push(record)) this.take(run, e, 'hooks', out);
    return out;
  }

  /**
   * The run's process is gone: release held hooks, close the calls nobody closed (a call refused
   * at a prompt never gets a result) and end the run if the stream did not.
   */
  endRun(at?: string, reason = 'process-exited'): AgentEvent[] {
    const run = this.run;
    if (!run) return [];
    const out: AgentEvent[] = [];
    for (const e of run.hooks.flush()) this.take(run, e, 'hooks', out);
    if (!run.ended && (run.started || run.hookStart)) {
      this.ensureStarted(run, at ?? this.last, out);
      const timestamp = at ?? this.last;
      this.closeOpen(run, timestamp, out);
      run.ended = true;
      this.emit(
        run.hookEnd ?? {
          ...this.envelope(timestamp),
          type: 'session.ended',
          ok: false,
          status: 'failed',
          reason,
        },
        out,
      );
    }
    this.run = undefined;
    return out;
  }

  private current(at?: string): Run {
    if (!this.run) this.startRun(at);
    return this.run as Run;
  }

  /** Envelope of an event the app adds itself (source `app`). */
  private envelope(timestamp: string) {
    return {
      schemaVersion: SCHEMA_VERSION,
      id: `${this.ctx.sessionId}:app`,
      sessionId: this.ctx.sessionId,
      seq: 0,
      timestamp,
      source: 'app' as const,
      provider: 'claude' as const,
      agentId: 'main' as const,
    };
  }

  private ensureStarted(run: Run, timestamp: string, out: AgentEvent[]): void {
    if (run.started) return;
    run.started = true;
    this.emit(run.hookStart ?? { ...this.envelope(timestamp), type: 'session.started' }, out);
  }

  private take(run: Run, e: AgentEvent, from: 'stream' | 'hooks', out: AgentEvent[]): void {
    if (run.ended) return;
    if (e.type === 'session.started') {
      if (from === 'hooks') {
        run.hookStart ??= e;
        return;
      }
      if (run.started) return;
      run.started = true;
      const earlier = run.hookStart && run.hookStart.timestamp < e.timestamp;
      this.emit(earlier && run.hookStart ? { ...e, timestamp: run.hookStart.timestamp } : e, out);
      return;
    }
    if (e.type === 'session.ended') {
      if (from === 'hooks') {
        run.hookEnd ??= e;
        return;
      }
      this.ensureStarted(run, e.timestamp, out);
      this.closeOpen(run, e.timestamp, out);
      run.ended = true;
      const reason = e.reason ?? run.hookEnd?.reason;
      this.emit(reason === undefined ? e : { ...e, reason }, out);
      return;
    }
    this.ensureStarted(run, e.timestamp, out);
    const key = keyOf(e);
    if (key !== undefined) {
      if (run.seen.has(key)) return;
      run.seen.add(key);
    }
    if (e.type === 'tool.called' && e.kind !== 'agent') run.open.set(e.toolUseId, e);
    if (e.type === 'tool.completed' || e.type === 'tool.failed') run.open.delete(e.toolUseId);
    this.emit(e, out);
  }

  private closeOpen(run: Run, timestamp: string, out: AgentEvent[]): void {
    for (const called of run.open.values()) {
      const { kind: _kind, tool: _tool, target: _target, type: _type, ...common } = called;
      run.seen.add(`terminal:${called.toolUseId}`);
      this.emit(
        {
          ...common,
          type: 'tool.failed',
          timestamp,
          reason: 'interrupted',
          detail: 'no result before the session ended',
        },
        out,
      );
    }
    run.open.clear();
  }

  private emit(e: AgentEvent, out: AgentEvent[]): void {
    const seq = this.seq++;
    const timestamp = e.timestamp < this.last ? this.last : e.timestamp;
    this.last = timestamp;
    out.push({ ...e, seq, id: `${this.ctx.sessionId}:${seq}`, timestamp });
  }
}
