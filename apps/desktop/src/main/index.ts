// Entry of the main process.
import { join } from 'node:path';
import { app, BrowserWindow, session } from 'electron';
import {
  hardenAllWebContents,
  hardenSession,
  installAppProtocol,
  registerAppScheme,
} from './hardening';
import { registerIpc } from './ipc';
import { parseDevServerUrl } from './security/urls';
import { createMainWindow } from './window';

// The dev server URL is honoured only in an unpackaged (development) run.
const devServer = app.isPackaged ? null : parseDevServerUrl(process.env.ELECTRON_RENDERER_URL);

// Before `ready`: sandbox every renderer and declare the app:// scheme.
app.enableSandbox();
registerAppScheme();
hardenAllWebContents(app, devServer);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(() => {
    hardenSession(session.defaultSession, devServer);
    installAppProtocol(session.defaultSession, join(__dirname, '../renderer'));
    registerIpc(devServer);
    createMainWindow(devServer);
  });

  app.on('window-all-closed', () => app.quit());
}
