// Reports the errors of the renderer to the main process (logger + Errors Console). The renderer
// never writes files or logs by itself: it only calls window.api.errors.reportRenderer.
import type { Api } from '@control-center/ipc-contract';

type ReportKind = 'window-error' | 'unhandled-rejection' | 'render-error';

const MAX = { name: 200, message: 4000, stack: 20_000 } as const;

function describe(value: unknown): { name: string; message: string; stack: string } {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack ?? '' };
  }
  let message: string;
  try {
    message = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
  } catch {
    message = String(value);
  }
  return { name: 'NonError', message, stack: '' };
}

/** Sends one error to the main process. Never throws and never reports its own failures. */
export function reportError(
  api: Api['errors'],
  kind: ReportKind,
  value: unknown,
  extraStack = '',
): void {
  const d = describe(value);
  const stack = extraStack ? `${d.stack}\n${extraStack}` : d.stack;
  api
    .reportRenderer({
      kind,
      name: d.name.slice(0, MAX.name),
      message: d.message.slice(0, MAX.message),
      stack: stack.slice(0, MAX.stack),
    })
    .catch(() => {
      // the main process is the only place that can log: nothing else to do
    });
}

/** `window.onerror` and `unhandledrejection`. Returns the function that removes them. */
export function installRendererCapture(api: Api['errors'], target: Window = window): () => void {
  const onError = (event: ErrorEvent) => {
    reportError(api, 'window-error', event.error ?? (event.message || 'Unknown window error'));
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportError(api, 'unhandled-rejection', event.reason);
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
