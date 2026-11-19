import { expect, it, vi } from 'vitest';
import { createProjectService } from './service';

it('resolves an outstanding open when the last subscriber leaves during scanning', async () => {
  const workerPath = new URL(
    'data:text/javascript,import { parentPort } from "node:worker_threads"; parentPort.on("message", () => {});',
  );
  const report = vi.fn();
  const service = createProjectService({ workerPath, wasmDir: '', report });
  try {
    const pending = service.open(1, 'workspace', '', vi.fn(), () => true);
    service.closeOwner(1);
    await expect(pending).resolves.toEqual({ ok: false, error: 'workspace-unavailable' });
    expect(report).not.toHaveBeenCalled();
  } finally {
    service.dispose();
  }
});
