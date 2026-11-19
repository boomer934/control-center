// Packs the map containers with ELK (rectpacking, in model order). Runs in the layout worker;
// tests call it directly.
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { PackRequest, PackResponse } from './layout';

const elk = new ELK();
const SPACING = 32;

export async function packBoxes(request: PackRequest): Promise<PackResponse> {
  // A target width from the total area and the viewport shape: without it rectpacking stacks the
  // containers in a tall column.
  const aspect = Math.min(4, Math.max(0.5, request.aspect));
  const area = request.boxes.reduce((sum, b) => sum + (b.w + SPACING) * (b.h + SPACING), 0);
  const widest = Math.max(0, ...request.boxes.map((b) => b.w));
  const target = Math.max(widest, Math.sqrt(area * aspect));
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'rectpacking',
      'elk.aspectRatio': String(aspect),
      'elk.rectpacking.widthApproximation.strategy': 'TARGET_WIDTH',
      'elk.rectpacking.widthApproximation.targetWidth': String(Math.round(target)),
      'elk.spacing.nodeNode': String(SPACING),
      'elk.padding': '[top=16,left=8,bottom=8,right=8]',
    },
    children: request.boxes.map((box) => ({ id: box.id, width: box.w, height: box.h })),
  };
  const out = await elk.layout(graph);
  const positions: PackResponse['positions'] = {};
  for (const child of out.children ?? [])
    positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
  return { id: request.id, positions, w: out.width ?? 0, h: out.height ?? 0 };
}
