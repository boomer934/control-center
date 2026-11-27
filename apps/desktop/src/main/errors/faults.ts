// Fault injectors for the E2E tests of the Errors Console. They exist only in a build made with
// `electron-vite build --mode e2e`: elsewhere the build aliases `#e2e-faults` to faults-off.ts, so
// none of this reaches the bundle (the packaged-build test checks it).
//
// The tests call them with `electronApp.evaluate`; there is no IPC channel for them. Each fault
// carries an `E2E_MARK_*` comment on its throwing line: the tests read this file to check that the
// stack the Console shows points at exactly that line.
import type { ErrorInput } from '@control-center/app-log';
import type { MachineSnapshot } from '@control-center/ipc-contract';
import { superviseChild } from './children';

export function e2eMachineSnapshot(): MachineSnapshot | undefined {
  if (process.env.CC_E2E_MACHINE_SNAPSHOT !== '1') return undefined;
  return {
    docker: { running: 4 },
    ports: { listening: 3, wildcard: 1 },
    gpu: { usedMiB: 9216, totalMiB: 16384 },
    ollama: { models: [{ name: 'qwen-coder:7b', inVram: true }] },
  };
}

export function e2eOllamaPort(): number | undefined {
  const port = Number(process.env.CC_E2E_OLLAMA_PORT);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : undefined;
}

interface Faults {
  uncaught(): void;
  rejection(): void;
  uncaughtWithSecret(secret: string): void;
  crashChild(command: string, file: string): void;
}

export function installE2eFaults(report: (input: ErrorInput) => unknown): void {
  const faults: Faults = {
    uncaught() {
      setImmediate(() => {
        throw new Error('e2e main uncaught exception'); // E2E_MARK_MAIN_THROW
      });
    },
    rejection() {
      void Promise.reject(new Error('e2e main unhandled rejection')); // E2E_MARK_MAIN_REJECT
    },
    uncaughtWithSecret(secret) {
      setImmediate(() => {
        throw new Error(`e2e leaked ${secret} while reading C:\\Users\\someone\\private.txt`); // E2E_MARK_MAIN_SECRET
      });
    },
    crashChild(command, file) {
      superviseChild({ name: 'e2e-crash', command, args: ['--no-warnings', file], report });
    },
  };
  (globalThis as Record<string, unknown>).__ccFaults = faults;
}
