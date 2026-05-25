import type { JSX } from "react";
import { TaskHeader } from "@/components/tasks/TaskHeader";
import { TaskFilters } from "@/components/tasks/TaskFilters";
import { TaskTable } from "@/components/tasks/TaskTable";
import { useTaskFilters } from "@/components/tasks/useTaskFilters";
import type { Task } from "@/lib/types";

interface TaskConsoleProps {
  tasks: Task[];
}

/**
 * Outer composition: header + filter bar + table.
 * Per 04-tasks §Layout — three stacked regions.
 * Filter state lives in URL search params (useTaskFilters / useSearchParams).
 */
export function TaskConsole({ tasks }: TaskConsoleProps): JSX.Element {
  const { filters, toggleStatus, toggleType, setQuery, clearFilters } =
    useTaskFilters();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TaskHeader tasks={tasks} />
      <TaskFilters
        filters={filters}
        toggleStatus={toggleStatus}
        toggleType={toggleType}
        setQuery={setQuery}
        clearFilters={clearFilters}
      />
      <div className="flex-1 overflow-auto">
        <TaskTable
          tasks={tasks}
          statusFilter={filters.statuses}
          typeFilter={filters.types}
          query={filters.query}
        />
      </div>
    </div>
  );
}
