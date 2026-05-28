/**
 * TanStack Query mutation hook for POST /api/tasks/:id/reject.
 *
 * On success: response-based cache update for ["task", taskId] via
 * setQueryData (same pattern as useApproveTask — atomic button-unmount via
 * showHitlButtons gate flipping on the new task.status). List invalidated
 * fire-and-forget; events refreshed via background ["task", taskId]
 * invalidate.
 *
 * On failure: throws MutationErrorBody (same shape as useApproveTask — D5).
 *
 * The `reason` field is required and non-empty. The UI enforces this via a
 * disabled Confirm button; the server 400s on empty reason if bypassed (D11).
 * followUp is deferred to a future enhancement (D9).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Task, TaskId } from "./types.js";
import { MutationErrorBody } from "./useApproveTask.js";
import type { TaskDetail } from "./useTask.js";

export type { MutationErrorBody } from "./useApproveTask.js";

export interface RejectVariables {
  taskId: TaskId;
  dbRowVersion: number;
  /** Required, non-empty. UI enforces; server 400s on empty. */
  reason: string;
}

async function postReject({
  taskId,
  dbRowVersion,
  reason,
}: RejectVariables): Promise<{ task: Task }> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dbRowVersion, reason }),
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => undefined);
    throw new MutationErrorBody(res.status, body);
  }
  return res.json() as Promise<{ task: Task }>;
}

export function useRejectTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postReject,
    onSuccess: (data, { taskId }) => {
      // Response-based cache update — see useApproveTask for rationale (D12
      // amended in stage-8b: response-based setQueryData is allowed).
      queryClient.setQueryData<TaskDetail | null>(
        ["task", taskId],
        (old) => (old ? { ...old, task: data.task } : old),
      );
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
  });
}
