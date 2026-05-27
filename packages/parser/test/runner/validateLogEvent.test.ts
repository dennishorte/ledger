/**
 * validateLogEvent round-trip tests.
 *
 * Verifies all six kind discriminants are accepted, plus key rejection cases.
 */

import { describe, expect, it } from "vitest";
import { validateLogEvent } from "../../src/runner/validateLogEvent.js";

const BASE = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  taskId: "550e8400-e29b-41d4-a716-446655440000",
  at: "2026-05-27T10:00:00.000Z",
  seq: 0,
};

describe("validateLogEvent", () => {
  it("accepts reasoning event", () => {
    const result = validateLogEvent({ ...BASE, kind: "reasoning", text: "hello", subkind: "thinking" });
    expect(result.ok).toBe(true);
  });

  it("accepts reasoning event with subkind=message", () => {
    const result = validateLogEvent({ ...BASE, kind: "reasoning", text: "msg", subkind: "message" });
    expect(result.ok).toBe(true);
  });

  it("accepts tool_call event", () => {
    const result = validateLogEvent({
      ...BASE,
      kind: "tool_call",
      callId: "call-1",
      toolName: "Read",
      arguments: '{"file_path":"/foo"}',
    });
    expect(result.ok).toBe(true);
  });

  it("accepts tool_result event", () => {
    const result = validateLogEvent({
      ...BASE,
      kind: "tool_result",
      callId: "call-1",
      status: "ok",
      body: "file contents",
      durationMs: 42,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts artifact event", () => {
    const result = validateLogEvent({
      ...BASE,
      kind: "artifact",
      artifactKind: "doc_updated",
      path: "/docs/01-leaf.md",
      docNodeId: "01-leaf",
      summary: "Updated requirements section",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts status_change with both from and to (normal transition)", () => {
    const result = validateLogEvent({
      ...BASE,
      kind: "status_change",
      from: "PENDING",
      to: "RUNNING",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts status_change with only to (seq-0 creation event — from absent, S4)", () => {
    const result = validateLogEvent({
      ...BASE,
      kind: "status_change",
      to: "PENDING",
      // from deliberately absent
    });
    expect(result.ok).toBe(true);
  });

  it("accepts status_change with reason", () => {
    const result = validateLogEvent({
      ...BASE,
      kind: "status_change",
      from: "PENDING",
      to: "BLOCKED",
      reason: "blocked_no_executor",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts error event", () => {
    const result = validateLogEvent({
      ...BASE,
      kind: "error",
      message: "Something went wrong",
      stack: "Error: Something went wrong\n  at ...",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts error event without stack", () => {
    const result = validateLogEvent({
      ...BASE,
      kind: "error",
      message: "Simple error",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects unknown kind value", () => {
    const result = validateLogEvent({ ...BASE, kind: "unknown_kind" });
    expect(result.ok).toBe(false);
  });

  it("rejects event missing required base fields", () => {
    // Missing taskId
    const { taskId: _tid, ...noTaskId } = { ...BASE, kind: "error", message: "test" };
    const result = validateLogEvent(noTaskId);
    expect(result.ok).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(validateLogEvent(null).ok).toBe(false);
    expect(validateLogEvent("string").ok).toBe(false);
    expect(validateLogEvent(123).ok).toBe(false);
  });

  it("rejects tool_result with invalid status value", () => {
    const result = validateLogEvent({
      ...BASE,
      kind: "tool_result",
      callId: "call-1",
      status: "invalid_status",
      body: "contents",
    });
    expect(result.ok).toBe(false);
  });
});
