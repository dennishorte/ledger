/**
 * validateHitlReject round-trip tests.
 *
 * Spec: docs/05-task-runner/03-hitl-gate.md §Tests item 7.
 */

import { describe, expect, it } from "vitest";
import { validateHitlReject } from "../../src/runner/validateHitlReject.js";

describe("validateHitlReject", () => {
  it("accepts minimal { dbRowVersion, reason }", () => {
    const result = validateHitlReject({ dbRowVersion: 2, reason: "no good" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.reason).toBe("no good");
      expect(result.input.followUp).toBeUndefined();
    }
  });

  it("rejects empty reason", () => {
    const result = validateHitlReject({ dbRowVersion: 0, reason: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects missing reason", () => {
    const result = validateHitlReject({ dbRowVersion: 0 });
    expect(result.ok).toBe(false);
  });

  it("rejects missing dbRowVersion", () => {
    const result = validateHitlReject({ reason: "no" });
    expect(result.ok).toBe(false);
  });

  it("accepts followUp via $ref to task-input.schema.json", () => {
    const result = validateHitlReject({
      dbRowVersion: 0,
      reason: "retry",
      followUp: { type: "noop", title: "follow-up task" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.followUp).toBeDefined();
      expect(result.input.followUp?.type).toBe("noop");
      // Defaults applied via $ref + useDefaults: true
      expect(result.input.followUp?.source).toBe("operator_injected");
      expect(result.input.followUp?.dependsOn).toEqual([]);
      expect(result.input.followUp?.priority).toBe(0);
    }
  });

  it("rejects followUp with missing required type", () => {
    const result = validateHitlReject({
      dbRowVersion: 0,
      reason: "no",
      followUp: { title: "missing type" } as unknown,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects followUp with invalid type enum value", () => {
    const result = validateHitlReject({
      dbRowVersion: 0,
      reason: "no",
      followUp: { type: "bogus", title: "x" } as unknown,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects additional properties at top level", () => {
    const result = validateHitlReject({
      dbRowVersion: 0,
      reason: "no",
      extra: "field",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects reason > 4096 chars", () => {
    const result = validateHitlReject({
      dbRowVersion: 0,
      reason: "x".repeat(4097),
    });
    expect(result.ok).toBe(false);
  });

  it("does not mutate the caller's object", () => {
    const original = { dbRowVersion: 0, reason: "test", followUp: { type: "noop" as const, title: "f" } };
    validateHitlReject(original);
    expect("source" in original.followUp).toBe(false);
  });
});
