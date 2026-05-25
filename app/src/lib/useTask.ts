/**
 * TanStack Query hook for fetching a single task + its log events.
 *
 * Returns `status: "missing"` when /api/transcripts/:id 404s.
 * See D11 for the graceful-degradation strategy.
 */

import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { LogEvent, Task, TaskId } from "./types.js";

export interface TaskDetail {
  task: Task;
  events: LogEvent[];
}

async function fetchTask(id: TaskId): Promise<TaskDetail | null> {
  const res = await fetch(`/api/transcripts/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
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
