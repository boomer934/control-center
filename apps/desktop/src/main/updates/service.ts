import { lstatSync, mkdirSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AppUpdater } from 'electron-updater';
import { StableVersionSchema, type AppUpdateStatus } from '@control-center/ipc-contract';

export const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface UpdateOptions {
  updater?: AppUpdater;
  dataDir: string;
  changed(status: AppUpdateStatus): void;
  failed(): void;
}

export function createUpdateService({ updater, dataDir, changed, failed }: UpdateOptions) {
  const disabledMarker = join(dataDir, 'updates-disabled');
  let status: AppUpdateStatus = { phase: 'unavailable' };
  let enabled = false;
  let closed = false;
  let checkInFlight: AbortController | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  function publish(next: AppUpdateStatus): void {
    status = next;
    changed(next);
  }

  function getStatus(): AppUpdateStatus {
    return status;
  }

  if (updater) {
    try {
      lstatSync(disabledMarker);
    } catch (error) {
      enabled = (error as NodeJS.ErrnoException).code === 'ENOENT';
      if (!enabled) failed();
    }
    status = { phase: enabled ? 'idle' : 'disabled' };
    updater.logger = null;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.disableWebInstaller = true;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    // Checks and downloads report via their promises. Explicit installation reports via this event.
    updater.on('error', () => {
      if (status.phase !== 'installing') return;
      updater.autoInstallOnAppQuit = false;
      failed();
      publish({ phase: 'error' });
    });
  }

  async function check(): Promise<void> {
    if (!updater || !enabled || closed || checkInFlight || status.phase === 'installing') return;
    // Keep a downloaded installer ready until it is installed or the user disables updates.
    if (status.phase === 'ready') return;
    const operation = new AbortController();
    const { signal } = operation;
    checkInFlight = operation;
    publish({ phase: 'checking' });
    try {
      const result = await updater.checkForUpdates();
      if (signal.aborted) return;
      if (!result?.isUpdateAvailable) {
        publish({ phase: 'idle' });
        return;
      }
      const { updateInfo, cancellationToken } = result;
      const version = StableVersionSchema.parse(updateInfo.version);
      if (
        !cancellationToken ||
        !updateInfo.files?.length ||
        updateInfo.files.some((file) => !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512))
      ) {
        throw new Error('Missing update download integrity information');
      }
      signal.addEventListener('abort', () => cancellationToken.cancel(), { once: true });
      updater.autoInstallOnAppQuit = true;
      publish({ phase: 'downloading', version });
      await updater.downloadUpdate(cancellationToken);
      if (!signal.aborted) publish({ phase: 'ready', version });
    } catch {
      if (!signal.aborted) {
        updater.autoInstallOnAppQuit = false;
        failed();
        publish({ phase: 'error' });
      }
    } finally {
      checkInFlight = undefined;
      // The user may have re-enabled updates while a cancelled check was still settling.
      if (signal.aborted) void check();
    }
  }

  function start(): void {
    if (!updater || timer || closed) return;
    timer = setInterval(() => void check(), UPDATE_INTERVAL_MS);
    void check();
  }

  function setEnabled(next: boolean): AppUpdateStatus {
    if (!updater || closed || status.phase === 'installing' || enabled === next) return status;
    // The empty directory is a persistent opt-out marker. No preference payload is read from disk.
    try {
      if (next) {
        rmdirSync(disabledMarker);
      } else {
        mkdirSync(dataDir, { recursive: true });
        mkdirSync(disabledMarker);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== (next ? 'ENOENT' : 'EEXIST')) throw error;
    }
    enabled = next;
    if (!enabled) {
      updater.autoInstallOnAppQuit = false;
      checkInFlight?.abort();
      publish({ phase: 'disabled' });
    } else {
      publish({ phase: 'idle' });
      void check();
    }
    return status;
  }

  function restart(): { restarting: boolean } {
    if (!updater || closed || status.phase !== 'ready') return { restarting: false };
    publish({ phase: 'installing', version: status.version });
    updater.quitAndInstall(true, true);
    return { restarting: getStatus().phase === 'installing' };
  }

  function dispose(): void {
    closed = true;
    clearInterval(timer);
    if (checkInFlight) {
      // Keep auto-install armed only for a completed download and a normal app quit.
      if (updater) updater.autoInstallOnAppQuit = false;
      checkInFlight.abort();
    }
  }

  return { start, getStatus, setEnabled, restart, dispose };
}
