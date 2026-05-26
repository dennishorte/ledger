import type { JSX } from "react";
import type { NodeStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

interface StatusChipProps {
  status: NodeStatus;
  className?: string;
}

/**
 * Per 01-ui/02-dag.md (Design > Status color mapping). All colors resolve
 * through the cream-theme tokens in src/styles/globals.css — no new tokens
 * introduced here.
 */
const STATUS_STYLES: Record<NodeStatus, { bg: string; fg: string }> = {
  DRAFT: { bg: "var(--color-surface-sunken)", fg: "var(--color-muted)" },
  SPEC_REVIEW: { bg: "var(--color-warning)", fg: "var(--color-fg)" },
  APPROVED: { bg: "var(--color-accent)", fg: "var(--color-accent-fg)" },
  IN_PROGRESS: { bg: "var(--color-accent)", fg: "var(--color-accent-fg)" },
  VERIFY: { bg: "var(--color-warning)", fg: "var(--color-fg)" },
  COMPLETE: { bg: "var(--color-success)", fg: "var(--color-accent-fg)" },
  ISSUE_OPEN: { bg: "var(--color-danger)", fg: "var(--color-accent-fg)" },
  PLANNED: { bg: "var(--color-surface-sunken)", fg: "var(--color-muted)" },
  DEFERRED: { bg: "var(--color-surface-sunken)", fg: "var(--color-muted)" },
};

export function StatusChip({ status, className }: StatusChipProps): JSX.Element {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-wider",
        className,
      )}
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
