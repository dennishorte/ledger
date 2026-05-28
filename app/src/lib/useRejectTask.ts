/**
 * TanStack Query mutation hook for POST /api/tasks/:id/reject.
 *
 * On success: invalidates ["tasks"] and ["task", taskId].
 * On failure: throws MutationErrorBody (same shape as useApproveTask — D5).
 *
 * The `reason` field is required and non-empty. The UI enforces this via a
 * disabled Confirm button; the server 400s on empty reason if bypassed (D11).
 * followUp is deferred to a future enhancement (D9).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Task, TaskId } from "./types.js";
import { MutationErrorBody } from "./useApproveTask.js";

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
    onSuccess: (_data, { taskId }) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
  });
}
