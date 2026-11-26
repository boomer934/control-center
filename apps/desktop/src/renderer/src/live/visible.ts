// What the map shows of the project (phase 5b, PIANO §4.3-A): by default the files the session
// touched and their direct import neighbours; everything else stays collapsed in its folder.
// One container per top-level folder (plus the project root). Pure: same input, same map.
import type { ProjectFile, ProjectSnapshot } from '@control-center/project-model/schema';
import { fileNodeId } from './activity';

/** A touched file brings at most this many import neighbours with it. */
export const NEIGHBOR_LIMIT = 8;
/** Above this many file nodes the neighbours go first, then "show all" stops expanding. */
export const VISIBLE_BUDGET = 600;
/** Collapsed subfolders listed one by one in a container before the rest merge into one node. */
const FOLDER_LIMIT = 12;

export type MapItem =
  | { kind: 'file'; id: string; path: string; name: string }
  /** A collapsed subfolder: `count` files below it. */
  | { kind: 'folder'; id: string; path: string; name: string; count: number }
  /** Hidden files or folders of `path`: clicking expands that folder. */
  | { kind: 'ghost'; id: string; path: string; name: string; count: number };

export interface MapGroup {
  id: string;
  /** Folder of the container, '' for the project root. */
  path: string;
  label: string;
  /** Files below the folder in the project. */
  count: number;
  collapsed: boolean;
  items: MapItem[];
}

export interface VisibleMap {
  groups: MapGroup[];
  /** Workspace paths shown as file nodes. */
  files: Set<string>;
  /** Changes only when the structure does: same key, same layout. */
  key: string;
}

export interface VisibleOptions {
  /** Folders the user opened. */
  expanded: ReadonlySet<string>;
  showAll: boolean;
}

interface Dir {
  files: string[];
  dirs: string[];
  total: number;
}

/** Folder index of a snapshot: direct files, direct subfolders and file count of each folder. */
export interface ProjectIndex {
  dirs: Map<string, Dir>;
  byPath: Map<string, ProjectFile>;
  importers: Map<string, string[]>;
}

