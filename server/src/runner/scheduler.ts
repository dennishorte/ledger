/**
 * Runner class + tick loop + orphan recovery.
 *
 * The Runner wraps a Store and drives the event-driven scheduler tick.
 * It owns an ExecutorRegistry and exposes RunnerHandle to executors.
 *
 * Re-entrancy pattern (D1): two booleans (`ticking`, `pending`) + a
 * do-while trampoline keep concurrent scheduleTick() calls from
 * growing the call stack. noop.run() calls handle.complete() synchronously
 * which calls scheduleTick() — the trampoline turns this into one more
 * iteration of the outer loop, not recursion.
 */

import type { Task, TaskId, TaskInput, LogEvent } from "@ledger/parser";
import type { Store } from "./store.js";
import type { Executor, ExecutorRegistry, RunnerHandle } from "./executors.js";
import { createDefaultRegistry } from "./executors.js";
import { conflicts } from "./conflict.js";
import type { EventBus } from "./events.js";
import { createEventBus } from "./events.js";

// ---------------------------------------------------------------------------
// Status-reason builders + constants (parent §Status reasons)
// ---------------------------------------------------------------------------

export const reasons = {
  blockedByDep: (depId: TaskId) => `blocked_by_dep:${depId}`,
  blockedByClaimConflict: (conflictingId: TaskId) =>
    `blocked_by_claim_conflict:${conflictingId}`,
  BLOCKED_NO_EXECUTOR: "blocked_no_executor",
  ORPHANED_ON_RESTART: "orphaned_on_restart",
  // HITL gate (03-hitl-gate). approvedWithNote + rejected both truncate at 80
  // chars for the status_change.reason field (which is for log-scanning, not
  // full content); the full rationale lives in the request body (approve note)
  // or in a kind=error detail event written before the status_change (reject).
  APPROVED: "approved",
  approvedWithNote: (note: string) => `approved: ${note.slice(0, 80)}`,
  rejected: (rationale: string) => `rejected: ${rationale.slice(0, 80)}`,
  // 03-claude-code-executor: dispatcher subprocess lifecycle reasons
  SUBPROCESS_EXIT_WITHOUT_TERMINAL_STATUS: "subprocess_exit_without_terminal_status",
  subprocessFailed: (tail: string) => `subprocess_failed:${tail.slice(0, 80)}`,
  // Watchdog (dispatcher-hang-issue.md): execa `timeout` elapsed → SIGTERM/SIGKILL.
  // The reconciler maps result.timedOut to this distinguishing reason so a hung
  // agent is no longer indistinguishable from a slow one, and its claim is freed.
  SUBPROCESS_TIMEOUT: "subprocess_timeout",
  // Idle watchdog (defect #2 companion): no stream-json output for `idleMs` →
  // killed. Distinct from subprocess_timeout (hard wall-clock cap) — idle fires
  // first and means "frozen", not "still working but slow".
  SUBPROCESS_IDLE: "subprocess_idle",
  CANCELLED_BY_OPERATOR: "cancelled_by_operator",
  // Defensive: pre-spawn failures (renderPrompt throw, writeMcpConfig fail,
  // claude binary not found). Distinct from subprocessFailed because no
  // subprocess was created (D10).
  executorInternalError: (msg: string) => `executor_internal_error:${msg.slice(0, 80)}`,
} as const;

// ---------------------------------------------------------------------------
// Runner interface (public surface)
// ---------------------------------------------------------------------------

