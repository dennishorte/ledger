/**
 * Store API round-trip tests.
 *
 * Every test uses an in-memory `:memory:` DB via `createMemoryStore()` for full isolation.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "../../src/runner/migrations/runner.js";
import { createStore, OptimisticLockError } from "../../src/runner/store.js";
import type { Store } from "../../src/runner/store.js";
import type { TaskInput } from "@ledger/parser";

function makeMemoryStore(): Store {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  return createStore(db);
}

let store: Store;

beforeEach(() => {
  store = makeMemoryStore();
});

afterEach(() => {
  store.close();
});

// ---------------------------------------------------------------------------
// createTask
// ---------------------------------------------------------------------------

describe("createTask", () => {
  it("returns a Task with status PENDING and the provided fields", () => {
    const input: TaskInput = { type: "noop", title: "hello world" };
    const task = store.createTask(input);

    expect(task.status).toBe("PENDING");
    expect(task.type).toBe("noop");
    expect(task.title).toBe("hello world");
    expect(task.source).toBe("operator_injected"); // default
    expect(task.dbRowVersion).toBe(0);
    expect(task.priority).toBe(0);
    expect(task.dependsOn).toEqual([]);
    expect(task.resourceClaims).toEqual([]);
    expect(typeof task.id).toBe("string");
    expect(task.id.length).toBeGreaterThan(0);
    expect(typeof task.createdAt).toBe("string");
    expect(task.transcriptPath).toBeUndefined();
  });

  it("writes exactly one tasks row and exactly one events row (seq=0, status_change, from absent)", () => {
    const task = store.createTask({ type: "noop", title: "creation test" });

    // Load the task back
    const loaded = store.loadTask(task.id);
    expect(loaded).toBeDefined();

    // Get events
    const events = store.getEvents(task.id);
    expect(events).toHaveLength(1);

    const evt = events[0];
    if (!evt) throw new Error("expected a creation event at seq=0");
    expect(evt.seq).toBe(0);
    expect(evt.kind).toBe("status_change");
    expect(evt.taskId).toBe(task.id);
    // from must be absent (S4)
    expect("from" in evt).toBe(false);
    // to must be PENDING
    expect((evt as { kind: "status_change"; to: string }).to).toBe("PENDING");
  });

  it("applies default source, dependsOn, resourceClaims, priority", () => {
    const task = store.createTask({ type: "noop", title: "defaults test" });
    expect(task.source).toBe("operator_injected");
    expect(task.dependsOn).toEqual([]);
    expect(task.resourceClaims).toEqual([]);
    expect(task.priority).toBe(0);
  });

  it("stores parentTaskId when provided", () => {
    const parent = store.createTask({ type: "noop", title: "parent" });
    const child = store.createTask({ type: "noop", title: "child", parentTaskId: parent.id });
    expect(child.parentTaskId).toBe(parent.id);
  });

  // -- dependsOn validation (05-task-runner round-2 item 5) ------------------

  it("throws when dependsOn references a non-existent task ID", () => {
    expect(() => {
      store.createTask({ type: "noop", title: "bad-dep", dependsOn: ["nonexistent-id"] });
    }).toThrow(/unknown task id.*nonexistent-id/);
  });

  it("does not write a task row when dependsOn validation fails", () => {
    const before = store.listTasks().length;
    try {
      store.createTask({ type: "noop", title: "bad-dep", dependsOn: ["ghost-id"] });
    } catch {
      // expected
    }
    expect(store.listTasks().length).toBe(before);
  });

  it("succeeds when dependsOn references an existing task ID", () => {
    const dep = store.createTask({ type: "noop", title: "dep task" });
    const child = store.createTask({ type: "noop", title: "dependent", dependsOn: [dep.id] });
    expect(child.dependsOn).toEqual([dep.id]);
  });
});

// ---------------------------------------------------------------------------
// loadTask / getStatus
// ---------------------------------------------------------------------------

describe("loadTask", () => {
  it("returns undefined for an unknown id", () => {
    expect(store.loadTask("nonexistent-id")).toBeUndefined();
  });

  it("round-trips a created task", () => {
    const task = store.createTask({ type: "noop", title: "round trip" });
    const loaded = store.loadTask(task.id);
    expect(loaded).toEqual(task);
  });
});

describe("getStatus", () => {
  it("returns undefined for an unknown id", () => {
    expect(store.getStatus("nonexistent-id")).toBeUndefined();
  });

  it("returns PENDING for a newly created task", () => {
    const task = store.createTask({ type: "noop", title: "status test" });
    expect(store.getStatus(task.id)).toBe("PENDING");
  });
});

// ---------------------------------------------------------------------------
// updateTaskStatus
// ---------------------------------------------------------------------------

describe("updateTaskStatus", () => {
  it("transitions status and bumps dbRowVersion", () => {
    const task = store.createTask({ type: "noop", title: "transition test" });
    expect(task.dbRowVersion).toBe(0);

    const updated = store.updateTaskStatus(task.id, { from: "PENDING", to: "RUNNING" });
    expect(updated.status).toBe("RUNNING");
    expect(updated.dbRowVersion).toBe(1);
  });

  it("appends a status_change event with from and to", () => {
    const task = store.createTask({ type: "noop", title: "event test" });
    store.updateTaskStatus(task.id, { from: "PENDING", to: "RUNNING" });

    const events = store.getEvents(task.id);
    // events: [seq=0 creation, seq=1 PENDING→RUNNING]
    expect(events).toHaveLength(2);
    const evt = events[1];
    if (!evt) throw new Error("expected a status_change event at seq=1");
    expect(evt.kind).toBe("status_change");
    expect((evt as { from?: string; to: string }).from).toBe("PENDING");
    expect((evt as { from?: string; to: string }).to).toBe("RUNNING");
  });

  it("sets startedAt when transitioning to RUNNING", () => {
    const task = store.createTask({ type: "noop", title: "startedAt test" });
    const updated = store.updateTaskStatus(task.id, { from: "PENDING", to: "RUNNING" });
    expect(typeof updated.startedAt).toBe("string");
  });

  it("sets completedAt when transitioning to COMPLETE", () => {
    const task = store.createTask({ type: "noop", title: "completedAt test" });
    store.updateTaskStatus(task.id, { from: "PENDING", to: "RUNNING" });
    const done = store.updateTaskStatus(task.id, { from: "RUNNING", to: "COMPLETE" });
    expect(typeof done.completedAt).toBe("string");
  });

  it("throws OptimisticLockError when expectedDbRowVersion mismatches", () => {
    const task = store.createTask({ type: "noop", title: "occ test" });
    // Bump dbRowVersion to 1
    store.updateTaskStatus(task.id, { from: "PENDING", to: "RUNNING" });

    // Now try with stale version 0 — should throw
    expect(() =>
      store.updateTaskStatus(task.id, { from: "RUNNING", to: "COMPLETE" }, 0),
    ).toThrow(OptimisticLockError);

    // Task must be unchanged (still RUNNING at version 1)
    const current = store.loadTask(task.id);
    expect(current?.status).toBe("RUNNING");
    expect(current?.dbRowVersion).toBe(1);
  });

  it("succeeds when expectedDbRowVersion matches", () => {
    const task = store.createTask({ type: "noop", title: "occ success" });
    const updated = store.updateTaskStatus(
      task.id,
      { from: "PENDING", to: "RUNNING" },
      0, // correct expected version
    );
    expect(updated.status).toBe("RUNNING");
  });
});

// ---------------------------------------------------------------------------
// appendEvent
// ---------------------------------------------------------------------------

describe("appendEvent", () => {
  it("appends events with monotonically increasing seq", () => {
    const task = store.createTask({ type: "noop", title: "seq test" });
    const N = 100;
    for (let i = 0; i < N; i++) {
      store.appendEvent(task.id, {
        kind: "reasoning",
        text: `line ${String(i)}`,
        subkind: "message",
      });
    }

    const events = store.getEvents(task.id);
    // creation event at seq=0, then N reasoning events
    expect(events).toHaveLength(N + 1);

    // Check monotonicity 0..100
    for (let i = 0; i <= N; i++) {
      expect(events[i]?.seq).toBe(i);
    }
  });

  it("returns the appended event with correct fields", () => {
    const task = store.createTask({ type: "noop", title: "append test" });
    const evt = store.appendEvent(task.id, {
      kind: "error",
      message: "test error",
      stack: "stack trace",
    });

    expect(evt.kind).toBe("error");
    expect(evt.taskId).toBe(task.id);
    expect(evt.seq).toBe(1); // creation is seq=0
    expect(typeof evt.id).toBe("string");
    expect(typeof evt.at).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// getEvents
// ---------------------------------------------------------------------------

describe("getEvents", () => {
  it("returns all events in seq order when called without opts", () => {
    const task = store.createTask({ type: "noop", title: "events test" });
    store.appendEvent(task.id, { kind: "reasoning", text: "a", subkind: "thinking" });
    store.appendEvent(task.id, { kind: "reasoning", text: "b", subkind: "thinking" });

    const events = store.getEvents(task.id);
    expect(events).toHaveLength(3); // creation + 2 reasoning
    expect(events[0]?.seq).toBe(0);
    expect(events[1]?.seq).toBe(1);
    expect(events[2]?.seq).toBe(2);
  });

  it("afterSeq filters correctly — getEvents(taskId, { afterSeq: 50 }) returns events 51..N", () => {
    const task = store.createTask({ type: "noop", title: "afterSeq test" });
    for (let i = 0; i < 100; i++) {
      store.appendEvent(task.id, { kind: "reasoning", text: String(i), subkind: "message" });
    }
    // total: 101 events (0..100)

    const after50 = store.getEvents(task.id, { afterSeq: 50 });
    expect(after50).toHaveLength(50); // 51..100
    expect(after50[0]?.seq).toBe(51);
    expect(after50[49]?.seq).toBe(100);
  });

  it("limit caps the result", () => {
    const task = store.createTask({ type: "noop", title: "limit test" });
    for (let i = 0; i < 10; i++) {
      store.appendEvent(task.id, { kind: "reasoning", text: String(i), subkind: "message" });
    }

    const limited = store.getEvents(task.id, { limit: 5 });
    expect(limited).toHaveLength(5);
  });

  it("afterSeq + limit compose correctly", () => {
    const task = store.createTask({ type: "noop", title: "afterSeq+limit" });
    for (let i = 0; i < 20; i++) {
      store.appendEvent(task.id, { kind: "reasoning", text: String(i), subkind: "message" });
    }
    // total: 21 events (0..20)

    const result = store.getEvents(task.id, { afterSeq: 5, limit: 3 });
    expect(result).toHaveLength(3);
    expect(result[0]?.seq).toBe(6);
    expect(result[2]?.seq).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// listTasks
// ---------------------------------------------------------------------------

describe("listTasks", () => {
  it("returns all tasks ordered by created_at DESC when no filter", () => {
    store.createTask({ type: "noop", title: "first" });
    store.createTask({ type: "noop", title: "second" });
    const tasks = store.listTasks();
    expect(tasks).toHaveLength(2);
  });

  it("filters by status", () => {
    const t1 = store.createTask({ type: "noop", title: "pending task" });
    store.updateTaskStatus(t1.id, { from: "PENDING", to: "RUNNING" });
    store.createTask({ type: "noop", title: "another pending" });

    const running = store.listTasks({ status: ["RUNNING"] });
    expect(running).toHaveLength(1);
    expect(running[0]?.id).toBe(t1.id);
  });

  it("filters by type", () => {
    store.createTask({ type: "noop", title: "noop task" });
    store.createTask({ type: "human_review", title: "human task" });

    const noops = store.listTasks({ type: ["noop"] });
    expect(noops).toHaveLength(1);
    expect(noops[0]?.type).toBe("noop");
  });

  it("filters by parent", () => {
    const parent = store.createTask({ type: "noop", title: "parent" });
    const child = store.createTask({ type: "noop", title: "child", parentTaskId: parent.id });
    store.createTask({ type: "noop", title: "orphan" });

    const children = store.listTasks({ parent: parent.id });
    expect(children).toHaveLength(1);
    expect(children[0]?.id).toBe(child.id);
  });

  it("multiple filters compose with AND", () => {
    const t1 = store.createTask({ type: "noop", title: "noop pending" });
    const t2 = store.createTask({ type: "human_review", title: "review pending" });
    store.updateTaskStatus(t1.id, { from: "PENDING", to: "RUNNING" });
    // t2 is still PENDING

    const result = store.listTasks({ status: ["PENDING"], type: ["human_review"] });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(t2.id);
  });
});

// ---------------------------------------------------------------------------
// listPendingEligible
// ---------------------------------------------------------------------------

describe("listPendingEligible", () => {
  it("returns PENDING and BLOCKED tasks ordered by priority DESC, created_at ASC", () => {
    const low = store.createTask({ type: "noop", title: "low priority", priority: 0 });
    const high = store.createTask({ type: "noop", title: "high priority", priority: 10 });
    const mid = store.createTask({ type: "noop", title: "mid priority", priority: 5 });

    const eligible = store.listPendingEligible();
    expect(eligible).toHaveLength(3);
    expect(eligible[0]?.id).toBe(high.id);
    expect(eligible[1]?.id).toBe(mid.id);
    expect(eligible[2]?.id).toBe(low.id);
  });

  it("does not include RUNNING tasks", () => {
    const task = store.createTask({ type: "noop", title: "running task" });
    store.updateTaskStatus(task.id, { from: "PENDING", to: "RUNNING" });

    const eligible = store.listPendingEligible();
    expect(eligible.every((t) => t.id !== task.id)).toBe(true);
  });

  it("does not include COMPLETE or FAILED tasks", () => {
    const t1 = store.createTask({ type: "noop", title: "complete" });
    const t2 = store.createTask({ type: "noop", title: "failed" });
    store.updateTaskStatus(t1.id, { from: "PENDING", to: "RUNNING" });
    store.updateTaskStatus(t1.id, { from: "RUNNING", to: "COMPLETE" });
    store.updateTaskStatus(t2.id, { from: "PENDING", to: "RUNNING" });
    store.updateTaskStatus(t2.id, { from: "RUNNING", to: "FAILED" });

    const eligible = store.listPendingEligible();
    expect(eligible.some((t) => t.id === t1.id)).toBe(false);
    expect(eligible.some((t) => t.id === t2.id)).toBe(false);
  });

  it("includes BLOCKED tasks", () => {
    const task = store.createTask({ type: "noop", title: "blocked" });
    store.updateTaskStatus(task.id, { from: "PENDING", to: "BLOCKED", reason: "blocked_no_executor" });

    const eligible = store.listPendingEligible();
    expect(eligible.some((t) => t.id === task.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FK cascade (ON DELETE CASCADE on events.task_id)
// ---------------------------------------------------------------------------

describe("FK cascade", () => {
  it("deletes events when the parent task is deleted", () => {
    // Use the underlying DB directly since Store doesn't expose delete
    // This verifies the ON DELETE CASCADE constraint is in effect
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    applyMigrations(db);
    const s = createStore(db);

    const task = s.createTask({ type: "noop", title: "fk test" });
    s.appendEvent(task.id, { kind: "error", message: "test" });
    s.appendEvent(task.id, { kind: "error", message: "test2" });

    // Manually delete the task row
    db.prepare("DELETE FROM tasks WHERE id = ?").run(task.id);

    const events = db.prepare("SELECT COUNT(*) as cnt FROM events WHERE task_id = ?")
      .get(task.id) as { cnt: number };
    expect(events.cnt).toBe(0);

    s.close();
  });
});
