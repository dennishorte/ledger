import { useMemo } from "react";
import dagre, {
  type graphlib,
  type GraphLabel,
  type NodeLabel,
  type EdgeLabel,
} from "@dagrejs/dagre";

type DocGraph = graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>;
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { DocNode, NodeId } from "@/lib/types";

export interface DocNodeData extends Record<string, unknown> {
  node: DocNode;
}

export interface DocSubtreeData extends Record<string, unknown> {
  label: string;
  title: string;
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 64;
const GROUP_PAD_X = 24;
const GROUP_PAD_TOP = 36;
const GROUP_PAD_BOTTOM = 20;

export interface LayoutResult {
  nodes: Node[];
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

  const depEdges: Edge[] = [];
  const docIds = new Set(docs.map((d) => d.id));

  // Feed both parent and dep relations to dagre so rank ordering reflects the
  // full structure, but only emit dep edges as visible lines (D11: hierarchy
  // is conveyed by spatial grouping, not edges).
  for (const d of docs) {
    if (d.parentId && docIds.has(d.parentId)) {
      g.setEdge(d.parentId, d.id);
    }
    for (const dep of d.dependsOn) {
      if (!docIds.has(dep) || dep === d.id) continue;
      g.setEdge(dep, d.id);
      depEdges.push({
        id: `dep-${dep}->${d.id}`,
        source: dep,
        target: d.id,
        type: "default",
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
      });
    }
  }

  dagre.layout(g);

  const docNodes: Node<DocNodeData>[] = docs.map((d) => {
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

  const subtreeNodes = buildSubtreeNodes(docs, g);

  // Subtree group rects render first so they sit behind the doc tiles.
  return { nodes: [...subtreeNodes, ...docNodes], edges: depEdges };
}

function buildSubtreeNodes(
  docs: DocNode[],
  g: DocGraph,
): Node<DocSubtreeData>[] {
  const docIds = new Set(docs.map((d) => d.id));
  const docById = new Map(docs.map((d) => [d.id, d] as const));
  const kidsByParent = new Map<NodeId, DocNode[]>();
  for (const d of docs) {
    if (d.parentId == null) continue;
    if (!docIds.has(d.parentId)) continue;
    const arr = kidsByParent.get(d.parentId) ?? [];
    arr.push(d);
    kidsByParent.set(d.parentId, arr);
  }

  const subtreeNodes: Node<DocSubtreeData>[] = [];
  for (const [parentId, kids] of kidsByParent) {
    if (kids.length < 2) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const k of kids) {
      const pos = g.node(k.id);
      const cx = pos.x ?? 0;
      const cy = pos.y ?? 0;
      minX = Math.min(minX, cx - NODE_WIDTH / 2);
      maxX = Math.max(maxX, cx + NODE_WIDTH / 2);
      minY = Math.min(minY, cy - NODE_HEIGHT / 2);
      maxY = Math.max(maxY, cy + NODE_HEIGHT / 2);
    }
    if (!Number.isFinite(minX)) continue;

    const parent = docById.get(parentId);
    const width = maxX - minX + 2 * GROUP_PAD_X;
    const height = maxY - minY + GROUP_PAD_TOP + GROUP_PAD_BOTTOM;

    subtreeNodes.push({
      id: `subtree-${parentId}`,
      type: "subtree",
      position: { x: minX - GROUP_PAD_X, y: minY - GROUP_PAD_TOP },
      data: {
        label: parent?.id ?? parentId,
        title: parent?.title ?? "",
      },
      draggable: false,
      selectable: false,
      focusable: false,
      style: { width, height, zIndex: -1 },
    });
  }
  return subtreeNodes;
}
