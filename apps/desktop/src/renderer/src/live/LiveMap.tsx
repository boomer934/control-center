// The map of the Live view (phase 5b, PIANO §4.3-A): the project as folders and files, lit up by
// what the agents do. React Flow draws the nodes; the agent chips, their links and the import
// links of the hovered file are an overlay in the same coordinates, so they can move with every
// event without touching the node list.
import '@xyflow/react/dist/base.css';
import './map.css';
import {
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type OnMoveStart,
} from '@xyflow/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { ProjectSnapshot } from '@control-center/project-model/schema';
import { useShortcuts } from '../keys/useShortcuts';
import { useTheme } from '../theme/ThemeProvider';
import { Glyph, Icon } from '../ui/icons';
import { Kbd, Sigil } from '../ui/primitives';
import type { AgentPresence, MapState } from './activity';
import type { Box, MapLayout } from './layout';
import { MapContext, MiniNode, nodeTypes, type MapContextValue } from './nodes';
import { useAgents, useStoreRevision, useTemps, type MapStore } from './store';
import { useMapActivity, type EventRecord } from './useMapActivity';
import { useMapLayout } from './useMapLayout';
import { buildVisibleMap, indexSnapshot, neighborsOf, type VisibleMap } from './visible';

/** A patch for the diff preview, or why there is none. */
export type DiffPreview =
  { ok: true; text: string; truncated: boolean } | { ok: false; message: string };

export interface LiveMapProps {
  snapshot: ProjectSnapshot;
  records: readonly EventRecord[];
  pendingPermission?: boolean;
  /** Fixed instant instead of "now" (replay, tests). */
  at?: number;
  loadDiff?(path: string): Promise<DiffPreview>;
  openDiff?(path: string): void;
  /** Extra tools on the right of the toolbar (the app info strip). */
  aside?: ReactNode;
}

const GUTTER = 48;
const CHIP_W = 184;
const TEMP_W = 240;
const FIT_PADDING = 0.06;
const FOLLOW_ZOOM = 0.9;
const DIFF_DELAY_MS = 350;
const DIFF_LINES = 30;
/** Gap between node rows (layout.ts) and where links land on a file node. */
const ROW_GAP = 6;
const LINK_INSET = 16;

const LEGEND: MapState[] = ['idle', 'reading', 'writing', 'running', 'waiting', 'error', 'done'];
const EDGE: Partial<Record<MapState, string>> = {
  reading: 'e e-read',
  writing: 'e e-write',
  error: 'e e-err',
  waiting: 'e e-attach w',
};

