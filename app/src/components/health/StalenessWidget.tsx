/**
 * StalenessWidget — list of stale nodes with reason and status chip.
 *
 * Rows sorted: ISSUE_OPEN first, then VERIFY, then by issue count (reason text).
 * Clicking a row navigates to /docs/:nodeId per D12.
 * Spec: docs/01-ui/06-health.md §Design > Staleness widget interaction
 */

import type { JSX } from "react";
import { useNavigate } from "react-router";
import type { DocNode, NodeId, StalenessSignal } from "@/lib/types";
import { StatusChip } from "@/components/dag/StatusChip";

interface StalenessWidgetProps {
  staleness: StalenessSignal[];
  nodes: DocNode[];
}

const STATUS_ORDER: Record<string, number> = {
  ISSUE_OPEN: 0,
  VERIFY: 1,
};

function statusRank(node: DocNode | undefined): number {
  return STATUS_ORDER[node?.status ?? ""] ?? 2;
}

export function StalenessWidget({
  staleness,
  nodes,
}: StalenessWidgetProps): JSX.Element {
  const navigate = useNavigate();
  const nodeById = new Map<NodeId, DocNode>(nodes.map((n) => [n.id, n]));

  const sorted = [...staleness].sort((a, b) => {
    const aRank = statusRank(nodeById.get(a.nodeId));
    const bRank = statusRank(nodeById.get(b.nodeId));
    if (aRank !== bRank) return aRank - bRank;
    if (a.issueCount !== b.issueCount) return b.issueCount - a.issueCount;
    return a.nodeId.localeCompare(b.nodeId);
  });

  function handleRowClick(nodeId: NodeId): void {
    void navigate(`/docs/${encodeURIComponent(nodeId)}`);
  }

  function handleRowKeyDown(e: React.KeyboardEvent, nodeId: NodeId): void {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleRowClick(nodeId);
    }
  }

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-[--color-success]">All nodes appear healthy.</p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 overflow-y-auto">
      {sorted.map((signal) => {
        const node = nodeById.get(signal.nodeId);
        return (
          <div
            key={signal.nodeId}
            role="button"
            tabIndex={0}
            className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-[--color-surface-sunken]"
            onClick={() => { handleRowClick(signal.nodeId); }}
            onKeyDown={(e) => { handleRowKeyDown(e, signal.nodeId); }}
          >
            {/* Node id */}
            <span className="shrink-0 font-mono text-xs text-[--color-muted]">
              {signal.nodeId}
            </span>
            {/* Title */}
            <span className="min-w-0 shrink-0 truncate text-xs text-[--color-fg]">
              {node?.title ?? ""}
            </span>
            {/* Reason */}
            <span className="min-w-0 flex-1 truncate text-xs text-[--color-faint]">
              {signal.reason}
            </span>
            {/* Status chip */}
            {node && <StatusChip status={node.status} />}
          </div>
        );
      })}
    </div>
  );
}
