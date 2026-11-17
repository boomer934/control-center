// Capture of the errors of the main process itself: exceptions nobody caught, rejections nobody
// handled, and renderer/GPU/utility processes that died.
import { describeError, type ErrorInput } from '@control-center/app-log';

type Report = (input: ErrorInput) => unknown;

interface RendererGone {
  reason: string;
  exitCode: number;
}
interface ChildGone extends RendererGone {
  type: string;
  name?: string;
}

/** The two Electron `app` events used here (Electron's `App` satisfies it). */
export interface AppEvents {
  on(event: 'render-process-gone', l: (e: unknown, c: unknown, d: RendererGone) => void): unknown;
  on(event: 'child-process-gone', l: (e: unknown, d: ChildGone) => void): unknown;
  off(event: 'render-process-gone', l: (e: unknown, c: unknown, d: RendererGone) => void): unknown;
  off(event: 'child-process-gone', l: (e: unknown, d: ChildGone) => void): unknown;
}

/** Process-level handlers. Returns a function that removes them (tests). */
export function installMainCapture(report: Report, app: AppEvents): () => void {
  const onException = (err: unknown, origin: string) => {
    report({
      origin: 'main',
      source: 'main',
      kind: origin === 'unhandledRejection' ? 'unhandled-rejection' : 'uncaught-exception',
      ...describeError(err),
    });
  };
  const onRejection = (reason: unknown) => {
    report({
      origin: 'main',
      source: 'main',
      kind: 'unhandled-rejection',
      ...describeError(reason),
    });
  };
  const onRendererGone = (_e: unknown, _c: unknown, details: RendererGone) => {
    if (details.reason === 'clean-exit') return;
    report({
      origin: 'renderer',
      source: 'renderer',
      kind: 'process-gone',
      name: 'RenderProcessGone',
      message: `Renderer process gone: ${details.reason} (exit code ${details.exitCode})`,
    });
  };
  const onChildGone = (_e: unknown, details: ChildGone) => {
    if (details.reason === 'clean-exit') return;
    report({
      origin: 'child',
      source: `child:${details.type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      kind: 'process-gone',
      name: 'ChildProcessGone',
      message: `${details.name ?? details.type} process gone: ${details.reason} (exit code ${details.exitCode})`,
    });
  };

  process.on('uncaughtException', onException);
  process.on('unhandledRejection', onRejection);
  app.on('render-process-gone', onRendererGone);
  app.on('child-process-gone', onChildGone);

  return () => {
    process.off('uncaughtException', onException);
    process.off('unhandledRejection', onRejection);
    app.off('render-process-gone', onRendererGone);
    app.off('child-process-gone', onChildGone);
  };
}
