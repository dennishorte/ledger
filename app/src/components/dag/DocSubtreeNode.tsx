import type { JSX } from "react";
import { type NodeProps } from "@xyflow/react";
import type { DocSubtreeData } from "@/components/dag/useDagLayout";

/**
 * Non-interactive background rectangle behind a parent's children.
 *
 * 02-dag D11: hierarchy is shown as spatial grouping, not edges. The parent
 * doc node itself sits separately above; this rect frames the children.
 */
export function DocSubtreeNode({ data }: NodeProps): JSX.Element {
  const { label, title } = data as DocSubtreeData;
  return (
    <div
      className="pointer-events-none relative h-full w-full rounded-xl border border-dashed border-[color:var(--color-border)]"
      style={{
        backgroundColor: "color-mix(in oklch, var(--color-surface-sunken) 60%, transparent)",
      }}
    >
      <div className="absolute left-3 top-2 flex items-baseline gap-2">
        <span className="font-mono text-[10px] text-[color:var(--color-faint)]">
          {label}
        </span>
        {title ? (
          <span className="text-[10px] italic text-[color:var(--color-muted)]">
            {title}
          </span>
        ) : null}
      </div>
    </div>
  );
}
