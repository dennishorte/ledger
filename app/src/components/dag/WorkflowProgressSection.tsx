/**
 * WorkflowProgressSection — inspector section showing a node's lifecycle position.
 *
 * Props: { node: DocNode; allNodes: DocNode[] }
 *
 * Fetches raw markdown via useDocSource, derives WorkflowProgress via
 * deriveWorkflowProgress, then renders either the leaf (six-row) or parent
 * (two-row + rollup) layout.
 *
 * Spec: docs/01-ui/09-workflow-progress.md §Design > Layout
 *                                           §Design > Components and files
 */

import type { JSX } from "react";
import { AlertTriangle } from "lucide-react";
import type { DocNode, NodeStatus } from "@/lib/types";
import { useDocSource } from "@/components/docs/useDocSource";
import { deriveWorkflowProgress } from "@/lib/deriveWorkflow";
import { WorkflowStageRow } from "@/components/dag/WorkflowStageRow";

interface WorkflowProgressSectionProps {
  node: DocNode;
  allNodes: DocNode[];
}

/**
 * Canonical display order for NodeStatus in the children rollup chip row.
 * Matches the PRD §6.2 lifecycle order, with PLANNED at the start (pre-lifecycle).
 */
const STATUS_DISPLAY_ORDER: NodeStatus[] = [
  "PLANNED",
  "DRAFT",
  "SPEC_REVIEW",
  "APPROVED",
  "IN_PROGRESS",
  "VERIFY",
  "ISSUE_OPEN",
  "COMPLETE",
];

export function WorkflowProgressSection({
  node,
  allNodes,
}: WorkflowProgressSectionProps): JSX.Element {
  const source = useDocSource(node.id);
  const raw = source?.raw ?? null;

  const progress = deriveWorkflowProgress(node, allNodes, raw);

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-muted)]">
        Workflow
      </div>

      <div className="mt-1 flex flex-col gap-0.5">
        {/* ISSUE_OPEN banner */}
        {progress.issueOpen && (
          <div className="mb-2 flex items-start gap-2 rounded-md border border-[color:var(--color-warning)] bg-[color:var(--color-warning)]/20 px-2 py-1.5">
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--color-warning)]"
              aria-hidden
            />
            <p className="text-xs text-[color:var(--color-fg)]">
              Issue open — verification failed, looped back to APPROVED. See
              Open Issues section.
            </p>
          </div>
        )}

        {/* Stage rows */}
        {progress.stages.map((stageState) => (
          <WorkflowStageRow
            key={stageState.stage}
            stage={stageState.stage}
            completion={stageState.completion}
            evidence={stageState.evidence}
          />
        ))}

        {/* Children rollup (parent nodes only) */}
        {progress.isParent && progress.childrenRollup !== undefined && (
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">
              Children:
            </span>
            {STATUS_DISPLAY_ORDER.filter(
              (s) => (progress.childrenRollup?.byStatus[s] ?? 0) > 0,
            ).map((s) => {
              const count = progress.childrenRollup?.byStatus[s] ?? 0;
              return (
                <span
                  key={s}
                  className="text-xs text-[color:var(--color-fg)]"
                >
                  {String(count)} {s}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
