// The only file of the main process that touches ipcMain (enforced by ESLint): it registers the
// handlers of @control-center/ipc-contract behind the sender check.
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { Handlers } from '@control-center/ipc-contract';
import { registerIpcHandlers } from '@control-center/ipc-contract/main';
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

const handlers: Handlers = {
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
  shell: {
    openExternal: async ({ url }) => ({ opened: await openExternalSafely(url) }),
  },
};

export function registerIpc(devServer: URL | null): () => void {
  return registerIpcHandlers(ipcMain, handlers, {
    isTrustedSender: makeSenderCheck(devServer),
    onFailure: ({ channel, code }) => {
      // Phase 3b replaces this with the structured logger. Never log payloads here.
      console.warn(`[ipc] ${channel} refused: ${code}`);
    },
  });
}
