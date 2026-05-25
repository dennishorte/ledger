import type { JSX } from "react";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Task } from "@/lib/types";

interface TaskHeaderProps {
  tasks: Task[];
}

/**
 * Header for the Task Console.
 * Shows the panel title, a refresh button, and a summary count chip.
 * Per 04-tasks §Layout: "[refresh] [25 tasks · 1 live]"
 */
export function TaskHeader({ tasks }: TaskHeaderProps): JSX.Element {
  const queryClient = useQueryClient();
  const liveCount = tasks.filter((t) => t.status === "RUNNING").length;

  function handleRefresh(): void {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }

  return (
    <div className="flex items-center justify-between border-b border-[color:var(--color-border-strong)] px-4 py-3">
      <h1 className="text-base font-semibold text-[color:var(--color-fg)]">
        Tasks
      </h1>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleRefresh}
          className="flex items-center gap-1 rounded border border-[color:var(--color-border)] px-2 py-1 text-xs text-[color:var(--color-muted)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-fg)]"
          title="Refresh task list"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          refresh
        </button>
        <span className="rounded-sm bg-[color:var(--color-surface-sunken)] px-2 py-1 font-mono text-xs text-[color:var(--color-muted)]">
          {tasks.length} task{tasks.length !== 1 ? "s" : ""}
          {liveCount > 0 && (
            <span className="ml-1 text-[color:var(--color-accent)]">
              · {liveCount} live
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
