/**
 * Orphan recovery tests.
 * Verifies that recoverOrphans() transitions RUNNING → FAILED,
 * leaves AWAITING_HUMAN_REVIEW intact, and ignores other statuses.
 */

import { afterEach, beforeEach, expect, it } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "../../src/runner/migrations/runner.js";
import { createStore } from "../../src/runner/store.js";
import { recoverOrphans } from "../../src/runner/scheduler.js";
import type { Store } from "../../src/runner/store.js";

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

// 1. DB seeded with two RUNNING rows → recoverOrphans transitions both to FAILED
//    with orphaned_on_restart; returns { recovered: 2 }.
it("transitions RUNNING rows to FAILED with orphaned_on_restart reason", () => {
  const t1 = store.createTask({ type: "noop", title: "orphan-1" });
  const t2 = store.createTask({ type: "noop", title: "orphan-2" });
  store.updateTaskStatus(t1.id, { from: "PENDING", to: "RUNNING" });
  store.updateTaskStatus(t2.id, { from: "PENDING", to: "RUNNING" });

  const result = recoverOrphans(store);
  expect(result.recovered).toBe(2);

  const loaded1 = store.loadTask(t1.id);
  const loaded2 = store.loadTask(t2.id);
  expect(loaded1?.status).toBe("FAILED");
  expect(loaded2?.status).toBe("FAILED");

  // Check the reason in the latest status_change event
  const events1 = store.getEvents(t1.id);
  const lastEvt1 = events1[events1.length - 1];
  if (!lastEvt1) throw new Error("expected at least one event for t1");
  expect(lastEvt1.kind).toBe("status_change");
  if (lastEvt1.kind === "status_change") {
    expect(lastEvt1.reason).toBe("orphaned_on_restart");
  }
});

// 2. DB seeded with one AWAITING_HUMAN_REVIEW row → recoverOrphans leaves it untouched.
it("leaves AWAITING_HUMAN_REVIEW rows untouched; recovered === 0", () => {
  const t = store.createTask({ type: "human_review", title: "awaiting" });
  store.updateTaskStatus(t.id, { from: "PENDING", to: "RUNNING" });
  store.updateTaskStatus(t.id, { from: "RUNNING", to: "AWAITING_HUMAN_REVIEW" });

  const result = recoverOrphans(store);
  expect(result.recovered).toBe(0);

  const loaded = store.loadTask(t.id);
  expect(loaded?.status).toBe("AWAITING_HUMAN_REVIEW");
});

// 3. DB seeded with PENDING / BLOCKED / COMPLETE / FAILED rows → no transitions; recovered === 0.
it("ignores PENDING, BLOCKED, COMPLETE, FAILED rows; recovered === 0", () => {
  const pending = store.createTask({ type: "noop", title: "pending" });

  const blocked = store.createTask({ type: "noop", title: "blocked" });
  store.updateTaskStatus(blocked.id, {
    from: "PENDING",
    to: "BLOCKED",
    reason: "blocked_no_executor",
  });

  const complete = store.createTask({ type: "noop", title: "complete" });
  store.updateTaskStatus(complete.id, { from: "PENDING", to: "RUNNING" });
  store.updateTaskStatus(complete.id, { from: "RUNNING", to: "COMPLETE" });

  const failed = store.createTask({ type: "noop", title: "failed" });
  store.updateTaskStatus(failed.id, { from: "PENDING", to: "RUNNING" });
  store.updateTaskStatus(failed.id, { from: "RUNNING", to: "FAILED" });

  const result = recoverOrphans(store);
  expect(result.recovered).toBe(0);

  expect(store.loadTask(pending.id)?.status).toBe("PENDING");
  expect(store.loadTask(blocked.id)?.status).toBe("BLOCKED");
  expect(store.loadTask(complete.id)?.status).toBe("COMPLETE");
  expect(store.loadTask(failed.id)?.status).toBe("FAILED");
});
