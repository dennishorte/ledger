import type { JSX, ReactNode } from "react";
import { TaskStatusChip } from "@/components/tasks/TaskStatusChip";
import { TaskTypeBadge } from "@/components/tasks/TaskTypeBadge";
import { formatDuration, formatRelativeTime } from "@/lib/formatDuration";
import type { Task } from "@/lib/types";

interface TaskRowProps {
  task: Task;
  isChild?: boolean;
  isSelected: boolean;
  onClick: () => void;
  now: number;
  /** Optional leading cell content (collapse toggle for session rows). */
  leadingCell?: ReactNode;
}

/**
 * Single task row in the TaskTable. Handles both session (root) and
 * child (sub-agent) rows. Child rows indent and show the └─ leader.
 *
 * Columns: [leading 16px] | Title | Type | Status | Agent | Duration | Started
 * The "leading" slot is used by the session row for the collapse chevron.
 * Per 04-tasks N1 — no Source column in the table.
 */
export function TaskRow({
  task,
  isChild = false,
  isSelected,
  onClick,
  now,
  leadingCell,
}: TaskRowProps): JSX.Element {
  const agent = task.agent?.persona ?? task.agent?.model ?? "—";
  const duration = formatDuration(task.startedAt, task.completedAt, now);
  const started = formatRelativeTime(task.startedAt ?? task.createdAt, now);

  return (
    <div
      role="row"
      aria-selected={isSelected}
      onClick={onClick}
      className="flex cursor-pointer items-center gap-2 border-b border-[color:var(--color-border)] px-3 py-2 text-sm transition-colors hover:bg-[color:var(--color-surface-sunken)]"
      style={{
        backgroundColor: isSelected ? "var(--color-accent-soft)" : undefined,
      }}
    >
      {/* Leading cell — 16px — collapse toggle for sessions, spacer for children */}
      <div className="w-4 shrink-0">
        {leadingCell ?? null}
      </div>

      {/* Title — flex-1 */}
      <div
        className="flex min-w-0 flex-1 items-center gap-1"
        style={{ paddingLeft: isChild ? "24px" : "0px" }}
      >
        {isChild && (
          <span
            className="shrink-0 select-none font-mono text-xs text-[color:var(--color-faint)]"
            aria-hidden
          >
            └─
          </span>
        )}
        <span
          className="truncate text-sm text-[color:var(--color-fg)]"
          title={task.title}
        >
          {task.title}
        </span>
      </div>

      {/* Type — 130px */}
      <div className="w-[130px] shrink-0">
        <TaskTypeBadge type={task.type} />
      </div>

      {/* Status — 160px */}
      <div className="w-[160px] shrink-0">
        <TaskStatusChip status={task.status} />
      </div>

      {/* Agent — 110px */}
      <div
        className="w-[110px] shrink-0 truncate font-mono text-xs text-[color:var(--color-muted)]"
        title={agent}
      >
        {agent}
      </div>

      {/* Duration — 70px */}
      <div className="w-[70px] shrink-0 text-right font-mono text-xs text-[color:var(--color-muted)]">
        {duration}
      </div>

      {/* Started — 110px */}
      <div className="w-[110px] shrink-0 text-right font-mono text-xs text-[color:var(--color-muted)]">
        {started}
      </div>
    </div>
  );
}
