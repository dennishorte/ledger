import type { JSX } from "react";
import { type NodeProps } from "@xyflow/react";
import { StatusChip } from "@/components/ui/StatusChip";
import type { DocSubtreeData } from "@/components/dag/useDagLayout";

/**
 * Subtree container whose header strip IS the parent node (D13).
 *
 * The dashed border continues to denote the subtree grouping; the solid
 * header strip carries the parent's status chip, id, and title so the
 * parent is no longer a separate floating doc tile. Children render inside
 * the box. Non-header area is pointer-events-none (click-inert) to match
 * the pre-v1.2 subtree behavior.
 *
 * Header click → onHeaderClick() → DagCanvas opens the inspector.
 */
export function DocSubtreeNode({ data }: NodeProps): JSX.Element {
  const { parentNode, onHeaderClick, depth } = data as DocSubtreeData;

  // Depth-based visual intensity so nested rects pop against their outer
  // enclosing rect when zoomed out. Outermost (depth 0) is a faint wash; each
  // nesting level steps up the surface-sunken opacity and switches the border
  // from `--color-border` to `--color-border-strong`. Capped so a hypothetical
  // 3rd nesting level wouldn't go fully opaque.
  const bgOpacity = Math.min(30 + depth * 40, 90);
  const backgroundColor = `color-mix(in oklch, var(--color-surface-sunken) ${String(bgOpacity)}%, transparent)`;
  const borderColorVar = depth === 0 ? "var(--color-border)" : "var(--color-border-strong)";

  return (
    <div
      className="pointer-events-none relative h-full w-full rounded-xl border border-dashed"
      style={{ backgroundColor, borderColor: borderColorVar }}
    >
      {/* Header strip — solid background, interactive */}
      <button
        type="button"
        onClick={onHeaderClick}
        className="pointer-events-auto absolute inset-x-0 top-0 flex cursor-pointer items-center gap-2 rounded-t-xl border-b border-dashed bg-[color:var(--color-surface-raised)] px-3 py-2 text-left transition-colors hover:bg-[color:var(--color-surface-sunken)]"
        style={{ borderColor: borderColorVar }}
      >
        <StatusChip status={parentNode.status} />
        <span className="font-mono text-[11px] text-[color:var(--color-muted)]">
          {parentNode.id}
        </span>
        {parentNode.title ? (
          <span className="truncate text-[11px] text-[color:var(--color-fg)]">
            {parentNode.title}
          </span>
        ) : null}
      </button>
    </div>
  );
}
