// Entry of the main process.
import { join } from 'node:path';
import { app, BrowserWindow, session } from 'electron';
import {
  hardenAllWebContents,
  hardenSession,
  installAppProtocol,
  registerAppScheme,
} from './hardening';
import { installE2eFaults } from '#e2e-faults';
import { installMainCapture } from './errors/capture';
import { builtPaths, createErrorsService } from './errors/service';
import { registerIpc } from './ipc';
import { parseDevServerUrl } from './security/urls';
import { createMainWindow } from './window';

// The dev server URL is honoured only in an unpackaged (development) run.
const devServer = app.isPackaged ? null : parseDevServerUrl(process.env.ELECTRON_RENDERER_URL);

const paths = builtPaths(__dirname);
const projectRoot = app.isPackaged ? app.getAppPath() : paths.projectRoot;
const errors = createErrorsService({
  logDir: join(app.getPath('userData'), 'logs'),
  projectRoot,
  builtRoot: paths.builtRoot,
  rendererSourceRoot: paths.rendererSourceRoot,
  devServer,
  meta: () => ({
    app: 'Control Center',
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
  }),
});
installMainCapture(errors.report, app);
installE2eFaults(errors.report);
errors.logger.info('main', 'app-start', { version: app.getVersion(), packaged: app.isPackaged });

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
    const disposeIpc = registerIpc(devServer, errors, projectRoot);
    let quitting = false;
    app.on('will-quit', function drainHistory(event) {
      event.preventDefault();
      if (quitting) return;
      quitting = true;
      void Promise.resolve()
        .then(disposeIpc)
        .catch(() => errors.logger.error('main', 'app-shutdown-failed'))
        .finally(() => {
          app.removeListener('will-quit', drainHistory);
          // Let Electron finish cancelling the original quit before trying again.
          setImmediate(() => app.quit());
        });
    });
    createMainWindow(devServer);
  });

  app.on('window-all-closed', () => app.quit());
}