export interface Runner {
  readonly store: Store;
  /** In-process pub/sub bus — subscribers are notified after every Store write. */
  readonly events: EventBus;
  /**
   * The shared RunnerHandle — exposed for the MCP tools layer (06-agent-dispatcher/02-runner-tools D9).
   * The same handle is passed to executors via run(task, handle).
   */
  readonly handle: RunnerHandle;
  /** Wraps store.createTask and triggers a scheduler tick. */
  createTask(input: TaskInput): Task;
  /** Registers an executor for a task type. Overwrites prior registration with a warning. */
  registerExecutor(type: Task["type"], exec: Executor): void;
  /** Triggers a scheduler tick. Idempotent under concurrent calls (trampoline). */
  tick(): void;
  /** Closes the underlying Store. */
  close(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRunner(
  store: Store,
  registry: ExecutorRegistry = createDefaultRegistry(),
  bus: EventBus = createEventBus(),
): Runner {
  let ticking = false;
  let pending = false;

  // One handle per Runner — handle methods are taskId-keyed and stateless, so
  // a singleton avoids per-dispatch allocation. (Spec Review S6, D15.)
  const handle: RunnerHandle = {
    emit(taskId: TaskId, event: Omit<LogEvent, "id" | "taskId" | "seq" | "at">): LogEvent {
      return store.appendEvent(taskId, event);
    },
    complete(taskId: TaskId): Task {
      const t = store.updateTaskStatus(taskId, { from: "RUNNING", to: "COMPLETE" });
      scheduleTick();
      return t;
    },
    fail(taskId: TaskId, reason: string): Task {
      const t = store.updateTaskStatus(taskId, { from: "RUNNING", to: "FAILED", reason });
      scheduleTick();
      return t;
    },
    awaitHumanReview(taskId: TaskId): Task {
      // Deliberately NO scheduleTick — the task is now suspended in a
      // claim-holding state; a tick would not re-dispatch it. (03-hitl-gate D1.)
      return store.updateTaskStatus(taskId, {
        from: "RUNNING",
        to: "AWAITING_HUMAN_REVIEW",
      });
    },
  };

  function scheduleTick(): void {
    if (ticking) {
      pending = true;
      return;
    }
    ticking = true;
    try {
      do {
        pending = false;
        tickOnce();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      } while (pending);
    } finally {
      ticking = false;
    }
  }

  function tickOnce(): void {
    // Step 1: Load tasks that hold claims (RUNNING ∪ AWAITING_HUMAN_REVIEW).
    // D2: both statuses, even though 02-scheduler never produces AWAITING_HUMAN_REVIEW.
    const inFlight: Task[] = store.listTasks({
      status: ["RUNNING", "AWAITING_HUMAN_REVIEW"],
    });

    // Step 2: Load PENDING/BLOCKED rows in dispatch order.
    const candidates = store.listPendingEligible();
    if (candidates.length === 0) return;

    // Step 3: Evaluate each candidate.
    for (const task of candidates) {
      const blockedReason = evaluate(task, inFlight);
      if (blockedReason === null) {
        // Eligible — check executor.
        const exec = registry.get(task.type);
        if (exec === undefined) {
          // Step 5: blocked_no_executor. Symmetric reason-equality guard (Spec Review B1):
          // do NOT emit a redundant status_change if the task is already BLOCKED
          // with this reason (mirrors step 6's guard for dep/conflict reasons).
          if (
            task.status !== "BLOCKED" ||
            lastReason(task.id) !== reasons.BLOCKED_NO_EXECUTOR
          ) {
            store.updateTaskStatus(task.id, {
              from: task.status,
              to: "BLOCKED",
              reason: reasons.BLOCKED_NO_EXECUTOR,
            });
          }
          continue;
        }

        // Step 4: dispatch.
        const running = store.updateTaskStatus(task.id, {
          from: task.status,
          to: "RUNNING",
        });
        dispatch(running, exec);

        // Step 7: loop back to step 1 — each tickOnce dispatches at most one task
        // before yielding. Setting pending=true and returning causes the outer
        // do-while to call tickOnce again. (Spec Review S3.)
        pending = true;
        return;
      }

      // Step 6: this row is blocked. Persist reason only if it changed (D9).
      if (task.status !== "BLOCKED" || lastReason(task.id) !== blockedReason) {
        store.updateTaskStatus(task.id, {
          from: task.status,
          to: "BLOCKED",
          reason: blockedReason,
        });
      }
    }
    // All candidates evaluated; none dispatched. Yield.
  }

  function evaluate(task: Task, inFlight: Task[]): string | null {
    // Dep-met check (first failing dep wins precedence over conflict check). (D spec §Reason precedence)
    for (const depId of task.dependsOn) {
      const depStatus = store.getStatus(depId);
      if (depStatus !== "COMPLETE") return reasons.blockedByDep(depId);
    }
    // Conflict check against in-flight working set.
    for (const inflight of inFlight) {
      if (conflicts(task.resourceClaims, inflight.resourceClaims)) {
        return reasons.blockedByClaimConflict(inflight.id);
      }
    }
    return null;
  }

  function dispatch(task: Task, exec: Executor): void {
    try {
      const result = exec.run(task, handle);
      if (result instanceof Promise) {
        result.catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          // Re-check status — executor may have already completed/failed before throwing.
          if (store.getStatus(task.id) === "RUNNING") {
            store.updateTaskStatus(task.id, {
              from: "RUNNING",
              to: "FAILED",
              reason: `executor_error: ${msg}`,
            });
            // Spec Review B2: symmetric with the sync branch — newly-eligible downstream
            // tasks must be re-evaluated after an async failure.
            scheduleTick();
          }
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (store.getStatus(task.id) === "RUNNING") {
        store.updateTaskStatus(task.id, {
          from: "RUNNING",
          to: "FAILED",
          reason: `executor_error: ${msg}`,
        });
        // Spec Review B2: call scheduleTick() after the FAILED transition so
        // downstream tasks that depend on this task get re-evaluated.
        scheduleTick();
      }
    }
  }

  // Helper: the most recent status_change event's reason for a task.
  // getEvents returns ASC by seq (verified store.ts:204-206); walk back-to-front.
  function lastReason(taskId: TaskId): string | undefined {
    const events = store.getEvents(taskId);
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (ev === undefined) continue;
      if (ev.kind === "status_change") {
        return ev.reason;
      }
    }
    return undefined;
  }

  return {
    store,
    events: bus,
    handle,
    createTask(input: TaskInput): Task {
      const task = store.createTask(input);
      scheduleTick();
      return task;
    },
    registerExecutor(type: Task["type"], exec: Executor): void {
      if (registry.has(type)) {
        console.warn(`runner: overwriting executor for type ${type}`);
      }
      registry.set(type, exec);
    },
    tick: scheduleTick,
    close(): void {
      store.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Orphan recovery (D5 — standalone function, not a Runner method)
// ---------------------------------------------------------------------------

/**
 * Scan for RUNNING tasks and transition them to FAILED with reason
 * `orphaned_on_restart`. AWAITING_HUMAN_REVIEW rows are left untouched —
 * they re-enter the suspended state on next boot per parent §HITL gate.
 * BLOCKED/PENDING rows are also left — the first tick re-evaluates them.
 */
export function recoverOrphans(store: Store): { recovered: number } {
  const orphans = store.listTasks({ status: ["RUNNING"] });
  for (const task of orphans) {
    store.updateTaskStatus(task.id, {
      from: "RUNNING",
      to: "FAILED",
      reason: reasons.ORPHANED_ON_RESTART,
    });
  }
  return { recovered: orphans.length };
}
