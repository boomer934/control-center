// The only file of the main process that touches ipcMain (enforced by ESLint): it registers the
// handlers of @control-center/ipc-contract behind the sender check.
import { app, BrowserWindow, clipboard, ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { Handlers } from '@control-center/ipc-contract';
import { registerIpcHandlers } from '@control-center/ipc-contract/main';
import type { ErrorsService } from './errors/service';
import { openExternalSafely } from './hardening';
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

export function registerIpc(devServer: URL | null, errors: ErrorsService): () => void {
  return registerIpcHandlers(ipcMain, makeHandlers(errors), {
    isTrustedSender: makeSenderCheck(devServer),
    onFailure: ({ channel, code, cause, issues }) => {
      // Never the payload: only the channel, the failure code and the error of the handler.
      // A zod error would list the received values, so for those only `issues` is kept.
      errors.reportIpcFailure(channel, code, issues ? undefined : cause, issues);
    },
  });
}
