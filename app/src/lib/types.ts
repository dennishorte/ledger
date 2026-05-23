/**
 * Shared domain types for the UI app.
 *
 * Per 01-ui/01-shell.md (D5), this file was intentionally empty after the
 * shell node. Domain contracts now arrive with each panel that needs them.
 *
 * First contributor: 01-ui/02-dag (the DAG view renders the project's own
 * document tree). Later panels (docs, tasks, logs, health, replay) will add
 * Task, LogEvent, Issue, etc.
 */

export type NodeId = string;

export type NodeStatus =
  | "DRAFT"
  | "SPEC_REVIEW"
  | "APPROVED"
  | "IN_PROGRESS"
  | "VERIFY"
  | "COMPLETE"
  | "ISSUE_OPEN"
  | "PLANNED";

export interface DocNode {
  id: NodeId;
  parentId: NodeId | null;
  title: string;
  status: NodeStatus;
  /** Sibling node IDs this node depends on, per its parent's manifest. */
  dependsOn: NodeId[];
  /** True when an authored `docs/**.md` file backs this node. */
  authored: boolean;
  /** Glob key from `import.meta.glob`, kept for debugging/routing. */
  source?: string;
}

/**
 * Raw markdown payload for a single authored doc node.
 *
 * Introduced by 01-ui/03-docs. Kept separate from DocNode so DAG consumers
 * don't pay for the full markdown bytes. The source path is NOT duplicated
 * here — read it from the matching DocNode.source (see spec S1 audit note).
 */
export interface DocSource {
  id: NodeId;
  /** Raw markdown body, with the metadata header preserved. */
  raw: string;
}

// ---------------------------------------------------------------------------
// Health dashboard types — introduced by 01-ui/06-health
// ---------------------------------------------------------------------------

/**
 * A single open-issue item extracted from a doc node's "## Open Issues" section.
 * Introduced by 01-ui/06-health.
 */
export interface IssueItem {
  /** Source node. */
  nodeId: NodeId;
  /** The raw markdown text of the bullet (single item, may be multi-line). */
  text: string;
  /** Priority tag extracted from the item text, e.g. "HIGH", "MEDIUM", "LOW", "TRIVIAL". */
  priority: IssuePriority;
  /**
   * Slug of the "## Open Issues" heading in the source doc, for anchor deep-linking.
   * Always "open-issues" for the current doc schema.
   */
  sectionSlug: string;
}

export type IssuePriority = "HIGH" | "MEDIUM" | "LOW" | "TRIVIAL" | "UNKNOWN";

/**
 * Staleness signal for a single node. Phase-1: derived from status + open issues.
 * Phase-2: will include mtime delta from the health daemon.
 */
export interface StalenessSignal {
  nodeId: NodeId;
  /** True when node status is VERIFY or ISSUE_OPEN, or node has ≥1 HIGH/MEDIUM open issue. */
  isStale: boolean;
  /** Human-readable reason, e.g. "Status is ISSUE_OPEN" or "2 HIGH-priority open issues". */
  reason: string;
}

/**
 * Token-cost roll-up per subtree root. Phase-1: all values are 0 / null.
 * Populated by the API when the cost tracker lands.
 */
export interface SubtreeCost {
  subtreeRootId: NodeId;
  /** Total input tokens in the subtree, or null when unavailable. */
  inputTokens: number | null;
  /** Total output tokens in the subtree, or null when unavailable. */
  outputTokens: number | null;
}

/**
 * Result of a dep-impact query: given a source node, which nodes are downstream?
 */
export interface DepImpactResult {
  /** Node the operator queried on. */
  sourceNodeId: NodeId;
  /** Transitively downstream node IDs (direct + indirect dependents). */
  affectedNodeIds: NodeId[];
}
