/**
 * Migrations runner tests.
 *
 * Uses in-memory SQLite databases to avoid file system state.
 * Exercises: initial apply, idempotency, PRAGMA user_version consistency.
 */

import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "../../src/runner/migrations/runner.js";

function makeMemoryDb(): InstanceType<typeof Database> {
  return new Database(":memory:");
}

describe("applyMigrations", () => {
  it("applies migration 001 to a fresh DB", () => {
    const db = makeMemoryDb();
    const { applied } = applyMigrations(db);
    expect(applied).toEqual([1]);

    // PRAGMA user_version must be 1 after apply (S3 — set AFTER transaction)
    const version = db.pragma("user_version", { simple: true }) as number;
    expect(version).toBe(1);

    // tasks table must exist
    const tablesRow = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const tableNames = tablesRow.map((r) => r.name);
    expect(tableNames).toContain("tasks");
    expect(tableNames).toContain("events");
    expect(tableNames).toContain("migrations");

    db.close();
  });

  it("migrations table has exactly one row after apply", () => {
    const db = makeMemoryDb();
    applyMigrations(db);

    const rows = db.prepare("SELECT version FROM migrations").all() as { version: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.version).toBe(1);

    db.close();
  });

  it("second apply is a no-op — user_version stays 1, migrations table stays at 1 row", () => {
    const db = makeMemoryDb();
    const { applied: firstApply } = applyMigrations(db);
    expect(firstApply).toEqual([1]);

    const { applied: secondApply } = applyMigrations(db);
    expect(secondApply).toEqual([]);

    const version = db.pragma("user_version", { simple: true }) as number;
    expect(version).toBe(1);

    const rows = db.prepare("SELECT version FROM migrations").all() as { version: number }[];
    expect(rows).toHaveLength(1);

    db.close();
  });

  it("idx_tasks_eligible index exists after apply", () => {
    const db = makeMemoryDb();
    applyMigrations(db);

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_tasks_eligible'"
    ).all() as { name: string }[];
    expect(indexes).toHaveLength(1);

    db.close();
  });

  it("events.task_id has ON DELETE CASCADE FK", () => {
    const db = makeMemoryDb();
    db.pragma("foreign_keys = ON");
    applyMigrations(db);

    // Insert a task, then delete it — events should cascade
    const taskId = "test-task-id";
    db.prepare(
      "INSERT INTO tasks (id, type, status, title, source, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(taskId, "noop", "PENDING", "Test", "operator_injected", new Date().toISOString());

    db.prepare(
      "INSERT INTO events (id, task_id, seq, at, kind, payload) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("evt-id", taskId, 0, new Date().toISOString(), "status_change", "{}");

    const before = db.prepare("SELECT COUNT(*) as cnt FROM events").get() as { cnt: number };
    expect(before.cnt).toBe(1);

    db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);

    const after = db.prepare("SELECT COUNT(*) as cnt FROM events").get() as { cnt: number };
    expect(after.cnt).toBe(0);

    db.close();
  });
});
