/**
 * IssueRollupWidget — open-issue list with priority and node filters.
 *
 * Spec: docs/01-ui/06-health.md §Design > Open Issues widget interaction
 */

import { useState } from "react";
import type { JSX } from "react";
import type { IssueItem, IssuePriority, NodeId } from "@/lib/types";
import { IssueRollupItem } from "./IssueRollupItem";

const ALL_PRIORITIES: IssuePriority[] = ["HIGH", "MEDIUM", "LOW", "TRIVIAL", "UNKNOWN"];

interface IssueRollupWidgetProps {
  issues: IssueItem[];
  /** All authored node IDs for the "filter by node" select. */
  nodeIds: NodeId[];
}

export function IssueRollupWidget({
  issues,
  nodeIds,
}: IssueRollupWidgetProps): JSX.Element {
  // Multi-select priority filter — all on by default.
  const [activePriorities, setActivePriorities] = useState<Set<IssuePriority>>(
    new Set(ALL_PRIORITIES),
  );
  const [filterNode, setFilterNode] = useState<NodeId>("");

  function togglePriority(p: IssuePriority): void {
    setActivePriorities((prev) => {
      const next = new Set(prev);
      if (next.has(p)) {
        next.delete(p);
      } else {
        next.add(p);
      }
      return next;
    });
  }

  const visible = issues.filter(
    (i) =>
      activePriorities.has(i.priority) &&
      (filterNode === "" || i.nodeId === filterNode),
  );

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Priority toggles */}
      <div className="flex flex-wrap gap-1.5">
        {ALL_PRIORITIES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => { togglePriority(p); }}
            className="rounded-sm px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider transition-colors"
            style={
              activePriorities.has(p)
                ? {
                    backgroundColor: "var(--color-accent)",
                    color: "var(--color-accent-fg)",
                  }
                : {
                    backgroundColor: "var(--color-surface-sunken)",
                    color: "var(--color-muted)",
                  }
            }
          >
            {p}
          </button>
        ))}
      </div>

      {/* Node filter */}
      <select
        className="w-full rounded border border-[--color-border] bg-[--color-surface] px-2 py-1 text-sm text-[--color-fg] focus:outline-none focus-visible:ring-2 focus-visible:ring-[--color-accent]"
        value={filterNode}
        onChange={(e) => { setFilterNode(e.target.value); }}
      >
        <option value="">All nodes</option>
        {nodeIds.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-2 py-3 text-sm text-[--color-faint]">
            No open issues matching filters.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {visible.map((item, idx) => (
              <IssueRollupItem key={`${item.nodeId}-${String(idx)}`} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
