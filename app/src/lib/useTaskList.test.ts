/**
 * Pure unit tests for mergeTasks — no hooks, no fetch, no React.
 * Five cases per spec §Tests.
 */

import { describe, it, expect } from "vitest";
import { mergeTasks } from "./useTaskList.js";
import type { Task } from "./types.js";

function makeTask(id: string, createdAt: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    type: "noop",
    status: "COMPLETE",
    title: "test",
    source: "operator_injected",
    dependsOn: [],
    resourceClaims: [],
    dbRowVersion: 0,
    priority: 0,
    createdAt,
    ...extra,
  };
}

describe("mergeTasks", () => {
  it("empty + empty → empty array", () => {
    expect(mergeTasks([], [])).toEqual([]);
  });

  it("runner-only → returns runner tasks sorted createdAt DESC", () => {
    const t1 = makeTask("aaa", "2026-01-01T00:00:00Z");
    const t2 = makeTask("bbb", "2026-01-02T00:00:00Z");
    const result = mergeTasks([t1, t2], []);
    expect(result.map((t) => t.id)).toEqual(["bbb", "aaa"]);
  });

  it("transcript-only → returns transcript tasks sorted createdAt DESC", () => {
    const t1 = makeTask("session:aaa", "2026-01-03T00:00:00Z");
    const t2 = makeTask("session:bbb", "2026-01-01T00:00:00Z");
    const result = mergeTasks([], [t1, t2]);
    expect(result.map((t) => t.id)).toEqual(["session:aaa", "session:bbb"]);
  });

  it("mixed → both sources present, sorted by createdAt DESC, no duplicates", () => {
    const r1 = makeTask("runner-1", "2026-01-03T00:00:00Z");
    const r2 = makeTask("runner-2", "2026-01-01T00:00:00Z");
    const t1 = makeTask("session:t1", "2026-01-02T00:00:00Z");
    const result = mergeTasks([r1, r2], [t1]);
    expect(result.map((t) => t.id)).toEqual(["runner-1", "session:t1", "runner-2"]);
    // No duplicates
    expect(new Set(result.map((t) => t.id)).size).toBe(result.length);
  });

  it("ID collision → runner takes precedence over transcript", () => {
    // Structurally impossible in production (different namespaces), but
    // the precedence rule is explicit in the spec (D8).
    const runnerVersion = makeTask("same-id", "2026-01-01T00:00:00Z", { title: "runner" });
    const transcriptVersion = makeTask("same-id", "2026-01-01T00:00:00Z", { title: "transcript" });
    const result = mergeTasks([runnerVersion], [transcriptVersion]);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("runner");
  });
});
