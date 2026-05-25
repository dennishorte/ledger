import type { JSX } from "react";
import type { TaskStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

interface TaskStatusChipProps {
  status: TaskStatus;
  className?: string;
}

/**
 * Task status chip — sibling of StatusChip (02-dag), not a generalisation.
 * See 04-tasks D3 for rationale. Color mapping per 04-tasks §Status chip.
 */
const STATUS_STYLES: Record<TaskStatus, { bg: string; fg: string }> = {
  PENDING: { bg: "var(--color-surface-sunken)", fg: "var(--color-muted)" },
  RUNNING: { bg: "var(--color-accent)", fg: "var(--color-accent-fg)" },
  BLOCKED: { bg: "var(--color-warning)", fg: "var(--color-fg)" },
  AWAITING_HUMAN_REVIEW: { bg: "var(--color-warning)", fg: "var(--color-fg)" },
  COMPLETE: { bg: "var(--color-success)", fg: "var(--color-accent-fg)" },
  FAILED: { bg: "var(--color-danger)", fg: "var(--color-accent-fg)" },
  CANCELLED: { bg: "var(--color-surface-sunken)", fg: "var(--color-muted)" },
};

/** Display label — AWAITING_HUMAN_REVIEW shortened per D10. */
function chipLabel(status: TaskStatus): string {
  if (status === "AWAITING_HUMAN_REVIEW") return "AWAITING REVIEW";
  return status.replace(/_/g, " ");
}

export function TaskStatusChip({
  status,
  className,
}: TaskStatusChipProps): JSX.Element {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-wider",
        className,
      )}
      style={{ backgroundColor: style.bg, color: style.fg }}
      title={status}
    >
      {chipLabel(status)}
    </span>
  );
}
