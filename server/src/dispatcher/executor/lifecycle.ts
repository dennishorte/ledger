/**
 * Pure exit-code → task-status lifecycle reconciliation.
 *
 * Isolated from subprocess management so every lifecycle row is unit-testable
 * with synthetic (exit, finalStatus) inputs (D4).
 *
 * Row evaluation order (Spec Review B2 fix):
 *   0  final === undefined  → task row gone; no-op
 *   4  final === "CANCELLED" → cancel route already wrote CANCELLED; honour it
 *   1  exitCode === 0 AND final ∈ TERMINAL → success; no-op
 *   2  exitCode === 0 AND final === "RUNNING" → agent forgot terminal call; fail
 *   3+5 catch-all (any other exit with final === "RUNNING") → subprocess failed
 */

import type { Task, TaskStatus } from "@ledger/parser";
import type { RunnerHandle } from "../../runner/executors.js";
import { reasons } from "../../runner/scheduler.js";

const TERMINAL: ReadonlySet<TaskStatus> = new Set([
  "COMPLETE",
  "FAILED",
  "AWAITING_HUMAN_REVIEW",
]);

/**
 * Structural subset of execa's Result<OptionsType> — only the three fields
 * reconcileExit reads. Using a structural type instead of the generic
 * Result<OptionsType> avoids inference-union issues with stderr under
 * noUncheckedIndexedAccess + strict (Spec Review S3, Briefing §9).
 */
export type ExitResult = {
  exitCode?: number | undefined;
  signal?: string | undefined;
  stderr?: string | undefined;
};

export function reconcileExit(
  task: Task,
  result: ExitResult,
  final: TaskStatus | undefined,
  handle: RunnerHandle,
): void {
  // Row 0: task row gone (test cleanup, future GC); nothing to transition.
  if (final === undefined) return;

  // Row 4 (checked FIRST — Spec Review B2): cancel route eagerly wrote
  // CANCELLED before delivering SIGTERM. Honour it regardless of how the
  // subprocess exited (clean exit, SIGTERM, SIGKILL, non-zero code).
  if (final === "CANCELLED") return;

  // Row 1: agent called complete_task / fail_task / await_human_review and
  // the subprocess exited cleanly. Nothing more to do.
  if (result.exitCode === 0 && TERMINAL.has(final)) return;

  // Row 2: subprocess exited 0 but the agent forgot to call a terminal MCP
  // tool. Fail the task with a descriptive reason.
  if (result.exitCode === 0 && final === "RUNNING") {
    handle.fail(task.id, reasons.SUBPROCESS_EXIT_WITHOUT_TERMINAL_STATUS);
    return;
  }

  // Rows 3 + 5 (merged catch-all): non-zero exit code OR signal-killed
  // while the task was still RUNNING (the cancel route never wrote CANCELLED).
  // Pass stderr (or "" if undefined under strict inference) to the builder;
  // the builder truncates to 80 chars at the reason layer (Spec Review S3, N1).
  handle.fail(task.id, reasons.subprocessFailed(result.stderr ?? ""));
}
