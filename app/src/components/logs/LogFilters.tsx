/**
 * LogFilters — kind chip-group with URL-synced state.
 *
 * Spec: 05-logs.md §Design > Filter bar interaction
 *
 * The `reasoning` chip covers both subkind "thinking" and "message" (N2).
 * Filter state is synced via useSearchParams (D4).
 */

import type { JSX } from "react";
import { useSearchParams } from "react-router";
import { cn } from "@/lib/cn";
import { ALL_KINDS, parseKindsFromParam } from "./logFiltersUtil";
import type { LogEventKind } from "./logFiltersUtil";

export type { LogEventKind } from "./logFiltersUtil";

const CHIP_LABELS: Record<LogEventKind, string> = {
  reasoning: "reasoning",
  tool_call: "tool_call",
  tool_result: "tool_result",
  artifact: "artifact",
  status_change: "status",
  error: "error",
};

interface LogFiltersProps {
  /** Total count per kind (for display, optional). */
  countByKind?: Partial<Record<LogEventKind, number>>;
}

export function LogFilters({ countByKind }: LogFiltersProps): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse active kinds from URL. Empty = all visible.
  const activeKinds = parseKindsFromParam(searchParams.get("kind"));

  function isActive(kind: LogEventKind): boolean {
    return activeKinds.size === 0 || activeKinds.has(kind);
  }

  function toggle(kind: LogEventKind): void {
    const next = new Set(activeKinds.size === 0 ? ALL_KINDS : activeKinds);
    if (next.has(kind)) {
      next.delete(kind);
    } else {
      next.add(kind);
    }
    // If all are selected, remove the param entirely (canonical "all on" state).
    const newParams = new URLSearchParams(searchParams);
    if (next.size === 0 || next.size === ALL_KINDS.length) {
      newParams.delete("kind");
    } else {
      newParams.set("kind", Array.from(next).join(","));
    }
    setSearchParams(newParams, { replace: true });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] px-4 py-2">
      <span className="text-xs text-[color:var(--color-muted)] mr-1">Kinds:</span>
      {ALL_KINDS.map((kind) => {
        const active = isActive(kind);
        const count = countByKind?.[kind];
        return (
          <button
            key={kind}
            type="button"
            onClick={() => {
              toggle(kind);
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-mono transition-colors",
              active
                ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)] text-[color:var(--color-accent-fg)]"
                : "border-[color:var(--color-border)] bg-transparent text-[color:var(--color-muted)] hover:border-[color:var(--color-accent)]",
            )}
            aria-pressed={active}
          >
            {CHIP_LABELS[kind]}
            {count !== undefined && (
              <span className="opacity-70">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
