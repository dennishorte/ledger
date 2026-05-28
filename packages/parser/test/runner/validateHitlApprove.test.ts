/**
 * validateHitlApprove round-trip tests.
 *
 * Spec: docs/05-task-runner/03-hitl-gate.md §Tests item 7.
 */

import { describe, expect, it } from "vitest";
import { validateHitlApprove } from "../../src/runner/validateHitlApprove.js";

describe("validateHitlApprove", () => {
  it("accepts minimal { dbRowVersion: N }", () => {
    const result = validateHitlApprove({ dbRowVersion: 3 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.dbRowVersion).toBe(3);
      expect(result.input.note).toBeUndefined();
    }
  });

  it("accepts { dbRowVersion, note }", () => {
    const result = validateHitlApprove({ dbRowVersion: 0, note: "looks good" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.note).toBe("looks good");
  });

  it("rejects missing dbRowVersion", () => {
    const result = validateHitlApprove({ note: "no version" });
    expect(result.ok).toBe(false);
  });

  it("rejects non-integer dbRowVersion", () => {
    const result = validateHitlApprove({ dbRowVersion: 1.5 });
    expect(result.ok).toBe(false);
  });

  it("rejects negative dbRowVersion", () => {
    const result = validateHitlApprove({ dbRowVersion: -1 });
    expect(result.ok).toBe(false);
  });

  it("rejects additional properties", () => {
    const result = validateHitlApprove({ dbRowVersion: 0, bonus: "field" });
    expect(result.ok).toBe(false);
  });

  it("rejects note longer than 4096 chars", () => {
    const result = validateHitlApprove({ dbRowVersion: 0, note: "x".repeat(4097) });
    expect(result.ok).toBe(false);
  });
});
