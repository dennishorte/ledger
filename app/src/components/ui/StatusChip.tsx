import type { JSX } from "react";
import type { NodeStatus } from "@/lib/types";
import { cn } from "@/lib/cn";
import { STATUS_STYLES } from "@/components/ui/statusColors";

interface StatusChipProps {
  status: NodeStatus;
  className?: string;
}

export function StatusChip({ status, className }: StatusChipProps): JSX.Element {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-wider",
        className,
      )}
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