const parentOf = (path: string) => {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? '' : path.slice(0, cut);
};
const topOf = (path: string) => {
  const cut = path.indexOf('/');
  return cut < 0 ? '' : path.slice(0, cut);
};
const baseOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const relativeTo = (dir: string, path: string) => (dir ? path.slice(dir.length + 1) : path);
const plural = (n: number, word: string) =>
  `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

export function indexProject(
  files: readonly { path: string }[],
  byPath = new Map<string, ProjectFile>(),
): ProjectIndex {
  const dirs = new Map<string, Dir>();
  const dir = (path: string): Dir => {
    let entry = dirs.get(path);
    if (!entry) {
      entry = { files: [], dirs: [], total: 0 };
      dirs.set(path, entry);
      if (path) dir(parentOf(path)).dirs.push(path);
    }
    return entry;
  };
  dir('');
  for (const file of files) {
    let parent = parentOf(file.path);
    dir(parent).files.push(file.path);
    for (;;) {
      dir(parent).total++;
      if (!parent) break;
      parent = parentOf(parent);
    }
  }
  for (const entry of dirs.values()) {
    entry.files.sort();
    entry.dirs.sort();
  }
  const importers = new Map<string, string[]>();
  for (const file of byPath.values())
    for (const target of file.imports) {
      const list = importers.get(target) ?? [];
      list.push(file.path);
      importers.set(target, list);
    }
  return { dirs, byPath, importers };
}

export function indexSnapshot(snapshot: ProjectSnapshot): ProjectIndex {
  return indexProject(snapshot.files, new Map(snapshot.files.map((file) => [file.path, file])));
}

/** Direct import neighbours of a file, both directions, in a stable order. */
export function neighborsOf(index: ProjectIndex, path: string): string[] {
  const file = index.byPath.get(path);
  const out = new Set<string>([...(file?.imports ?? []), ...(index.importers.get(path) ?? [])]);
  out.delete(path);
  return [...out].sort();
}

export function buildVisibleMap(
  index: ProjectIndex,
  touched: readonly string[],
  options: VisibleOptions,
): VisibleMap {
  // Touched files are kept even when the model does not know them yet (a file just created).
  const extra = touched.filter(
    (path) => !index.byPath.has(path) && !index.dirs.get(parentOf(path))?.files.includes(path),
  );
  const project = extra.length ? withExtraFiles(index, extra) : index;

  const visible = new Set<string>(touched);
  const neighbors: string[] = [];
  for (const path of touched)
    for (const next of neighborsOf(project, path).slice(0, NEIGHBOR_LIMIT))
      if (!visible.has(next)) {
        visible.add(next);
        neighbors.push(next);
      }
  if (visible.size > VISIBLE_BUDGET)
    for (const path of neighbors.reverse()) {
      if (visible.size <= VISIBLE_BUDGET) break;
      visible.delete(path);
    }

  const open = new Set(options.expanded);
  for (const dir of open) for (const path of project.dirs.get(dir)?.files ?? []) visible.add(path);
  if (options.showAll) {
    // Breadth first, so the top of the tree opens before the depths.
    const queue = [''];
    while (queue.length && visible.size < VISIBLE_BUDGET) {
      const dir = queue.shift()!;
      const entry = project.dirs.get(dir);
      if (!entry) continue;
      if (visible.size + entry.files.length > VISIBLE_BUDGET && dir) continue;
      open.add(dir);
      for (const path of entry.files) visible.add(path);
      queue.push(...entry.dirs);
    }
  }

  const shown = new Map<string, number>();
  for (const path of visible) {
    let dir = parentOf(path);
    for (;;) {
      shown.set(dir, (shown.get(dir) ?? 0) + 1);
      if (!dir) break;
      dir = parentOf(dir);
    }
  }
  const hasVisible = (dir: string) => (shown.get(dir) ?? 0) > 0;

  const items = (container: string, dir: string, out: MapItem[]) => {
    const entry = project.dirs.get(dir);
    if (!entry) return;
    let hidden = 0;
    for (const path of entry.files) {
      if (visible.has(path))
        out.push({ kind: 'file', id: fileNodeId(path), path, name: relativeTo(container, path) });
      else hidden++;
    }
    if (hidden)
      out.push({
        kind: 'ghost',
        id: `g:${dir}`,
        path: dir,
        name: `+${plural(hidden, 'file')}`,
        count: hidden,
      });
    // The project root lists only its own files: each top-level folder is a container.
    if (!dir && !container) return;
    const folders: MapItem[] = [];
    let mergedFiles = 0;
    let merged = 0;
    for (const sub of entry.dirs) {
      if (hasVisible(sub) || open.has(sub)) {
        items(container, sub, out);
        continue;
      }
      const count = project.dirs.get(sub)?.total ?? 0;
      if (folders.length < FOLDER_LIMIT || open.has(dir))
        folders.push({
          kind: 'folder',
          id: `d:${sub}`,
          path: sub,
          name: `${relativeTo(container, sub)}/`,
          count,
        });
      else {
        merged++;
        mergedFiles += count;
      }
    }
    out.push(...folders);
    if (merged)
      out.push({
        kind: 'ghost',
        id: `g:${dir}/`,
        path: dir,
        name: `+${plural(merged, 'folder')}`,
        count: mergedFiles,
      });
  };

  const groups: MapGroup[] = [];
  const root = project.dirs.get('')!;
  if (root.files.length) {
    const list: MapItem[] = [];
    items('', '', list);
    groups.push({
      id: 'c:',
      path: '',
      label: './',
      count: root.files.length,
      collapsed: false,
      items: list,
    });
  }
  for (const top of root.dirs) {
    const collapsed = !hasVisible(top) && !open.has(top);
    const list: MapItem[] = [];
    if (!collapsed) items(top, top, list);
    groups.push({
      id: `c:${top}`,
      path: top,
      label: top,
      count: project.dirs.get(top)?.total ?? 0,
      collapsed,
      items: list,
    });
  }

  const key = groups
    .map((g) => `${g.id}${g.collapsed ? '-' : '+'}${g.items.map((i) => i.id).join('|')}`)
    .join('\n');
  const files = new Set<string>();
  for (const group of groups)
    for (const item of group.items) if (item.kind === 'file') files.add(item.path);
  return { groups, files, key };
}

function withExtraFiles(index: ProjectIndex, extra: readonly string[]): ProjectIndex {
  const paths: { path: string }[] = [];
  for (const entry of index.dirs.values()) for (const path of entry.files) paths.push({ path });
  for (const path of extra) paths.push({ path });
  const next = indexProject(paths, index.byPath);
  return { ...next, importers: index.importers };
}

/** Top-level folder of a workspace path ('' for a root file): the container it lives in. */
export function containerOf(path: string): string {
  return `c:${topOf(path)}`;
}

export { baseOf, parentOf };
