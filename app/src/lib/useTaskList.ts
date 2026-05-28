/**
 * TanStack Query hook for listing all tasks from both data sources:
 * - /api/tasks (runner-emitted tasks)
 * - /api/transcripts (transcript-derived tasks)
 *
 * Both sources are fetched in parallel via Promise.allSettled and merged by
 * mergeTasks. Either source 404'ing degrades silently (returns []); non-404
 * errors propagate — a single 500 from either source causes isError. When
 * BOTH sources fail with non-404 errors, both reasons are included in the
 * thrown error. See D1 / D7 in the spec for design rationale.
 */

import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { Task, TaskId } from "./types.js";

async function fetchOne(url: string): Promise<Task[]> {
  const res = await fetch(url);
  // 404 = "source not available" — degrade silently (D7). The 404 is
  // consumed here as fulfilled([]) so Promise.allSettled below sees
  // `fulfilled`, not `rejected`. Non-404 errors throw and surface as
  // `rejected` in the caller's allSettled result (Spec Review S1 — explicit
  // comment so a future reader doesn't "fix" this to always throw).
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`${url}: ${String(res.status)}`);
  const data = (await res.json()) as { tasks: Task[] };
  return data.tasks;
}

/**
 * Merge runner and transcript task lists into a single deduplicated list
 * sorted by createdAt DESC. Runner tasks take precedence on ID collision
 * (structurally impossible under current ID schemes, but explicit per D8).
 *
 * Exported for the test file only — not part of the hook's public surface.
 */
export function mergeTasks(runnerTasks: Task[], transcriptTasks: Task[]): Task[] {
  const byId = new Map<TaskId, Task>();
  for (const t of transcriptTasks) byId.set(t.id, t);
  for (const t of runnerTasks) byId.set(t.id, t);
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function fetchTaskList(): Promise<Task[]> {
  const [runnerR, transcriptR] = await Promise.allSettled([
    fetchOne("/api/tasks"),
    fetchOne("/api/transcripts"),
  ]);

  // Non-404 errors from either source propagate as query errors (D7: non-404
  // errors propagate; Requirements: "errors other than 404 propagate").
  // If both failed, include both reasons. If one failed, surface that one.
  if (runnerR.status === "rejected" && transcriptR.status === "rejected") {
    throw new Error(
      `both task sources failed: runner=${String(runnerR.reason)}, ` +
        `transcript=${String(transcriptR.reason)}`,
    );
  }
  if (runnerR.status === "rejected") {
    throw runnerR.reason as Error;
  }
  if (transcriptR.status === "rejected") {
    throw transcriptR.reason as Error;
  }

  return mergeTasks(runnerR.value, transcriptR.value);
}

export function useTaskList(): UseQueryResult<Task[]> {
  return useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: fetchTaskList,
    staleTime: 5_000,
    retry: false,
  });
}
