// The only file of the main process that touches ipcMain (enforced by ESLint): it registers the
// handlers of @control-center/ipc-contract behind the sender check, and pushes the contract
// events to the trusted windows only (ADR 0007).
import { app, BrowserWindow, clipboard, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { contract, type Handlers } from '@control-center/ipc-contract';
import {
  createEventEmitter,
  registerIpcHandlers,
  type Emit,
  type EventReceiver,
} from '@control-center/ipc-contract/main';
import type { ErrorsService } from './errors/service';
import { openExternalSafely } from './hardening';
import { coalesce, makeFailureRouter } from './ipc-events';
import { isAppUrl } from './security/urls';

/** Windows created by the app itself; IPC from any other WebContents is refused. */
const trustedWindowIds = new Set<number>();

export function trustWindow(win: BrowserWindow): void {
  const id = win.id;
  trustedWindowIds.add(id);
  win.on('closed', () => trustedWindowIds.delete(id));
}

/**
 * A sender is trusted only if it is the top-level frame of one of the app's windows and is
 * showing an app URL (app://control-center, or the dev server in development).
 */
export function makeSenderCheck(devServer: URL | null) {
  return (event: IpcMainInvokeEvent): boolean => {
    const frame = event.senderFrame;
    if (!frame || frame.parent !== null) return false;
    if (!isAppUrl(frame.url, devServer)) return false;
    const win = BrowserWindow.fromWebContents(event.sender);
    return win !== null && trustedWindowIds.has(win.id) && win.webContents === event.sender;
  };
}

function makeHandlers(errors: ErrorsService): Handlers {
  return {
    app: {
      getInfo: () => ({
        name: app.getName(),
        version: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        platform: process.platform,
        packaged: app.isPackaged,
      }),
    },
    errors: {
      list: () => ({ revision: errors.store.revision, groups: errors.store.list() }),
      reportRenderer: (report) => errors.reportRenderer(report),
      copyReport: () => {
        const { text, groups } = errors.buildReport();
        // The text is already redacted. The main process writes it: the renderer has no
        // clipboard permission.
        clipboard.writeText(text);
        return { copied: true, groups };
      },
      clear: () => ({ cleared: errors.store.clear() }),
    },
    shell: {
      openExternal: async ({ url }) => ({ opened: await openExternalSafely(url) }),
    },
  };
}

/**
 * The receivers of push events: the same windows whose IPC is trusted, still alive and still
 * showing an app URL. `webContents.send` reaches the top-level frame only.
 */
export function trustedReceivers(devServer: URL | null): EventReceiver[] {
  const out: EventReceiver[] = [];
  for (const id of trustedWindowIds) {
    const win = BrowserWindow.fromId(id);
    if (!win || win.isDestroyed()) continue;
    const contents = win.webContents;
    if (contents.isDestroyed() || !isAppUrl(contents.getURL(), devServer)) continue;
    out.push({ send: (channel, payload) => contents.send(channel, payload) });
  }
  return out;
}

/** At most one `errors:changed` every this many ms: an error storm is one reload, not hundreds. */
const ERRORS_CHANGED_DELAY_MS = 50;

export function registerIpc(devServer: URL | null, errors: ErrorsService): () => void {
  const reportFailure = makeFailureRouter(errors);

  const disposeHandlers = registerIpcHandlers(ipcMain, makeHandlers(errors), {
    isTrustedSender: makeSenderCheck(devServer),
    onFailure: reportFailure,
  });

  const emit: Emit = createEventEmitter({
    targets: () => trustedReceivers(devServer),
    onFailure: reportFailure,
  });

  const errorsChanged = coalesce(ERRORS_CHANGED_DELAY_MS, () =>
    emit(contract.errors.changed, { revision: errors.store.revision }),
  );
  const stopErrors = errors.store.onChange(errorsChanged.trigger);

  return () => {
    stopErrors();
    errorsChanged.cancel();
    disposeHandlers();
  };
}
