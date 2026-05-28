/**
 * Scheduler integration tests.
 *
 * Each test constructs a fresh in-memory Store, then creates a Runner
 * against it. Tests drive the scheduler via runner.createTask() +
 * runner.tick() and assert final state via store.loadTask() /
 * store.getEvents().
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "../../src/runner/migrations/runner.js";
import { createStore } from "../../src/runner/store.js";
import { createRunner } from "../../src/runner/scheduler.js";
import { noopExecutor, createDefaultRegistry } from "../../src/runner/executors.js";
import type { Store } from "../../src/runner/store.js";
import type { Runner } from "../../src/runner/scheduler.js";
import type { Executor, ExecutorRegistry, RunnerHandle } from "../../src/runner/executors.js";
import type { Task, ResourceClaim } from "@ledger/parser";

function makeMemoryStore(): Store {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  return createStore(db);
}

function makeRunnerPair(
  registry: ExecutorRegistry = createDefaultRegistry(),
): { runner: Runner; store: Store } {
  const s = makeMemoryStore();
  const r = createRunner(s, registry);
  return { runner: r, store: s };
}

function getLastEvent(events: ReturnType<Store["getEvents"]>) {
  const ev = events[events.length - 1];
  if (!ev) throw new Error("expected at least one event");
  return ev;
}

let store: Store;
let runner: Runner;

beforeEach(() => {
  store = makeMemoryStore();
  runner = createRunner(store, createDefaultRegistry());
});

afterEach(() => {
  store.close();
});

// ---------------------------------------------------------------------------
// Test 1: Single noop task → PENDING → RUNNING → COMPLETE inside createTask()
// ---------------------------------------------------------------------------
it("test 1: noop task transitions PENDING → RUNNING → COMPLETE inside createTask()", () => {
  const task = runner.createTask({ type: "noop", title: "smoke" });

  const loaded = store.loadTask(task.id);
  expect(loaded?.status).toBe("COMPLETE");

  const events = store.getEvents(task.id);
  // seq 0: creation (status_change, to=PENDING, from absent)
  // seq 1: PENDING → RUNNING (dispatch)
  // seq 2: RUNNING → COMPLETE (noop complete)
  expect(events).toHaveLength(3);

  const ev0 = events[0];
  if (!ev0) throw new Error("missing event 0");
  expect(ev0.kind).toBe("status_change");
  if (ev0.kind === "status_change") {
    expect(ev0.to).toBe("PENDING");
    expect(ev0.from).toBeUndefined();
  }

  const ev1 = events[1];
  if (!ev1) throw new Error("missing event 1");
  expect(ev1.kind).toBe("status_change");
  if (ev1.kind === "status_change") {
    expect(ev1.from).toBe("PENDING");
    expect(ev1.to).toBe("RUNNING");
  }

  const ev2 = events[2];
  if (!ev2) throw new Error("missing event 2");
  expect(ev2.kind).toBe("status_change");
  if (ev2.kind === "status_change") {
    expect(ev2.from).toBe("RUNNING");
    expect(ev2.to).toBe("COMPLETE");
  }
});

// ---------------------------------------------------------------------------
// Test 2: Two unrelated noop tasks → both COMPLETE inside one outer tick()
// (trampoline verification — Spec Review S3)
// ---------------------------------------------------------------------------
it("test 2: two unrelated noop tasks both reach COMPLETE inside one outer tick() call", () => {
  // Instrument the registry to count dispatch invocations (S3 trampoline verification)
  let dispatchCount = 0;
  const countingRegistry = new Map(createDefaultRegistry());
  countingRegistry.set("noop", {
    run(task: Task, handle: RunnerHandle) {
      dispatchCount++;
      void noopExecutor.run(task, handle);
    },
  });

  const { runner: r, store: s } = makeRunnerPair(countingRegistry);
  const t1 = s.createTask({ type: "noop", title: "a" });
  const t2 = s.createTask({ type: "noop", title: "b" });

  r.tick(); // one outer tick() call drives the trampoline

  expect(s.loadTask(t1.id)?.status).toBe("COMPLETE");
  expect(s.loadTask(t2.id)?.status).toBe("COMPLETE");
  expect(dispatchCount).toBe(2); // trampoline ran tickOnce twice

  s.close();
});

// ---------------------------------------------------------------------------
// Test 3: Dep ordering — B depends on A; B stays BLOCKED until A completes
// ---------------------------------------------------------------------------
it("test 3: task B depending on A stays BLOCKED until A completes", () => {
  let completeA: (() => void) | undefined;

  const holdExecutor: Executor = {
    run(task, handle) {
      completeA = () => handle.complete(task.id);
    },
  };
  const reg = createDefaultRegistry();
  reg.set("implement", holdExecutor);
  const { runner: r, store: s } = makeRunnerPair(reg);

  const a = r.createTask({ type: "implement", title: "A" });
  const b = r.createTask({ type: "noop", title: "B", dependsOn: [a.id] });

  expect(s.loadTask(a.id)?.status).toBe("RUNNING");
  expect(s.loadTask(b.id)?.status).toBe("BLOCKED");

  const bEvents = s.getEvents(b.id);
  const lastBEvt = getLastEvent(bEvents);
  if (lastBEvt.kind === "status_change") {
    expect(lastBEvt.reason).toBe(`blocked_by_dep:${a.id}`);
  }

  // Complete A → scheduleTick() fires → B dispatches
  if (!completeA) throw new Error("completeA not set");
  completeA();

  expect(s.loadTask(b.id)?.status).toBe("COMPLETE");

  s.close();
});

// ---------------------------------------------------------------------------
// Test 4: Claim conflict — B blocked while A holds a write claim on same node
// ---------------------------------------------------------------------------
it("test 4: B blocked by write-claim conflict with running A; dispatches after A completes", () => {
  let completeA: (() => void) | undefined;

  const holdExecutor: Executor = {
    run(task, handle) {
      completeA = () => handle.complete(task.id);
    },
  };
  const reg = createDefaultRegistry();
  reg.set("implement", holdExecutor);
  const { runner: r, store: s } = makeRunnerPair(reg);

  const claim = { kind: "node" as const, nodeId: "x", mode: "write" as const };
  const a = r.createTask({ type: "implement", title: "A", resourceClaims: [claim] });
  const b = r.createTask({ type: "noop", title: "B", resourceClaims: [claim] });

  expect(s.loadTask(a.id)?.status).toBe("RUNNING");
  expect(s.loadTask(b.id)?.status).toBe("BLOCKED");

  const bEvts = s.getEvents(b.id);
  const lastBEvt = getLastEvent(bEvts);
  if (lastBEvt.kind === "status_change") {
    expect(lastBEvt.reason).toBe(`blocked_by_claim_conflict:${a.id}`);
  }

  if (!completeA) throw new Error("completeA not set");
  completeA();

  expect(s.loadTask(a.id)?.status).toBe("COMPLETE");
  expect(s.loadTask(b.id)?.status).toBe("COMPLETE");

  s.close();
});

// ---------------------------------------------------------------------------
// Test 5: Two read claims on same node — both dispatch concurrently
// ---------------------------------------------------------------------------
it("test 5: two tasks with read claims on same node dispatch concurrently", () => {
  const completers: Array<() => void> = [];

  const holdExecutor: Executor = {
    run(task, handle) {
      completers.push(() => handle.complete(task.id));
    },
  };
  const reg = createDefaultRegistry();
  reg.set("implement", holdExecutor);
  const { runner: r, store: s } = makeRunnerPair(reg);

  const readClaim = { kind: "node" as const, nodeId: "x", mode: "read" as const };
  const a = r.createTask({ type: "implement", title: "A", resourceClaims: [readClaim] });
  const b = r.createTask({ type: "implement", title: "B", resourceClaims: [readClaim] });

  // Both should be dispatched (RUNNING), not blocked
  expect(s.loadTask(a.id)?.status).toBe("RUNNING");
  expect(s.loadTask(b.id)?.status).toBe("RUNNING");

  for (const complete of completers) complete();

  expect(s.loadTask(a.id)?.status).toBe("COMPLETE");
  expect(s.loadTask(b.id)?.status).toBe("COMPLETE");

  s.close();
});

// ---------------------------------------------------------------------------
// Test 6: No executor → BLOCKED with blocked_no_executor; register → dispatches
// ---------------------------------------------------------------------------
it("test 6: unknown type → blocked_no_executor; after registering executor it dispatches", () => {
  const task = runner.createTask({ type: "implement", title: "no-exec" });

  expect(store.loadTask(task.id)?.status).toBe("BLOCKED");
  const lastEvt = getLastEvent(store.getEvents(task.id));
  if (lastEvt.kind === "status_change") {
    expect(lastEvt.reason).toBe("blocked_no_executor");
  }

  runner.registerExecutor("implement", noopExecutor);
  runner.tick();

  expect(store.loadTask(task.id)?.status).toBe("COMPLETE");
});

// ---------------------------------------------------------------------------
// Test 7: Priority ordering — dispatch in priority DESC order
// ---------------------------------------------------------------------------
it("test 7: tasks dispatch in priority DESC order", () => {
  const order: string[] = [];
  const recordExecutor: Executor = {
    run(task, handle) {
      order.push(task.title);
      handle.complete(task.id);
    },
  };
  const reg = createDefaultRegistry();
  reg.set("implement", recordExecutor);
  const { runner: r, store: s } = makeRunnerPair(reg);

  // Insert all tasks directly via store (no auto-tick) so they queue together.
  s.createTask({ type: "implement", title: "low", priority: 0 });
  s.createTask({ type: "implement", title: "high", priority: 5 });
  s.createTask({ type: "implement", title: "mid", priority: 1 });

  // Now run one explicit tick — trampoline dispatches all three in priority DESC order.
  r.tick();

  expect(s.listTasks({ status: ["COMPLETE"] })).toHaveLength(3);
  expect(order).toEqual(["high", "mid", "low"]);

  s.close();
});

// ---------------------------------------------------------------------------
// Test 8: Same priority → created_at ASC (FIFO within priority)
// ---------------------------------------------------------------------------
it("test 8: same priority dispatches in created_at ASC (insertion) order", () => {
  const order: string[] = [];
  const recordExecutor: Executor = {
    run(task, handle) {
      order.push(task.title);
      handle.complete(task.id);
    },
  };
  const reg = new Map(createDefaultRegistry());
  reg.set("implement", recordExecutor);
  const { runner: r, store: s } = makeRunnerPair(reg);

  // Insert directly (no auto-tick) so both queue at the same priority.
  s.createTask({ type: "implement", title: "first", priority: 0 });
  s.createTask({ type: "implement", title: "second", priority: 0 });

  r.tick();

  expect(order).toEqual(["first", "second"]);

  s.close();
});

// ---------------------------------------------------------------------------
// Test 9: Dep on a FAILED task — stays BLOCKED indefinitely
// ---------------------------------------------------------------------------
it("test 9: dependency on FAILED task keeps dependent BLOCKED indefinitely", () => {
  let failA: (() => void) | undefined;

  const failExecutor: Executor = {
    run(task, handle) {
      failA = () => handle.fail(task.id, "forced failure");
    },
  };
  const reg = createDefaultRegistry();
  reg.set("implement", failExecutor);
  const { runner: r, store: s } = makeRunnerPair(reg);

  const a = r.createTask({ type: "implement", title: "A" });
  const b = r.createTask({ type: "noop", title: "B", dependsOn: [a.id] });

  expect(s.loadTask(a.id)?.status).toBe("RUNNING");

  if (!failA) throw new Error("failA not set");
  failA();

  expect(s.loadTask(a.id)?.status).toBe("FAILED");
  expect(s.loadTask(b.id)?.status).toBe("BLOCKED");

  // Re-running tick N times should not dispatch B
  r.tick();
  r.tick();
  r.tick();

  expect(s.loadTask(b.id)?.status).toBe("BLOCKED");

  s.close();
});

// ---------------------------------------------------------------------------
// Test 10: Dep on non-existent task ID → stays BLOCKED with blocked_by_dep:<id>
// ---------------------------------------------------------------------------
it("test 10: dependency on non-existent task → BLOCKED with blocked_by_dep:<missing-id>", () => {
  const missingId = "00000000-0000-0000-0000-000000000000";
  const task = runner.createTask({ type: "noop", title: "orphan dep", dependsOn: [missingId] });

  expect(store.loadTask(task.id)?.status).toBe("BLOCKED");
  const lastEvt = getLastEvent(store.getEvents(task.id));
  if (lastEvt.kind === "status_change") {
    expect(lastEvt.reason).toBe(`blocked_by_dep:${missingId}`);
  }

  runner.tick();
  expect(store.loadTask(task.id)?.status).toBe("BLOCKED");
});

// ---------------------------------------------------------------------------
// Test 11: Reason precedence — dep check before conflict check
// ---------------------------------------------------------------------------
it("test 11: BLOCKED reason names dep (not conflict) when both conditions apply", () => {
  const holdExec: Executor = {
    run(_task, _handle) {
      // Hold — don't complete
    },
  };
  const reg = createDefaultRegistry();
  reg.set("implement", holdExec);
  const { runner: r, store: s } = makeRunnerPair(reg);

  const missingId = "11111111-1111-1111-1111-111111111111";
  const writeClaim = { kind: "node" as const, nodeId: "y", mode: "write" as const };

  // Start an in-flight task with the same write claim
  const inFlight = r.createTask({ type: "implement", title: "in-flight", resourceClaims: [writeClaim] });
  expect(s.loadTask(inFlight.id)?.status).toBe("RUNNING");

  // Create B with both an unmet dep AND a conflicting claim
  const b = r.createTask({
    type: "noop",
    title: "B",
    dependsOn: [missingId],
    resourceClaims: [writeClaim],
  });

  // B should be BLOCKED with dep reason (dep check runs first)
  const lastBEvt = getLastEvent(s.getEvents(b.id));
  if (lastBEvt.kind === "status_change") {
    expect(lastBEvt.reason).toBe(`blocked_by_dep:${missingId}`);
  }

  s.close();
});

// ---------------------------------------------------------------------------
// Test 12: BLOCKED→BLOCKED reason update — emits new event only on reason change
// ---------------------------------------------------------------------------
it("test 12: BLOCKED→BLOCKED reason update emits a new status_change only if reason changed", () => {
  // Scenario: task is BLOCKED with blocked_no_executor.
  // Tick multiple times — no new events (reason unchanged).
  // Register executor — reason changes (dispatched, COMPLETE).
  const { runner: r, store: s } = makeRunnerPair(createDefaultRegistry());

  const b = s.createTask({ type: "implement", title: "B" });
  // Manually set B to BLOCKED with blocked_no_executor
  s.updateTaskStatus(b.id, { from: "PENDING", to: "BLOCKED", reason: "blocked_no_executor" });

  const eventCountAfterBlock = s.getEvents(b.id).length;

  // Tick multiple times — reason hasn't changed, no new events
  r.tick();
  r.tick();
  r.tick();
  expect(s.getEvents(b.id).length).toBe(eventCountAfterBlock);

  // Register noop as executor for "implement", tick → B dispatches
  r.registerExecutor("implement", noopExecutor);
  r.tick();

  // B should now be COMPLETE (reason changed: BLOCKED → RUNNING → COMPLETE)
  expect(s.loadTask(b.id)?.status).toBe("COMPLETE");
  // Event count increased (at least BLOCKED→RUNNING + RUNNING→COMPLETE)
  expect(s.getEvents(b.id).length).toBeGreaterThan(eventCountAfterBlock);

  s.close();
});

// ---------------------------------------------------------------------------
// Test 13: Sync executor throws → RUNNING → FAILED; downstream re-evaluated (B2)
// ---------------------------------------------------------------------------
it("test 13: sync executor throws → task FAILED; downstream re-evaluated (Spec Review B2)", () => {
  const throwExec: Executor = {
    run(_task, _handle) {
      throw new Error("boom");
    },
  };
  const reg = createDefaultRegistry();
  reg.set("implement", throwExec);
  const { runner: r, store: s } = makeRunnerPair(reg);

  const a = r.createTask({ type: "implement", title: "A" });
  expect(s.loadTask(a.id)?.status).toBe("FAILED");

  const lastEvt = getLastEvent(s.getEvents(a.id));
  if (lastEvt.kind === "status_change") {
    expect(lastEvt.reason).toBe("executor_error: boom");
  }

  // Spec Review B2 verification: downstream task depending on A should be
  // BLOCKED with blocked_by_dep (not dispatched, since A FAILED).
  const b = r.createTask({ type: "noop", title: "B", dependsOn: [a.id] });
  expect(s.loadTask(b.id)?.status).toBe("BLOCKED");

  const lastBEvt = getLastEvent(s.getEvents(b.id));
  if (lastBEvt.kind === "status_change") {
    expect(lastBEvt.reason).toBe(`blocked_by_dep:${a.id}`);
  }

  s.close();
});

// ---------------------------------------------------------------------------
// Test 14: Async executor returns rejected promise → task FAILED
// ---------------------------------------------------------------------------
it("test 14: async executor rejected promise → task FAILED with executor_error", async () => {
  const asyncThrowExec: Executor = {
    run(_task, _handle) {
      return Promise.reject(new Error("async boom"));
    },
  };
  const reg = createDefaultRegistry();
  reg.set("implement", asyncThrowExec);
  const { runner: r, store: s } = makeRunnerPair(reg);

  const task = r.createTask({ type: "implement", title: "async-fail" });
  // Initially RUNNING — the promise hasn't rejected yet
  expect(s.loadTask(task.id)?.status).toBe("RUNNING");

  // Wait for the rejection to propagate
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  expect(s.loadTask(task.id)?.status).toBe("FAILED");
  const lastEvt = getLastEvent(s.getEvents(task.id));
  if (lastEvt.kind === "status_change") {
    expect(lastEvt.reason).toBe("executor_error: async boom");
  }

  s.close();
});

// ---------------------------------------------------------------------------
// Test 14b: Async failure RELEASES claims; a previously claim-blocked sibling
// dispatches via the async .catch()'s scheduleTick (Spec Review B2 — async path).
//
// Rationale: the sync sibling test (test 13) is also B2-relevant but
// structurally the surrounding `pending = true; return;` in tickOnce would
// fire the trampoline regardless of the sync catch's scheduleTick — making
// the sync B2 fix defense-in-depth. The async path is where B2 is actually
// load-bearing: the .catch() fires in a microtask after the outer tick has
// already exited (ticking = false), so without the explicit scheduleTick in
// the catch handler, no one would re-evaluate eligible siblings.
// (Implementation Review N1.)
// ---------------------------------------------------------------------------
it("test 14b: async failure releases claims; previously-blocked sibling dispatches (B2 async)", async () => {
  const asyncThrowExec: Executor = {
    run(_task, _handle) {
      return Promise.reject(new Error("async release boom"));
    },
  };
  const reg = createDefaultRegistry();
  reg.set("implement", asyncThrowExec);
  const { runner: r, store: s } = makeRunnerPair(reg);

  const claim: ResourceClaim = { kind: "node", nodeId: "shared", mode: "write" };
  // Stage both tasks via direct store.createTask to avoid auto-ticks racing the setup.
  const a = s.createTask({
    type: "implement",
    title: "A async-throws while holding write claim",
    resourceClaims: [claim],
  });
  const c = s.createTask({
    type: "noop",
    title: "C waiting on A's write claim",
    resourceClaims: [claim],
  });

  // First tick: A dispatches (RUNNING); C blocks on claim conflict.
  r.tick();
  expect(s.loadTask(a.id)?.status).toBe("RUNNING");
  expect(s.loadTask(c.id)?.status).toBe("BLOCKED");
  const cBlockedEvt = getLastEvent(s.getEvents(c.id));
  if (cBlockedEvt.kind === "status_change") {
    expect(cBlockedEvt.reason).toBe(`blocked_by_claim_conflict:${a.id}`);
  }

  // Wait for the rejected Promise to fire its .catch() — which must call
  // scheduleTick() for C to be re-evaluated and dispatched.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  expect(s.loadTask(a.id)?.status).toBe("FAILED");
  // The load-bearing assertion: C completed because the async .catch()'s
  // scheduleTick() fired the trampoline, which re-evaluated C now that A
  // no longer holds the claim. Without that scheduleTick, C would still be
  // BLOCKED here.
  expect(s.loadTask(c.id)?.status).toBe("COMPLETE");

  s.close();
});

// ---------------------------------------------------------------------------
// Test 15: runner.tick() is idempotent — ten calls produce same state and event count
// ---------------------------------------------------------------------------
it("test 15: calling tick() ten times consecutively is idempotent", () => {
  let completer: (() => void) | undefined;
  const holdExec: Executor = {
    run(task, handle) {
      completer = () => handle.complete(task.id);
    },
  };
  const reg = createDefaultRegistry();
  reg.set("implement", holdExec);
  const { runner: r, store: s } = makeRunnerPair(reg);

  const task = r.createTask({ type: "implement", title: "idempotent" });
  expect(s.loadTask(task.id)?.status).toBe("RUNNING");
  const eventCountWhileRunning = s.getEvents(task.id).length;

  // Tick ten more times — task is already RUNNING, no new events
  for (let i = 0; i < 10; i++) {
    r.tick();
  }
  expect(s.getEvents(task.id).length).toBe(eventCountWhileRunning);

  // Complete the task
  if (!completer) throw new Error("completer not set");
  completer();
  expect(s.loadTask(task.id)?.status).toBe("COMPLETE");

  // Tick ten more times — task is COMPLETE, no new events
  const finalEventCount = s.getEvents(task.id).length;
  for (let i = 0; i < 10; i++) {
    r.tick();
  }
  expect(s.getEvents(task.id).length).toBe(finalEventCount);

  s.close();
});

// ---------------------------------------------------------------------------
// registerExecutor: console.warn on overwrite
// ---------------------------------------------------------------------------
describe("registerExecutor", () => {
  it("emits console.warn when overwriting an existing executor", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    runner.registerExecutor("noop", noopExecutor); // overwrite noop
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("overwriting executor for type noop"),
    );
    warnSpy.mockRestore();
  });

  it("does not warn when registering a new executor type", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    runner.registerExecutor("implement", noopExecutor);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
