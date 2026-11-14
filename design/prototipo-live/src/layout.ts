// Map layout with ELK: one container per top-level folder (plus the project root and the shell),
// each a single column of nodes; the containers are packed by ELK too. Agent chips are not laid
// out here: they move with time and are placed next to the node they work on (see LiveMap).
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { Replay } from './replay/types';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface LaidContainer extends Box {
  id: string;
  label: string;
  count: number;
}
export interface LaidNode extends Box {
  id: string;
  /** Parent container id; x/y are relative to it. */
  parent: string;
  name: string;
  kind: 'file' | 'command';
}
export interface MapLayout {
  containers: LaidContainer[];
  nodes: LaidNode[];
  /** Absolute box of every node, for chip placement. */
  abs: Map<string, Box>;
  w: number;
  h: number;
}

const elk = new ELK();
/** Monospace advance at --fs-map (Martian Mono, cell width) used to size nodes. */
const CH = 7.2;
const shorten = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function layoutMap(replay: Replay, row: number): Promise<MapLayout> {
  const groups = new Map<
    string,
    { label: string; items: { id: string; name: string; kind: LaidNode['kind'] }[] }
  >();
  for (const f of replay.files) {
    const cut = f.indexOf('/');
    const dir = cut < 0 ? '.' : f.slice(0, cut);
    const g = groups.get(dir) ?? { label: dir === '.' ? './' : dir, items: [] };
    g.items.push({ id: f, name: cut < 0 ? f : f.slice(cut + 1), kind: 'file' });
    groups.set(dir, g);
  }
  const shell = replay.ops.filter((o) => o.kind === 'shell');
  if (shell.length)
    groups.set('$shell', {
      label: 'shell',
      items: shell.map((o) => ({
        id: o.id,
        name: `$ ${shorten(o.target ?? '', 38)}`,
        kind: 'command',
      })),
    });

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'rectpacking',
      'elk.aspectRatio': '1.8',
      'elk.spacing.nodeNode': '32',
      'elk.padding': '[top=16,left=8,bottom=8,right=8]',
    },
    children: [...groups].map(([id, g]) => {
      const w = Math.max(150, ...g.items.map((i) => i.name.length * CH + 120));
      return {
        id: `ctr:${id}`,
        layoutOptions: {
          // unconnected nodes in one layer = a single column, in model order
          'elk.algorithm': 'layered',
          'elk.direction': 'RIGHT',
          'elk.separateConnectedComponents': 'false',
          'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
          'elk.spacing.nodeNode': String(row * 0.4),
          'elk.padding': '[top=20,left=16,bottom=12,right=16]',
        },
        children: g.items.map((i) => ({ id: i.id, width: Math.round(w), height: row })),
      };
    }),
  };

  const out = await elk.layout(graph);
  const containers: LaidContainer[] = [];
  const nodes: LaidNode[] = [];
  const abs = new Map<string, Box>();
  for (const c of out.children ?? []) {
    const key = c.id.slice(4);
    const g = groups.get(key);
    if (!g) continue;
    const cx = c.x ?? 0;
    const cy = c.y ?? 0;
    containers.push({
      id: c.id,
      label: g.label,
      count: g.items.length,
      x: cx,
      y: cy,
      w: c.width ?? 0,
      h: c.height ?? 0,
    });
    for (const n of c.children ?? []) {
      const item = g.items.find((i) => i.id === n.id);
      if (!item) continue;
      const box = { x: n.x ?? 0, y: n.y ?? 0, w: n.width ?? 0, h: n.height ?? row };
      nodes.push({ ...box, id: n.id, parent: c.id, name: item.name, kind: item.kind });
      abs.set(n.id, { ...box, x: cx + box.x, y: cy + box.y });
    }
  }
  return { containers, nodes, abs, w: out.width ?? 0, h: out.height ?? 0 };
}
