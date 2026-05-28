/**
 * TanStack Query mutation hook for POST /api/tasks/:id/approve.
 *
 * On success: response-based cache update for ["task", taskId] via
 * setQueryData (the inspector's HitlActions gate is `live?.task.status ===
 * "AWAITING_HUMAN_REVIEW"` — writing the post-transition task from the server
 * response flips the gate false atomically on the same render the mutation
 * resolves, eliminating the button flicker that fire-and-forget invalidation
 * caused in stage-8). The list query ["tasks"] is invalidated fire-and-forget
 * — the row update is the operator's secondary signal. The ["task", taskId]
 * query is also invalidated (background) so the events list refreshes from
 * the server (the mutation response carries only `{task}`, not events).
 *
 * On failure: throws a structured MutationErrorBody so the inspector can
 * differentiate 409 version_conflict / wrong_status from generic failures (D5).
 *
 * D12 (amended 2026-05-28, stage-8b): response-based setQueryData is allowed
 * — the server response is authoritative, no rollback path needed.
 * Speculative-optimistic updates are still avoided per the original D12.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Task, TaskId } from "./types.js";
import type { TaskDetail } from "./useTask.js";

export interface ApproveVariables {
  taskId: TaskId;
  dbRowVersion: number;
  note?: string;
}

/**
 * Structured mutation error carrying the HTTP status + parsed response body.
 * Re-exported so useRejectTask and TaskInspector can share the type (D5).
 * Hook-local concern — not promoted to @/lib/types.
 *
 * Extends Error so `throw` satisfies @typescript-eslint/only-throw-error.
 */
export class MutationErrorBody extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`HTTP ${String(status)}`);
    this.status = status;
    this.body = body;
  }
}

async function postApprove({
  taskId,
  dbRowVersion,
  note,
}: ApproveVariables): Promise<{ task: Task }> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      note !== undefined && note.length > 0
        ? { dbRowVersion, note }
        : { dbRowVersion },
    ),
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => undefined);
    throw new MutationErrorBody(res.status, body);
  }
  return res.json() as Promise<{ task: Task }>;
}

export function useApproveTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postApprove,
    onSuccess: (data, { taskId }) => {
      // Response-based cache update: write the post-transition task into the
      // inspector's cache so showHitlButtons flips false atomically.
      // Events are not in the response — left stale and refreshed by the
      // invalidate below.
      queryClient.setQueryData<TaskDetail | null>(
        ["task", taskId],
        (old) => (old ? { ...old, task: data.task } : old),
      );
      // Background refresh: list rows + inspector events.
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
  });
}
