import { join } from 'node:path';
import { BrowserWindow } from 'electron';
import { trustWindow } from './ipc';
import { secureWebPreferences } from './security/web-preferences';
import { APP_INDEX_URL } from './security/urls';

export function createMainWindow(devServer: URL | null): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Control Center',
    webPreferences: secureWebPreferences(join(__dirname, '../preload/index.js')),
  });
  trustWindow(win);

  win.once('ready-to-show', () => win.show());
  void win.loadURL(devServer ? devServer.href : APP_INDEX_URL);
  return win;
}
