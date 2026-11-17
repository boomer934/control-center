// Supervision of child processes (claude, ollama, MCP servers, pty helpers in later phases): their
// stderr and abnormal exits go to the Errors Console and the log. This is an internal helper of
// the main process; the renderer has no way to start a process (see SICUREZZA.md).
import { spawn, type ChildProcess } from 'node:child_process';
import { parseErrorHead, stripAnsi } from '@control-center/app-log';
import type { ErrorInput } from '@control-center/app-log';

export interface SuperviseOptions {
  /** Short identifier shown in the Console: `[a-z0-9-]`. */
  name: string;
  command: string;
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  report: (input: ErrorInput) => unknown;
  /** Quiet time after which buffered stderr is reported as one error. Default 150 ms. */
  flushMs?: number;
  /** Give the child a stdin pipe (default: ignored). */
  stdin?: boolean;
  /** Receives stdout as UTF-8 text. Without it stdout is drained and ignored. */
  onStdout?: (chunk: string) => void;
  /** Asked when the child exits with an error: true means the app ended it on purpose. */
  expectedExit?: () => boolean;
}

const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_STDERR = 64 * 1024;

/**
 * Starts `command` without a shell and reports what goes wrong. stdout is data, not errors: it goes
 * to `onStdout` when given (the caller validates it), otherwise it is drained and ignored.
 */
export function superviseChild(options: SuperviseOptions): ChildProcess {
  if (!NAME.test(options.name)) throw new Error(`Invalid child process name: ${options.name}`);
  const source = `child:${options.name}`;
  const flushMs = options.flushMs ?? 150;

  const child = spawn(options.command, [...(options.args ?? [])], {
    cwd: options.cwd,
    env: options.env ?? process.env,
    shell: false,
    windowsHide: true,
    stdio: [options.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  let timer: NodeJS.Timeout | undefined;

  const flush = () => {
    clearTimeout(timer);
    const text = stripAnsi(stderr).trim();
    stderr = '';
    if (!text) return;
    const head = parseErrorHead(text);
    options.report({
      origin: 'child',
      source,
      kind: 'child-stderr',
      name: head.name,
      message: head.message,
      stack: text,
    });
  };

  if (options.onStdout) {
    const onStdout = options.onStdout;
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => onStdout(chunk));
  } else {
    child.stdout?.resume();
  }
  // a child that exits before reading all its input must not crash the app with EPIPE
  child.stdin?.on('error', () => undefined);
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    if (stderr.length < MAX_STDERR) stderr += chunk;
    clearTimeout(timer);
    timer = setTimeout(flush, flushMs);
  });

  child.on('error', (err) => {
    options.report({
      origin: 'child',
      source,
      kind: 'child-spawn',
      name: err.name,
      message: err.message,
    });
  });

  child.on('close', (code, signal) => {
    flush();
    if (code === 0 || options.expectedExit?.()) return;
    options.report({
      origin: 'child',
      source,
      kind: 'child-exit',
      name: 'ChildExit',
      message: signal ? `Killed by signal ${signal}` : `Exited with code ${String(code)}`,
    });
  });

  return child;
}
