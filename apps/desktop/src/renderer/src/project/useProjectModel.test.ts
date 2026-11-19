import type { ProjectOpenResult, ProjectUpdate } from '@control-center/ipc-contract';
import type { ProjectSnapshot } from '@control-center/project-model/schema';
import { useEffect, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useProjectModel } from './useProjectModel';

vi.mock('react', () => ({ useEffect: vi.fn(), useState: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it('fetches a current snapshot when a newer delta arrives during the first open', async () => {
  const initial: ProjectSnapshot = {
    version: 1,
    revision: 0,
    status: 'indexing',
    truncated: false,
    progress: { indexed: 0, parseable: 1 },
    files: [],
  };
  const latest: ProjectSnapshot = {
    ...initial,
    revision: 1,
    status: 'ready',
    progress: { indexed: 1, parseable: 1 },
  };
  let resolveOpen!: (result: ProjectOpenResult) => void;
  const pending = new Promise<ProjectOpenResult>((resolve) => {
    resolveOpen = resolve;
  });
  const open = vi
    .fn<() => Promise<ProjectOpenResult>>()
    .mockReturnValueOnce(pending)
    .mockResolvedValueOnce({ ok: true, snapshot: latest });
  const subscribe = vi.fn<(listener: (update: ProjectUpdate) => void) => () => void>(() => vi.fn());
  vi.stubGlobal('window', { api: { project: { open, onUpdated: subscribe } } });

  const setState = vi.fn();
  vi.mocked(useState).mockReturnValue([{ kind: 'idle' }, setState]);
  useProjectModel('workspace');
  const cleanup = vi.mocked(useEffect).mock.calls[0]![0]();
  try {
    subscribe.mock.calls[0]![0]({
      kind: 'delta',
      workspaceId: 'workspace',
      delta: {
        revision: latest.revision,
        status: latest.status,
        truncated: latest.truncated,
        progress: latest.progress,
        upsert: [],
        remove: [],
      },
    });
    resolveOpen({ ok: true, snapshot: initial });
    await expect
      .poll(() => setState.mock.lastCall?.[0])
      .toEqual({
        kind: 'ready',
        snapshot: latest,
      });
    expect(open).toHaveBeenCalledTimes(2);
  } finally {
    cleanup?.();
  }
});