// Props of <ReactFlow> keep their identity across renders: React Flow hands them to every node
// wrapper, so a new array or handler on each event would re-render all the nodes (ADR 0013).
const NO_EDGES: Edge[] = [];
const PRO_OPTIONS = { hideAttribution: true };

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Orthogonal path with rounded corners through the points (as in the design screens). */
function roundedPath(points: [number, number][], r = 8): string {
  let d = `M${points[0]![0]} ${points[0]![1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[i + 1]!;
    const a = Math.min(r, Math.hypot(x1 - x0, y1 - y0) / 2, Math.hypot(x2 - x1, y2 - y1) / 2);
    const ux = Math.sign(x1 - x0);
    const uy = Math.sign(y1 - y0);
    const vx = Math.sign(x2 - x1);
    const vy = Math.sign(y2 - y1);
    d += ` L${x1 - ux * a} ${y1 - uy * a} Q${x1} ${y1} ${x1 + vx * a} ${y1 + vy * a}`;
  }
  const last = points[points.length - 1]!;
  return `${d} L${last[0]} ${last[1]}`;
}

/** Where a link reaches its node: the left side of a command, the top edge of a file. */
function linkEnd(x: number, target: Box): [number, number] {
  return target.x > x
    ? [target.x, target.y + target.h / 2]
    : [target.x + target.w - LINK_INSET, target.y];
}

/**
 * Corners of the link from a chip to the node its agent works on. Toward a file it runs in the
 * gap above the node's row and drops onto its top edge, so it never crosses the other nodes of
 * the grid.
 */
function linkPoints(x: number, y: number, row: number, target: Box): [number, number][] {
  const cy = y + row / 2;
  const [tx, ty] = linkEnd(x, target);
  if (target.x > x) {
    const sx = x + CHIP_W;
    const mid = sx + GUTTER / 2;
    return [
      [sx, cy],
      [mid, cy],
      [mid, ty],
      [tx, ty],
    ];
  }
  const mid = x - GUTTER / 2;
  const lane = target.y - ROW_GAP / 2;
  return [
    [x, cy],
    [mid, cy],
    [mid, lane],
    [tx, lane],
    [tx, ty],
  ];
}

const linkPath = (x: number, y: number, row: number, target: Box) =>
  roundedPath(linkPoints(x, y, row, target));

/**
 * The dot of a trip along a link, moved by a transform on the compositor (Web Animations).
 * On a map of 500 nodes, motion that needs the main thread on every frame (an offset-path, or
 * repainting the links) repaints and re-layers the whole map each frame, and a slow CPU then
 * misses frames while the events stream (PROBLEMI_NOTI, 2026-11-26).
 */
function Trip({
  trip,
  reverse,
  state,
  points,
}: {
  /** The target of the trip: a new one starts a trip, later moves of the link do not. */
  trip?: string;
  /** From the node to the chip (reads) instead of toward the node (writes). */
  reverse?: boolean;
  state: MapState;
  points: [number, number][];
}) {
  // One dot per agent, kept between trips: a new element would be a new compositor layer, and
  // every new layer re-layers the whole map once.
  const dot = useRef<HTMLElement>(null);
  const running = useRef<Animation>(undefined);
  const route = useRef(points);
  route.current = reverse ? [...points].reverse() : points;
  // The colour of the last trip: it ends even if the agent already moved on.
  const tone = useRef(state);
  if (state === 'reading' || state === 'writing') tone.current = state;
  useEffect(() => () => running.current?.cancel(), []);
  useEffect(() => {
    const el = dot.current;
    const stops = route.current;
    if (!el || !trip || stops.length < 2 || reducedMotion()) return;
    running.current?.cancel();
    const lengths = stops
      .slice(1)
      .map(([x, y], i) => Math.hypot(x - stops[i]![0], y - stops[i]![1]));
    const total = lengths.reduce((a, b) => a + b, 0) || 1;
    let run = 0;
    const frames: Keyframe[] = stops.map(([x, y], i) => {
      run += i ? lengths[i - 1]! : 0;
      return { transform: `translate(${x}px, ${y}px)`, offset: run / total };
    });
    frames[0]!.opacity = 1;
    frames.at(-1)!.opacity = 0;
    const style = getComputedStyle(el);
    running.current = el.animate(frames, {
      duration: parseFloat(style.getPropertyValue('--dur-3')) || 300,
      easing: style.getPropertyValue('--ease-io').trim() || 'ease-in-out',
    });
  }, [trip]);
  return <i ref={dot} className={`lmap-trip ${tone.current}`} aria-hidden="true" />;
}

interface Chip {
  agent: AgentPresence;
  x: number;
  y: number;
  target?: Box;
}

/** Chips sit in a column right of the map, level with the node their agent works on. */
function placeChips(
  agents: readonly AgentPresence[],
  boxes: ReadonlyMap<string, Box>,
  x: number,
  row: number,
): Chip[] {
  const shown = agents
    .filter((a) => a.alive)
    .map((agent) => ({ agent, target: agent.target ? boxes.get(agent.target) : undefined }))
    .sort(
      (a, b) => (a.target?.y ?? -1) - (b.target?.y ?? -1) || a.agent.id.localeCompare(b.agent.id),
    );
  let floor = -Infinity;
  return shown.map(({ agent, target }) => {
    const y = Math.max(target?.y ?? 0, floor);
    floor = y + row + 6;
    return { agent, x, y, ...(target ? { target } : {}) };
  });
}

function MapInner(props: LiveMapProps) {
  const { snapshot, records, pendingPermission, at, loadDiff, openDiff, aside } = props;
  const rf = useReactFlow();
  const { density } = useTheme();
  const wrapper = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [folders, setFolders] = useState<ReadonlyMap<string, number>>(new Map());

  const index = useMemo(() => indexSnapshot(snapshot), [snapshot]);
  const { store, touched } = useMapActivity(records, { at, pendingPermission, folders });
  const visible: VisibleMap = useMemo(
    () => buildVisibleMap(index, touched, { expanded, showAll }),
    [index, touched, expanded, showAll],
  );

  useEffect(() => {
    const next = new Map<string, number>();
    for (const group of visible.groups) {
      if (group.collapsed) next.set(group.path, group.count);
      for (const item of group.items) if (item.kind === 'folder') next.set(item.path, item.count);
    }
    setFolders(next);
  }, [visible]);

  const aspect = wrapper.current
    ? wrapper.current.clientWidth / Math.max(1, wrapper.current.clientHeight)
    : 1.6;
  const { layout, failed } = useMapLayout(visible, density, aspect);
  const temps = useTemps(store);
  const agents = useAgents(store);

  const chipX = (layout?.w ?? 0) + GUTTER;
  const laneX = chipX + CHIP_W + GUTTER;
  const row = layout?.row ?? 24;
  const tempBoxes = useMemo(
    () =>
      new Map(temps.map((t, i) => [t.id, { x: laneX, y: 16 + i * (row + 8), w: TEMP_W, h: row }])),
    [temps, laneX, row],
  );
  const boxes = useMemo(() => {
    const all = new Map<string, Box>(layout?.abs);
    for (const [id, box] of tempBoxes) all.set(id, box);
    return all;
  }, [layout, tempBoxes]);

  const nodes = useMemo<Node[]>(() => {
    if (!layout) return [];
    const out: Node[] = [];
    const size = (width: number, height: number) => ({
      width,
      height,
      measured: { width, height },
    });
    for (const g of layout.groups)
      out.push({
        id: g.group.id,
        type: 'ctr',
        position: { x: g.x, y: g.y },
        ...size(g.w, g.h),
        data: { group: g.group },
        draggable: false,
        selectable: false,
      });
    for (const it of layout.items)
      out.push({
        id: it.item.id,
        type: it.item.kind,
        parentId: it.parent,
        position: { x: it.x, y: it.y },
        ...size(it.w, it.h),
        data: it.item,
        draggable: false,
        selectable: false,
      });
    for (const [id, box] of tempBoxes)
      out.push({
        id,
        type: 'temp',
        position: { x: box.x, y: box.y },
        ...size(box.w, box.h),
        data: { id },
        draggable: false,
        selectable: false,
      });
    return out;
  }, [layout, tempBoxes]);

  const chips = useMemo(() => placeChips(agents, boxes, chipX, row), [agents, boxes, chipX, row]);

  // ── Camera: fit, follow ────────────────────────────────────────────────────
  const userMoved = useRef(false);
  const [follow, setFollow] = useState<{ on: boolean; agent?: string; stopped: boolean }>({
    on: false,
    stopped: false,
  });
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);

  const bounds = useCallback((): Box | undefined => {
    if (!layout) return undefined;
    const right = tempBoxes.size ? laneX + TEMP_W : chips.length ? chipX + CHIP_W : layout.w;
    const bottom = Math.max(
      layout.h,
      ...[...tempBoxes.values()].map((b) => b.y + b.h),
      ...chips.map((c) => c.y + row),
    );
    return { x: 0, y: 0, w: right, h: bottom };
  }, [layout, tempBoxes, laneX, chips, chipX, row]);

  const fit = useCallback(
    (animate = true) => {
      const b = bounds();
      if (!b || !width || !height) return;
      const zoom = Math.min(
        1,
        width / (b.w * (1 + 2 * FIT_PADDING)),
        height / (b.h * (1 + 2 * FIT_PADDING)),
      );
      const x = (width - b.w * zoom) / 2 - b.x * zoom;
      const y = (height - b.h * zoom) / 2 - b.y * zoom;
      void rf.setViewport({ x, y, zoom }, { duration: animate && !reducedMotion() ? 200 : 0 });
    },
    [bounds, width, height, rf],
  );

  // The map opens fitted, and stays fitted while nobody moved it (DESIGN.md, 1b).
  const fittedKey = useRef('');
  useEffect(() => {
    if (!layout || !width || follow.on) return;
    const key = `${layout.key}|${tempBoxes.size > 0}|${chips.length > 0}`;
    if (key === fittedKey.current || (fittedKey.current && userMoved.current)) return;
    fit(Boolean(fittedKey.current));
    fittedKey.current = key;
  }, [layout, width, follow.on, tempBoxes.size, chips.length, fit]);

  const followed = follow.on
    ? (chips.find((c) => c.agent.id === follow.agent) ??
      [...chips].sort((a, b) => b.agent.lastActive - a.agent.lastActive)[0])
    : undefined;
  const focus =
    followed?.target ??
    (followed ? { x: followed.x, y: followed.y, w: CHIP_W, h: row } : undefined);
  useEffect(() => {
    if (!focus) return;
    const zoom = Math.max(rf.getZoom(), FOLLOW_ZOOM);
    void rf.setCenter(focus.x + focus.w / 2, focus.y + focus.h / 2, {
      zoom,
      duration: reducedMotion() ? 0 : 300,
    });
    // Only a new place to look at moves the camera.
  }, [focus?.x, focus?.y, rf]);

  const toggleFollow = (agent?: string) =>
    setFollow((f) =>
      f.on && !agent
        ? { on: false, stopped: false }
        : { on: true, agent: agent ?? f.agent, stopped: false },
    );

  useShortcuts({
    'live.follow': () => toggleFollow(),
    'live.fit': () => {
      setFollow({ on: false, stopped: false });
      userMoved.current = false;
      fit();
    },
    'live.unfollow': () =>
      setFollow((f) => (f.on || f.stopped ? { on: false, stopped: false } : f)),
  });

  // ── Hover: import links and the diff preview ──────────────────────────────
  const [hovered, setHovered] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ path: string; at: DOMRect; diff?: DiffPreview } | null>(
    null,
  );
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hoverRef = useRef<string | null>(null);

  const context = useMemo<MapContextValue>(
    () => ({
      store,
      expand: (path) =>
        setExpanded((previous) => {
          const next = new Set(previous);
          next.add(path);
          return next;
        }),
      hover: (path, element) => {
        clearTimeout(hoverTimer.current);
        hoverRef.current = path;
        setHovered(path);
        if (!path || !element) return setPreview(null);
        const diff = store.file(path)?.diff;
        if (!diff || !loadDiff) return setPreview(null);
        hoverTimer.current = setTimeout(() => {
          const rect = element.getBoundingClientRect();
          setPreview({ path, at: rect });
          void loadDiff(path).then(
            (result) => hoverRef.current === path && setPreview({ path, at: rect, diff: result }),
            () =>
              hoverRef.current === path &&
              setPreview({ path, at: rect, diff: { ok: false, message: 'Diff unavailable.' } }),
          );
        }, DIFF_DELAY_MS);
      },
      ...(openDiff ? { openDiff } : {}),
    }),
    [store, loadDiff, openDiff],
  );
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  const hoverNode = useRef(context.hover);
  hoverNode.current = context.hover;
  const onNodeMouseEnter = useCallback<NodeMouseHandler>(
    (event, n) =>
      hoverNode.current(
        n.type === 'file' ? (n.data as { path: string }).path : null,
        event.currentTarget as HTMLElement,
      ),
    [],
  );
  const onNodeMouseLeave = useCallback<NodeMouseHandler>(() => hoverNode.current(null), []);
  const onMoveStart = useCallback<OnMoveStart>((event) => {
    if (!event) return;
    userMoved.current = true;
    setPreview(null);
    setFollow((f) => (f.on ? { on: false, agent: f.agent, stopped: true } : f));
  }, []);

  const importLinks = useMemo(() => {
    if (!hovered || !layout) return [];
    const from = layout.abs.get(`f:${hovered}`);
    if (!from) return [];
    return neighborsOf(index, hovered)
      .map((path) => layout.abs.get(`f:${path}`))
      .filter((box): box is Box => Boolean(box))
      .map((to) => {
        const x1 = from.x + from.w / 2;
        const y1 = from.y + from.h / 2;
        const x2 = to.x + to.w / 2;
        const y2 = to.y + to.h / 2;
        const bend = Math.max(24, Math.abs(y2 - y1) / 2);
        return `M${x1} ${y1} C${x1 + bend} ${y1} ${x2 + bend} ${y2} ${x2} ${y2}`;
      });
  }, [hovered, layout, index]);

  // ── Semantic zoom: far away only folders and heat, near the names ─────────
  const zoomLevel = useStore((s) =>
    s.transform[2] < 0.45 ? 'far' : s.transform[2] < 0.8 ? 'mid' : 'near',
  );
  const zoomPercent = useStore((s) => Math.round(s.transform[2] * 100));
  const zoomStyle = { '--map-zoom': String(Math.max(0.05, zoomPercent / 100)) } as CSSProperties;

  const revision = useStoreRevision(store);
  const readout = useMemo(() => {
    void revision;
    let written = 0;
    let read = 0;
    let add = 0;
    let del = 0;
    for (const a of store.allFiles().values()) {
      if (a.writes) written++;
      else if (a.reads) read++;
      add += a.diff?.add ?? 0;
      del += a.diff?.del ?? 0;
    }
    return { written, read, add, del };
  }, [store, revision]);

  const alert =
    chips.find((c) => c.agent.state === 'waiting') ?? chips.find((c) => c.agent.state === 'error');
  const otherAgents = chips.filter((c) => c.agent.alive);
  const followName = (followed ?? otherAgents.at(0))?.agent.name ?? 'Claude';

  return (
    <MapContext.Provider value={context}>
      <div className="tb lmap-tb" role="toolbar" aria-label="Map">
        <span className="tool">
          <b>Live</b>
        </span>
        <button
          type="button"
          className="tool"
          aria-pressed={follow.on}
          disabled={!otherAgents.length}
          onClick={() => toggleFollow()}
          data-testid="map-follow"
        >
          <Icon name="follow" />
          Follow <b>{followName}</b>
          <Kbd>F</Kbd>
        </button>
        {otherAgents.length > 1 &&
          otherAgents.map((c) => (
            <button
              key={c.agent.id}
              type="button"
              className="tool"
              aria-pressed={follow.on && followed?.agent.id === c.agent.id}
              onClick={() => toggleFollow(c.agent.id)}
              title={`Follow ${c.agent.name}`}
            >
              <Sigil code={c.agent.code} agent={c.agent.kind} />
            </button>
          ))}
        <button
          type="button"
          className="tool"
          aria-pressed={showAll}
          onClick={() => setShowAll((v) => !v)}
          data-testid="map-show-all"
        >
          <Icon name="folder" />
          Whole project
        </button>
        {expanded.size > 0 && (
          <button type="button" className="tool" onClick={() => setExpanded(new Set())}>
            Collapse folders
          </button>
        )}
        <span className="r">
          {aside}
          <button
            type="button"
            className="tool"
            onClick={() => {
              setFollow({ on: false, stopped: false });
              userMoved.current = false;
              fit();
            }}
            data-testid="map-fit"
          >
            <Icon name="fit" />
            Fit <span className="mono">{zoomPercent}%</span>
            <Kbd>0</Kbd>
          </button>
        </span>
      </div>
      <div
        ref={wrapper}
        className="map lmap"
        data-zoom={zoomLevel}
        style={zoomStyle}
        data-testid="live-map"
        // Ready once the layout on screen is the one of the visible map, not a previous one.
        data-ready={layout?.key === visible.key}
        data-files={visible.files.size}
        tabIndex={-1}
      >
        <ReactFlow
          nodes={nodes}
          edges={NO_EDGES}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          onlyRenderVisibleElements
          minZoom={0.08}
          maxZoom={2}
          proOptions={PRO_OPTIONS}
          // Node events also give the nodes their pointer events (they are not selectable).
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          onMoveStart={onMoveStart}
        >
          <ViewportPortal>
            <svg className="lmap-links" aria-hidden="true">
              {importLinks.map((d, i) => (
                <path key={i} className="e e-imp" d={d} />
              ))}
              {chips.map(({ agent, x, y, target }) => {
                if (!target) return null;
                const d = linkPath(x, y, row, target);
                const [tx, ty] = linkEnd(x, target);
                const end =
                  agent.state === 'writing' ? 'write' : agent.state === 'reading' ? 'read' : null;
                return (
                  <g key={agent.id}>
                    <path className={EDGE[agent.state] ?? 'e e-attach'} d={d} />
                    {end && <circle className={`e-end-${end}`} cx={tx} cy={ty} r={3} />}
                  </g>
                );
              })}
            </svg>
            {chips.map(({ agent, x, y, target }) => {
              // One trip along the link per new target: reads flow to the agent, writes to the file.
              const moving = target && (agent.state === 'reading' || agent.state === 'writing');
              return (
                <Trip
                  key={agent.id}
                  {...(moving ? { trip: agent.target!, reverse: agent.state === 'reading' } : {})}
                  state={agent.state}
                  points={target ? linkPoints(x, y, row, target) : []}
                />
              );
            })}
            {chips.map(({ agent, x, y }) => (
              <div
                key={agent.id}
                className={`achip ag-${agent.kind} s-${agent.state}`}
                style={{ left: x, top: y, width: CHIP_W }}
                data-agent={agent.code}
                data-state={agent.state}
              >
                <Sigil code={agent.code} agent={agent.kind} />
                <span className="nmx ell">{agent.name}</span>
                <span className="st">
                  <Glyph name={`s-${agent.state}`} />
                  {agent.label}
                </span>
              </div>
            ))}
          </ViewportPortal>
          <MiniMap
            className="lmap-mini"
            nodeComponent={MiniNode}
            pannable
            ariaLabel="Map overview"
          />
        </ReactFlow>

        {!layout && !failed && (
          <p className="loading-note lmap-note">
            <span className="prog run" />
            Laying out {snapshot.files.length.toLocaleString('en-US')} files…
          </p>
        )}
        {failed && (
          <p className="lmap-note shell-error" role="alert">
            The map could not be laid out.
          </p>
        )}
        {layout && !records.length && (
          <div className="empty lmap-empty" data-testid="map-empty">
            <Icon name="live" className="g" />
            <h2>No session yet</h2>
            <p>
              Start a task: the reads, edits and commands of the agents light up the files they
              touch, right here.
            </p>
          </div>
        )}
        {follow.stopped && (
          <p className="lmap-pill" role="status">
            Following stopped · <Kbd>F</Kbd> to resume
          </p>
        )}
        {preview && <DiffPopover preview={preview} host={wrapper.current} />}

        <div className="legend" aria-label="Key">
          <span className="lk">Key</span>
          {LEGEND.map((state) => (
            <span key={state} className={`li s-${state}`}>
              <Glyph name={`s-${state}`} />
              {state}
            </span>
          ))}
        </div>
        <div className="readout" data-testid="map-readout">
          <span>
            <b>{readout.written}</b> edited
          </span>
          <span>
            <b>{readout.read}</b> read
          </span>
          <span>
            <b className="add">+{readout.add}</b> <b className="del">−{readout.del}</b>
          </span>
          <span>
            <b>{visible.files.size}</b> on map
          </span>
        </div>
        <p className="sr-only" aria-live="polite">
          {alert
            ? `${alert.agent.name} ${alert.agent.state === 'waiting' ? 'is waiting for you' : 'hit an error'}`
            : ''}
        </p>
      </div>
    </MapContext.Provider>
  );
}

function DiffPopover({
  preview,
  host,
}: {
  preview: { path: string; at: DOMRect; diff?: DiffPreview };
  host: HTMLElement | null;
}) {
  const origin = host?.getBoundingClientRect();
  if (!origin) return null;
  const left = Math.min(preview.at.left - origin.left, origin.width - 420);
  const below = preview.at.bottom - origin.top + 6;
  const lines = preview.diff?.ok
    ? preview.diff.text.split('\n').filter((l) => !/^(diff --git|index |--- |\+\+\+ )/.test(l))
    : [];
  return (
    <div
      className="lmap-diff"
      style={{ left: Math.max(8, left), top: below }}
      role="tooltip"
      data-testid="map-diff"
    >
      <div className="lmap-diff-h mono">{preview.path}</div>
      {!preview.diff && <p className="lmap-diff-m">Loading the diff…</p>}
      {preview.diff && !preview.diff.ok && <p className="lmap-diff-m">{preview.diff.message}</p>}
      {preview.diff?.ok && (
        <pre className="lmap-diff-b">
          {lines.slice(0, DIFF_LINES).map((line, i) => (
            <span
              key={i}
              className={
                line.startsWith('+')
                  ? 'add'
                  : line.startsWith('-')
                    ? 'del'
                    : line.startsWith('@@')
                      ? 'hunk'
                      : undefined
              }
            >
              {line || ' '}
              {'\n'}
            </span>
          ))}
          {(lines.length > DIFF_LINES || preview.diff.truncated) && <span className="hunk">…</span>}
        </pre>
      )}
    </div>
  );
}

export function LiveMap(props: LiveMapProps) {
  return (
    <ReactFlowProvider>
      <MapInner {...props} />
    </ReactFlowProvider>
  );
}

export type { MapLayout, MapStore };
