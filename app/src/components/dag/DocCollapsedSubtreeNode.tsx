import type { JSX } from "react";
import { type NodeProps } from "@xyflow/react";
import { ChevronRight } from "lucide-react";
import { StatusChip } from "@/components/ui/StatusChip";
import { STATUS_STYLES } from "@/components/ui/statusColors";
import type { DocCollapsedSubtreeData } from "@/components/dag/useDagLayout";
import type { NodeStatus } from "@/lib/types";

/**
 * Collapsed subtree rollup tile (D15 / v1.4).
 *
 * Stands in for a whole subtree the operator (or the status-driven default)
 * has collapsed. Reads as a stacked card — distinct from a plain leaf `doc`
 * tile — so "opens into more" is legible at a glance. Carries the parent's
 * chip + id, a truncated title, and a descendant rollup (count + per-status
 * dots). The chevron expands; the body opens the inspector (affordances kept
 * distinct per Req 6).
 */

// Active/attention states lead; settled states trail. Drives the dot order.
const TALLY_ORDER: NodeStatus[] = [
  "ISSUE_OPEN",
  "IN_PROGRESS",
  "VERIFY",
  "SPEC_REVIEW",
  "APPROVED",
  "DRAFT",
  "PLANNED",
  "DEFERRED",
  "COMPLETE",
];

export function DocCollapsedSubtreeNode({ data }: NodeProps): JSX.Element {
  const { parentNode, onHeaderClick, onToggleExpand, total, counts } =
    data as DocCollapsedSubtreeData;

  const tally = TALLY_ORDER.filter((s) => (counts[s] ?? 0) > 0).map((s) => ({
    status: s,
    count: counts[s] ?? 0,
  }));

  return (
    <div className="relative h-[64px] w-[240px]">
      {/* Stacked-card peek: two offset layers behind the front card. */}
      <div
        aria-hidden
        className="absolute left-[5px] top-[5px] h-full w-full rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-sunken)]"
      />
      <div
        aria-hidden
        className="absolute left-[2.5px] top-[2.5px] h-full w-full rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-sunken)]"
      />
      {/* Front card */}
      <div className="relative flex h-full w-full items-stretch overflow-hidden rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] shadow-sm">
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={`Expand ${parentNode.id}`}
          title="Expand subtree"
          className="flex shrink-0 cursor-pointer items-center border-r border-[color:var(--color-border)] px-1 text-[color:var(--color-muted)] transition-colors hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-fg)]"
        >
          <ChevronRight size={16} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={onHeaderClick}
          className="flex min-w-0 flex-1 cursor-pointer flex-col justify-center gap-0.5 px-2 py-1 text-left transition-colors hover:bg-[color:var(--color-surface-sunken)]"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <StatusChip status={parentNode.status} />
            <span
              className="truncate font-mono text-[11px] text-[color:var(--color-muted)]"
              title={parentNode.id}
            >
              {parentNode.id}
            </span>
          </div>
          {parentNode.title ? (
            <div
              className="truncate text-[11px] text-[color:var(--color-fg)]"
              title={parentNode.title}
            >
              {parentNode.title}
            </div>
          ) : null}
          <div
            className="flex items-center gap-1"
            title={tally.map((t) => `${t.status}: ${String(t.count)}`).join(" · ")}
          >
            <span className="font-mono text-[10px] text-[color:var(--color-faint)]">
              {total} {total === 1 ? "node" : "nodes"}
            </span>
            <span className="flex items-center gap-[3px]">
              {tally.map((t) => (
                <span key={t.status} className="flex items-center gap-[2px]">
                  <span
                    className="inline-block h-[7px] w-[7px] rounded-full"
                    style={{ backgroundColor: STATUS_STYLES[t.status].bg }}
                  />
                  <span className="font-mono text-[9px] text-[color:var(--color-muted)]">
                    {t.count}
                  </span>
                </span>
              ))}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
