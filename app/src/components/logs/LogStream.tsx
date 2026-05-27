/**
 * LogStream — outer composition: header + filter bar + event list.
 *
 * Spec: 05-logs.md §Design > Layout
 */

import type { JSX } from "react";
import type { ConnectionStatus, LogEvent, Task } from "@/lib/types";
import type { LogEventKind } from "./logFiltersUtil";
import { LogStreamHeader } from "./LogStreamHeader";
import { LogFilters } from "./LogFilters";
import { LogEventList } from "./LogEventList";

interface LogStreamProps {
  task: Task;
  events: LogEvent[];
  connStatus: ConnectionStatus;
  reconnectVisible: boolean;
  queryPending: boolean;
}

export function LogStream({
  task,
  events,
  connStatus,
  reconnectVisible,
  queryPending,
}: LogStreamProps): JSX.Element {
  // Compute per-kind counts for filter chips
  const countByKind: Partial<Record<LogEventKind, number>> = {};
  for (const e of events) {
    countByKind[e.kind] = (countByKind[e.kind] ?? 0) + 1;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <LogStreamHeader
        task={task}
        eventCount={events.length}
        connStatus={connStatus}
        reconnectVisible={reconnectVisible}
        queryPending={queryPending}
      />
      <LogFilters countByKind={countByKind} />
      <LogEventList events={events} />
    </div>
  );
}
