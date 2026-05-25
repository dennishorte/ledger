/**
 * LogEventList — scroll container with auto-follow and event list rendering.
 *
 * Spec: 05-logs.md §Design > Event list
 */

import type { JSX } from "react";
import type { LogEvent } from "@/lib/types";
import { useAutoFollow } from "./useAutoFollow";
import { LogEventRow } from "./LogEventRow";
import { parseKindsFromParam } from "./logFiltersUtil";
import { useSearchParams } from "react-router";

interface LogEventListProps {
  events: LogEvent[];
}

export function LogEventList({ events }: LogEventListProps): JSX.Element {
  const [searchParams] = useSearchParams();
  const activeKinds = parseKindsFromParam(searchParams.get("kind"));

  // Apply kind filter
  const filtered =
    activeKinds.size === 0
      ? events
      : events.filter((e) => activeKinds.has(e.kind));

  const { ref, following, jumpToLatest } = useAutoFollow(filtered.length);

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={ref}
        className="h-full overflow-y-auto py-2"
        style={{ overscrollBehavior: "contain" }}
      >
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-xs text-[color:var(--color-faint)]">
            No events
          </div>
        ) : (
          filtered.map((event) => (
            <LogEventRow key={`${event.taskId}-${String(event.seq)}`} event={event} />
          ))
        )}
      </div>

      {/* Jump to latest button */}
      {!following && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={jumpToLatest}
            className="flex items-center gap-1.5 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] px-3 py-1.5 text-xs text-[color:var(--color-accent)] shadow-sm hover:bg-[color:var(--color-surface-sunken)] transition-colors"
          >
            Jump to latest ↓
          </button>
        </div>
      )}
    </div>
  );
}
