import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CancellationToken, type AppUpdater } from 'electron-updater';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUpdateService, UPDATE_INTERVAL_MS } from './service';

const update = {
  isUpdateAvailable: true,
  updateInfo: { version: '2.0.0', files: [{ sha512: `${'A'.repeat(86)}==` }] },
  cancellationToken: new CancellationToken(),
};

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'cc-updates-'));
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  // Only remove the temporary directory created for this test.
  rmSync(dataDir, { recursive: true, force: true });
});

function setup(available = true) {
  const updater = {
    on: vi.fn(),
    checkForUpdates: vi.fn<() => Promise<typeof update | null>>().mockResolvedValue(null),
    downloadUpdate: vi.fn().mockResolvedValue(['installer.exe']),
    quitAndInstall: vi.fn(),
    autoInstallOnAppQuit: true,
    autoDownload: true,
    allowPrerelease: true,
    allowDowngrade: true,
    disableWebInstaller: false,
  };
  const changed = vi.fn();
  const failed = vi.fn();
  const service = createUpdateService({
    updater: available ? (updater as unknown as AppUpdater) : undefined,
    dataDir,
    changed,
    failed,
  });
  return { updater, service, changed, failed };
}

describe('app updates', () => {
  it('checks on startup and every six hours, then stops at shutdown', async () => {
    const { updater, service } = setup();
    service.start();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    service.dispose();
    await vi.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it('downloads a stable update and exposes an explicit restart only after it is ready', async () => {
    const { updater, service, changed } = setup();
    updater.checkForUpdates.mockResolvedValueOnce(update);
    service.start();
    expect(service.restart()).toEqual({ restarting: false });
    expect(updater).toMatchObject({
      allowPrerelease: false,
      allowDowngrade: false,
      disableWebInstaller: true,
      autoDownload: false,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(changed.mock.calls.map(([value]) => value.phase)).toEqual([
      'checking',
      'downloading',
      'ready',
    ]);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(service.restart()).toEqual({ restarting: true });
    expect(service.restart()).toEqual({ restarting: false });
    expect(updater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true);
  });

  it('rejects a manifest without an installer checksum and recovers on the next check', async () => {
    const { updater, service, failed } = setup();
    updater.checkForUpdates.mockResolvedValueOnce({
      ...update,
      updateInfo: { version: '2.0.0', files: [{ sha512: '' }] },
    });
    service.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.getStatus()).toEqual({ phase: 'error' });
    expect(failed).toHaveBeenCalledTimes(1);
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS);
    expect(service.getStatus()).toEqual({ phase: 'idle' });
  });

  it('cancels an in-flight download and persists opt-out across app restarts', async () => {
    const { updater, service } = setup();
    const cancellationToken = new CancellationToken();
    updater.checkForUpdates.mockResolvedValueOnce({ ...update, cancellationToken });
    let finishDownload!: (files: string[]) => void;
    updater.downloadUpdate.mockReturnValueOnce(
      new Promise<string[]>((resolve) => {
        finishDownload = resolve;
      }),
    );
    service.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.getStatus()).toEqual({ phase: 'downloading', version: '2.0.0' });
    expect(service.setEnabled(false)).toEqual({ phase: 'disabled' });
    expect(cancellationToken.cancelled).toBe(true);
    finishDownload(['installer.exe']);
    await vi.advanceTimersByTimeAsync(0);
    expect(service.getStatus()).toEqual({ phase: 'disabled' });
    expect(updater.autoInstallOnAppQuit).toBe(false);
    service.dispose();

    const next = setup();
    next.service.start();
    await vi.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS);
    expect(next.updater.checkForUpdates).not.toHaveBeenCalled();
    next.service.setEnabled(true);
    expect(next.updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('leaves updating unavailable when there is no packaged updater', () => {
    const { updater, service } = setup(false);
    service.start();
    expect(service.setEnabled(true)).toEqual({ phase: 'unavailable' });
    expect(service.restart()).toEqual({ restarting: false });
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });
});
