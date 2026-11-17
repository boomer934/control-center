// Plumbing of the push events of the main process (ADR 0007), kept out of ipc.ts so it can be
// unit-tested without Electron.
import { contract } from '@control-center/ipc-contract';
import type { IpcFailure } from '@control-center/ipc-contract/main';
import type { ErrorsService } from './errors/service';

/**
 * Runs `fire` at most once per `delayMs`, after the first trigger of a burst: an error storm
 * becomes one event, not hundreds.
 */
export function coalesce(delayMs: number, fire: () => void): { trigger(): void; cancel(): void } {
  let pending: ReturnType<typeof setTimeout> | null = null;
  return {
    trigger() {
      pending ??= setTimeout(() => {
        pending = null;
        fire();
      }, delayMs);
    },
    cancel() {
      if (pending) clearTimeout(pending);
      pending = null;
    },
  };
}

/**
 * Where a refused or failed IPC call or event goes. Never the payload: only the channel, the
 * failure code and the error of the handler; a zod error would list the received values, so for
 * those only `issues` is kept. A failure of `errors:changed` itself goes to the log file only:
 * recording it in the store would push `errors:changed` again, a loop.
 */
export function makeFailureRouter(errors: Pick<ErrorsService, 'logger' | 'reportIpcFailure'>) {
  return ({ channel, code, cause, issues }: IpcFailure): void => {
    if (channel === contract.errors.changed.channel) {
      errors.logger.error('ipc', 'event-failed', { channel, code, ...(issues ? { issues } : {}) });
      return;
    }
    errors.reportIpcFailure(channel, code, issues ? undefined : cause, issues);
  };
}
