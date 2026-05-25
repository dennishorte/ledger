import type { JSX } from "react";
import { Loader2, ListTodo, WifiOff } from "lucide-react";
import { useTaskList } from "@/lib/useTaskList";
import { TaskConsole } from "@/components/tasks/TaskConsole";
import { EmptyState } from "@/components/layout/EmptyState";

/**
 * Route shell for the Task Control Console (/tasks).
 *
 * Responsibility: call useTaskList(), branch on loading / error / empty / data.
 * All rendering is delegated to <TaskConsole />.
 *
 * Per 04-tasks §Data source (D11): useTaskList() returns [] on production
 * build (no middleware). When the array is empty, render the "run pnpm dev"
 * empty state specified in 10-orchestration D11.
 */
export default function TaskConsolePanel(): JSX.Element {
  const { data: tasks, isLoading, isError } = useTaskList();

  if (isLoading) {
    return (
      <EmptyState
        icon={Loader2}
        title="Loading tasks…"
        description="Fetching task list from the dev middleware."
      />
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={WifiOff}
        title="Could not load tasks."
        description="The dev middleware may not be running. Start with: pnpm -C app dev"
      />
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <EmptyState
        icon={ListTodo}
        title="No tasks found."
        description="Run pnpm dev to enable the orchestration middleware and surface tasks from Claude Code transcripts."
      />
    );
  }

  return <TaskConsole tasks={tasks} />;
}
