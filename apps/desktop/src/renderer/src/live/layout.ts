// Map layout (phase 5b). Inside a container the nodes sit on a regular grid, computed here; the
// containers are packed by ELK in a worker (pack.ts, layout.worker.ts), so a big project never
// blocks the interface. Sizes come from the density tokens (--row, --fs-map).
import type { MapGroup, MapItem, VisibleMap } from './visible';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutMetrics {
  /** Height of a node row, from --row. */
  row: number;
  /** Advance of one monospace character at --fs-map. */
  ch: number;
}

export interface LaidGroup extends Box {
  group: MapGroup;
}

export interface LaidItem extends Box {
  item: MapItem;
  /** Container id; x and y are relative to it. */
  parent: string;
}

export interface MapLayout {
  key: string;
  groups: LaidGroup[];
  items: LaidItem[];
  /** Absolute box of every node, by node id. */
  abs: Map<string, Box>;
  w: number;
  h: number;
  /** Row height the layout was made with. */
  row: number;
}

/** What the worker packs: one box per container, in model order. */
export interface PackRequest {
  id: number;
  boxes: { id: string; w: number; h: number }[];
  aspect: number;
}

export interface PackResponse {
  id: number;
  positions: Record<string, { x: number; y: number }>;
  w: number;
  h: number;
}

const PAD_X = 14;
const PAD_TOP = 22;
const PAD_BOTTOM = 12;
const GAP_X = 10;
const GAP_Y = 6;
/** Sign column, gaps and room for the meta (diff badge, note) of a node. */
const NODE_EXTRA = 96;
const MIN_CELL = 150;
const MAX_CELL = 300;

export function metricsFrom(style: CSSStyleDeclaration): LayoutMetrics {
  const row = parseFloat(style.getPropertyValue('--row')) || 24;
  const fs = parseFloat(style.getPropertyValue('--fs-map')) || 11;
  return { row, ch: fs * 0.655 };
}

/** Grid of one container: sizes of the container and of each node, relative to it. */
export function sizeGroup(
  group: MapGroup,
  m: LayoutMetrics,
): { w: number; h: number; items: LaidItem[] } {
  const labelW = (group.label.length + String(group.count).length + 4) * m.ch + 2 * PAD_X;
  if (group.collapsed || !group.items.length) {
    return { w: Math.round(Math.max(170, labelW + 24)), h: Math.round(m.row + 20), items: [] };
  }
  const n = group.items.length;
  const cols = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(n / 4))));
  const rows = Math.ceil(n / cols);
  const longest = Math.max(...group.items.map((item) => item.name.length));
  const cell = Math.round(Math.min(MAX_CELL, Math.max(MIN_CELL, longest * m.ch + NODE_EXTRA)));
  const items = group.items.map((item, i) => ({
    item,
    parent: group.id,
    x: PAD_X + (i % cols) * (cell + GAP_X),
    y: PAD_TOP + Math.floor(i / cols) * (m.row + GAP_Y),
    w: cell,
    h: m.row,
  }));
  const w = Math.max(labelW, 2 * PAD_X + cols * cell + (cols - 1) * GAP_X);
  const h = PAD_TOP + rows * m.row + (rows - 1) * GAP_Y + PAD_BOTTOM;
  return { w: Math.round(w), h: Math.round(h), items };
}

export function packRequest(
  id: number,
  visible: VisibleMap,
  m: LayoutMetrics,
  aspect: number,
): PackRequest {
  return {
    id,
    aspect,
    boxes: visible.groups.map((group) => {
      const { w, h } = sizeGroup(group, m);
      return { id: group.id, w, h };
    }),
  };
}

/** Puts the packed container positions and the grids together. */
export function assembleLayout(
  visible: VisibleMap,
  m: LayoutMetrics,
  packed: PackResponse,
): MapLayout {
  const groups: LaidGroup[] = [];
  const items: LaidItem[] = [];
  const abs = new Map<string, Box>();
  for (const group of visible.groups) {
    const sized = sizeGroup(group, m);
    const at = packed.positions[group.id] ?? { x: 0, y: 0 };
    const box = { x: at.x, y: at.y, w: sized.w, h: sized.h };
    groups.push({ ...box, group });
    abs.set(group.id, box);
    for (const item of sized.items) {
      items.push(item);
      abs.set(item.item.id, { x: box.x + item.x, y: box.y + item.y, w: item.w, h: item.h });
    }
  }
  return { key: visible.key, groups, items, abs, w: packed.w, h: packed.h, row: m.row };
}
