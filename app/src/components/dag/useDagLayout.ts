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
  /** Full DocNode for the parent so the header can render chip + id + title. */
  parentNode: DocNode;
  /** Called when the user clicks the header strip. */
  onHeaderClick: () => void;
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 64;
const GROUP_PAD_X = 24;
const GROUP_PAD_TOP = 52; // taller top padding to accommodate the header strip
const GROUP_PAD_BOTTOM = 20;

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Compute the transitive reduction of a set of dep edges.
 *
 * For each edge u → v, drop it if there exists any longer path u → … → v
 * (length ≥ 2) within the same edge set. Parent edges are excluded from
 * this computation — callers must pass only dep-typed edges.
 *
 * The input array is not mutated; a new filtered array is returned.
 */
function transitiveReduction(edges: Edge[]): Edge[] {
  // Build adjacency list: source → set of targets.
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    const targets = adj.get(e.source) ?? new Set<string>();
    targets.add(e.target);
    adj.set(e.source, targets);
  }

  // BFS/DFS: can we reach `target` from `start` in ≥2 hops?
  function reachableViaLongerPath(start: string, target: string): boolean {
    // Explore all nodes reachable from `start` in ≥1 hop,
    // then check if `target` is among those reachable in ≥2 hops.
    const visited = new Set<string>();
    const queue: Array<{ node: string; hops: number }> = [{ node: start, hops: 0 }];
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const { node, hops } = item;
      const neighbors = adj.get(node) ?? new Set<string>();
      for (const neighbor of neighbors) {
        if (hops >= 1 && neighbor === target) return true;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ node: neighbor, hops: hops + 1 });
        }
      }
    }
    return false;
  }

  return edges.filter((e) => !reachableViaLongerPath(e.source, e.target));
}

/**
 * One-shot dagre layout. Recomputes only when the input doc set changes
 * (which, in Phase 1, is once per page load).
 *
 * The `onSubtreeHeaderClick` callback is called with the parent's DocNode
 * when the user clicks the header strip of a subtree rect.
 */
export function useDagLayout(
  docs: DocNode[],
  onSubtreeHeaderClick: (node: DocNode) => void,
): LayoutResult {
  return useMemo(() => layout(docs, onSubtreeHeaderClick), [docs, onSubtreeHeaderClick]);
}

