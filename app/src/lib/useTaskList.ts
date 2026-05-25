/**
 * TanStack Query hook for listing all tasks from the dev middleware.
 *
 * Returns `[]` when /api/transcripts 404s (production build, no middleware).
 * See D11 for the graceful-degradation strategy.
 */

import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { Task } from "./types.js";

async function fetchTaskList(): Promise<Task[]> {
  const res = await fetch("/api/transcripts");
  if (!res.ok) return [];
  const data = (await res.json()) as { tasks: Task[] };
  return data.tasks;
}

export function useTaskList(): UseQueryResult<Task[]> {
  return useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: fetchTaskList,
    staleTime: 5_000,
    retry: false,
  });
}
