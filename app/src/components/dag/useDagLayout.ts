import { useEffect, useState } from "react";
import ELK, { type ElkNode, type ElkExtendedEdge } from "elkjs/lib/elk.bundled.js";
import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { DocNode, NodeId, NodeStatus } from "@/lib/types";
import { buildSubtreeParentIds } from "@/lib/dagExpansion";

export interface DocNodeData extends Record<string, unknown> {
  node: DocNode;
}

export interface DocSubtreeData extends Record<string, unknown> {
  /** Full DocNode for the parent so the header can render chip + id + title. */
  parentNode: DocNode;
  /** Called when the user clicks the header strip. */
  onHeaderClick: () => void;
  /** Called when the user clicks the collapse chevron (v1.4 / D15). */
  onToggleExpand: () => void;
  /**
   * Nesting depth in the doc tree (0 = outermost, ≥1 = nested inside another
   * subtree). Drives depth-based wash/border intensity in `DocSubtreeNode`
   * so inner rects pop visually against their enclosing outer rect when
   * the canvas is zoomed out.
   */
  depth: number;
}

/** Per-status descendant tally for a collapsed subtree's rollup (v1.4). */
export type StatusTally = Partial<Record<NodeStatus, number>>;

export interface DocCollapsedSubtreeData extends Record<string, unknown> {
  /** Full DocNode for the parent — chip + id + title on the rollup tile. */
  parentNode: DocNode;
  /** Called when the user clicks the tile body. */
  onHeaderClick: () => void;
  /** Called when the user clicks the expand chevron. */
  onToggleExpand: () => void;
  /** Total transitive descendant count. */
  total: number;
  /** Transitive descendant counts keyed by lifecycle status. */
  counts: StatusTally;
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

// Sentinel id for the ELK graph wrapper. Must not collide with any doc id —
// the PRD doc tree uses the literal `root` as its top-level id (see PRD §6.1
// / `parseDocs.ts` mapping for `00-project.md`), so we can't reuse that here.
const ELK_GRAPH_ROOT_ID = "__elk_root__";

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

// Layered options for a compound whose children have real dependency flow
// among them — direction matters, so rank them top-down (the v1.3 behavior).
const LAYERED_COMPOUND_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "80",
  "elk.spacing.nodeNode": "40",
  // Edges attached here may connect nodes nested in different expanded child
  // subtrees; INCLUDE_CHILDREN lets layered rank across those boundaries.
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.padding": COMPOUND_PADDING,
};