// dagre's graphlib Graph defaults all three generic params to `any`; supply
// them explicitly using dagre's own label types. `NodeLabel` already has
// optional `x` and `y` so post-layout coordinates are typed without casts.
function layout(docs: DocNode[], onSubtreeHeaderClick: (node: DocNode) => void): LayoutResult {
  const g = new dagre.graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>();
  g.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 40, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const d of docs) {
    g.setNode(d.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  const depEdges: Edge[] = [];
  const docIds = new Set(docs.map((d) => d.id));

  // Determine which nodes are subtree parents (≥2 children in doc set).
  // These are NOT emitted as `doc` nodes — the subtree rect IS the parent.
  const subtreeParentIds = buildSubtreeParentIds(docs, docIds);

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

  // Reduce the dep edges for rendering (dagre already used the full set above
  // for rank assignment — layout is unaffected by the reduction).
  const reducedDepEdges = transitiveReduction(depEdges);

  // Emit doc tiles only for nodes that are NOT subtree parents.
  const docNodes: Node<DocNodeData>[] = docs
    .filter((d) => !subtreeParentIds.has(d.id))
    .map((d) => {
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

  const subtreeNodes = buildSubtreeNodes(docs, g, docIds, subtreeParentIds, onSubtreeHeaderClick);

  // Subtree group rects render first so they sit behind the doc tiles.
  return { nodes: [...subtreeNodes, ...docNodes], edges: reducedDepEdges };
}

/** Returns the set of node IDs that qualify as subtree parents (≥2 children). */
function buildSubtreeParentIds(docs: DocNode[], docIds: Set<NodeId>): Set<NodeId> {
  const childCount = new Map<NodeId, number>();
  for (const d of docs) {
    if (d.parentId == null) continue;
    if (!docIds.has(d.parentId)) continue;
    childCount.set(d.parentId, (childCount.get(d.parentId) ?? 0) + 1);
  }
  const result = new Set<NodeId>();
  for (const [id, count] of childCount) {
    if (count >= 2) result.add(id);
  }
  return result;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Build subtree rect nodes with bottom-up bounds computation so that outer
 * subtrees fully enclose inner subtrees (D13).
 *
 * Algorithm:
 * 1. For each subtree parent, collect its direct children.
 * 2. Process subtrees deepest-first (bottom-up by depth).
 * 3. A child that is itself a subtree parent contributes its computed outer
 *    subtree bounds (padded rect) rather than its dagre tile position.
 */
function buildSubtreeNodes(
  docs: DocNode[],
  g: DocGraph,
  docIds: Set<NodeId>,
  subtreeParentIds: Set<NodeId>,
  onSubtreeHeaderClick: (node: DocNode) => void,
): Node<DocSubtreeData>[] {
  const docById = new Map(docs.map((d) => [d.id, d] as const));
  const kidsByParent = new Map<NodeId, NodeId[]>();
  for (const d of docs) {
    if (d.parentId == null) continue;
    if (!docIds.has(d.parentId)) continue;
    if (!subtreeParentIds.has(d.parentId)) continue;
    const arr = kidsByParent.get(d.parentId) ?? [];
    arr.push(d.id);
    kidsByParent.set(d.parentId, arr);
  }

  // Compute depth of each subtree parent for bottom-up processing order.
  function depth(id: NodeId): number {
    const doc = docById.get(id);
    if (!doc?.parentId) return 0;
    return 1 + depth(doc.parentId);
  }

  const orderedParents = Array.from(subtreeParentIds).sort(
    (a, b) => depth(b) - depth(a), // deepest first → bottom-up
  );

  // Store computed outer bounds (the padded rect) keyed by parent id.
  const subtreeBounds = new Map<NodeId, Bounds>();

  const subtreeNodes: Node<DocSubtreeData>[] = [];

  for (const parentId of orderedParents) {
    const kids = kidsByParent.get(parentId) ?? [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const kidId of kids) {
      if (subtreeParentIds.has(kidId)) {
        // This child is itself a subtree — union over its already-computed bounds.
        const inner = subtreeBounds.get(kidId);
        if (inner) {
          minX = Math.min(minX, inner.minX);
          maxX = Math.max(maxX, inner.maxX);
          minY = Math.min(minY, inner.minY);
          maxY = Math.max(maxY, inner.maxY);
        }
      } else {
        const pos = g.node(kidId);
        const cx = pos.x ?? 0;
        const cy = pos.y ?? 0;
        minX = Math.min(minX, cx - NODE_WIDTH / 2);
        maxX = Math.max(maxX, cx + NODE_WIDTH / 2);
        minY = Math.min(minY, cy - NODE_HEIGHT / 2);
        maxY = Math.max(maxY, cy + NODE_HEIGHT / 2);
      }
    }

    if (!Number.isFinite(minX)) continue;

    const outerMinX = minX - GROUP_PAD_X;
    const outerMaxX = maxX + GROUP_PAD_X;
    const outerMinY = minY - GROUP_PAD_TOP;
    const outerMaxY = maxY + GROUP_PAD_BOTTOM;

    subtreeBounds.set(parentId, {
      minX: outerMinX,
      maxX: outerMaxX,
      minY: outerMinY,
      maxY: outerMaxY,
    });

    const parent = docById.get(parentId);
    if (!parent) continue;

    const width = outerMaxX - outerMinX;
    const height = outerMaxY - outerMinY;
    const capturedParent = parent; // stable ref for closure

    subtreeNodes.push({
      id: `subtree-${parentId}`,
      type: "subtree",
      position: { x: outerMinX, y: outerMinY },
      data: {
        parentNode: parent,
        onHeaderClick: () => { onSubtreeHeaderClick(capturedParent); },
      },
      draggable: false,
      selectable: false,
      focusable: false,
      style: { width, height, zIndex: -1 },
    });
  }

  return subtreeNodes;
}
