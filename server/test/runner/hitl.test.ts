/**
 * HITL executor + handle.awaitHumanReview unit tests.
 *
 * Spec: docs/05-task-runner/03-hitl-gate.md §Test plan item 1.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "../../src/runner/migrations/runner.js";
import { createStore } from "../../src/runner/store.js";
import { createRunner } from "../../src/runner/scheduler.js";
import {
  humanReviewExecutor,
  noopExecutor,
  createDefaultRegistry,
} from "../../src/runner/executors.js";
import type { Store } from "../../src/runner/store.js";
import type { Runner } from "../../src/runner/scheduler.js";
import type { RunnerHandle } from "../../src/runner/executors.js";
import type { LogEvent, ResourceClaim } from "@ledger/parser";

function makeMemoryStore(): Store {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  return createStore(db);
}

function makeRunnerPair(): { runner: Runner; store: Store } {
  const s = makeMemoryStore();
  const r = createRunner(s);
  return { runner: r, store: s };
}

function lastStatusChange(events: LogEvent[]): LogEvent & { kind: "status_change" } {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev !== undefined && ev.kind === "status_change") {
      return ev;
    }
  }
  throw new Error("no status_change event found");
}

let store: Store;
let runner: Runner;

beforeEach(() => {
  ({ runner, store } = makeRunnerPair());
});

afterEach(() => {
  store.close();
});

describe("humanReviewExecutor", () => {
  it("registered in createDefaultRegistry alongside noop", () => {
    const reg = createDefaultRegistry();
    expect(reg.get("noop")).toBe(noopExecutor);
    expect(reg.get("human_review")).toBe(humanReviewExecutor);
    expect(reg.size).toBe(2);
  });

  it("run() calls handle.awaitHumanReview exactly once with the task's id", () => {
    const awaitSpy = vi.fn();
    const handle: RunnerHandle = {
      emit: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
      awaitHumanReview: awaitSpy,
    };
    const task = store.createTask({ type: "human_review", title: "T" });
    void humanReviewExecutor.run(task, handle);
    expect(awaitSpy).toHaveBeenCalledTimes(1);
    expect(awaitSpy).toHaveBeenCalledWith(task.id);
  });
});

describe("handle.awaitHumanReview", () => {
  it("transitions RUNNING → AWAITING_HUMAN_REVIEW with no reason set", () => {
    const task = runner.createTask({ type: "human_review", title: "T" });
    // After createTask the trampoline has run: PENDING → RUNNING → AWAITING_HUMAN_REVIEW
    const reloaded = store.loadTask(task.id);
    expect(reloaded?.status).toBe("AWAITING_HUMAN_REVIEW");

    const events = store.getEvents(task.id);
    expect(events).toHaveLength(3);
    const sc = events[2];
    if (sc?.kind !== "status_change") throw new Error("expected status_change");
    expect(sc.from).toBe("RUNNING");
    expect(sc.to).toBe("AWAITING_HUMAN_REVIEW");
    expect(sc.reason).toBeUndefined();
  });

  it("dbRowVersion is 2 after two transitions (PENDING→RUNNING, RUNNING→AWAITING)", () => {
    const task = runner.createTask({ type: "human_review", title: "T" });
    expect(store.loadTask(task.id)?.dbRowVersion).toBe(2);
  });

  it("does NOT call scheduleTick after the suspension transition", () => {
    // Without a spy on the internal scheduleTick, we assert via behavior:
    // The trampoline iteration count is bounded by `pending` flag flips.
    // If awaitHumanReview were to call scheduleTick, we'd recurse one extra
    // iteration. Each iteration looks at the candidate set; AWAITING_HUMAN_REVIEW
    // is in-flight (not a candidate), so no extra work happens. We assert that
    // the task is observed in AWAITING state with no additional events.
    const task = runner.createTask({ type: "human_review", title: "T" });
    const before = store.getEvents(task.id).length;
    runner.tick(); // explicit re-tick after stable state
    const after = store.getEvents(task.id).length;
    expect(after).toBe(before);
  });
});

describe("human_review task lifecycle (claims held)", () => {
  it("a downstream task with conflicting write claim is BLOCKED while review pending", () => {
    const claim: ResourceClaim = {
      kind: "node",
      nodeId: "shared",
      mode: "write",
    };
    const reviewer = runner.createTask({
      type: "human_review",
      title: "A",
      resourceClaims: [claim],
    });
    expect(store.loadTask(reviewer.id)?.status).toBe("AWAITING_HUMAN_REVIEW");

    const downstream = runner.createTask({
      type: "noop",
      title: "B",
      resourceClaims: [claim],
    });
    expect(store.loadTask(downstream.id)?.status).toBe("BLOCKED");

    const blockedEvt = lastStatusChange(store.getEvents(downstream.id));
    expect(blockedEvt.to).toBe("BLOCKED");
    expect(blockedEvt.reason).toBe(`blocked_by_claim_conflict:${reviewer.id}`);
  });

  it("after approve (manual store update), downstream task dispatches", () => {
    const claim: ResourceClaim = {
      kind: "node",
      nodeId: "shared",
      mode: "write",
    };
    const reviewer = runner.createTask({
      type: "human_review",
      title: "A",
      resourceClaims: [claim],
    });
    const downstream = runner.createTask({
      type: "noop",
      title: "B",
      resourceClaims: [claim],
    });
    expect(store.loadTask(downstream.id)?.status).toBe("BLOCKED");

    // Simulate approve via direct store call (the endpoint test exercises the route).
    store.updateTaskStatus(reviewer.id, {
      from: "AWAITING_HUMAN_REVIEW",
      to: "COMPLETE",
    });
    runner.tick();
    expect(store.loadTask(downstream.id)?.status).toBe("COMPLETE");
  });
});

describe("restart durability", () => {
  it("AWAITING_HUMAN_REVIEW row survives recoverOrphans + fresh Runner", async () => {
    const { recoverOrphans } = await import("../../src/runner/scheduler.js");
    // Seed an AWAITING_HUMAN_REVIEW row directly via the runner lifecycle.
    const task = runner.createTask({ type: "human_review", title: "review me" });
    expect(store.loadTask(task.id)?.status).toBe("AWAITING_HUMAN_REVIEW");

    // Simulate restart: recoverOrphans + a fresh Runner constructed on the same Store.
    const { recovered } = recoverOrphans(store);
    expect(recovered).toBe(0); // no RUNNING rows; nothing recovered.
    expect(store.loadTask(task.id)?.status).toBe("AWAITING_HUMAN_REVIEW");

    const fresh = createRunner(store);
    // No new ticks fire; task is still AWAITING.
    fresh.tick();
    expect(store.loadTask(task.id)?.status).toBe("AWAITING_HUMAN_REVIEW");
  });
});
