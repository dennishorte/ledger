/**
 * lifecycle.ts unit tests — reconcileExit pure function.
 *
 * All five lifecycle rows tested with synthetic (exit, finalStatus) inputs
 * and a recording mock RunnerHandle. No subprocess spawned.
 *
 * Spec: docs/06-agent-dispatcher/03-claude-code-executor.md §Requirements item 10
 * Row ordering (Spec Review B2 fix): 0 → 4 → 1 → 2 → 3+5 catch-all
 */

import { describe, expect, it } from "vitest";
import { reconcileExit } from "../../../src/dispatcher/executor/lifecycle.js";
import { reasons } from "../../../src/runner/scheduler.js";
import type { Task, TaskStatus } from "@ledger/parser";
import type { RunnerHandle } from "../../../src/runner/executors.js";
import type { Result } from "execa";

// ---------------------------------------------------------------------------
// Synthetic test helpers
// ---------------------------------------------------------------------------

function makeTask(id: string = "task-1"): Task {
  return {
    id,
    type: "implement",
    status: "RUNNING",
    title: "Test task",
    source: "operator_injected",
    dependsOn: [],
    resourceClaims: [],
    dbRowVersion: 1,
    priority: 0,
    createdAt: new Date().toISOString(),
  };
}

function makeResult(overrides: Partial<Result> = {}): Result {
  return {
    exitCode: 0,
    stdout: "",
    stderr: "",
    command: "claude --print --bare --mcp-config /tmp/test.json",
    escapedCommand: "claude --print --bare --mcp-config /tmp/test.json",
    ...overrides,
  } as Result;
}

function makeHandle(): { handle: RunnerHandle; calls: { method: string; args: unknown[] }[] } {
  const calls: { method: string; args: unknown[] }[] = [];
  const handle: RunnerHandle = {
    emit: (taskId, event) => {
      calls.push({ method: "emit", args: [taskId, event] });
      return { id: "ev-1", taskId, seq: 0, at: new Date().toISOString(), ...event } as ReturnType<RunnerHandle["emit"]>;
    },
    complete: (taskId) => {
      calls.push({ method: "complete", args: [taskId] });
      return makeTask(taskId);
    },
    fail: (taskId, reason) => {
      calls.push({ method: "fail", args: [taskId, reason] });
      return makeTask(taskId);
    },
    awaitHumanReview: (taskId) => {
      calls.push({ method: "awaitHumanReview", args: [taskId] });
      return makeTask(taskId);
    },
  };
  return { handle, calls };
}

// ---------------------------------------------------------------------------
// Row 0: final === undefined — task row gone; no transition
// ---------------------------------------------------------------------------

