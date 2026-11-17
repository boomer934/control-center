import type { Api } from '@control-center/ipc-contract';

declare global {
  interface Window {
    /** The typed bridge exposed by the preload. The only way to reach the main process. */
    readonly api: Api;
  }

  /** Build-time flag: true only in the E2E build (see errors/faults.tsx). */
  const __CC_E2E_FAULTS__: boolean;
}

export {};
