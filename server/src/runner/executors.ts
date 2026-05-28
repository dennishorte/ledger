/**
 * Executor interface, RunnerHandle, noop + human_review built-ins, and registry helpers.
 *
 * The registry is a Map<TaskType, Executor> owned by each Runner instance —
 * not a process-global — so tests can construct fresh runners without state bleed.
 *
 * awaitHumanReview was added by 03-hitl-gate. The handle method does NOT call
 * scheduleTick (D1): the task is now claim-holding-suspended and a tick wouldn't
 * re-dispatch it.
 */

import type { Task, TaskId, TaskType, LogEvent } from "@ledger/parser";

export interface RunnerHandle {
  /** Append a non-status_change event (executor reports an artifact, tool call, etc.). */
  emit(taskId: TaskId, event: Omit<LogEvent, "id" | "taskId" | "seq" | "at">): LogEvent;
  /** Transition RUNNING → COMPLETE; emits status_change; triggers re-tick. */
  complete(taskId: TaskId): Task;
  /** Transition RUNNING → FAILED with rationale; emits status_change; triggers re-tick. */
  fail(taskId: TaskId, reason: string): Task;
  /**
   * Transition RUNNING → AWAITING_HUMAN_REVIEW. Emits a status_change event
   * with no `reason` (the absence-of-reason is the default; the transition
   * IS the operator-facing signal). Claims remain held via the scheduler's
   * working-set query (02-scheduler D2). Does NOT call scheduleTick (D1).
   * v1 caller: the `human_review` executor only.
   */
  awaitHumanReview(taskId: TaskId): Task;
}

export interface Executor {
  /** Invoked by the scheduler when a task transitions PENDING/BLOCKED → RUNNING. */
  run(task: Task, handle: RunnerHandle): Promise<void> | void;
}

export const noopExecutor: Executor = {
  run(task, handle) {
    handle.complete(task.id);
  },
};

export const humanReviewExecutor: Executor = {
  run(task, handle) {
    handle.awaitHumanReview(task.id);
  },
};

export type ExecutorRegistry = Map<TaskType, Executor>;

export function createDefaultRegistry(): ExecutorRegistry {
  const registry = new Map<TaskType, Executor>();
  registry.set("noop", noopExecutor);
  registry.set("human_review", humanReviewExecutor);
  return registry;
}
