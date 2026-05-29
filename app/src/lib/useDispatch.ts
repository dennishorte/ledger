/**
 * TanStack Query mutation hook for POST /api/dispatch/:nodeId.
 *
 * On success: invalidates ["tasks"] so the new task appears in the list panel.
 * No setQueryData for the new task — Spec Review S3: the task is PENDING at
 * creation; by the time the operator navigates to it, the scheduler has likely
 * transitioned it to RUNNING, so seeding with the PENDING snapshot would cause
 * a "PENDING → RUNNING" flicker. The invalidate covers the in-panel watch case.
 *
 * On failure: throws a structured MutationErrorBody so callers can differentiate
 * 409 no_inferred_type from 404 node_not_found and from generic failures.
 *
 * Spec: docs/06-agent-dispatcher/05-dispatch-api.md §Design useDispatch hook
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MutationErrorBody } from "./useApproveTask.js";
import type { Task, NodeId, TaskType, ResourceClaim } from "./types.js";

export interface DispatchVariables {
  nodeId: NodeId;
  type?: TaskType;
  priority?: number;
  resourceClaims?: ResourceClaim[];
}

async function postDispatch(vars: DispatchVariables): Promise<{ task: Task }> {
  const { nodeId, ...body } = vars;
  const res = await fetch(`/api/dispatch/${encodeURIComponent(nodeId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody: unknown = await res.json().catch(() => undefined);
    throw new MutationErrorBody(res.status, errBody);
  }
  return res.json() as Promise<{ task: Task }>;
}

export function useDispatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postDispatch,
    onSuccess: () => {
      // No setQueryData for the new task (Spec Review S3 rationale):
      //   - The new task is PENDING on creation; by the time the operator
      //     clicks the toast link to navigate to it, the scheduler has
      //     likely already transitioned it to RUNNING (the scheduler ticks
      //     immediately after createTask).
      //   - Seeding the cache with the PENDING snapshot would cause the
      //     inspector to flash "PENDING" before refetching the live status.
      //   - The ["tasks"] list invalidation below covers the case where the
      //     operator stays in the Tasks panel and watches the new row appear.
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