// Rectpacking options for a compound we want compacted into a near-square grid
// rather than stretched along one rank (v1.4 / D15). Used for the top-level
// overview and for any compound whose children carry no inter-child deps.
// rectpacking ignores edges for placement — safe here because React Flow draws
// its own bezier edges from node positions; ELK edge geometry is never read.
const RECTPACK_COMPOUND_OPTIONS: Record<string, string> = {
  "elk.algorithm": "rectpacking",
  "elk.aspectRatio": "1.6",
  "elk.spacing.nodeNode": "32",
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
  expandedIds: Set<NodeId>,
  onToggleExpand: (id: NodeId) => void,
  onSubtreeHeaderClick: (node: DocNode) => void,
): LayoutResult {
  const [result, setResult] = useState<LayoutResult>(EMPTY_RESULT);

  useEffect(() => {
    let cancelled = false;
    void computeDagLayout(docs, expandedIds, onToggleExpand, onSubtreeHeaderClick).then(
      (next) => {
        if (!cancelled) setResult(next);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [docs, expandedIds, onToggleExpand, onSubtreeHeaderClick]);

  return result;
}

/**
 * Pure async layout core — exported for headless geometry tests. The hook
 * wraps this with React state + cancellation.
 */
export async function computeDagLayout(
  docs: DocNode[],
  expandedIds: Set<NodeId>,
  onToggleExpand: (id: NodeId) => void,
  onSubtreeHeaderClick: (node: DocNode) => void,
): Promise<LayoutResult> {
  if (docs.length === 0) return EMPTY_RESULT;

  const docById = new Map(docs.map((d) => [d.id, d] as const));
  const docIds = new Set(docs.map((d) => d.id));

  // Subtree parents are nodes with ≥2 children in the doc set. They become
  // ELK compound nodes when expanded; collapsed they render as a single
  // rollup tile (D13/v1.2 + D15/v1.4).
  const subtreeParentIds = buildSubtreeParentIds(docs);
  // A subtree parent is rendered as a container only when explicitly expanded.
  const isExpandedSubtree = (id: NodeId): boolean =>
    subtreeParentIds.has(id) && expandedIds.has(id);

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

  // Ancestor chain root→id (inclusive), restricted to ids in the doc set.
  function chainOf(id: NodeId): NodeId[] {
    const chain: NodeId[] = [];
    let cursor: NodeId | null = id;
    while (cursor != null) {
      chain.unshift(cursor);
      const doc = docById.get(cursor);
      cursor = doc?.parentId != null && docIds.has(doc.parentId) ? doc.parentId : null;
    }
    return chain;
  }

  // Edge aggregation (D15/v1.4): a dep edge touching a node hidden inside a
  // collapsed subtree reroutes to that subtree's collapsed tile. `representative`
  // returns the first collapsed subtree parent on the root→node chain
  // (everything above it is expanded by construction), else the node itself —
  // which is therefore always a rendered node.
  function representative(id: NodeId): NodeId {
    for (const node of chainOf(id)) {
      if (subtreeParentIds.has(node) && !expandedIds.has(node)) return node;
    }
    return id;
  }

  const edgeStyle = {
    stroke: "var(--color-accent)",
    strokeDasharray: "4 4",
    strokeWidth: 1.5,
  } as const;
  const edgeMarker = {
    type: MarkerType.ArrowClosed,
    color: "var(--color-accent)",
    width: 14,
    height: 14,
  } as const;

  // Remap each declared dep through `representative`, then dedup by
  // (source,target) and drop self-edges (both endpoints collapsed into the
  // same visible node — a now-hidden internal dependency). ELK uses the full
  // aggregated set for layering; transitive reduction trims it at render only.
  const aggregatedDepEdges: Edge[] = [];
  const seenEdgeKeys = new Set<string>();
  for (const d of docs) {
    for (const dep of d.dependsOn) {
      if (!docIds.has(dep) || dep === d.id) continue;
      const source = representative(dep);
      const target = representative(d.id);
      if (source === target) continue;
      const key = `${source}->${target}`;
      if (seenEdgeKeys.has(key)) continue;
      seenEdgeKeys.add(key);
      aggregatedDepEdges.push({
        id: `dep-${key}`,
        source,
        target,
        type: "default",
        animated: false,
        style: edgeStyle,
        markerEnd: edgeMarker,
      });
    }
  }

  // Per-compound algorithm + edge placement (v1.4 / D15).
  //
  // A compound keeps layered/DOWN when its children carry real dependency flow
  // (direction reads) and switches to rectpacking when they don't (pack into a
  // near-square grid instead of stretching along one rank). The top-level
  // overview always packs — it wants compactness, not a wide dependency rank.
  //
  // Each aggregated edge is assigned to its lowest-common-ancestor compound (the
  // node where the two endpoints' root→node chains diverge). That compound
  // becomes layered and the edge is attached to *its* `edges` array — NOT the
  // graph wrapper. This matters once any ancestor is rectpacking: ELK's JSON
  // import rejects a wrapper-level edge that dives into a packed subtree
  // ("Referenced shape does not exist"). Edges whose LCA is the top-level
  // overview (depth 0) are dropped from the ELK graph entirely and drawn by
  // React Flow alone — placement there is by packing, not by rank. (React Flow
  // renders every edge from node positions; ELK edge geometry is never read.)
  const elkEdgesByContainer = new Map<NodeId, ElkExtendedEdge[]>();
  const layeredCompounds = new Set<NodeId>();
  for (const e of aggregatedDepEdges) {
    const sourceChain = chainOf(e.source);
    const targetChain = chainOf(e.target);
    let i = 0;
    while (
      i < sourceChain.length &&
      i < targetChain.length &&
      sourceChain[i] === targetChain[i]
    ) {
      i += 1;
    }
    const lca = sourceChain[i - 1];
    // Skip when one endpoint is an ancestor of the other (no divergence) — there
    // is no enclosing compound that ranks them as siblings.
    if (lca === undefined || i >= sourceChain.length || i >= targetChain.length) continue;
    if (depthOf(lca) === 0) continue; // top-level overview packs; RF draws this edge
    layeredCompounds.add(lca);
    const arr = elkEdgesByContainer.get(lca) ?? [];
    arr.push({ id: e.id, sources: [e.source], targets: [e.target] });
    elkEdgesByContainer.set(lca, arr);
  }

  const compoundOptions = (docId: NodeId): Record<string, string> =>
    layeredCompounds.has(docId) ? LAYERED_COMPOUND_OPTIONS : RECTPACK_COMPOUND_OPTIONS;

  function buildElkNode(docId: NodeId): ElkNode {
    // Only expanded subtree parents become compound nodes. A collapsed subtree
    // parent emits a leaf-sized box and its descendants are never laid out —
    // the scaling win (D15): ELK cost tracks open-node count, not total.
    if (isExpandedSubtree(docId)) {
      const childIds = kidsByParent.get(docId) ?? [];
      const containedEdges = elkEdgesByContainer.get(docId);
      return {
        id: docId,
        layoutOptions: compoundOptions(docId),
        children: childIds.map(buildElkNode),
        ...(containedEdges ? { edges: containedEdges } : {}),
      };
    }
    return {
      id: docId,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  }

  // Edges live in their LCA compound (see elkEdgesByContainer), never on the
  // wrapper — a wrapper-level edge into a packed subtree breaks ELK's importer.
  const elkGraph: ElkNode = {
    id: ELK_GRAPH_ROOT_ID,
    layoutOptions: ROOT_LAYOUT_OPTIONS,
    children: rootIds.map(buildElkNode),
    edges: [],
  };

  const laidOut = await elk.layout(elkGraph);

  // Walk the laid-out tree once, accumulating parent offsets to produce flat
  // absolute coordinates for React Flow. Also compute depth (for paint-order
  // zIndex on subtree wrappers) along the way.
  const docNodes: Node<DocNodeData>[] = [];
  const subtreeNodes: Node<DocSubtreeData>[] = [];
  const collapsedNodes: Node<DocCollapsedSubtreeData>[] = [];

  function depthOf(id: NodeId): number {
    const doc = docById.get(id);
    if (!doc?.parentId || !docIds.has(doc.parentId)) return 0;
    return 1 + depthOf(doc.parentId);
  }

  // Transitive descendant tally for a collapsed subtree's rollup chip.
  function descendantTally(id: NodeId): { total: number; counts: StatusTally } {
    const counts: StatusTally = {};
    let total = 0;
    const stack = [...(kidsByParent.get(id) ?? [])];
    while (stack.length > 0) {
      const childId = stack.pop();
      if (childId === undefined) break;
      const child = docById.get(childId);
      if (!child) continue;
      total += 1;
      counts[child.status] = (counts[child.status] ?? 0) + 1;
      for (const grandchild of kidsByParent.get(childId) ?? []) stack.push(grandchild);
    }
    return { total, counts };
  }

  function walk(elkNode: ElkNode, parentAbsX: number, parentAbsY: number): void {
    const absX = parentAbsX + (elkNode.x ?? 0);
    const absY = parentAbsY + (elkNode.y ?? 0);

    if (elkNode.id === ELK_GRAPH_ROOT_ID) {
      for (const child of elkNode.children ?? []) walk(child, absX, absY);
      return;
    }

    const docId = elkNode.id;
    const doc = docById.get(docId);
    if (!doc) return;

    if (isExpandedSubtree(docId)) {
      const width = elkNode.width ?? 0;
      const height = elkNode.height ?? 0;
      // Depth-based zIndex: outer subtrees paint behind inner ones; doc tiles
      // (zIndex 0) paint above all subtrees. Carried over from v1.2's
      // paint-order patch — preserves the same z-order semantics under the
      // ELK engine.
      const parentDepth = depthOf(docId);
      const subtreeZ = -100 + parentDepth;
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
          onToggleExpand: () => {
            onToggleExpand(captured.id);
          },
          depth: parentDepth,
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

    if (subtreeParentIds.has(docId)) {
      // Collapsed subtree: a single rollup tile, no descendant recursion.
      const captured = doc;
      const { total, counts } = descendantTally(docId);
      collapsedNodes.push({
        id: docId,
        type: "collapsedSubtree",
        position: { x: absX, y: absY },
        data: {
          parentNode: doc,
          onHeaderClick: () => {
            onSubtreeHeaderClick(captured);
          },
          onToggleExpand: () => {
            onToggleExpand(captured.id);
          },
          total,
          counts,
        },
        draggable: false,
        selectable: false,
        focusable: false,
      });
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

  const reducedDepEdges = transitiveReduction(aggregatedDepEdges);

  // Subtree rects first so they sit behind doc tiles in the array order
  // (belt-and-suspenders alongside the zIndex style). Collapsed-subtree tiles
  // and doc tiles share the foreground (default zIndex 0).
  return {
    nodes: [...subtreeNodes, ...docNodes, ...collapsedNodes],
    edges: reducedDepEdges,
  };
}
