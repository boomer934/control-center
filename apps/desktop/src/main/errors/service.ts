// Wires the logger, the error store and the renderer stack mapper into the one object the rest of
// the main process uses. No Electron import: paths and metadata come from the caller.
import { resolve } from 'node:path';
import {
  createErrorReporter,
  createLogger,
  describeError,
  ErrorStore,
  formatReport,
  type ErrorGroup,
  type ErrorInput,
  type Logger,
  type ReportMeta,
} from '@control-center/app-log';
import { makeTextCleaner } from '@control-center/event-schema';
import { createStackMapper } from './stack-mapper';

export interface ErrorsServiceOptions {
  /** Where the JSONL files go (`<userData>/logs`). */
  logDir: string;
  /** Repository root (development) or app path (packaged): frame paths are made relative to it. */
  projectRoot: string;
  /** `out/`: the build, with the source maps of every bundle. */
  builtRoot: string;
  /** `src/renderer`, for dev-server frames. */
  rendererSourceRoot: string;
  devServer: URL | null;
  meta: () => Omit<ReportMeta, 'generatedAt'>;
  /** More reports than this per `windowMs` from the renderer are dropped. */
  rendererBudget?: { max: number; windowMs: number };
}

export interface RendererReport {
  kind: 'window-error' | 'unhandled-rejection' | 'render-error';
  name: string;
  message: string;
  stack: string;
}

export function createErrorsService(options: ErrorsServiceOptions) {
  const clean = makeTextCleaner(options.projectRoot);
  const logger: Logger = createLogger({ dir: options.logDir, clean, minLevel: 'info' });
  const store = new ErrorStore({ projectRoot: options.projectRoot, clean });
  const mapper = createStackMapper({
    builtRoot: options.builtRoot,
    rendererSourceRoot: options.rendererSourceRoot,
    devOrigin: options.devServer?.origin ?? null,
  });
  const reportMapped = createErrorReporter({ logger, store });
  // Every stack goes through the source maps before it is parsed, logged or shown.
  const report = (input: ErrorInput): ErrorGroup =>
    reportMapped(input.stack ? { ...input, stack: mapper.map(input.stack) } : input);

  const budget = options.rendererBudget ?? { max: 100, windowMs: 10_000 };
  let windowStart = 0;
  let used = 0;
  let dropped = 0;

  return {
    logger,
    store,
    report,

    /** An error the renderer caught in itself: bounded in rate, stack mapped to the sources. */
    reportRenderer(input: RendererReport): { id: string } {
      const t = Date.now();
      if (t - windowStart > budget.windowMs) {
        if (dropped > 0) {
          logger.warn('renderer', 'reports-dropped', { dropped });
          dropped = 0;
        }
        windowStart = t;
        used = 0;
      }
      used += 1;
      if (used > budget.max) {
        dropped += 1;
        return { id: 'dropped' };
      }
      const group = report({
        origin: 'renderer',
        source: 'renderer',
        kind: input.kind,
        name: input.name,
        message: input.message,
        stack: input.stack,
      });
      return { id: group.id };
    },

    /** An IPC call that was refused or failed (never includes the payload). */
    reportIpcFailure(channel: string, code: string, cause: unknown, issues?: string): void {
      const detail = cause === undefined ? null : describeError(cause);
      report({
        origin: 'ipc',
        source: `ipc:${channel}`,
        kind: 'ipc-failure',
        name: detail?.name ?? 'IpcFailure',
        // zod errors list the received values: use only the path summary the gate computed
        message: `${code}${issues ? `: ${issues}` : detail && !issues ? `: ${detail.message}` : ''}`,
        ...(detail?.stack && !issues ? { stack: detail.stack } : {}),
      });
    },

    /** The text of "copy report": cleaned again as a whole. */
    buildReport(): { text: string; groups: number } {
      const groups = store.list();
      const text = formatReport(groups, { ...options.meta(), generatedAt: new Date() }, clean);
      return { text, groups: groups.length };
    },
  };
}

export type ErrorsService = ReturnType<typeof createErrorsService>;

/** Paths of the built app relative to the main bundle (`out/main/index.js`). */
export function builtPaths(mainDir: string) {
  return {
    builtRoot: resolve(mainDir, '..'),
    // out/main → apps/desktop/src/renderer (the Vite root of the renderer)
    rendererSourceRoot: resolve(mainDir, '../../src/renderer'),
    projectRoot: resolve(mainDir, '../../../..'),
  };
}
