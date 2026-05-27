/**
 * DepImpactWidget — node picker + affected-node list.
 *
 * Phase-1: doc-tree dependents only. Labeled clearly per D4.
 * Clicking a row navigates to /docs/:nodeId per D12.
 * Spec: docs/01-ui/06-health.md §Design > Dep-Impact Preview widget
 */

import { useState, useMemo } from "react";
import type { JSX } from "react";
import { useNavigate } from "react-router";
import type { DocNode, NodeId } from "@/lib/types";
import { StatusChip } from "@/components/ui/StatusChip";
import { computeDepImpact } from "@/lib/deriveHealth";

interface DepImpactWidgetProps {
  nodes: DocNode[];
}

export function DepImpactWidget({ nodes }: DepImpactWidgetProps): JSX.Element {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<NodeId>("");

  const authoredNodes = useMemo(
    () => nodes.filter((n) => n.authored).sort((a, b) => a.id.localeCompare(b.id)),
    [nodes],
  );

  const nodeById = useMemo(
    () => new Map<NodeId, DocNode>(nodes.map((n) => [n.id, n])),
    [nodes],
  );

  const affectedNodes = useMemo<DocNode[]>(() => {
    if (!selectedId) return [];
    const result = computeDepImpact(selectedId, nodes);
    return result.affectedNodeIds
      .map((id) => nodeById.get(id))
      .filter((n): n is DocNode => n !== undefined)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [selectedId, nodes, nodeById]);

  function handleRowClick(nodeId: NodeId): void {
    void navigate(`/docs/${encodeURIComponent(nodeId)}`);
  }

  function handleRowKeyDown(e: React.KeyboardEvent, nodeId: NodeId): void {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleRowClick(nodeId);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Node picker */}
      <select
        className="w-full rounded border border-[--color-border] bg-[--color-surface] px-2 py-1 text-sm text-[--color-fg] focus:outline-none focus-visible:ring-2 focus-visible:ring-[--color-accent]"
        value={selectedId}
        onChange={(e) => { setSelectedId(e.target.value); }}
      >
        <option value="">Select a node to preview impact…</option>
        {authoredNodes.map((n) => (
          <option key={n.id} value={n.id}>
            {n.id} — {n.title}
          </option>
        ))}
      </select>

      {/* Affected list */}
      <div className="flex-1 overflow-y-auto">
        {!selectedId ? null : affectedNodes.length === 0 ? (
          <p className="px-2 py-2 text-sm text-[--color-faint]">
            No downstream nodes depend on this node.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {affectedNodes.map((node) => (
              <div
                key={node.id}
                role="button"
                tabIndex={0}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[--color-surface-sunken]"
                onClick={() => { handleRowClick(node.id); }}
                onKeyDown={(e) => { handleRowKeyDown(e, node.id); }}
              >
                <span className="shrink-0 font-mono text-xs text-[--color-muted]">
                  {node.id}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-[--color-fg]">
                  {node.title}
                </span>
                <StatusChip status={node.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Phase-1 note */}
      <p className="text-xs text-[--color-faint]">
        Phase 1 — shows doc-tree dependents only. Task invalidation requires the task runner.
      </p>
    </div>
  );
}
