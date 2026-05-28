/**
 * Shared domain types for the UI app.
 *
 * Per 01-ui/01-shell.md (D5), this file was intentionally empty after the
 * shell node. Domain contracts now arrive with each panel that needs them.
 *
 * First contributor: 01-ui/02-dag (the DAG view renders the project's own
 * document tree). Later panels (docs, tasks, logs, health, replay) will add
 * Task, LogEvent, Issue, etc.
 *
 * NodeId, NodeStatus, and DocNode are canonical in @ledger/parser (04-api-server/02-parser-extraction D5).
 * Re-exported here so existing @/lib/types consumers keep working unchanged.
 */

export type { NodeId, NodeStatus, DocNode } from "@ledger/parser";
import type { NodeId, NodeStatus } from "@ledger/parser";

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
  /** Total open-issue count on this node (any priority). Used as a tertiary sort key. */
  issueCount: number;
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

// ---------------------------------------------------------------------------
// Orchestration types — canonical home is @ledger/parser (05-task-runner/01-store-schema)
// Re-exported here so all existing import sites keep compiling unchanged.
// ---------------------------------------------------------------------------

export type {
  TaskId,
  TaskType,
  TaskStatus,
  TaskSource,
  ResourceClaim,
  Task,
  TaskInput,
  LogEventId,
  ConnectionStatus,
  BaseLogEvent,
  LogEvent,
} from "@ledger/parser";

// ---------------------------------------------------------------------------
// Workflow-progress types — introduced by 01-ui/09-workflow-progress
// ---------------------------------------------------------------------------

/**
 * The six PRD §6.2 lifecycle stages, in canonical order.
 * Introduced by 01-ui/09-workflow-progress.
 */
export type WorkflowStage =
  | "DRAFT"
  | "SPEC_REVIEW"
  | "APPROVED"
  | "IN_PROGRESS"
  | "VERIFY"
  | "COMPLETE";

/**
 * Completion state of a single stage row.
 *  - DONE:    stage is in the past (status > stage) or its structural marker is present.
 *  - CURRENT: stage equals the node's current status.
 *  - PENDING: stage is in the future (status < stage) and no structural marker yet.
 *  - SKIPPED: status is past this stage but the structural marker is absent
 *             (e.g., DRAFT→APPROVED via the leaf-workflow stage-2 shortcut).
 */
export type StageCompletion = "DONE" | "CURRENT" | "PENDING" | "SKIPPED";

export interface WorkflowStageState {
  stage: WorkflowStage;
  completion: StageCompletion;
  /** Human-readable evidence string, e.g. "Status header is COMPLETE" or "Spec Review (2026-05-22) audit table present". */
  evidence: string;
}

export interface WorkflowProgress {
  nodeId: NodeId;
  /**
   * Mirrors DocNode.status. Note: this can be PLANNED or ISSUE_OPEN, neither
   * of which is a WorkflowStage — the renderer maps them through stages[] and
   * issueOpen rather than expecting a 1:1 stage correspondence.
   */
  currentStatus: NodeStatus;
  /** True iff currentStatus === "ISSUE_OPEN". When true, the banner renders. */
  issueOpen: boolean;
  /**
   * Six entries for leaves, two entries (DRAFT, APPROVED) for parents. The
   * length is governed by isParent rather than by the type — see parent-node
   * handling below. Type-narrowing on isParent is the safe access pattern.
   */
  stages: WorkflowStageState[];
  /** True when the node is a parent (has children in the manifest). Renderer uses this to pick the collapsed layout. */
  isParent: boolean;
  /** For parent nodes only: counts derived from the children manifest. Undefined for leaves. */
  childrenRollup?: {
    total: number;
    byStatus: Partial<Record<NodeStatus, number>>;
  };
}
