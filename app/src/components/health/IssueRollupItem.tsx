/**
 * IssueRollupItem — single row in the Open Issues widget.
 *
 * Shows: node-id badge | priority badge | issue text (2-line truncation).
 * Full text on hover via native `title`. Clicking navigates to
 * /docs/:nodeId#open-issues per D10/D12.
 *
 * Issue text is plain text — no <MarkdownBody> per D9.
 * Spec: docs/01-ui/06-health.md §Design > Open Issues widget interaction
 */

import type { JSX } from "react";
import { useNavigate } from "react-router";
import type { IssueItem, IssuePriority } from "@/lib/types";

interface PriorityBadgeProps {
  priority: IssuePriority;
}

const PRIORITY_STYLE: Record<IssuePriority, { bg: string; fg: string; label: string }> = {
  HIGH: { bg: "var(--color-danger)", fg: "var(--color-accent-fg)", label: "HIGH" },
  MEDIUM: { bg: "var(--color-warning)", fg: "var(--color-fg)", label: "MED" },
  LOW: { bg: "var(--color-surface-sunken)", fg: "var(--color-muted)", label: "LOW" },
  TRIVIAL: { bg: "var(--color-surface-sunken)", fg: "var(--color-muted)", label: "TRIV" },
  UNKNOWN: { bg: "var(--color-surface-sunken)", fg: "var(--color-faint)", label: "—" },
};

function PriorityBadge({ priority }: PriorityBadgeProps): JSX.Element {
  const s = PRIORITY_STYLE[priority];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-sm px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-wider"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

interface IssueRollupItemProps {
  item: IssueItem;
}

export function IssueRollupItem({ item }: IssueRollupItemProps): JSX.Element {
  const navigate = useNavigate();

  function handleClick(): void {
    void navigate(
      `/docs/${encodeURIComponent(item.nodeId)}#${item.sectionSlug}`,
    );
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-[--color-surface-sunken] focus-visible:outline-2 focus-visible:outline-[--color-accent]"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      title={item.text}
    >
      {/* Node badge */}
      <span
        className="mt-px inline-flex shrink-0 items-center rounded-sm px-1.5 py-[1px] font-mono text-[10px] tracking-wide"
        style={{
          backgroundColor: "var(--color-surface-sunken)",
          color: "var(--color-muted)",
        }}
      >
        {item.nodeId}
      </span>
      {/* Priority badge */}
      <PriorityBadge priority={item.priority} />
      {/* Issue text — 2-line clamp */}
      <span
        className="min-w-0 flex-1 leading-snug text-[--color-fg]"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {item.text}
      </span>
    </div>
  );
}
