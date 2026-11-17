// Sandboxed preload: exposes only the typed `window.api` generated from the IPC contract.
// The raw ipcRenderer, Node globals and Electron modules never reach the renderer.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { contract } from '@control-center/ipc-contract';
import { createApi } from '@control-center/ipc-contract/preload';

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld(
  'api',
  createApi(
    invoke,
    (channel, listener) => {
      // The IpcRendererEvent stays here: the renderer receives only the payload.
      const raw = (_event: IpcRendererEvent, ...args: unknown[]) => listener(args);
      ipcRenderer.on(channel, raw);
      return () => {
        ipcRenderer.removeListener(channel, raw);
      };
    },
    {
      // A subscriber of the page threw: report it like any other renderer error.
      onListenerError: (error) => {
        const e = error instanceof Error ? error : new Error(String(error));
        void invoke(contract.errors.reportRenderer.channel, {
          kind: 'window-error',
          name: e.name.slice(0, 200),
          message: e.message.slice(0, 4000),
          stack: (e.stack ?? '').slice(0, 20_000),
        }).catch(() => {
          // the main process does not answer: nothing else to do
        });
      },
    },
  ),
);
