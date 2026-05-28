/**
 * Executor interface, RunnerHandle, noop built-in, and registry helpers.
 *
 * The registry is a Map<TaskType, Executor> owned by each Runner instance —
 * not a process-global — so tests can construct fresh runners without state bleed.
 *
 * Note: awaitHumanReview is NOT added to RunnerHandle in this sub-leaf.
 * That method lands in 03-hitl-gate. Adding it later is a non-breaking method addition.
 */

import type { Task, TaskId, TaskType, LogEvent } from "@ledger/parser";

export interface RunnerHandle {
  /** Append a non-status_change event (executor reports an artifact, tool call, etc.). */
  emit(taskId: TaskId, event: Omit<LogEvent, "id" | "taskId" | "seq" | "at">): LogEvent;
  /** Transition RUNNING → COMPLETE; emits status_change; triggers re-tick. */
  complete(taskId: TaskId): Task;
  /** Transition RUNNING → FAILED with rationale; emits status_change; triggers re-tick. */
  fail(taskId: TaskId, reason: string): Task;
  // Note: awaitHumanReview is added by 03-hitl-gate, not this sub-leaf.
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

export type ExecutorRegistry = Map<TaskType, Executor>;

export function createDefaultRegistry(): ExecutorRegistry {
  const registry = new Map<TaskType, Executor>();
  registry.set("noop", noopExecutor);
  return registry;
}
