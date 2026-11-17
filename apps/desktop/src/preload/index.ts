// Sandboxed preload: exposes only the typed `window.api` generated from the IPC contract.
// The raw ipcRenderer, Node globals and Electron modules never reach the renderer.
import { contextBridge, ipcRenderer } from 'electron';
import { createApi } from '@control-center/ipc-contract/preload';

contextBridge.exposeInMainWorld(
  'api',
  createApi((channel, ...args) => ipcRenderer.invoke(channel, ...args)),
);
