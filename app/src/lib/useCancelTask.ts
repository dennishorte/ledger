/**
 * TanStack Query mutation hook for POST /api/tasks/:id/cancel.
 *
 * On success: response-based cache update for ["task", taskId] via setQueryData
 * so the Cancel button visibility (gated on live?.task.status === "RUNNING")
 * flips false atomically on the same render the mutation resolves, eliminating
 * the button flicker that fire-and-forget invalidation caused in 05-task-runner/
 * 05-ui-hook-migration stage-8b. Mirrors useApproveTask's D12-amended pattern.
 *
 * On failure: throws a structured MutationErrorBody. Distinguishes
 * 409 no_subprocess from generic 409 so the UI can show a relevant message.
 *
 * Spec: docs/06-agent-dispatcher/05-dispatch-api.md §Design useCancelTask hook
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MutationErrorBody } from "./errors.js";
import type { Task, TaskId } from "./types.js";
import type { TaskDetail } from "./useTask.js";

export interface CancelVariables {
  taskId: TaskId;
  reason?: string;
}

async function postCancel({ taskId, reason }: CancelVariables): Promise<{ task: Task }> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reason !== undefined ? { reason } : {}),
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => undefined);
    throw new MutationErrorBody(res.status, body);
  }
  return res.json() as Promise<{ task: Task }>;
}

export function useCancelTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postCancel,
    onSuccess: (data, { taskId }) => {
      // Response-based cache update: write the post-transition task into the
      // inspector's cache so the Cancel button visibility (gated on
      // cancellable status) flips false atomically on the same render.
      // Mirrors useApproveTask's D12-amended pattern (05-task-runner/
      // 05-ui-hook-migration stage-8b loop-back).
      queryClient.setQueryData<TaskDetail | null>(
        ["task", taskId],
        (old) => (old ? { ...old, task: data.task } : old),
      );
      // Background refresh: list rows + inspector events. The events list
      // is not in the response — left stale and refreshed by the invalidate.
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
  });
}
