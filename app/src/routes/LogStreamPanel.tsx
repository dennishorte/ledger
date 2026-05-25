/**
 * LogStreamPanel — route shell for /logs/:taskId.
 *
 * Thin shell: reads taskId from params, calls useLogStream + useTask,
 * delegates rendering to <LogStream>. Empty-state branches for missing task
 * and production build (no middleware).
 *
 * Spec: 05-logs.md §Design > File layout
 */

import type { JSX } from "react";
import { ScrollText, AlertTriangle } from "lucide-react";
import { useParams, Link } from "react-router";
import { EmptyState } from "@/components/layout/EmptyState";
import { useLogStream } from "@/lib/useLogStream";
import { useTask } from "@/lib/useTask";
import { LogStream } from "@/components/logs/LogStream";

export default function LogStreamPanel(): JSX.Element {
  const { taskId } = useParams<{ taskId: string }>();

  // Guard: taskId must be present (always true with the route definition).
  if (!taskId) {
    return (
      <EmptyState
        icon={ScrollText}
        title="No task ID in URL."
        description="Navigate to /logs/:taskId with a valid task ID."
      />
    );
  }

  return <LogStreamPanelInner taskId={taskId} />;
}

function LogStreamPanelInner({ taskId }: { taskId: string }): JSX.Element {
  const { events, status: connStatus, reconnectAttempt } = useLogStream(taskId);
  const taskQuery = useTask(taskId);
  const queryPending = taskQuery.status === "pending";

  // Missing task (404) — once query has settled
  if (!queryPending && (taskQuery.data === null || taskQuery.status === "error")) {
    // Check if this looks like a production build with no middleware
    if (connStatus === "missing" && typeof window !== "undefined") {
      const isLikelyNoMiddleware =
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1";

      if (isLikelyNoMiddleware) {
        return (
          <EmptyState
            icon={AlertTriangle}
            title="Log streaming unavailable."
            description="Run `pnpm dev` to enable the transcript middleware. Log streaming is not available in production builds."
            actions={
              <Link
                to="/tasks"
                className="text-sm text-[color:var(--color-accent)] hover:underline"
              >
                Back to tasks
              </Link>
            }
          />
        );
      }
    }

    return (
      <EmptyState
        icon={ScrollText}
        title="Task not found."
        description={`No task with ID "${taskId}" exists in the current scan.`}
        actions={
          <Link
            to="/tasks"
            className="text-sm text-[color:var(--color-accent)] hover:underline"
          >
            Back to tasks
          </Link>
        }
      />
    );
  }

  // Still loading — let useLogStream initialise; task data pending
  if (queryPending) {
    // Render a minimal loading state. The panel will fill in as the query resolves.
    // ConnectionPill's N1 mitigation handles the red-pill flash.
  }

  const task = taskQuery.data?.task;

  // No task data yet (still loading) — show a minimal shell
  if (!task) {
    return (
      <EmptyState
        icon={ScrollText}
        title="Loading…"
        description="Fetching task data."
      />
    );
  }

  return (
    <LogStream
      task={task}
      events={events}
      connStatus={connStatus}
      reconnectAttempt={reconnectAttempt}
      queryPending={queryPending}
    />
  );
}
