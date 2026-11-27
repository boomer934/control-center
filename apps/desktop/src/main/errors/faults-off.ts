// Stands in for faults.ts in every build that is not `--mode e2e` (see electron.vite.config.ts).
export function installE2eFaults(): void {
  // no fault injectors in this build
}

export function e2eMachineSnapshot(): undefined {
  return undefined;
}

export function e2eOllamaPort(): undefined {
  return undefined;
}
