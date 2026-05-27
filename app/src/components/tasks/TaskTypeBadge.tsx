import type { JSX } from "react";
import type { TaskType } from "@/lib/types";
import { cn } from "@/lib/cn";

interface TaskTypeBadgeProps {
  type: TaskType;
  className?: string;
}

/**
 * Lightweight type badge. Text + soft background. See 04-tasks §Type badge.
 * Three visual groups distinguished by background color token.
 */
function badgeBg(type: TaskType): string {
  switch (type) {
    case "operator_session":
      return "var(--color-surface-sunken)";
    case "spec_draft":
    case "spec_review":
    case "implement":
    case "verify":
    case "reverify":
    case "doc_refactor":
    case "issue_triage":
      return "var(--color-accent-soft)";
    case "human_review":
    case "project_status_review":
      return "var(--color-warning-soft)";
    case "agent_task":
    case "noop":
      return "var(--color-surface-sunken)";
  }
}

export function TaskTypeBadge({
  type,
  className,
}: TaskTypeBadgeProps): JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-[1px] font-mono text-[10px] lowercase tracking-wide",
        className,
      )}
      style={{
        backgroundColor: badgeBg(type),
        color: "var(--color-fg)",
      }}
    >
      {type}
    </span>
  );
}
