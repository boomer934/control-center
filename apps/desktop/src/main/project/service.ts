// The project model of the active workspace (phase 5a, ADR 0012). A worker thread scans,
// parses and watches the workspace; this service keeps a mirror of its model, answers
// `project:open` from it and forwards the deltas to the windows that opened it. One model at a
// time: opening another workspace stops the previous worker.
import { Worker } from 'node:worker_threads';
import type { ErrorInput } from '@control-center/app-log';
import type { ProjectOpenResult, ProjectUpdate } from '@control-center/ipc-contract';
import { WorkerMessageSchema, type WorkerStart } from '@control-center/project-model/protocol';
import { applyProjectDelta, type ProjectSnapshot } from '@control-center/project-model/schema';

export interface ProjectServiceDeps {
  /** The worker entry (out/main/project-worker.js, or the TS source in tests). */
  workerPath: string | URL;
  /** Folder with the Tree-sitter runtime and grammars. */
  wasmDir: string;
  report: (error: ErrorInput) => void;
}

type Emit = (update: ProjectUpdate) => void;
type StopReason = Extract<ProjectOpenResult, { ok: false }>['error'];

interface Model {
  workspaceId: string;
  root: string;
  worker: Worker;
  snapshot: ProjectSnapshot | null;
  ready: Promise<void>;
  markReady: () => void;
  subscribers: Map<number, Emit>;
  stopReason: StopReason | null;
}

export function createProjectService(deps: ProjectServiceDeps) {
  let model: Model | null = null;

  const report = (name: string, message: string) =>
    deps.report({ origin: 'main', source: 'project-model', kind: 'child-exit', name, message });

  function stop(current: Model | null, reason: StopReason = 'workspace-unavailable'): void {
    if (!current || current.stopReason) return;
    current.stopReason = reason;
    current.markReady();
    current.subscribers.clear();
    void current.worker.terminate();
    if (model === current) model = null;
  }

  function start(workspaceId: string, root: string): Model {
    const worker = new Worker(deps.workerPath, { name: 'project-model' });
    let markReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const current: Model = {
      workspaceId,
      root,
      worker,
      snapshot: null,
      ready,
      markReady,
      subscribers: new Map(),
      stopReason: null,
    };
    const fail = (name: string, message: string) => {
      if (current.stopReason) return;
      report(name, message);
      for (const emit of current.subscribers.values()) emit({ workspaceId, kind: 'failed' });
      stop(current, 'failed');
    };
    worker.on('message', (raw: unknown) => {
      if (current.stopReason) return;
      const parsed = WorkerMessageSchema.safeParse(raw);
      if (!parsed.success)
        return fail('ProjectModelProtocol', 'The project model worker sent an invalid message');
      const message = parsed.data;
      if (message.type === 'failed')
        return fail('ProjectModelScan', 'The workspace could not be scanned');
      if (message.type === 'snapshot') {
        current.snapshot = message.snapshot;
        current.markReady();
        return;
      }
      const next = current.snapshot && applyProjectDelta(current.snapshot, message.delta);
      if (!next) return fail('ProjectModelProtocol', 'The project model worker skipped a revision');
      current.snapshot = next;
      for (const emit of current.subscribers.values()) {
        emit({ workspaceId, kind: 'delta', delta: message.delta });
      }
    });
    // Worker errors can carry file paths: only a fixed message leaves this module.
    worker.on('error', () =>
      fail('ProjectModelCrashed', 'The project model worker stopped with an error'),
    );
    worker.on('exit', () => fail('ProjectModelExited', 'The project model worker exited'));
    const startMessage: WorkerStart = { type: 'start', root, wasmDir: deps.wasmDir };
    worker.postMessage(startMessage);
    return current;
  }

  return {
    /**
     * Opens (or reuses) the model of `root` and subscribes `owner` to its deltas. `isCurrent`
     * says whether the workspace is still the active one when the snapshot is ready.
     */
    async open(
      owner: number,
      workspaceId: string,
      root: string,
      emit: Emit,
      isCurrent: () => boolean,
    ): Promise<ProjectOpenResult> {
      if (!model || model.workspaceId !== workspaceId || model.root !== root) {
        stop(model);
        model = start(workspaceId, root);
      }
      const current = model;
      current.subscribers.set(owner, emit);
      await current.ready;
      if (current.stopReason) return { ok: false, error: current.stopReason };
      if (!current.snapshot) return { ok: false, error: 'failed' };
      if (!isCurrent()) return { ok: false, error: 'workspace-unavailable' };
      return { ok: true, snapshot: current.snapshot };
    },

    closeOwner(owner: number): void {
      if (!model) return;
      model.subscribers.delete(owner);
      if (!model.subscribers.size) stop(model);
    },

    dispose(): void {
      stop(model);
    },
  };
}
