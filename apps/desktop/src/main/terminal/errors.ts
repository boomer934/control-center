// Errors in the output of an integrated terminal (phase 5e). The pty output is buffered and
// scanned once the process pauses (a stack trace is printed in one go), with the parsers of
// @control-center/event-schema. A terminal that printed a dev server banner reports its errors as
// `dev-server`; Docker Compose log prefixes make them `docker`. Repeats are dropped and the rate is
// capped, so a crash loop cannot flood the renderer.
import {
  DEV_SERVER_BANNER,
  detectErrors,
  prepareLines,
  type ErrorDraft,
} from '@control-center/event-schema';

/** Quiet time after the last output before the buffer is scanned. */
export const SCAN_DELAY_MS = 250;
/** Longest wait between the first unscanned output and its scan. */
export const MAX_WAIT_MS = 1000;
/** Output kept for the next scan; older text is dropped (a trace is printed last). */
export const SCAN_BUFFER_CHARS = 64 * 1024;
/** The same error (message and place) again within this time is a repeat. */
export const REPEAT_WINDOW_MS = 10_000;
/** At most this many errors per terminal per minute. */
export const MAX_ERRORS_PER_MINUTE = 30;

export interface TerminalErrorScanner {
  push(data: string): void;
  /** Scans what is buffered now (the terminal exited). */
  flush(): void;
  dispose(): void;
}

export interface ScannerDeps {
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
}

export function createTerminalErrorScanner(
  cwd: string,
  onErrors: (errors: ErrorDraft[], at: Date) => void,
  deps: ScannerDeps = {},
): TerminalErrorScanner {
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle as NodeJS.Timeout));
  const now = deps.now ?? Date.now;
  let buffer = '';
  let timer: unknown;
  let pendingSince = 0;
  let devServer = false;
  let disposed = false;
  const recent = new Map<string, number>();
  const sent: number[] = [];

  function scan(): void {
    timer = undefined;
    const text = buffer;
    buffer = '';
    if (disposed || !text) return;
    if (!devServer && prepareLines(text).lines.some((line) => DEV_SERVER_BANNER.test(line)))
      devServer = true;
    const t = now();
    for (const [key, at] of recent) if (t - at > REPEAT_WINDOW_MS) recent.delete(key);
    while (sent.length && t - sent[0]! > 60_000) sent.shift();
    const fresh = detectErrors(text, { cwd, origin: devServer ? 'dev-server' : 'terminal' }).filter(
      (error) => {
        const key = `${error.message}\u0000${error.file?.path ?? ''}:${error.line ?? ''}`;
        if (recent.has(key)) return false;
        recent.set(key, t);
        return true;
      },
    );
    const room = Math.max(0, MAX_ERRORS_PER_MINUTE - sent.length);
    const out = fresh.slice(0, room);
    for (let i = 0; i < out.length; i++) sent.push(t);
    if (out.length) onErrors(out, new Date(t));
  }

  return {
    push(data) {
      if (disposed) return;
      buffer = (buffer + data).slice(-SCAN_BUFFER_CHARS);
      const t = now();
      if (timer === undefined) pendingSince = t;
      // Output that never pauses (a chatty dev server) is still scanned every MAX_WAIT_MS.
      else if (t - pendingSince >= MAX_WAIT_MS) return;
      else clearTimer(timer);
      timer = setTimer(scan, SCAN_DELAY_MS);
    },
    flush() {
      if (timer !== undefined) clearTimer(timer);
      scan();
    },
    dispose() {
      disposed = true;
      if (timer !== undefined) clearTimer(timer);
      timer = undefined;
      buffer = '';
    },
  };
}
