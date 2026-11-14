// Replay model for the phase 1d prototype. A throwaway shape, not the phase 2 AgentEvent schema:
// it keeps only what the Live view draws, and never file contents.

export type AgentKind = 'claude' | 'sub';

export interface ReplayAgent {
  id: string;
  /** Channel sigil: CL for the main session, first two letters for subagents. */
  code: string;
  name: string;
  kind: AgentKind;
  /** Task description (subagents only). */
  task?: string;
  /** ms from session start */
  start: number;
  end: number;
  /** Agent op in the parent lane that spawned this agent. */
  parentOp?: string;
}

export type OpKind = 'read' | 'search' | 'write' | 'shell' | 'agent' | 'other';
export type Outcome = 'ok' | 'error' | 'denied';

export interface ReplayOp {
  id: string;
  agent: string;
  tool: string;
  kind: OpKind;
  /** Relative file path (read/write), command line (shell), pattern (search) or task (agent). */
  target: string | null;
  /** Files this op touched besides the target (search matches). */
  matches: string[];
  start: number;
  end: number;
  outcome: Outcome;
  /** Short reason shown on errors: "not found", "1 failing", "denied". */
  reason?: string;
  diff?: { add: number; del: number };
  /** True when the duration was stretched to show a permission wait (no real wait was recorded). */
  simulatedWait?: boolean;
}

export interface Replay {
  name: string;
  prompt: string;
  duration: number;
  agents: ReplayAgent[];
  ops: ReplayOp[];
  /** Every relative file path seen in the session, sorted. */
  files: string[];
  result: { ok: boolean; summary: string; tokens: number; costUsd: number };
  simulated: string[];
}
