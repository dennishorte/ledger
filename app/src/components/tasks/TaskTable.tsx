import { type JSX, useState, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TaskRow } from "@/components/tasks/TaskRow";
import { TaskInspector } from "@/components/tasks/TaskInspector";
import { useTaskGrouping } from "@/components/tasks/useTaskGrouping";
import { useShellStore } from "@/stores/shell";
import type { Task, TaskId, TaskStatus, TaskType } from "@/lib/types";

interface TaskTableProps {
  tasks: Task[];
  statusFilter: TaskStatus[];
  typeFilter: TaskType[];
  query: string;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Table body. Handles session grouping, collapse/expand, filtering, and
 * row-click → inspector. Column headers are also rendered here.
 *
 * Collapse default rules (04-tasks §Layout):
 *  - Default open when the session has ≥1 RUNNING child.
 *  - Default collapsed when the table > 50 tasks or session is older than 1 h.
 */
export function TaskTable({
  tasks,
  statusFilter,
  typeFilter,
  query,
}: TaskTableProps): JSX.Element {
  const groups = useTaskGrouping(tasks);
  const openInspector = useShellStore((s) => s.openInspector);
  const [selectedTaskId, setSelectedTaskId] = useState<TaskId | null>(null);
  const now = Date.now();
  const totalTasks = tasks.length;

  // Default collapsed state: collapsed when total > 50 OR session older than 1h
  // AND no RUNNING children. Sessions with RUNNING children default open.
  const defaultCollapsed = useCallback(
    (session: Task, children: Task[]): boolean => {
      const hasRunningChild = children.some((c) => c.status === "RUNNING");
      if (hasRunningChild) return false;
      if (totalTasks > 50) return true;
      const age = now - Date.parse(session.createdAt);
      return age > ONE_HOUR_MS;
    },
    [now, totalTasks],
  );

  const [collapsed, setCollapsed] = useState<Record<TaskId, boolean>>(() => {
    const initial: Record<TaskId, boolean> = {};
    for (const { session, children } of groups) {
      initial[session.id] = defaultCollapsed(session, children);
    }
    return initial;
  });

  const toggleCollapse = useCallback((sessionId: TaskId) => {
    setCollapsed((prev) => ({ ...prev, [sessionId]: !prev[sessionId] }));
  }, []);

  const handleRowClick = useCallback(
    (task: Task) => {
      setSelectedTaskId(task.id);
      openInspector(<TaskInspector task={task} allTasks={tasks} />);
    },
    [openInspector, tasks],
  );

  // Apply filters
  const filteredGroups = useMemo(() => {
    const lowerQ = query.toLowerCase();
    return groups.map(({ session, children }) => {
      const sessionVisible =
        statusFilter.includes(session.status) &&
        typeFilter.includes(session.type) &&
        (lowerQ === "" || session.title.toLowerCase().includes(lowerQ));

      const visibleChildren = children.filter(
        (c) =>
          statusFilter.includes(c.status) &&
          typeFilter.includes(c.type) &&
          (lowerQ === "" || c.title.toLowerCase().includes(lowerQ)),
      );

      return { session, children, sessionVisible, visibleChildren };
    });
  }, [groups, statusFilter, typeFilter, query]);

  const anyVisible = filteredGroups.some(
    ({ sessionVisible, visibleChildren }) =>
      sessionVisible || visibleChildren.length > 0,
  );

  if (!anyVisible) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-sm text-[color:var(--color-muted)]">
        No tasks match the current filters.
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-auto">
      {/* Column header */}
      <div
        role="row"
        className="flex items-center gap-2 border-b border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-muted)]"
      >
        {/* Spacer matching the leading cell in TaskRow */}
        <div className="w-4 shrink-0" />
        <div className="flex-1">Title</div>
        <div className="w-[130px] shrink-0">Type</div>
        <div className="w-[160px] shrink-0">Status</div>
        <div className="w-[110px] shrink-0">Agent</div>
        <div className="w-[70px] shrink-0 text-right">Dur.</div>
        <div className="w-[110px] shrink-0 text-right">Started</div>
      </div>

      {/* Rows */}
      <div role="rowgroup">
        {filteredGroups.map(
          ({ session, children, sessionVisible, visibleChildren }) => {
            if (!sessionVisible && visibleChildren.length === 0) return null;

            const isExpanded = !(collapsed[session.id] ?? false);
            const hasChildren = children.length > 0;

            const collapseBtn = hasChildren ? (
              <button
                type="button"
                className="flex h-4 w-4 items-center justify-center text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)]"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapse(session.id);
                }}
                aria-label={isExpanded ? "Collapse session" : "Expand session"}
                aria-expanded={isExpanded}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" aria-hidden />
                ) : (
                  <ChevronRight className="h-3 w-3" aria-hidden />
                )}
              </button>
            ) : null;

            return (
              <div key={session.id}>
                {/* Session row */}
                {sessionVisible && (
                  <TaskRow
                    task={session}
                    isSelected={selectedTaskId === session.id}
                    onClick={() => {
                      handleRowClick(session);
                    }}
                    now={now}
                    leadingCell={collapseBtn}
                  />
                )}

                {/* Child rows */}
                {isExpanded &&
                  visibleChildren.map((child) => (
                    <TaskRow
                      key={child.id}
                      task={child}
                      isChild
                      isSelected={selectedTaskId === child.id}
                      onClick={() => {
                        handleRowClick(child);
                      }}
                      now={now}
                    />
                  ))}
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}
