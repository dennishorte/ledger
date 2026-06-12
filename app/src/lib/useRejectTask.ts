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
 * `followUp` is optional — when present it is forwarded to the server's
 * POST /api/tasks/:id/reject body, which creates a follow-up task and returns
 * it as `followUpTask` in the response (03-hitl-gate D9).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Task, TaskId, TaskInput } from "./types.js";
import { MutationErrorBody } from "./useApproveTask.js";
import type { TaskDetail } from "./useTask.js";

export type { MutationErrorBody } from "./useApproveTask.js";

export interface RejectVariables {
  taskId: TaskId;
  dbRowVersion: number;
  /** Required, non-empty. UI enforces; server 400s on empty. */
  reason: string;
  /** Optional follow-up task to create on rejection (03-hitl-gate D9). */
  followUp?: TaskInput;
}

async function postReject({
  taskId,
  dbRowVersion,
  reason,
  followUp,
}: RejectVariables): Promise<{ task: Task; followUpTask?: Task }> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      followUp !== undefined
        ? { dbRowVersion, reason, followUp }
        : { dbRowVersion, reason },
    ),
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => undefined);
    throw new MutationErrorBody(res.status, body);
  }
  return res.json() as Promise<{ task: Task; followUpTask?: Task }>;
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
