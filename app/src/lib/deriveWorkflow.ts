/**
 * deriveWorkflow — pure derivation of WorkflowProgress from a DocNode + raw body.
 *
 * No React imports. Pure functions over DocNode / string.
 * Spec: docs/01-ui/09-workflow-progress.md §Design > Stage derivation rules
 *                                           §Design > Structural markers
 *                                           §Design > Parent-node handling
 */

import type {
  DocNode,
  NodeStatus,
  WorkflowProgress,
  WorkflowStage,
  WorkflowStageState,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Stage rank table (spec §Design > Stage derivation rules, step 3)
// ---------------------------------------------------------------------------

const STAGE_RANKS: Record<WorkflowStage, number> = {
  DRAFT: 0,
  SPEC_REVIEW: 1,
  APPROVED: 2,
  IN_PROGRESS: 3,
  VERIFY: 4,
  COMPLETE: 5,
};

const CANONICAL_STAGES: WorkflowStage[] = [
  "DRAFT",
  "SPEC_REVIEW",
  "APPROVED",
  "IN_PROGRESS",
  "VERIFY",
  "COMPLETE",
];

/**
 * Map a NodeStatus (which may include PLANNED or ISSUE_OPEN) to a numeric rank
 * for stage comparison. ISSUE_OPEN coerces to rank 2 (APPROVED) per D12.
 * PLANNED should be caught by step 1 (authored === false) before reaching here.
 */
function statusToRank(status: NodeStatus): number {
  switch (status) {
    case "DRAFT":
      return 0;
    case "SPEC_REVIEW":
      return 1;
    case "APPROVED":
      return 2;
    case "IN_PROGRESS":
      return 3;
    case "VERIFY":
      return 4;
    case "COMPLETE":
      return 5;
    case "ISSUE_OPEN":
      return 2; // coerced to APPROVED-rank per D12
    case "PLANNED":
      return -1; // caught by authored === false check; guard only
  }
}

// ---------------------------------------------------------------------------
// Structural marker detection (spec §Design > Structural markers)
// ---------------------------------------------------------------------------

/** SPEC_REVIEW: `## Spec Review (YYYY-MM-DD)` heading present. */
function detectSpecReview(raw: string): string | null {
  const m = raw.match(/^##\s+Spec Review \((\d{4}-\d{2}-\d{2})\)/m);
  if (!m) return null;
  const date = m[1] ?? "";
  return `Spec Review (${date}) audit table present`;
}

/** IN_PROGRESS: `## Implementation Notes` heading present and content is not the placeholder. */
function detectImplementationNotes(raw: string): string | null {
  const idx = raw.search(/^##\s+Implementation Notes\b/m);
  if (idx === -1) return null;
  const afterHeading = raw.slice(idx);
  // The placeholder is the literal string on the next non-blank line.
  const isPlaceholder = afterHeading.includes(
    "*(none yet — pre-implementation)*",
  );
  if (isPlaceholder) return null;
  return "Implementation Notes section populated";
}

/** VERIFY: `### Implementation Review (YYYY-MM-DD)` subsection present. */
function detectImplementationReview(raw: string): string | null {
  const m = raw.match(/^###\s+Implementation Review \((\d{4}-\d{2}-\d{2})\)/m);
  if (!m) return null;
  const date = m[1] ?? "";
  return `Implementation Review (${date}) subsection present`;
}

// ---------------------------------------------------------------------------
// Per-stage computation
// ---------------------------------------------------------------------------

function computeStageState(
  stage: WorkflowStage,
  statusRank: number,
  currentStatus: NodeStatus,
  authored: boolean,
  raw: string | null,
): WorkflowStageState {
  const stageRank = STAGE_RANKS[stage];

  if (stageRank > statusRank) {
    return { stage, completion: "PENDING", evidence: `Awaiting ${stage}` };
  }

  if (stageRank === statusRank) {
    // When the actual status differs from the stage name (e.g. ISSUE_OPEN
    // coerces to APPROVED-rank per D12), name the real status so the evidence
    // does not contradict the issue-open banner.
    const evidence =
      currentStatus === stage
        ? `Status header is ${stage}`
        : `Status header is ${currentStatus} (placed at ${stage})`;
    return { stage, completion: "CURRENT", evidence };
  }

  // stageRank < statusRank: stage is in the past — check structural marker.
  switch (stage) {
    case "DRAFT": {
      // DONE when authored === true; authored is guaranteed by the time we reach
      // here (step 1 in deriveWorkflowProgress handles authored === false).
      return {
        stage,
        completion: authored ? "DONE" : "SKIPPED",
        evidence: authored
          ? "Required sections present"
          : "Doc not yet authored",
      };
    }
    case "SPEC_REVIEW": {
      const evidence = raw ? detectSpecReview(raw) : null;
      if (evidence) {
        return { stage, completion: "DONE", evidence };
      }
      return {
        stage,
        completion: "SKIPPED",
        evidence: "No Spec Review audit table (stage-2 shortcut taken)",
      };
    }
    case "APPROVED": {
      // No structural marker — inferred from statusRank ≥ 2.
      return {
        stage,
        completion: "DONE",
        evidence: "Status reached APPROVED",
      };
    }
    case "IN_PROGRESS": {
      const evidence = raw ? detectImplementationNotes(raw) : null;
      if (evidence) {
        return { stage, completion: "DONE", evidence };
      }
      return {
        stage,
        completion: "SKIPPED",
        evidence: "No populated Implementation Notes (IN_PROGRESS shortcut taken)",
      };
    }
    case "VERIFY": {
      const evidence = raw ? detectImplementationReview(raw) : null;
      if (evidence) {
        return { stage, completion: "DONE", evidence };
      }
      return {
        stage,
        completion: "SKIPPED",
        evidence: "No Implementation Review subsection (VERIFY shortcut taken)",
      };
    }
    case "COMPLETE": {
      // No structural marker — inferred from statusRank === 5.
      return {
        stage,
        completion: "DONE",
        evidence: "Status header is COMPLETE",
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive workflow progress for a single node.
 *
 * @param node     The DocNode whose progress to derive.
 * @param allNodes Full node list, used for parent detection and children rollup.
 * @param raw      Raw markdown body (`source?.raw ?? null`). Null for manifest-only nodes.
 *
 * Pure function — no React, no side effects.
 * Spec: docs/01-ui/09-workflow-progress.md §Design > Stage derivation rules
 */
export function deriveWorkflowProgress(
  node: DocNode,
  allNodes: DocNode[],
  raw: string | null,
): WorkflowProgress {
  const nodeId = node.id;
  const currentStatus = node.status;

  // Step 1: manifest-only node (authored === false).
  if (!node.authored) {
    const stages: WorkflowStageState[] = CANONICAL_STAGES.map((stage) => ({
      stage,
      completion: "PENDING" as const,
      evidence: "Doc not yet authored",
    }));
    return {
      nodeId,
      currentStatus,
      issueOpen: false,
      stages,
      isParent: false,
    };
  }

  // Step 2: parent node detection via allNodes.filter(n => n.parentId === node.id).
  const childNodes = allNodes.filter((n) => n.parentId === nodeId);
  if (childNodes.length > 0) {
    // Parent: two-row strip (DRAFT, APPROVED) + children rollup.
    const parentStatusRank = statusToRank(currentStatus);

    const draftState = computeStageState(
      "DRAFT",
      parentStatusRank,
      currentStatus,
      node.authored,
      raw,
    );
    const approvedState = computeStageState(
      "APPROVED",
      parentStatusRank,
      currentStatus,
      node.authored,
      raw,
    );

    // Children rollup: count by status.
    const byStatus: Partial<Record<NodeStatus, number>> = {};
    for (const child of childNodes) {
      const prev = byStatus[child.status] ?? 0;
      byStatus[child.status] = prev + 1;
    }

    return {
      nodeId,
      currentStatus,
      issueOpen: currentStatus === "ISSUE_OPEN",
      stages: [draftState, approvedState],
      isParent: true,
      childrenRollup: {
        total: childNodes.length,
        byStatus,
      },
    };
  }

  // Step 3: map current status to rank.
  const statusRank = statusToRank(currentStatus);
  const issueOpen = currentStatus === "ISSUE_OPEN";

  // Step 4: compute each stage.
  const stages: WorkflowStageState[] = CANONICAL_STAGES.map((stage) =>
    computeStageState(stage, statusRank, currentStatus, node.authored, raw),
  );

  return {
    nodeId,
    currentStatus,
    issueOpen,
    stages,
    isParent: false,
  };
}
