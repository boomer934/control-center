// The project model of the active workspace (phase 5a): a snapshot from `project:open`, kept
// current with the `project:updated` deltas. A gap in the revisions means an update was missed,
// so the hook asks for a fresh snapshot.
import { useEffect, useState } from 'react';
import { applyProjectDelta, type ProjectSnapshot } from '@control-center/project-model/schema';

export type ProjectModelState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; snapshot: ProjectSnapshot }
  | { kind: 'error'; error: 'workspace-unavailable' | 'failed' };

export function useProjectModel(workspaceId?: string): ProjectModelState {
  const [state, setState] = useState<ProjectModelState>({ kind: 'idle' });

  useEffect(() => {
    if (!workspaceId) {
      setState({ kind: 'idle' });
      return;
    }
    let alive = true;
    let failed = false;
    let snapshot: ProjectSnapshot | null = null;
    let latestRevision = 0;
    let opening = false;
    const open = () => {
      if (opening) return;
      opening = true;
      window.api.project.open({ workspaceId }).then(
        (result) => {
          opening = false;
          if (!alive || failed) return;
          if (!result.ok) return setState({ kind: 'error', error: result.error });
          if (!snapshot || result.snapshot.revision >= snapshot.revision)
            snapshot = result.snapshot;
          // A delta seen in flight may be newer than the snapshot captured by the main process.
          if (snapshot.revision < latestRevision) return open();
          setState({ kind: 'ready', snapshot });
        },
        () => {
          opening = false;
          if (alive) setState({ kind: 'error', error: 'failed' });
        },
      );
    };
    setState({ kind: 'loading' });
    const unsubscribe = window.api.project.onUpdated((update) => {
      if (!alive || failed || update.workspaceId !== workspaceId) return;
      if (update.kind === 'failed') {
        failed = true;
        setState({ kind: 'error', error: 'failed' });
        return;
      }
      latestRevision = Math.max(latestRevision, update.delta.revision);
      if (!snapshot || update.delta.revision <= snapshot.revision) return;
      const next = applyProjectDelta(snapshot, update.delta);
      if (!next) return open();
      snapshot = next;
      setState({ kind: 'ready', snapshot: next });
    });
    open();
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [workspaceId]);

  return state;
}

/** One line for the Live view until the map of phase 5b: files, links, indexing progress. */
export function describeProject(state: ProjectModelState): string {
  switch (state.kind) {
    case 'idle':
      return 'No workspace';
    case 'loading':
      return 'Scanning…';
    case 'error':
      return state.error === 'failed' ? 'The project could not be scanned.' : 'Workspace closed.';
    case 'ready': {
      const { files, progress, status, truncated } = state.snapshot;
      const links = files.reduce(
        (sum, file) => sum + file.imports.length + file.importDirs.length,
        0,
      );
      const count = `${files.length.toLocaleString('en-US')}${truncated ? '+' : ''} files`;
      const linked = `${links.toLocaleString('en-US')} import links`;
      if (status === 'ready') return `${count} · ${linked}`;
      const share = progress.parseable
        ? Math.floor((progress.indexed / progress.parseable) * 100)
        : 0;
      return `${count} · indexing ${share}%`;
    }
  }
}
