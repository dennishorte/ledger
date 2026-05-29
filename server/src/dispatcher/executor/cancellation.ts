/**
 * Cancellation registry — Map<TaskId, Subprocess> populated on spawn,
 * cleared on exit. 05-dispatch-api's cancel route calls
 *   ctx.dispatchCancellation.lookup(taskId)?.kill("SIGTERM")
 * to deliver the cancel signal.
 *
 * The registry is exposed read-only via ProjectContext.dispatchCancellation.
 * The cancel route owns the eager-DB-write side; this leaf owns the
 * subprocess-handle map. Two-leaf coupling is intentional (D9).
 */

import type { Subprocess } from "execa";
import type { TaskId } from "@ledger/parser";

export interface CancellationRegistry {
  bind(taskId: TaskId, subprocess: Subprocess): void;
  unbind(taskId: TaskId): void;
  lookup(taskId: TaskId): Subprocess | undefined;
  size(): number;
}

export function createCancellationRegistry(): CancellationRegistry {
  const map = new Map<TaskId, Subprocess>();
  return {
    bind(taskId, subprocess) {
      map.set(taskId, subprocess);
    },
    unbind(taskId) {
      map.delete(taskId);
    },
    lookup(taskId) {
      return map.get(taskId);
    },
    size() {
      return map.size;
    },
  };
}
