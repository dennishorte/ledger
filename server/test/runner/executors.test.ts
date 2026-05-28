/**
 * Executor registry + noop tests.
 */

import { describe, expect, it, vi } from "vitest";
import { noopExecutor, createDefaultRegistry } from "../../src/runner/executors.js";
import type { RunnerHandle, Executor } from "../../src/runner/executors.js";
import type { Task } from "@ledger/parser";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-123",
    type: "noop",
    status: "RUNNING",
    title: "test",
    source: "operator_injected",
    dependsOn: [],
    resourceClaims: [],
    dbRowVersion: 0,
    priority: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeHandle() {
  const completeFn = vi.fn().mockReturnValue(makeTask({ status: "COMPLETE" }));
  const emitFn = vi.fn();
  const failFn = vi.fn().mockReturnValue(makeTask({ status: "FAILED" }));
  const handle: RunnerHandle = {
    emit: emitFn,
    complete: completeFn,
    fail: failFn,
  };
  return { handle, completeFn, emitFn, failFn };
}

describe("createDefaultRegistry", () => {
  // 1. Returns a registry with `noop` registered, no other types.
  it("returns a registry with noop registered and no other types", () => {
    const reg = createDefaultRegistry();
    expect(reg.has("noop")).toBe(true);
    expect(reg.size).toBe(1);
  });

  // 4. The registry is a fresh Map per construction — two registries are independent.
  it("two registries are independent — modifying one does not affect the other", () => {
    const r1 = createDefaultRegistry();
    const r2 = createDefaultRegistry();
    r1.set("implement", noopExecutor);
    expect(r2.has("implement")).toBe(false);
  });
});

describe("noopExecutor", () => {
  // 2. calls handle.complete(task.id) exactly once with the task's id.
  it("calls handle.complete(task.id) exactly once", () => {
    const task = makeTask();
    const { handle, completeFn } = makeHandle();
    void noopExecutor.run(task, handle);
    expect(completeFn).toHaveBeenCalledTimes(1);
    expect(completeFn).toHaveBeenCalledWith(task.id);
  });

  // 3. does not call handle.emit or handle.fail.
  it("does not call handle.emit or handle.fail", () => {
    const task = makeTask();
    const { handle, emitFn, failFn } = makeHandle();
    void noopExecutor.run(task, handle);
    expect(emitFn).not.toHaveBeenCalled();
    expect(failFn).not.toHaveBeenCalled();
  });

  it("is synchronous (run() returns void, not a Promise)", () => {
    const task = makeTask();
    const { handle } = makeHandle();
    const result = noopExecutor.run(task, handle) as unknown;
    // noopExecutor.run returns undefined (implicit void)
    expect(result).toBeUndefined();
  });
});

describe("Executor type compatibility", () => {
  it("a custom executor that returns Promise<void> is accepted by the Executor type", () => {
    const asyncExec: Executor = {
      run(_task, handle) {
        return Promise.resolve().then(() => {
          handle.complete(_task.id);
        });
      },
    };
    const task = makeTask();
    const { handle } = makeHandle();
    const p = asyncExec.run(task, handle);
    expect(p).toBeInstanceOf(Promise);
    // Drain the promise to avoid unhandled rejection
    void (p as Promise<void>);
  });
});
