import {
  Handle,
  Position,
  ReactFlow,
  useNodesInitialized,
  useReactFlow,
  useViewport,
  type BuiltInEdge,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { memo, useEffect, useMemo, useState } from 'react';
import type { MapLayout } from '../layout';
import {
  opTargets,
  type AgentView,
  type LiveView,
  type NodeView,
  type SemState,
} from '../replay/state';
import { Glyph, Sig } from './Glyph';

type CtrData = { label: string; count: number };
type CellData = { name: string; title: string; command: boolean; view: NodeView };
type ChipData = { a: AgentView };

const CtrNode = memo(function CtrNode({ data }: NodeProps<Node<CtrData>>) {
  return (
    <div className="ctr">
      <span className="lg">
        {data.label} <i>· {data.count}</i>
      </span>
    </div>
  );
});

function Meta({ v }: { v: NodeView }) {
  const parts = [];
  if (v.diff)
    parts.push(
      <span key="d" className="diffbadge">
        <span className="add">+{v.diff.add}</span>
        <span className="del">−{v.diff.del}</span>
      </span>,
    );
  if (v.note) parts.push(<span key="n">{v.note}</span>);
  else if (v.reads > 0 && !v.diff && v.state !== 'running')
    parts.push(<span key="r">read ×{v.reads}</span>);
  if (v.fresh)
    parts.push(
      <span key="t" className="trail" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>,
    );
  return parts.length ? <span className="meta">{parts}</span> : null;
}

const CellNode = memo(function CellNode({ data }: NodeProps<Node<CellData>>) {
  const v = data.view;
  const cls = [
    'node',
    `s-${v.state}`,
    data.command ? 'temp' : '',
    v.state === 'reading' ? 'pulse' : '',
    v.fresh ? 'fresh' : '',
  ].join(' ');
  return (
    <div
      className={cls}
      title={`${data.title} · ${v.state}`}
      data-node={data.title}
      data-state={v.state}
    >
      {/* remount on every new reading event: one pulse per event, never a loop */}
      <span className="sign" key={v.pulseKey ?? 'sign'}>
        <Glyph id={`s-${v.state}`} />
      </span>
      <span className="nm">{data.name}</span>
      <Meta v={v} />
      {v.state === 'running' ? <span className="prog" /> : null}
      <Handle type="target" position={Position.Right} isConnectable={false} />
    </div>
  );
});

const ChipNode = memo(function ChipNode({ data }: NodeProps<Node<ChipData>>) {
  const { a } = data;
  return (
    <div className={`achip ag-${a.agent.kind} s-${a.state}`} data-agent={a.agent.code}>
      <Handle type="source" position={Position.Left} isConnectable={false} />
      <Sig code={a.agent.code} kind={a.agent.kind} />
      <span className="nmx ell">{a.agent.name}</span>
      <span className="st">
        <Glyph id={`s-${a.state}`} />
        {a.label}
      </span>
    </div>
  );
});

const nodeTypes = { ctr: CtrNode, cell: CellNode, chip: ChipNode };

const EDGE: Partial<Record<SemState, string>> = {
  reading: 'e e-read',
  writing: 'e e-write',
  error: 'e e-err',
  waiting: 'e e-attach w',
};

const CHIP_W = 170;
/** Sizes come from ELK, so nodes are born measured (controlled nodes get no dimension changes). */
const size = (width: number, height: number) => ({ width, height, measured: { width, height } });

export function LiveMap({
  layout,
  view,
  readout,
  reducedMotion,
}: {
  layout: MapLayout;
  view: LiveView;
  readout: [string, string][];
  reducedMotion: boolean;
}) {
  const rf = useReactFlow();
  const row = layout.nodes[0]?.h ?? 20;

  // static part: containers and cells (state comes from the view)
  const base = useMemo(() => {
    const ns: Node[] = layout.containers.map((c) => ({
      id: c.id,
      type: 'ctr',
      position: { x: c.x, y: c.y },
      ...size(c.w, c.h),
      data: { label: c.label, count: c.count },
      selectable: false,
      draggable: false,
    }));
    return ns;
  }, [layout]);

  const { nodes, edges } = useMemo(() => {
    const cells: Node[] = layout.nodes.map((n) => {
      const v =
        (n.kind === 'command' ? view.commands.get(n.id) : view.files.get(n.id)) ??
        ({ id: n.id, state: 'idle', reads: 0, fresh: false } satisfies NodeView);
      return {
        id: n.id,
        type: 'cell',
        parentId: n.parent,
        extent: 'parent' as const,
        position: { x: n.x, y: n.y },
        ...size(n.w, n.h),
        data: {
          name: n.name,
          title: n.kind === 'command' ? n.name : n.id,
          command: n.kind === 'command',
          view: v,
        },
        draggable: false,
      };
    });

    // agent chips: one column to the right of the map, aligned with the node they work on
    const chips: Node[] = [];
    const es: Edge[] = [];
    const taken: number[] = [];
    const chipX = layout.w + 48;
    for (const a of view.agents) {
      if (!a.alive || !a.op || a.op.kind === 'agent') continue;
      const { files, command } = opTargets(a.op);
      const target = command ?? files.find((f) => layout.abs.has(f));
      const box = target ? layout.abs.get(target) : undefined;
      if (!target || !box) continue;
      let y = box.y;
      while (taken.some((t) => Math.abs(t - y) < row)) y += row + 6;
      taken.push(y);
      const id = `chip:${a.agent.id}`;
      chips.push({
        id,
        type: 'chip',
        position: { x: chipX, y },
        ...size(Math.max(CHIP_W, a.agent.name.length * 7.2 + 150), row),
        data: { a },
        draggable: false,
        selectable: false,
      });
      const edge: BuiltInEdge = {
        id: `edge:${a.agent.id}`,
        source: id,
        target,
        type: 'smoothstep',
        pathOptions: { borderRadius: 8 },
        className: EDGE[a.state] ?? 'e e-attach',
        selectable: false,
        focusable: false,
      };
      es.push(edge);
    }
    return { nodes: [...base, ...cells, ...chips], edges: es };
  }, [base, layout, view]);

  // Fit on open and whenever the session changes (rule from 1b: the map opens fitted).
  // Only once React Flow has measured the nodes, otherwise the bounds are NaN.
  const measured = useNodesInitialized();
  const [fitted, setFitted] = useState(false);
  useEffect(() => {
    if (!measured) return;
    const ms = reducedMotion ? 0 : 200;
    void rf.fitView({ padding: 0.06, maxZoom: 1, duration: ms });
    // the fitView promise does not settle reliably here: flag the end of the fit by time
    const id = setTimeout(() => setFitted(true), ms + 50);
    return () => clearTimeout(id);
  }, [measured, layout, rf, reducedMotion]);

  return (
    <div className="map" id="map" data-fitted={fitted}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        minZoom={0.3}
        maxZoom={2}
        attributionPosition="bottom-right"
        fitView
        fitViewOptions={{ padding: 0.06, maxZoom: 1 }}
      />
      <div className="legend" id="legend">
        <span className="lk">Key</span>
        {(['idle', 'reading', 'writing', 'running', 'waiting', 'error', 'done'] as const).map(
          (s) => (
            <span key={s} className={`li s-${s}`}>
              <Glyph id={`s-${s}`} />
              {s}
            </span>
          ),
        )}
      </div>
      <div className="readout" id="readout">
        {readout.map(([v, l]) => (
          <span key={l}>
            <b>{v}</b> {l}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Current zoom, for the Fit control in the toolbar. */
export function useZoomPercent() {
  return Math.round(useViewport().zoom * 100);
}
