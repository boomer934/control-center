// Fault injectors for the E2E tests of the Errors Console. Like their main-process twin they exist
// only in a build made with `--mode e2e`; elsewhere `__CC_E2E_FAULTS__` is false and this file
// does nothing. Each throwing line carries an `E2E_MARK_*` comment: the tests read this file to
// check that the Console shows exactly that line of the TypeScript source.
import { useEffect, useState } from 'react';

interface RendererFaults {
  windowError(): void;
  rejection(): void;
  renderCrash(): void;
}

declare global {
  interface Window {
    __ccFaults?: RendererFaults;
  }
}

const CRASH_EVENT = 'cc:e2e-render-crash';

function triggerWindowError(): void {
  setTimeout(() => {
    throw new Error('e2e renderer window error'); // E2E_MARK_RENDERER_THROW
  }, 0);
}

function triggerRejection(): void {
  void Promise.reject(new Error('e2e renderer unhandled rejection')); // E2E_MARK_RENDERER_REJECT
}

// Every use of the flag is a constant condition, so a build without `--mode e2e` drops the
// triggers, the probe and their strings. The packaged-build test checks it did.
export function installFaults(): void {
  if (__CC_E2E_FAULTS__) {
    window.__ccFaults = {
      windowError: triggerWindowError,
      rejection: triggerRejection,
      renderCrash: () => window.dispatchEvent(new Event(CRASH_EVENT)),
    };
  }
}

/** Throws while rendering once `renderCrash()` was called. */
function Probe() {
  const [crashed, setCrashed] = useState(false);
  useEffect(() => {
    const on = () => setCrashed(true);
    window.addEventListener(CRASH_EVENT, on);
    return () => window.removeEventListener(CRASH_EVENT, on);
  }, []);
  if (crashed) throw new Error('e2e renderer render crash'); // E2E_MARK_RENDERER_RENDER
  return null;
}

/** The probe in the E2E build, nothing otherwise. */
export const FaultProbe: () => null = __CC_E2E_FAULTS__ ? Probe : () => null;
