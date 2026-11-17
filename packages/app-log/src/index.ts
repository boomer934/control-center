// Public entry of @control-center/app-log (Node only: it uses node:fs and node:crypto).
export type {
  ErrorGroup,
  ErrorInput,
  ErrorKind,
  ErrorOrigin,
  FrameKind,
  LogLevel,
  StackFrame,
} from './types';
export { describeError, normalizeFile, parseErrorHead, parseStack, stripAnsi } from './stack';
export { ErrorStore, type ErrorStoreOptions } from './store';
export { createLogger, sanitizeValue, type Logger, type LoggerOptions } from './logger';
export { formatReport, type ReportMeta } from './report';

import type { Logger } from './logger';
import type { ErrorStore } from './store';
import type { ErrorGroup, ErrorInput } from './types';

/**
 * One call per error: written to the JSONL log and counted in the store the Console reads.
 * The log entry carries the parsed frames, never the raw stack.
 */
export function createErrorReporter(deps: { logger: Logger; store: ErrorStore }) {
  return function report(input: ErrorInput): ErrorGroup {
    const group = deps.store.record(input);
    deps.logger.log(input.kind === 'child-stderr' ? 'warn' : 'error', input.source, input.kind, {
      group: group.id,
      count: group.count,
      name: group.name,
      message: group.message,
      frames: group.frames.filter((f) => f.kind === 'project').slice(0, 12),
    });
    return group;
  };
}
