// Per-node store of the map (phase 5b). The React Flow node list changes only with the layout;
// each node reads its own state from here, so an event re-renders only the nodes it changed.
// Keys: `f:<path>` files, `d:<path>` folder heat, `t:â€¦` temporary nodes, `agents`, `temps`.
import { useCallback, useSyncExternalStore } from 'react';
import {
  fileNodeId,
  type ActivityView,
  type AgentPresence,
  type MapState,
  type NodeActivity,
  type TempView,
} from './activity';

/** Activity below a folder, for the heat bars and the minimap. */
export interface FolderHeat {
  written: number;
  read: number;
  /** Files below the folder in the project. */
  total: number;
  /** Most urgent state of a file below it. */
  state: MapState;
}

const RANK: Record<MapState, number> = {
  idle: 0,
  done: 1,
  reading: 2,
  running: 3,
  writing: 4,
  error: 5,
  waiting: 6,
};

function sameActivity(a: NodeActivity | undefined, b: NodeActivity | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.state === b.state &&
    a.reads === b.reads &&
    a.writes === b.writes &&
    a.note === b.note &&
    a.fresh === b.fresh &&
    a.pulse === b.pulse &&
    a.diff?.add === b.diff?.add &&
    a.diff?.del === b.diff?.del
  );
}

function sameHeat(a: FolderHeat | undefined, b: FolderHeat | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.written === b.written && a.read === b.read && a.total === b.total && a.state === b.state;
}

function samePresence(a: readonly AgentPresence[], b: readonly AgentPresence[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i]!;
    return (
      x.id === y.id &&
      x.state === y.state &&
      x.label === y.label &&
      x.alive === y.alive &&
      x.target === y.target &&
      x.name === y.name &&
      x.model === y.model &&
      x.effort === y.effort &&
      x.code === y.code &&
      x.calls === y.calls
    );
  });
}

export class MapStore {
  private files = new Map<string, NodeActivity>();
  private heats = new Map<string, FolderHeat>();
  private tempStates = new Map<string, TempView>();
  private agentList: AgentPresence[] = [];
  private tempList: TempView[] = [];
  private listeners = new Map<string, Set<() => void>>();
  private foldersKey = '';
  private changes = 0;

  revision(): number {
    return this.changes;
  }

  subscribe = (key: string, listener: () => void): (() => void) => {
    const set = this.listeners.get(key) ?? new Set();
    set.add(listener);
    this.listeners.set(key, set);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(key);
    };
  };

  file(path: string): NodeActivity | undefined {
    return this.files.get(path);
  }

  heat(path: string): FolderHeat | undefined {
    return this.heats.get(path);
  }

  temp(id: string): TempView | undefined {
    return this.tempStates.get(id);
  }

  agents(): AgentPresence[] {
    return this.agentList;
  }

  temps(): TempView[] {
    return this.tempList;
  }

  /** Every file state, for the minimap and the readout. */
  allFiles(): ReadonlyMap<string, NodeActivity> {
    return this.files;
  }

  /**
   * Takes a new view and notifies only the keys that changed. `folders` are the folders shown
   * as a collapsed node or container, with their file count.
   */
  update(view: ActivityView, folders: ReadonlyMap<string, number>): void {
    const changed = new Set<string>();

    const nextFiles = new Map<string, NodeActivity>();
    for (const [path, node] of view.files) {
      const previous = this.files.get(path);
      if (sameActivity(previous, node)) nextFiles.set(path, previous!);
      else {
        nextFiles.set(path, node);
        changed.add(fileNodeId(path));
      }
    }
    for (const path of this.files.keys()) if (!nextFiles.has(path)) changed.add(fileNodeId(path));
    this.files = nextFiles;

    // Heat only moves when a file state or the set of folders on screen does.
    const foldersKey = [...folders].map(([folder, total]) => `${folder}:${total}`).join('\n');
    const filesChanged = [...changed].some((key) => key.startsWith('f:'));
    const recompute = filesChanged || foldersKey !== this.foldersKey;
    const nextHeats = new Map<string, FolderHeat>();
    for (const [folder, total] of recompute ? folders : []) {
      const heat: FolderHeat = { written: 0, read: 0, total, state: 'idle' };
      const prefix = folder ? `${folder}/` : '';
      for (const [path, node] of nextFiles) {
        if (prefix && !path.startsWith(prefix)) continue;
        if (node.writes) heat.written++;
        else if (node.reads) heat.read++;
        if (RANK[node.state] > RANK[heat.state]) heat.state = node.state;
      }
      const previous = this.heats.get(folder);
      if (sameHeat(previous, heat)) nextHeats.set(folder, previous!);
      else {
        nextHeats.set(folder, heat);
        changed.add(`d:${folder}`);
      }
    }
    if (recompute) {
      for (const folder of this.heats.keys())
        if (!nextHeats.has(folder)) changed.add(`d:${folder}`);
      this.heats = nextHeats;
      this.foldersKey = foldersKey;
    }

    const nextTemps = new Map<string, TempView>();
    for (const temp of view.temps) {
      const previous = this.tempStates.get(temp.id);
      if (previous && sameActivity(previous, temp) && previous.label === temp.label)
        nextTemps.set(temp.id, previous);
      else {
        nextTemps.set(temp.id, temp);
        changed.add(temp.id);
      }
    }
    const tempIds = [...nextTemps.keys()].join('\n');
    for (const id of this.tempStates.keys()) if (!nextTemps.has(id)) changed.add(id);
    this.tempStates = nextTemps;
    // The list keeps its identity while the same temporary nodes are on the map.
    if (tempIds !== this.tempList.map((t) => t.id).join('\n')) {
      this.tempList = [...nextTemps.values()];
      changed.add('temps');
    }

    if (!samePresence(this.agentList, view.agents)) {
      this.agentList = view.agents;
      changed.add('agents');
    }

    if (changed.size) {
      changed.add('*');
      this.changes++;
    }
    for (const key of changed) for (const listener of this.listeners.get(key) ?? []) listener();
  }
}

/** Subscribes to one key of the store; the subscription is stable across renders. */
function useKey<T>(store: MapStore, key: string, read: () => T): T {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(key, listener),
    [store, key],
  );
  return useSyncExternalStore(subscribe, read);
}

export const useFileActivity = (store: MapStore, path: string) =>
  useKey(store, fileNodeId(path), () => store.file(path));

export const useFolderHeat = (store: MapStore, path: string) =>
  useKey(store, `d:${path}`, () => store.heat(path));

export const useTempActivity = (store: MapStore, id: string) =>
  useKey(store, id, () => store.temp(id));

export const useAgents = (store: MapStore) => useKey(store, 'agents', () => store.agents());

export const useTemps = (store: MapStore) => useKey(store, 'temps', () => store.temps());

/** Re-renders on any change of the store (minimap, readout). */
export const useStoreRevision = (store: MapStore) => useKey(store, '*', () => store.revision());
