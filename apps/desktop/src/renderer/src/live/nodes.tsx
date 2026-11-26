// Custom React Flow nodes of the map (phase 5b), drawn with the classes of the design system
// (.node, .ctr, .heat, .trail, .prog). A node reads its own state from the store, so an event
// re-renders only the nodes it touches.
import { createContext, memo, useContext, type KeyboardEvent, type ReactNode } from 'react';
import type { MiniMapNodeProps, Node, NodeProps } from '@xyflow/react';
import { Glyph } from '../ui/icons';
import type { MapState, NodeActivity } from './activity';
import {
  useFileActivity,
  useFolderHeat,
  useTempActivity,
  type FolderHeat,
  type MapStore,
} from './store';
import type { MapGroup, MapItem } from './visible';

export interface MapContextValue {
  store: MapStore;
  /** Opens a folder (a collapsed container, subfolder or "+N files" node). */
  expand(path: string): void;
  /** The pointer entered (element) or left (null) a file node; wired on React Flow's node events. */
  hover(path: string | null, element?: HTMLElement): void;
  openDiff?(path: string): void;
  inspectNode?(id: string): void;
}

export const MapContext = createContext<MapContextValue | null>(null);

function useMap(): MapContextValue {
  const value = useContext(MapContext);
  if (!value) throw new Error('Map nodes need a MapContext');
  return value;
}

const HEAT_BARS = 6;

/** Six bars: written files (h), read files (r), the rest of the folder. */
export function HeatBars({ heat }: { heat?: FolderHeat }) {
  const total = Math.max(1, heat?.total ?? 1);
  const share = (n: number) => (n ? Math.max(1, Math.round((HEAT_BARS * n) / total)) : 0);
  const h = Math.min(HEAT_BARS, share(heat?.written ?? 0));
  const r = Math.min(HEAT_BARS - h, share(heat?.read ?? 0));
  const bars = [
    ...Array<string>(h).fill('h'),
    ...Array<string>(r).fill('r'),
    ...Array<string>(HEAT_BARS - h - r).fill(''),
  ];
  return (
    <span className="heat" aria-hidden="true">
      {bars.map((kind, i) => (
        <i key={i} className={kind || undefined} />
      ))}
    </span>
  );
}

function Meta({ a }: { a?: NodeActivity }) {
  if (!a) return null;
  const parts: ReactNode[] = [];
  if (a.diff)
    parts.push(
      <span key="d" className="diffbadge">
        <span className="add">+{a.diff.add}</span>
        <span className="del">−{a.diff.del}</span>
      </span>,
    );
  if (a.note) parts.push(<span key="n">{a.note}</span>);
  else if (a.reads > 0 && !a.diff && a.state !== 'running')
    parts.push(<span key="r">read ×{a.reads}</span>);
  if (a.fresh)
    parts.push(
      <span key="t" className="trail" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>,
    );
  return parts.length ? <span className="meta">{parts}</span> : null;
}

function stateClass(state: MapState, fresh?: boolean): string {
  return ['node', `s-${state}`, state === 'reading' ? 'pulse' : '', fresh ? 'fresh' : '']
    .filter(Boolean)
    .join(' ');
}

type ItemNode<K extends MapItem['kind']> = Node<Extract<MapItem, { kind: K }>, K>;

export const FileNode = memo(function FileNode({ data }: NodeProps<ItemNode<'file'>>) {
  const { store, openDiff, inspectNode } = useMap();
  const a = useFileActivity(store, data.path);
  const state = a?.state ?? 'idle';
  const diff = Boolean(a?.diff) && openDiff;
  const open = diff
    ? () => openDiff(data.path)
    : a && inspectNode
      ? () => inspectNode(`f:${data.path}`)
      : undefined;
  // The note ("L2 TypeError") says which error: the name on the node may be cut short.
  const note = state === 'error' && a?.note ? a.note : undefined;
  return (
    <div
      className={stateClass(state, a?.fresh) + (diff ? ' has-diff' : '')}
      data-node={data.path}
      data-state={state}
      title={`${data.path} · ${state}${note ? ` · ${note}` : ''}`}
      onClick={open}
      {...(open && {
        role: 'button',
        tabIndex: 0,
        'aria-label': `${data.path}, ${state}${note ? ` ${note}` : ''}, ${diff ? 'open the diff' : 'inspect activity'}`,
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        },
      })}
    >
      {/* Remounted on every new read: one pulse per event, never a loop. */}
      <span className="sign" key={a?.pulse ?? 'sign'}>
        <Glyph name={`s-${state}`} />
      </span>
      <span className="nm">{data.name}</span>
      <Meta a={a} />
      {state === 'running' && <span className="prog" />}
    </div>
  );
});

