import type { DocNode, NodeId, NodeStatus } from "@/lib/types";

/**
 * Expansion policy for the DAG panel's collapsible subtrees (02-dag D15).
 *
 * Pure functions only — no React, no ELK. `useDagLayout` consumes the
 * effective expanded set; `DagCanvas` derives it from the persisted override
 * map layered over the status-driven default.
 */

/**
 * Statuses that mark a node as part of the "active frontier" — work that is
 * live and worth surfacing. A subtree containing any such descendant expands
 * by default. DRAFT, COMPLETE, PLANNED, and DEFERRED are deliberately absent:
 * DRAFT/PLANNED are not-yet-started and DEFERRED/COMPLETE are settled, so none
 * of them pull a subtree open on their own.
 */
export const ACTIVE_FRONTIER: ReadonlySet<NodeStatus> = new Set<NodeStatus>([
  "SPEC_REVIEW",
  "APPROVED",
  "IN_PROGRESS",
  "VERIFY",
  "ISSUE_OPEN",
]);

/** Map of parentId → direct child ids, restricted to ids present in `docs`. */
function buildChildrenMap(docs: DocNode[]): Map<NodeId, NodeId[]> {
  const docIds = new Set(docs.map((d) => d.id));
  const childrenByParent = new Map<NodeId, NodeId[]>();
  for (const d of docs) {
    if (d.parentId == null || !docIds.has(d.parentId)) continue;
    const arr = childrenByParent.get(d.parentId) ?? [];
    arr.push(d.id);
    childrenByParent.set(d.parentId, arr);
  }
  return childrenByParent;
}

/**
 * Subtree parents: nodes with ≥2 children in the doc set. These are the only
 * nodes that render as compound containers (and thus the only ones that can be
 * collapsed/expanded). Single-child parents stay plain tiles.
 */
export function buildSubtreeParentIds(docs: DocNode[]): Set<NodeId> {
  const result = new Set<NodeId>();
  for (const [id, kids] of buildChildrenMap(docs)) {
    if (kids.length >= 2) result.add(id);
  }
  return result;
}

/** Root ids: nodes with no parent (or a parent outside the doc set). */
function rootIds(docs: DocNode[]): NodeId[] {
  const docIds = new Set(docs.map((d) => d.id));
  return docs
    .filter((d) => d.parentId == null || !docIds.has(d.parentId))
    .map((d) => d.id);
}

/**
 * Default-expanded subtree parents: every root, plus any subtree parent with a
 * transitive descendant in the active frontier. Because every ancestor of a
 * frontier node transitively contains it, this expands exactly the path to
 * live work and leaves finished/deferred subtrees collapsed.
 */
export function computeDefaultExpansion(docs: DocNode[]): Set<NodeId> {
  const docById = new Map(docs.map((d) => [d.id, d] as const));
  const childrenByParent = buildChildrenMap(docs);
  const subtreeParentIds = buildSubtreeParentIds(docs);
  const expanded = new Set<NodeId>(rootIds(docs));

  function hasActiveDescendant(id: NodeId): boolean {
    const stack = [...(childrenByParent.get(id) ?? [])];
    while (stack.length > 0) {
      const childId = stack.pop();
      if (childId === undefined) break;
      const child = docById.get(childId);
      if (child && ACTIVE_FRONTIER.has(child.status)) return true;
      for (const grandchild of childrenByParent.get(childId) ?? []) {
        stack.push(grandchild);
      }
    }
    return false;
  }

  for (const id of subtreeParentIds) {
    if (hasActiveDescendant(id)) expanded.add(id);
  }
  return expanded;
}

export interface EffectiveExpansion {
  /** Subtree-parent ids that are effectively expanded right now. */
  expanded: Set<NodeId>;
  /** All subtree-parent ids (collapsible candidates) — for bulk controls. */
  subtreeParentIds: Set<NodeId>;
}

/**
 * Effective expansion = per-node operator override (if any) layered over the
 * status-driven default. Roots are always forced expanded — collapsing the
 * canvas frame to a single tile carries no value.
 */
export function computeEffectiveExpansion(
  docs: DocNode[],
  overrides: Record<NodeId, boolean>,
): EffectiveExpansion {
  const subtreeParentIds = buildSubtreeParentIds(docs);
  const defaults = computeDefaultExpansion(docs);
  const forcedRoots = new Set(rootIds(docs));
  const expanded = new Set<NodeId>();

  for (const id of subtreeParentIds) {
    if (forcedRoots.has(id)) {
      expanded.add(id);
      continue;
    }
    const override = overrides[id];
    const isExpanded = override === undefined ? defaults.has(id) : override;
    if (isExpanded) expanded.add(id);
  }
  return { expanded, subtreeParentIds };
}
