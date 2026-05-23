/**
 * deriveHealth — pure derivation of staleness signals and dep-impact results.
 *
 * No React imports. Pure functions over DocNode[] / IssueItem[].
 * Spec: docs/01-ui/06-health.md §Design > Staleness derivation
 *                              §Design > Dep-impact query
 */

import type {
  DepImpactResult,
  DocNode,
  IssueItem,
  NodeId,
  StalenessSignal,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Staleness derivation
// ---------------------------------------------------------------------------

/**
 * Derive staleness signals for all authored nodes.
 *
 * A node is stale if any of:
 *   - Its status is ISSUE_OPEN or VERIFY.
 *   - It has ≥1 HIGH-priority open issue.
 *   - It has ≥2 MEDIUM-priority open issues.
 *
 * Manifest-only nodes (authored: false) are excluded — they have no content
 * to be stale against.
 *
 * Phase-1 proxy: the real signal (mtime vs last-verification-timestamp) arrives
 * with the health daemon. See spec D3.
 */
export function deriveStaleness(
  nodes: DocNode[],
  issuesByNode: Map<NodeId, IssueItem[]>,
): StalenessSignal[] {
  const signals: StalenessSignal[] = [];

  for (const node of nodes) {
    if (!node.authored) continue;

    const issues = issuesByNode.get(node.id) ?? [];
    const highCount = issues.filter((i) => i.priority === "HIGH").length;
    const mediumCount = issues.filter((i) => i.priority === "MEDIUM").length;

    let reason = "";

    if (node.status === "ISSUE_OPEN") {
      reason = "Status is ISSUE_OPEN";
    } else if (node.status === "VERIFY") {
      reason = "Status is VERIFY";
    } else if (highCount >= 1) {
      reason =
        highCount === 1
          ? "1 HIGH-priority open issue"
          : `${String(highCount)} HIGH-priority open issues`;
    } else if (mediumCount >= 2) {
      reason = `${String(mediumCount)} MEDIUM-priority open issues`;
    }

    const isStale = reason !== "";
    signals.push({
      nodeId: node.id,
      isStale,
      reason,
      issueCount: issues.length,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Dep-impact query
// ---------------------------------------------------------------------------

/**
 * Compute which nodes are transitively downstream of `sourceNodeId`.
 *
 * Builds a reverse-adjacency map (dependents graph) and runs BFS from the
 * source to collect all transitive dependents.
 *
 * Phase-1: doc-tree dependency edges only. Task-level invalidation requires
 * the task runner (04-tasks). Labeled as such in the UI per D4.
 *
 * Returns { sourceNodeId, affectedNodeIds: [] } when no downstream nodes exist
 * — never throws.
 */
export function computeDepImpact(
  sourceNodeId: NodeId,
  nodes: DocNode[],
): DepImpactResult {
  // Build reverse adjacency: nodeId → set of nodes that depend on it.
  const reverseDeps = new Map<NodeId, NodeId[]>();
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      const list = reverseDeps.get(dep);
      if (list) {
        list.push(node.id);
      } else {
        reverseDeps.set(dep, [node.id]);
      }
    }
  }

  // BFS from sourceNodeId over the reverse graph.
  const visited = new Set<NodeId>();
  const queue: NodeId[] = [sourceNodeId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const dependents = reverseDeps.get(current) ?? [];
    for (const dep of dependents) {
      if (!visited.has(dep)) {
        visited.add(dep);
        queue.push(dep);
      }
    }
  }

  return {
    sourceNodeId,
    affectedNodeIds: Array.from(visited),
  };
}
