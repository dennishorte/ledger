import { useMemo } from "react";
import dagre, {
  type GraphLabel,
  type NodeLabel,
  type EdgeLabel,
} from "@dagrejs/dagre";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { DocNode } from "@/lib/types";

export interface DocNodeData extends Record<string, unknown> {
  node: DocNode;
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 64;

export interface LayoutResult {
  nodes: Node<DocNodeData>[];
  edges: Edge[];
}

/**
 * One-shot dagre layout. Recomputes only when the input doc set changes
 * (which, in Phase 1, is once per page load).
 */
export function useDagLayout(docs: DocNode[]): LayoutResult {
  return useMemo(() => layout(docs), [docs]);
}

// dagre's graphlib Graph defaults all three generic params to `any`; supply
// them explicitly using dagre's own label types. `NodeLabel` already has
// optional `x` and `y` so post-layout coordinates are typed without casts.
function layout(docs: DocNode[]): LayoutResult {
  const g = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>();
  g.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 40, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const d of docs) {
    g.setNode(d.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  const parentEdges: Edge[] = [];
  const depEdges: Edge[] = [];
  const docIds = new Set(docs.map((d) => d.id));

  for (const d of docs) {
    if (d.parentId && docIds.has(d.parentId)) {
      const id = `parent-${d.parentId}->${d.id}`;
      g.setEdge(d.parentId, d.id);
      parentEdges.push({
        id,
        source: d.parentId,
        target: d.id,
        type: "smoothstep",
        style: { stroke: "var(--color-border-strong)", strokeWidth: 1.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "var(--color-border-strong)",
          width: 14,
          height: 14,
        },
      });
    }
    for (const dep of d.dependsOn) {
      if (!docIds.has(dep) || dep === d.id) continue;
      const id = `dep-${dep}->${d.id}`;
      // dagre also gets dependency edges so the rank assignment respects them.
      g.setEdge(dep, d.id);
      depEdges.push({
        id,
        source: dep,
        target: d.id,
        type: "smoothstep",
        animated: false,
        style: {
          stroke: "var(--color-accent)",
          strokeDasharray: "4 4",
          strokeWidth: 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "var(--color-accent)",
          width: 14,
          height: 14,
        },
        label: "depends on",
        labelStyle: {
          fill: "var(--color-muted)",
          fontSize: 10,
        },
        labelBgStyle: {
          fill: "var(--color-surface)",
        },
        labelBgPadding: [4, 2] as [number, number],
      });
    }
  }

  dagre.layout(g);

  const nodes: Node<DocNodeData>[] = docs.map((d) => {
    const pos = g.node(d.id);
    return {
      id: d.id,
      type: "doc",
      position: {
        // dagre returns centers; React Flow uses top-left.
        x: (pos.x ?? 0) - NODE_WIDTH / 2,
        y: (pos.y ?? 0) - NODE_HEIGHT / 2,
      },
      data: { node: d },
    };
  });

  return { nodes, edges: [...parentEdges, ...depEdges] };
}
