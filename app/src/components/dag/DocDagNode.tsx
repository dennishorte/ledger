import type { JSX } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { StatusChip } from "@/components/ui/StatusChip";
import type { DocNodeData } from "@/components/dag/useDagLayout";
import { cn } from "@/lib/cn";

/**
 * Custom React Flow node for a project document node.
 *
 * Dashed border + muted fill when the node is manifest-only (no authored
 * doc yet), per 02-dag D3.
 */
export function DocDagNode({
  data,
  selected,
}: NodeProps): JSX.Element {
  const { node } = data as DocNodeData;
  const isPlanned = !node.authored;

  return (
    <div
      className={cn(
        "w-[240px] rounded-md border bg-[color:var(--color-surface-raised)] px-3 py-2 text-left shadow-sm transition-colors",
        isPlanned
          ? "border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-sunken)]"
          : "border-[color:var(--color-border-strong)]",
        selected && "ring-2 ring-[color:var(--color-accent)] ring-offset-1 ring-offset-[color:var(--color-surface)]",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-px !w-px !min-h-0 !min-w-0 !border-none !bg-transparent !opacity-0"
        isConnectable={false}
      />
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "truncate font-mono text-[11px]",
            isPlanned ? "text-[color:var(--color-faint)]" : "text-[color:var(--color-muted)]",
          )}
          title={node.id}
        >
          {node.id}
        </span>
        <StatusChip status={node.status} />
      </div>
      <div
        className={cn(
          "mt-1 truncate text-sm",
          isPlanned ? "text-[color:var(--color-muted)] italic" : "text-[color:var(--color-fg)]",
        )}
        title={node.title}
      >
        {node.title}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-px !w-px !min-h-0 !min-w-0 !border-none !bg-transparent !opacity-0"
        isConnectable={false}
      />
    </div>
  );
}
