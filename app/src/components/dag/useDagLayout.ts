import { useEffect, useState } from "react";
import ELK, { type ElkNode, type ElkExtendedEdge } from "elkjs/lib/elk.bundled.js";
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
const GROUP_PAD_TOP = 52; // matches the v1.2 header-strip height
const GROUP_PAD_BOTTOM = 20;

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

const EMPTY_RESULT: LayoutResult = { nodes: [], edges: [] };

// Single ELK instance reused across hook invocations. `elk.bundled` ships the
// worker entry inline; instantiation is cheap but allocating one Worker per
// hook call would be wasteful.
const elk = new ELK();

const ROOT_LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  // Equivalents of dagre's ranksep / nodesep at the v1.2 values.
  "elk.layered.spacing.nodeNodeBetweenLayers": "80",
  "elk.spacing.nodeNode": "40",
  // Required for crossing minimization across compound boundaries — e.g. the
  // sibling deps `08-markdown → 03-docs` and `02-dag → 09-workflow-progress`
  // that dagre routed as crossed edges in v1.0–v1.2.
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.padding": "[top=24,left=24,bottom=24,right=24]",
};

// Padding inside a compound node makes room for the header strip on top.
// ELK takes padding as `[top=N,left=N,bottom=N,right=N]`; the four values
// mirror v1.2's GROUP_PAD_* constants. Built as a separate const so the
// numeric constants stay typed-numeric for any other call sites.
const COMPOUND_PADDING =
  "[top=" +
  String(GROUP_PAD_TOP) +
  ",left=" +
  String(GROUP_PAD_X) +
  ",bottom=" +
  String(GROUP_PAD_BOTTOM) +
  ",right=" +
  String(GROUP_PAD_X) +
  "]";

const COMPOUND_LAYOUT_OPTIONS: Record<string, string> = {
  "elk.padding": COMPOUND_PADDING,
};

/**
 * Compute the transitive reduction of a set of dep edges.
 *
 * For each edge u → v, drop it if there exists any longer path u → … → v
 * (length ≥ 2) within the same edge set. The input array is not mutated;
 * a new filtered array is returned. Carried over verbatim from the dagre
 * implementation — D11/round-1 logic is engine-agnostic.
 */
