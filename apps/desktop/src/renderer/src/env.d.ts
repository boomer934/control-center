import type { Api } from '@control-center/ipc-contract';

declare global {
  interface Window {
    /** The typed bridge exposed by the preload. The only way to reach the main process. */
    readonly api: Api;
  }
}

export {};
