/**
 * validateTaskInput round-trip tests.
 *
 * Verifies the minimal valid shape, default application, and key rejection cases.
 */

import { describe, expect, it } from "vitest";
import { validateTaskInput } from "../../src/runner/validateTaskInput.js";

describe("validateTaskInput", () => {
  it("accepts minimal { type: 'noop', title: '...' } (B1 — noop must be present)", () => {
    const result = validateTaskInput({ type: "noop", title: "test task" });
    expect(result.ok).toBe(true);
  });

  it("applies defaults: source='operator_injected', dependsOn=[], resourceClaims=[], priority=0", () => {
    const result = validateTaskInput({ type: "noop", title: "defaults test" });
    if (!result.ok) throw new Error("unexpected failure: " + JSON.stringify(result.errors));
    expect(result.input.source).toBe("operator_injected");
    expect(result.input.dependsOn).toEqual([]);
    expect(result.input.resourceClaims).toEqual([]);
    expect(result.input.priority).toBe(0);
  });

  it("does not mutate the caller's object when applying defaults", () => {
    const original = { type: "noop" as const, title: "immutable" };
    validateTaskInput(original);
    // original should still not have defaults added
    expect("source" in original).toBe(false);
    expect("dependsOn" in original).toBe(false);
  });

  it("accepts all TaskType values including noop", () => {
    const types = [
      "spec_draft", "spec_review", "implement", "verify",
      "doc_refactor", "issue_triage", "human_review", "reverify",
      "project_status_review", "operator_session", "agent_task", "noop",
    ];
    for (const type of types) {
      const result = validateTaskInput({ type, title: "test" });
      expect(result.ok).toBe(true);
    }
  });

  it("accepts all explicit source values", () => {
    const sources = ["agent_generated", "operator_injected", "daemon_triggered"];
    for (const source of sources) {
      const result = validateTaskInput({ type: "noop", title: "test", source });
      expect(result.ok).toBe(true);
    }
  });

  it("accepts full TaskInput with all optional fields", () => {
    const result = validateTaskInput({
      type: "human_review",
      title: "Review this PR",
      source: "operator_injected",
      parentTaskId: "parent-uuid",
      dependsOn: ["dep-uuid-1"],
      resourceClaims: [{ kind: "node", nodeId: "01-leaf", mode: "write" }],
      agent: { model: "claude-opus-4-5", persona: "reviewer" },
      reviewPayload: { summary: "Needs approval", diffRef: "abc123" },
      priority: 5,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects missing 'type' field", () => {
    const result = validateTaskInput({ title: "no type" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /type/.test(e.path) || /type/.test(e.message))).toBe(true);
    }
  });

  it("rejects missing 'title' field", () => {
    const result = validateTaskInput({ type: "noop" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /title/.test(e.path) || /title/.test(e.message))).toBe(true);
    }
  });

  it("rejects invalid type string", () => {
    const result = validateTaskInput({ type: "not_a_valid_type", title: "test" });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid source string", () => {
    const result = validateTaskInput({ type: "noop", title: "test", source: "invalid_source" });
    expect(result.ok).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(validateTaskInput(null).ok).toBe(false);
    expect(validateTaskInput("string").ok).toBe(false);
    expect(validateTaskInput(42).ok).toBe(false);
  });

  it("rejects empty title", () => {
    const result = validateTaskInput({ type: "noop", title: "" });
    expect(result.ok).toBe(false);
  });
});
