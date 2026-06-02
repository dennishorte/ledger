import type { NodeStatus } from "@/lib/types";

/**
 * Per 01-ui/02-dag.md (Design > Status color mapping). All colors resolve
 * through the cream-theme tokens in src/styles/globals.css — no new tokens
 * introduced here. Lives in its own module (not `StatusChip.tsx`) so the
 * component file stays components-only for React Fast Refresh.
 */
export const STATUS_STYLES: Record<NodeStatus, { bg: string; fg: string }> = {
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
