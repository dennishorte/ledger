/**
 * TanStack Query mutation hook for POST /api/tasks/:id/approve.
 *
 * On success: invalidates ["tasks"] and ["task", taskId] so the inspector +
 * row list reflect the new COMPLETE status within one render cycle.
 *
 * On failure: throws a structured MutationErrorBody so the inspector can
 * differentiate 409 version_conflict / wrong_status from generic failures (D5).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Task, TaskId } from "./types.js";

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
    onSuccess: (_data, { taskId }) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
  });
}
