/**
 * TanStack Query hook for fetching a single task + its log events.
 *
 * Endpoint is selected by ID format (D2):
 * - id.includes(":") → /api/transcripts/:id  (transcript IDs: session:<uuid>, agent:<id>)
 * - else             → /api/tasks/:id         (runner IDs: bare UUIDv4)
 *
 * Returns null on 404 (task no longer exists / not yet visible).
 * Throws on non-404 errors so the query enters isError (Spec Review B1).
 */

import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { isRunnerTaskId } from "./types.js";
import type { LogEvent, Task, TaskId } from "./types.js";

export interface TaskDetail {
  task: Task;
  events: LogEvent[];
}

function pickEndpoint(id: TaskId): string {
  // Use the canonical isRunnerTaskId predicate (D2, 05-task-runner round-2).
  // Consolidates the colon-based invariant in one place; all call sites use
  // isRunnerTaskId rather than bare id.includes(":") checks.
  return isRunnerTaskId(id)
    ? `/api/tasks/${encodeURIComponent(id)}`
    : `/api/transcripts/${encodeURIComponent(id)}`;
}

async function fetchTask(id: TaskId): Promise<TaskDetail | null> {
  const res = await fetch(pickEndpoint(id));
  // Mirror useTaskList's 404-vs-5xx split (Spec Review B1): 404 → null
  // (task genuinely doesn't exist); other non-ok → throw so the query
  // enters isError instead of silently rendering "task no longer found"
  // during a server outage.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${pickEndpoint(id)}: ${String(res.status)}`);
  return res.json() as Promise<TaskDetail>;
}

export function useTask(id: TaskId): UseQueryResult<TaskDetail | null> {
  return useQuery<TaskDetail | null>({
    queryKey: ["task", id],
    queryFn: () => fetchTask(id),
    staleTime: 5_000,
    retry: false,
  });
}
