/**
 * DocsTree — hierarchical index of all DocNodes for the /docs route.
 *
 * Renders every authored and manifest-only node as a nested list, one row
 * per node, with indent by depth, monospaced id, plain title, and a
 * StatusChip. Each row links to /docs/<encoded-id>.
 *
 * PLANNED-status rows are rendered muted/dashed to match their DAG appearance.
 *
 * Spec: docs/01-ui/03-docs.md §Design > Routes & layout (/docs)
 */

import type { JSX } from "react";
import { Link } from "react-router";
import type { DocNode, NodeId } from "@/lib/types";
import { loadDocNodes } from "@/lib/parseDocs";
import { StatusChip } from "@/components/dag/StatusChip";
import { EmptyState } from "@/components/layout/EmptyState";
import { FileText } from "lucide-react";

// ── Data ───────────────────────────────────────────────────────────────────

const allNodes: DocNode[] = loadDocNodes();

// Build parent-to-children map (sorted by id for stable display order).
function buildTree(nodes: DocNode[]): Map<NodeId | null, DocNode[]> {
  const map = new Map<NodeId | null, DocNode[]>();
  for (const node of nodes) {
    const key = node.parentId;
    const siblings = map.get(key) ?? [];
    siblings.push(node);
    map.set(key, siblings);
  }
  // Sort each sibling list by id for deterministic order.
  for (const children of map.values()) {
    children.sort((a, b) => a.id.localeCompare(b.id));
  }
  return map;
}

const treeMap = buildTree(allNodes);

// ── Sub-components ─────────────────────────────────────────────────────────

interface TreeRowProps {
  node: DocNode;
  depth: number;
  isLastSibling: boolean;
  childMap: Map<NodeId | null, DocNode[]>;
}

function TreeRow({
  node,
  depth,
  isLastSibling,
  childMap,
}: TreeRowProps): JSX.Element {
  const isPlanned = node.status === "PLANNED";
  const children = childMap.get(node.id) ?? [];
  const lastIdx = children.length - 1;

  return (
    <>
      <li>
        <Link
          to={`/docs/${encodeURIComponent(node.id)}`}
          style={{ paddingLeft: `${String(depth * 1.25)}rem` }}
          className={[
            "flex items-center gap-3 rounded px-3 py-1.5 text-sm transition-colors",
            "hover:bg-[color:var(--color-surface-sunken)]",
            isPlanned
              ? "text-[color:var(--color-muted)]"
              : "text-[color:var(--color-fg)]",
          ].join(" ")}
        >
          {/* Indent leader: ├─ for non-last siblings, └─ for the last */}
          {depth > 0 && (
            <span
              className="select-none font-mono text-[color:var(--color-faint)]"
              aria-hidden
            >
              {isLastSibling ? "└─" : "├─"}
            </span>
          )}

          {/* Node id — monospaced */}
          <span
            className={[
              "font-mono text-xs shrink-0",
              isPlanned
                ? "text-[color:var(--color-faint)]"
                : "text-[color:var(--color-muted)]",
            ].join(" ")}
          >
            {node.id}
          </span>

          {/* Title */}
          <span
            className={[
              "flex-1 truncate",
              isPlanned ? "italic" : "",
            ].join(" ")}
          >
            {node.title}
          </span>

          {/* Status chip */}
          <StatusChip status={node.status} />
        </Link>
      </li>

      {/* Recurse for children */}
      {children.map((child, idx) => (
        <TreeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          isLastSibling={idx === lastIdx}
          childMap={childMap}
        />
      ))}
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function DocsTree(): JSX.Element {
  const roots = treeMap.get(null) ?? [];

  if (roots.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No documents found."
        description="The docs/ tree appears here once docs are added."
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div
        className="border-b border-[color:var(--color-border)] px-6 py-4"
        style={{ backgroundColor: "var(--color-surface-raised)" }}
      >
        <h1 className="text-base font-semibold text-[color:var(--color-fg)]">
          Documents
        </h1>
        <p className="mt-0.5 text-xs text-[color:var(--color-muted)]">
          {allNodes.length} node{allNodes.length !== 1 ? "s" : ""} — authored
          and manifest-only
        </p>
      </div>

      {/* Tree list */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5 list-none p-0 m-0">
          {roots.map((root, idx) => (
            <TreeRow
              key={root.id}
              node={root}
              depth={0}
              isLastSibling={idx === roots.length - 1}
              childMap={treeMap}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