/** A folder state shows on its node only when it calls for attention. */
const folderState = (heat?: FolderHeat): MapState =>
  heat?.state === 'error' || heat?.state === 'waiting' ? heat.state : 'idle';

export const FolderNode = memo(function FolderNode({ data }: NodeProps<ItemNode<'folder'>>) {
  const { store, expand } = useMap();
  const heat = useFolderHeat(store, data.path);
  return (
    <button
      type="button"
      className={`node folder s-${folderState(heat)}`}
      data-folder={data.path}
      title={`${data.path}/ · ${data.count} files · open`}
      onClick={() => expand(data.path)}
    >
      <span className="sign">
        <Glyph name="i-folder" />
      </span>
      <span className="nm">{data.name}</span>
      <span className="meta">
        <HeatBars heat={heat} />
        {data.count.toLocaleString('en-US')}
      </span>
    </button>
  );
});

export const GhostNode = memo(function GhostNode({ data }: NodeProps<ItemNode<'ghost'>>) {
  const { expand } = useMap();
  return (
    <button
      type="button"
      className="node ghost"
      title={`Show the rest of ${data.path || 'the project root'}`}
      onClick={() => expand(data.path)}
    >
      <span className="sign">
        <Glyph name="i-plus" />
      </span>
      <span className="nm">{data.name}</span>
    </button>
  );
});

export const GroupNode = memo(function GroupNode({
  data,
}: NodeProps<Node<{ group: MapGroup }, 'ctr'>>) {
  const { store, expand } = useMap();
  const { group } = data;
  const heat = useFolderHeat(store, group.collapsed ? group.path : '\0');
  const count = group.count.toLocaleString('en-US');
  if (!group.collapsed)
    return (
      <div className="ctr" data-folder={group.path}>
        <span className="lg">
          {group.label} <i>· {count}</i>
        </span>
      </div>
    );
  return (
    <button
      type="button"
      className={`ctr collapsed s-${folderState(heat)}`}
      data-folder={group.path}
      title={`${group.label}/ · ${count} files · open`}
      onClick={() => expand(group.path)}
    >
      <span className="lg">
        {group.label} <i>· {count}</i>
      </span>
      <HeatBars heat={heat} />
    </button>
  );
});

export const TempNode = memo(function TempNode({ data }: NodeProps<Node<{ id: string }, 'temp'>>) {
  const { store, inspectNode } = useMap();
  const t = useTempActivity(store, data.id);
  if (!t) return null;
  return (
    <div
      className={`${stateClass(t.state, t.fresh)} temp`}
      data-temp={t.kind}
      data-state={t.state}
      title={t.label}
      {...(inspectNode && {
        role: 'button',
        tabIndex: 0,
        'aria-label': `Inspect ${t.label}`,
        onClick: () => inspectNode(data.id),
        onKeyDown: (event: KeyboardEvent) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          inspectNode(data.id);
        },
      })}
    >
      <span className="sign">
        <Glyph name={t.kind === 'mcp' ? 'i-mcp' : `s-${t.state}`} />
      </span>
      <span className="nm">{t.label}</span>
      <Meta a={t} />
      {t.state === 'running' && <span className="prog" />}
    </div>
  );
});

export const nodeTypes = {
  ctr: GroupNode,
  file: FileNode,
  folder: FolderNode,
  ghost: GhostNode,
  temp: TempNode,
};

const MINI_CLASS: Partial<Record<MapState, string>> = {
  reading: 'mm-r',
  writing: 'mm-w',
  done: 'mm-w',
  error: 'mm-e',
  waiting: 'mm-q',
};

/** Minimap node coloured by activity: the heatmap of the zones the agents touched. */
export const MiniNode = memo(function MiniNode({ id, x, y, width, height }: MiniMapNodeProps) {
  const { store } = useMap();
  const isFile = id.startsWith('f:');
  const a = useFileActivity(store, isFile ? id.slice(2) : '\0');
  const heat = useFolderHeat(
    store,
    id.startsWith('d:') || id.startsWith('c:') ? id.slice(2) : '\0',
  );
  const touched = isFile ? a && (a.writes ? 'mm-w' : a.reads ? 'mm-r' : undefined) : undefined;
  const warm = heat && (heat.written ? 'mm-w' : heat.read ? 'mm-r' : undefined);
  const live = MINI_CLASS[(isFile ? a?.state : heat?.state) ?? 'idle'];
  const container = id.startsWith('c:');
  const cls = container && !heat ? 'mm-c' : (live ?? touched ?? warm ?? 'mm-n');
  return <rect className={cls} x={x} y={y} width={width} height={height} rx={2} />;
});
