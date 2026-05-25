import { type ChangeEvent, type JSX, useRef, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ALL_TASK_STATUSES,
  ALL_TASK_TYPES,
} from "@/components/tasks/useTaskFilters";
import type { TaskFilters, UseTaskFiltersReturn } from "@/components/tasks/useTaskFilters";
import type { TaskStatus, TaskType } from "@/lib/types";
import { TaskStatusChip } from "@/components/tasks/TaskStatusChip";

interface TaskFiltersProps {
  filters: TaskFilters;
  toggleStatus: UseTaskFiltersReturn["toggleStatus"];
  toggleType: UseTaskFiltersReturn["toggleType"];
  setQuery: UseTaskFiltersReturn["setQuery"];
  clearFilters: UseTaskFiltersReturn["clearFilters"];
}

/**
 * Filter bar: status multi-select chips, type multi-select chips, search input.
 *
 * All chips are always rendered. Inactive chips are dimmed (opacity-35).
 * Clicking a chip toggles it. URL is the canonical state (useTaskFilters).
 *
 * Per 04-tasks §Filter bar interaction and D6.
 */
export function TaskFilters({
  filters,
  toggleStatus,
  toggleType,
  setQuery,
  clearFilters,
}: TaskFiltersProps): JSX.Element {
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQueryChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        setQuery(value);
      }, 200);
    },
    [setQuery],
  );

  const allStatusesOn = filters.statuses.length === ALL_TASK_STATUSES.length;
  const allTypesOn = filters.types.length === ALL_TASK_TYPES.length;
  const hasActiveFilters = !allStatusesOn || !allTypesOn || filters.query !== "";

  return (
    <div className="flex flex-col gap-2 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] px-3 py-2">
      {/* Status row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-muted)] w-12 shrink-0">
          Status
        </span>
        {ALL_TASK_STATUSES.map((status) => (
          <StatusFilterChip
            key={status}
            status={status}
            active={filters.statuses.includes(status)}
            onToggle={toggleStatus}
          />
        ))}
      </div>

      {/* Type row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-muted)] w-12 shrink-0">
          Type
        </span>
        {ALL_TASK_TYPES.map((type) => (
          <TypeFilterChip
            key={type}
            type={type}
            active={filters.types.includes(type)}
            onToggle={toggleType}
          />
        ))}
      </div>

      {/* Search row */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-muted)] w-12 shrink-0">
          Search
        </span>
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            defaultValue={filters.query}
            onChange={handleQueryChange}
            placeholder="Filter by title…"
            className="w-full rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-xs text-[color:var(--color-fg)] placeholder:text-[color:var(--color-faint)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          )}
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[10px] text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] underline"
          >
            clear all
          </button>
        )}
      </div>
    </div>
  );
}

function StatusFilterChip({
  status,
  active,
  onToggle,
}: {
  status: TaskStatus;
  active: boolean;
  onToggle: (s: TaskStatus) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => {
        onToggle(status);
      }}
      className={cn("transition-opacity", active ? "opacity-100" : "opacity-35")}
      title={active ? `Hide ${status}` : `Show ${status}`}
    >
      <TaskStatusChip status={status} />
    </button>
  );
}

function TypeFilterChip({
  type,
  active,
  onToggle,
}: {
  type: TaskType;
  active: boolean;
  onToggle: (t: TaskType) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => {
        onToggle(type);
      }}
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-[1px] font-mono text-[10px] lowercase tracking-wide transition-opacity",
        active ? "opacity-100" : "opacity-35",
      )}
      style={{
        backgroundColor: "var(--color-surface-sunken)",
        color: "var(--color-fg)",
      }}
    >
      {type}
    </button>
  );
}