function transitiveReduction(edges: Edge[]): Edge[] {
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    const targets = adj.get(e.source) ?? new Set<string>();
    targets.add(e.target);
    adj.set(e.source, targets);
  }

  function reachableViaLongerPath(start: string, target: string): boolean {
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
 * ELK-backed compound-graph layout. Recomputes when the input doc set or the
 * header-click callback changes. Returns empty arrays until ELK resolves on
 * first render; for ≤30 nodes this is ~50–200ms.
 */
export function useDagLayout(
  docs: DocNode[],
  onSubtreeHeaderClick: (node: DocNode) => void,
): LayoutResult {
  const [result, setResult] = useState<LayoutResult>(EMPTY_RESULT);

  useEffect(() => {
    let cancelled = false;
    void layout(docs, onSubtreeHeaderClick).then((next) => {
      if (!cancelled) setResult(next);
    });
    return () => {
      cancelled = true;
    };
  }, [docs, onSubtreeHeaderClick]);

  return result;
}

async function layout(
  docs: DocNode[],
  onSubtreeHeaderClick: (node: DocNode) => void,
): Promise<LayoutResult> {
  if (docs.length === 0) return EMPTY_RESULT;

  const docById = new Map(docs.map((d) => [d.id, d] as const));
  const docIds = new Set(docs.map((d) => d.id));

  // Subtree parents are nodes with ≥2 children in the doc set. They become
  // ELK compound nodes; their visual header strip IS the parent (D13/v1.2).
  const subtreeParentIds = buildSubtreeParentIds(docs, docIds);

  const kidsByParent = new Map<NodeId, NodeId[]>();
  for (const d of docs) {
    if (d.parentId == null || !docIds.has(d.parentId)) continue;
    const arr = kidsByParent.get(d.parentId) ?? [];
    arr.push(d.id);
    kidsByParent.set(d.parentId, arr);
  }

  // Roots: nodes with no parent (or parent outside the doc set).
  const rootIds = docs
    .filter((d) => d.parentId == null || !docIds.has(d.parentId))
    .map((d) => d.id);

  // Build dep edges (all of them — ELK uses the full set for layering;
  // transitive reduction is applied later, at render emission only).
  const allDepEdges: Edge[] = [];
  for (const d of docs) {
    for (const dep of d.dependsOn) {
      if (!docIds.has(dep) || dep === d.id) continue;
      allDepEdges.push({
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

  const elkEdges: ElkExtendedEdge[] = allDepEdges.map((e) => ({
    id: e.id,
    sources: [e.source],
    targets: [e.target],
  }));

  function buildElkNode(docId: NodeId): ElkNode {
    if (subtreeParentIds.has(docId)) {
      const childIds = kidsByParent.get(docId) ?? [];
      return {
        id: docId,
        layoutOptions: COMPOUND_LAYOUT_OPTIONS,
        children: childIds.map(buildElkNode),
      };
    }
    return {
      id: docId,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  }

  const elkGraph: ElkNode = {
    id: "root",
    layoutOptions: ROOT_LAYOUT_OPTIONS,
    children: rootIds.map(buildElkNode),
    edges: elkEdges,
  };

  const laidOut = await elk.layout(elkGraph);

  // Walk the laid-out tree once, accumulating parent offsets to produce flat
  // absolute coordinates for React Flow. Also compute depth (for paint-order
  // zIndex on subtree wrappers) along the way.
  const docNodes: Node<DocNodeData>[] = [];
  const subtreeNodes: Node<DocSubtreeData>[] = [];

  function depthOf(id: NodeId): number {
    const doc = docById.get(id);
    if (!doc?.parentId || !docIds.has(doc.parentId)) return 0;
    return 1 + depthOf(doc.parentId);
  }

  function walk(elkNode: ElkNode, parentAbsX: number, parentAbsY: number): void {
    const absX = parentAbsX + (elkNode.x ?? 0);
    const absY = parentAbsY + (elkNode.y ?? 0);

    if (elkNode.id === "root") {
      for (const child of elkNode.children ?? []) walk(child, absX, absY);
      return;
    }

    const docId = elkNode.id;
    const doc = docById.get(docId);
    if (!doc) return;

    if (subtreeParentIds.has(docId)) {
      const width = elkNode.width ?? 0;
      const height = elkNode.height ?? 0;
      // Depth-based zIndex: outer subtrees paint behind inner ones; doc tiles
      // (zIndex 0) paint above all subtrees. Carried over from v1.2's
      // paint-order patch — preserves the same z-order semantics under the
      // ELK engine.
      const subtreeZ = -100 + depthOf(docId);
      const captured = doc;
      subtreeNodes.push({
        id: `subtree-${docId}`,
        type: "subtree",
        position: { x: absX, y: absY },
        data: {
          parentNode: doc,
          onHeaderClick: () => {
            onSubtreeHeaderClick(captured);
          },
        },
        draggable: false,
        selectable: false,
        focusable: false,
        // pointerEvents on the wrapper: React Flow's `.react-flow__node`
        // default is `pointer-events: all`, which would let an enclosing
        // subtree capture clicks meant for an enclosed subtree's header
        // button. The header `<button>` re-enables pointer events via
        // `pointer-events-auto` and wins as a CSS leaf.
        style: { width, height, zIndex: subtreeZ, pointerEvents: "none" },
      });
      for (const child of elkNode.children ?? []) walk(child, absX, absY);
      return;
    }

    docNodes.push({
      id: docId,
      type: "doc",
      position: { x: absX, y: absY },
      data: { node: doc },
    });
  }

  walk(laidOut, 0, 0);

  const reducedDepEdges = transitiveReduction(allDepEdges);

  // Subtree rects first so they sit behind doc tiles in the array order
  // (belt-and-suspenders alongside the zIndex style).
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
