/**
 * LogStreamHeader — sticky header for the log stream panel.
 *
 * Shows: back link, task title, status chip, connection pill,
 * agent model/persona, event count, duration.
 *
 * Spec: 05-logs.md §Design > Layout
 */

import type { JSX } from "react";
import { Link } from "react-router";
import { ChevronLeft } from "lucide-react";
import type { ConnectionStatus, Task } from "@/lib/types";
import { ConnectionPill } from "./ConnectionPill";
import { formatDuration } from "@/lib/formatDuration";
import { TaskStatusChip } from "@/components/tasks/TaskStatusChip";

interface LogStreamHeaderProps {
  task: Task;
  eventCount: number;
  connStatus: ConnectionStatus;
  reconnectAttempt: number;
  queryPending: boolean;
}

export function LogStreamHeader({
  task,
  eventCount,
  connStatus,
  reconnectAttempt,
  queryPending,
}: LogStreamHeaderProps): JSX.Element {
  const duration = formatDuration(task.startedAt, task.completedAt);

  return (
    <header
      className="sticky top-0 z-10 border-b border-[color:var(--color-border)] px-6 py-3"
      style={{ backgroundColor: "var(--color-surface-raised)" }}
    >
      {/* Back link */}
      <Link
        to="/tasks"
        className="mb-2 inline-flex items-center gap-1 text-xs text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] transition-colors"
      >
        <ChevronLeft className="h-3 w-3" aria-hidden />
        Back to tasks
      </Link>

      {/* ID + status + connection pill */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-[color:var(--color-muted)]">
          {task.id}
        </span>
        <TaskStatusChip status={task.status} />
        <ConnectionPill
          status={connStatus}
          reconnectAttempt={reconnectAttempt}
          queryPending={queryPending}
        />
      </div>

      {/* Title */}
      <h1 className="mt-0.5 text-base font-semibold text-[color:var(--color-fg)]">
        {task.title}
      </h1>

      {/* Meta row */}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[color:var(--color-muted)]">
        {task.agent && (
          <span>
            {task.agent.model}
            {task.agent.persona && ` · persona: ${task.agent.persona}`}
          </span>
        )}
        {duration !== "—" && <span>{duration}</span>}
        <span>{eventCount} events</span>
      </div>
    </header>
  );
}
