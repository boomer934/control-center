// Shapes shared by the logger, the error store and the report. The IPC contract declares its own
// zod schemas for the same shapes (the renderer never imports this package).

/** Where an error comes from. */
export type ErrorOrigin = 'main' | 'renderer' | 'child' | 'ipc';

export type ErrorKind =
  | 'uncaught-exception'
  | 'unhandled-rejection'
  | 'window-error'
  | 'render-error'
  | 'process-gone'
  | 'child-stderr'
  | 'child-exit'
  | 'child-spawn'
  | 'ipc-failure'
  | 'bridge-rejected'
  | 'claude-setup'
  | 'codex-setup'
  | 'capabilities';

/** `project`: our own source. `dependency`: inside node_modules. `internal`: Node, Electron, V8. */
export type FrameKind = 'project' | 'dependency' | 'internal';

export interface StackFrame {
  readonly fn: string | null;
  /** Project-relative POSIX path, `node_modules/…`, a `node:` module, or a masked absolute path. */
  readonly file: string;
  readonly line: number | null;
  readonly column: number | null;
  readonly kind: FrameKind;
}

/** What a capture point hands to the reporter. */
export interface ErrorInput {
  readonly origin: ErrorOrigin;
  /** `main`, `renderer`, or `child:<name>`, `ipc:<channel>`. */
  readonly source: string;
  readonly kind: ErrorKind;
  readonly name: string;
  readonly message: string;
  /** Raw V8 stack (or the stderr text of a child). Parsed, cleaned and truncated by the store. */
  readonly stack?: string;
  readonly at?: Date;
}

/** Errors with the same fingerprint are one group with a counter. */
export interface ErrorGroup {
  readonly id: string;
  readonly origin: ErrorOrigin;
  readonly source: string;
  readonly kind: ErrorKind;
  readonly name: string;
  readonly message: string;
  readonly frames: StackFrame[];
  readonly count: number;
  /** ISO 8601. */
  readonly firstSeen: string;
  readonly lastSeen: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
