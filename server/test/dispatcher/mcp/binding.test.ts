/**
 * Binding registry unit tests.
 *
 * Covers: bind populates; unbind removes; lookup returns value or undefined;
 * requireBound returns on hit; throws McpError(InvalidParams, "task_not_bound", ...)
 * on each of the three failure modes (no_session, session_not_bound, task_id_mismatch).
 *
 * Spec: docs/06-agent-dispatcher/02-runner-tools.md §Requirements item 10
 */

import { describe, expect, it } from "vitest";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { createBindingRegistry } from "../../../src/dispatcher/mcp/binding.js";

// ---------------------------------------------------------------------------
// bind / unbind / lookup
// ---------------------------------------------------------------------------

describe("bind + lookup", () => {
  it("bind populates the registry", () => {
    const reg = createBindingRegistry();
    reg.bind("session-1", "task-a");
    expect(reg.lookup("session-1")).toBe("task-a");
  });

  it("bind with undefined taskId is a no-op (no X-Ledger-Task-Id header)", () => {
    const reg = createBindingRegistry();
    reg.bind("session-1", undefined);
    expect(reg.lookup("session-1")).toBeUndefined();
  });

  it("bind with empty-string taskId is a no-op", () => {
    const reg = createBindingRegistry();
    reg.bind("session-1", "");
    expect(reg.lookup("session-1")).toBeUndefined();
  });

  it("lookup returns undefined for unknown session", () => {
    const reg = createBindingRegistry();
    expect(reg.lookup("unknown")).toBeUndefined();
  });

  it("unbind removes the entry", () => {
    const reg = createBindingRegistry();
    reg.bind("session-1", "task-a");
    reg.unbind("session-1");
    expect(reg.lookup("session-1")).toBeUndefined();
  });

  it("unbind on non-existent session is a no-op", () => {
    const reg = createBindingRegistry();
    // Should not throw
    expect(() => { reg.unbind("unknown"); }).not.toThrow();
  });

  it("size reflects the count of active bindings", () => {
    const reg = createBindingRegistry();
    expect(reg.size()).toBe(0);
    reg.bind("session-1", "task-a");
    expect(reg.size()).toBe(1);
    reg.bind("session-2", "task-b");
    expect(reg.size()).toBe(2);
    reg.unbind("session-1");
    expect(reg.size()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// requireBound — success path
// ---------------------------------------------------------------------------

describe("requireBound — success path", () => {
  it("returns the bound taskId when session is bound and claimed taskId matches", () => {
    const reg = createBindingRegistry();
    reg.bind("session-1", "task-a");
    const result = reg.requireBound("session-1", "task-a");
    expect(result).toBe("task-a");
  });
});

// ---------------------------------------------------------------------------
// requireBound — rejection modes
// ---------------------------------------------------------------------------

describe("requireBound — no_session rejection", () => {
  it("throws McpError with reason no_session when sessionId is undefined", () => {
    const reg = createBindingRegistry();
    try {
      reg.requireBound(undefined, "task-a");
      throw new Error("should have thrown");
    } catch (err) {
      // McpError.message is non-enumerable; check it separately from toMatchObject
      expect((err as Error).message).toContain("task_not_bound");
      expect(err).toMatchObject({
        code: ErrorCode.InvalidParams,
        data: { reason: "no_session", claimedTaskId: "task-a" },
      });
    }
  });
});

describe("requireBound — session_not_bound rejection", () => {
  it("throws McpError with reason session_not_bound when session has no binding", () => {
    const reg = createBindingRegistry();
    try {
      reg.requireBound("session-1", "task-a");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("task_not_bound");
      expect(err).toMatchObject({
        code: ErrorCode.InvalidParams,
        data: { reason: "session_not_bound", sessionId: "session-1", claimedTaskId: "task-a" },
      });
    }
  });

  it("throws session_not_bound after unbind", () => {
    const reg = createBindingRegistry();
    reg.bind("session-1", "task-a");
    reg.unbind("session-1");
    try {
      reg.requireBound("session-1", "task-a");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toMatchObject({
        data: { reason: "session_not_bound" },
      });
    }
  });
});

describe("requireBound — task_id_mismatch rejection", () => {
  it("throws McpError with reason task_id_mismatch when claimed taskId differs from bound", () => {
    const reg = createBindingRegistry();
    reg.bind("session-1", "task-a");
    try {
      reg.requireBound("session-1", "task-b");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("task_not_bound");
      expect(err).toMatchObject({
        code: ErrorCode.InvalidParams,
        data: {
          reason: "task_id_mismatch",
          sessionId: "session-1",
          claimedTaskId: "task-b",
          boundTaskId: "task-a",
        },
      });
    }
  });
});
