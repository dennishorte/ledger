/**
 * WorkflowStageRow — single row in the workflow progress checklist.
 *
 * Renders: icon + stage name + evidence string.
 * SKIPPED rows show the stage name in strikethrough.
 * Hovering reveals the full evidence string via native title tooltip.
 *
 * Spec: docs/01-ui/09-workflow-progress.md §Design > Layout
 */

import type { JSX } from "react";
import { Check, Circle, CircleDashed, CircleSlash } from "lucide-react";
import type { StageCompletion, WorkflowStage } from "@/lib/types";

interface WorkflowStageRowProps {
  stage: WorkflowStage;
  completion: StageCompletion;
  evidence: string;
}

function StageIcon({ completion }: { completion: StageCompletion }): JSX.Element {
  switch (completion) {
    case "DONE":
      return (
        <Check
          className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-success)]"
          aria-hidden
        />
      );
    case "CURRENT":
      return (
        <Circle
          className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-fg)]"
          aria-hidden
        />
      );
    case "PENDING":
      return (
        <CircleDashed
          className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-muted)]"
          aria-hidden
        />
      );
    case "SKIPPED":
      return (
        <CircleSlash
          className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-muted)]"
          aria-hidden
        />
      );
  }
}

export function WorkflowStageRow({
  stage,
  completion,
  evidence,
}: WorkflowStageRowProps): JSX.Element {
  const isActive = completion === "DONE" || completion === "CURRENT";
  const nameClass = isActive
    ? "text-sm font-medium text-[color:var(--color-fg)]"
    : "text-sm font-medium text-[color:var(--color-muted)]";

  return (
    <div
      className="flex items-start gap-2 py-0.5"
      title={evidence}
    >
      <span className="mt-0.5">
        <StageIcon completion={completion} />
      </span>
      <div className="min-w-0 flex-1">
        <span
          className={
            completion === "SKIPPED"
              ? `${nameClass} line-through`
              : nameClass
          }
        >
          {stage}
        </span>
        <div className="mt-0.5 truncate text-xs text-[color:var(--color-muted)]">
          {evidence}
        </div>
      </div>
    </div>
  );
}