describe("reconcileExit row 0 — final undefined", () => {
  it("no handle method called when final is undefined", () => {
    const task = makeTask();
    const result = makeResult({ exitCode: 0 });
    const { handle, calls } = makeHandle();
    reconcileExit(task, result, undefined, handle);
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Row 4 (checked first — Spec Review B2): final === "CANCELLED"
// ---------------------------------------------------------------------------

describe("reconcileExit row 4 — CANCELLED takes precedence", () => {
  it("no handle method called when final is CANCELLED (clean exit)", () => {
    const task = makeTask();
    const result = makeResult({ exitCode: 0 });
    const { handle, calls } = makeHandle();
    reconcileExit(task, result, "CANCELLED", handle);
    expect(calls).toHaveLength(0);
  });

  it("no handle method called when final is CANCELLED (SIGTERM exit)", () => {
    const task = makeTask();
    const result = makeResult({ exitCode: undefined, signal: "SIGTERM" });
    const { handle, calls } = makeHandle();
    reconcileExit(task, result, "CANCELLED", handle);
    expect(calls).toHaveLength(0);
  });

  it("no handle method called when final is CANCELLED (non-zero exit)", () => {
    const task = makeTask();
    const result = makeResult({ exitCode: 1 });
    const { handle, calls } = makeHandle();
    reconcileExit(task, result, "CANCELLED", handle);
    expect(calls).toHaveLength(0);
  });

  it("no handle method called when final is CANCELLED (SIGKILL exit)", () => {
    const task = makeTask();
    const result = makeResult({ exitCode: undefined, signal: "SIGKILL" });
    const { handle, calls } = makeHandle();
    reconcileExit(task, result, "CANCELLED", handle);
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Row 1: exitCode === 0 AND final ∈ {COMPLETE, FAILED, AWAITING_HUMAN_REVIEW}
// ---------------------------------------------------------------------------

describe("reconcileExit row 1 — success path (agent reported correctly)", () => {
  const TERMINAL_STATUSES: TaskStatus[] = ["COMPLETE", "FAILED", "AWAITING_HUMAN_REVIEW"];

  for (const status of TERMINAL_STATUSES) {
    it(`no handle method called when exitCode=0 and final=${status}`, () => {
      const task = makeTask();
      const result = makeResult({ exitCode: 0 });
      const { handle, calls } = makeHandle();
      reconcileExit(task, result, status, handle);
      expect(calls).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Row 2: exitCode === 0 AND final === "RUNNING" — agent forgot terminal call
// ---------------------------------------------------------------------------

describe("reconcileExit row 2 — agent forgot terminal call", () => {
  it("calls handle.fail with SUBPROCESS_EXIT_WITHOUT_TERMINAL_STATUS", () => {
    const task = makeTask();
    const result = makeResult({ exitCode: 0 });
    const { handle, calls } = makeHandle();
    reconcileExit(task, result, "RUNNING", handle);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "fail",
      args: [task.id, reasons.SUBPROCESS_EXIT_WITHOUT_TERMINAL_STATUS],
    });
  });
});

// ---------------------------------------------------------------------------
// Rows 3+5 catch-all: non-zero exit OR signal-kill, final === "RUNNING"
// ---------------------------------------------------------------------------

describe("reconcileExit rows 3+5 — subprocess failed", () => {
  it("calls handle.fail with subprocessFailed when exitCode !== 0 and final=RUNNING", () => {
    const task = makeTask();
    const result = makeResult({ exitCode: 1, stderr: "authentication error" });
    const { handle, calls } = makeHandle();
    reconcileExit(task, result, "RUNNING", handle);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "fail",
      args: [task.id, reasons.subprocessFailed("authentication error")],
    });
  });

  it("uses empty string when stderr is undefined", () => {
    const task = makeTask();
    const result = makeResult({ exitCode: 2, stderr: undefined });
    const { handle, calls } = makeHandle();
    reconcileExit(task, result, "RUNNING", handle);
    expect(calls[0]).toMatchObject({
      method: "fail",
      args: [task.id, reasons.subprocessFailed("")],
    });
  });

  it("truncates stderr at 80 chars in the reason", () => {
    const task = makeTask();
    const longStderr = "x".repeat(200);
    const result = makeResult({ exitCode: 1, stderr: longStderr });
    const { handle, calls } = makeHandle();
    reconcileExit(task, result, "RUNNING", handle);
    const reason = typeof calls[0]?.args[1] === "string" ? calls[0].args[1] : "";
    // reason format: "subprocess_failed:<80 chars>"
    expect(reason).toBe(`subprocess_failed:${"x".repeat(80)}`);
  });

  it("calls handle.fail when signal-killed (SIGKILL) and final=RUNNING", () => {
    const task = makeTask();
    const result = makeResult({ exitCode: undefined, signal: "SIGKILL", stderr: "killed" });
    const { handle, calls } = makeHandle();
    reconcileExit(task, result, "RUNNING", handle);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("fail");
  });

  it("calls handle.fail when signal-killed (SIGTERM) with final=RUNNING (no cancel route ran)", () => {
    const task = makeTask();
    const result = makeResult({ exitCode: undefined, signal: "SIGTERM", stderr: "" });
    const { handle, calls } = makeHandle();
    // If cancel route ran, final would be CANCELLED (row 4). Here it's RUNNING,
    // meaning the signal arrived from something other than the cancel route.
    reconcileExit(task, result, "RUNNING", handle);
    expect(calls[0]?.method).toBe("fail");
  });
});

// ---------------------------------------------------------------------------
// BLOCKED/PENDING final statuses — not RUNNING or CANCELLED; fall through to
// the catch-all and call handle.fail (defensive — shouldn't happen in practice)
// ---------------------------------------------------------------------------

describe("reconcileExit — non-zero exit with non-RUNNING final status", () => {
  it("calls handle.fail for non-zero exit and final=PENDING (unexpected state)", () => {
    const task = makeTask();
    const result = makeResult({ exitCode: 1, stderr: "crash" });
    const { handle, calls } = makeHandle();
    reconcileExit(task, result, "PENDING", handle);
    // PENDING is not CANCELLED, not in TERMINAL, not RUNNING →
    // catches in the 3+5 catch-all
    expect(calls[0]?.method).toBe("fail");
  });
});

// ---------------------------------------------------------------------------
// reasons const additions (verify the new entries are present)
// ---------------------------------------------------------------------------

describe("reasons const — new additions", () => {
  it("SUBPROCESS_EXIT_WITHOUT_TERMINAL_STATUS is a string", () => {
    expect(typeof reasons.SUBPROCESS_EXIT_WITHOUT_TERMINAL_STATUS).toBe("string");
    expect(reasons.SUBPROCESS_EXIT_WITHOUT_TERMINAL_STATUS).toBe(
      "subprocess_exit_without_terminal_status",
    );
  });

  it("subprocessFailed builder truncates to 80 chars", () => {
    const long = "a".repeat(200);
    const result = reasons.subprocessFailed(long);
    expect(result).toBe(`subprocess_failed:${"a".repeat(80)}`);
  });

  it("subprocessFailed builder with short string", () => {
    expect(reasons.subprocessFailed("err")).toBe("subprocess_failed:err");
  });

  it("CANCELLED_BY_OPERATOR is the right string", () => {
    expect(reasons.CANCELLED_BY_OPERATOR).toBe("cancelled_by_operator");
  });

  it("executorInternalError builder truncates to 80 chars", () => {
    const long = "z".repeat(200);
    expect(reasons.executorInternalError(long)).toBe(
      `executor_internal_error:${"z".repeat(80)}`,
    );
  });
});
