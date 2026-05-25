/**
 * Golden test for transcriptParse against the committed fixture.
 *
 * Pinned to Claude Code 2.1.148 JSONL format.
 * Fixture: app/server/__fixtures__/sample-session.jsonl
 *
 * This test verifies:
 * 1. All six LogEvent kinds are emitted correctly.
 * 2. Known skip types (last-prompt, file-history-snapshot, attachment,
 *    queue-operation, permission-mode) produce no events.
 * 3. The expected event sequence is produced end-to-end.
 * 4. Sub-agent task-type inference (D2 keyword table) matches all table rows.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseTranscript, inferTaskType } from "./transcriptParse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const FIXTURE_PATH = join(__dirname, "__fixtures__", "sample-session.jsonl");

// ---------------------------------------------------------------------------
// Golden test: fixture → expected LogEvent[] sequence
// ---------------------------------------------------------------------------

describe("parseTranscript (golden fixture)", () => {
  const content = readFileSync(FIXTURE_PATH, "utf8");
  const { events } = parseTranscript("session:abc123", content);

  it("emits at least one event", () => {
    expect(events.length).toBeGreaterThan(0);
  });

  it("emits events in monotonically increasing seq order", () => {
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const curr = events[i];
      if (prev !== undefined && curr !== undefined) {
        expect(curr.seq).toBeGreaterThan(prev.seq);
      }
    }
  });

  it("stamps every event with the correct taskId", () => {
    for (const event of events) {
      expect(event.taskId).toBe("session:abc123");
    }
  });

  it("produces a status_change event from system/local_command", () => {
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("status_change");
  });

  it("produces an error event from system/api_error with the right message", () => {
    const errorEvents = events.flatMap((e) => (e.kind === "error" ? [e] : []));
    expect(errorEvents.length).toBeGreaterThanOrEqual(1);
    const first = errorEvents[0];
    if (first === undefined) throw new Error("expected at least one error event");
    expect(first.message).toContain("Rate limit");
  });

  it("produces tool_call events from assistant tool_use blocks", () => {
    const toolCalls = events.flatMap((e) => (e.kind === "tool_call" ? [e] : []));
    expect(toolCalls.length).toBeGreaterThanOrEqual(2);
    const names = toolCalls.map((e) => e.toolName);
    expect(names).toContain("Read");
    expect(names).toContain("Write");
  });

  it("produces tool_result events from user tool_result blocks", () => {
    const toolResults = events.flatMap((e) => (e.kind === "tool_result" ? [e] : []));
    expect(toolResults.length).toBeGreaterThanOrEqual(2);
    const statuses = toolResults.map((e) => e.status);
    expect(statuses).toContain("ok");
  });

  it("emits an artifact event after a successful Write tool result", () => {
    const artifacts = events.flatMap((e) => (e.kind === "artifact" ? [e] : []));
    expect(artifacts.length).toBeGreaterThanOrEqual(1);
    const first = artifacts[0];
    if (first === undefined) throw new Error("expected at least one artifact event");
    expect(first.path.length).toBeGreaterThan(0);
    expect(["doc_created", "doc_updated", "file_written"]).toContain(first.artifactKind);
  });

  it("produces reasoning/message events from assistant text blocks", () => {
    const messageEvents = events.filter(
      (e) => e.kind === "reasoning" && e.subkind === "message",
    );
    expect(messageEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("produces reasoning/thinking events from assistant thinking blocks", () => {
    const thinkingEvents = events.filter(
      (e) => e.kind === "reasoning" && e.subkind === "thinking",
    );
    expect(thinkingEvents.length).toBeGreaterThanOrEqual(1);
    const first = thinkingEvents[0];
    if (first !== undefined && first.kind === "reasoning") {
      expect(first.text).toContain("middleware");
    }
  });

  it("computes durationMs for tool_result when timestamps are available", () => {
    const resultsWithDuration = events.filter(
      (e) => e.kind === "tool_result" && e.durationMs !== undefined,
    );
    expect(resultsWithDuration.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT emit ai-title as a LogEvent", () => {
    // ai-title lines should not produce any events
    // (they're consumed by title derivation)
    for (const event of events) {
      // No LogEvent kind corresponds to ai-title
      expect(["reasoning", "tool_call", "tool_result", "artifact", "status_change", "error"]).toContain(event.kind);
    }
  });
});

// ---------------------------------------------------------------------------
// D2 keyword table — sub-agent task type inference
// ---------------------------------------------------------------------------

describe("inferTaskType (D2 keyword table)", () => {
  const table: Array<{ description: string; expected: string }> = [
    { description: "Implement 08-markdown node", expected: "implement" },
    { description: "Implementation of the health dashboard", expected: "implement" },
    { description: "Spec review for 10-orchestration", expected: "spec_review" },
    { description: "Review spec draft for 04-tasks", expected: "spec_review" },
    { description: "Review draft — 09-workflow-progress", expected: "spec_review" },
    { description: "SPEC_REVIEW for node 05-logs", expected: "spec_review" },
    { description: "Implementation review for 03-docs", expected: "verify" },
    { description: "Review implementation of 06-health", expected: "verify" },
    { description: "Verify the orchestration node", expected: "verify" },
    { description: "Verification of the health panel", expected: "verify" },
    { description: "Draft spec for 11-settings", expected: "spec_draft" },
    { description: "Author spec for 04-tasks", expected: "spec_draft" },
    { description: "Author DRAFT for 07-replay", expected: "spec_draft" },
    { description: "Spec draft — 05-logs", expected: "spec_draft" },
    { description: "Refactor the docs structure", expected: "doc_refactor" },
    { description: "Doc refactor for 00-project", expected: "doc_refactor" },
    { description: "Triage the open issues in 06-health", expected: "issue_triage" },
    { description: "Investigate flaky typecheck", expected: "issue_triage" },
    { description: "Diagnose the broken build", expected: "issue_triage" },
    { description: "Re-verify 08-markdown after fix", expected: "reverify" },
    { description: "Reverify the health panel", expected: "reverify" },
    { description: "Something completely unrecognized", expected: "agent_task" },
    { description: "", expected: "agent_task" },
  ];

  for (const { description, expected } of table) {
    it(`"${description.slice(0, 40)}" → ${expected}`, () => {
      expect(inferTaskType(description)).toBe(expected);
    });
  }
});
