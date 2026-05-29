/**
 * Tests for shared.ts composition helpers.
 *
 * Spec: docs/06-agent-dispatcher/04-prompt-templates.md §Requirements item 8
 */

import { describe, it, expect } from "vitest";
import {
  personaPreamble,
  mcpToolContractReminder,
  requiredReadingSection,
  taskHeaderBlock,
} from "../../../src/dispatcher/prompts/shared.js";
import type { Persona } from "../../../src/dispatcher/prompts/shared.js";
import type { Task } from "@ledger/parser";
import type { ProjectContext } from "../../../src/context.js";

// ---------------------------------------------------------------------------
// Deterministic fixtures (S2)
// ---------------------------------------------------------------------------

const TASK_ID = "00000000-0000-0000-0000-000000000001";
const PROJECT_ROOT = "/project";

function makeTask(type: Task["type"] = "implement"): Task {
  return {
    id: TASK_ID,
    type,
    status: "PENDING",
    title: "Test task",
    source: "operator_injected",
    dependsOn: [],
    resourceClaims: [],
    dbRowVersion: 0,
    priority: 0,
    createdAt: "2026-05-28T00:00:00.000Z",
  };
}

const MOCK_CTX: ProjectContext = {
  projectRoot: PROJECT_ROOT,
  docsRoot: `${PROJECT_ROOT}/docs`,
  project: { schemaVersion: 1, name: "Test", docs: "docs", agent: "claude-code" },
  port: 4180,
  startedAt: "2026-05-28T00:00:00.000Z",
  store: null as unknown as ProjectContext["store"],
  runner: null as unknown as ProjectContext["runner"],
  mcp: null as unknown as ProjectContext["mcp"],
  binding: null as unknown as ProjectContext["binding"],
  docs: [],
  resolveDocPath: () => undefined,
};

// ---------------------------------------------------------------------------
// personaPreamble
// ---------------------------------------------------------------------------

const ALL_PERSONAS: Persona[] = [
  "implement", "spec_review", "verify", "spec_draft",
  "reverify", "doc_refactor", "issue_triage", "project_status_review",
];

describe("personaPreamble", () => {
  it("implement preamble differs from spec_review preamble (distinct persona content)", () => {
    expect(personaPreamble("implement")).not.toBe(personaPreamble("spec_review"));
  });

  it("all eight persona preambles are distinct strings", () => {
    const preambles = ALL_PERSONAS.map(personaPreamble);
    const unique = new Set(preambles);
    expect(unique.size).toBe(ALL_PERSONAS.length);
  });

  it("each preamble is a non-empty string", () => {
    for (const persona of ALL_PERSONAS) {
      const p = personaPreamble(persona);
      expect(typeof p).toBe("string");
      expect(p.length).toBeGreaterThan(0);
    }
  });

  it("implement preamble contains 'ship'", () => {
    expect(personaPreamble("implement")).toMatch(/ship/i);
  });

  it("spec_review preamble contains 'reviewer'", () => {
    expect(personaPreamble("spec_review")).toMatch(/reviewer/i);
  });
});

// ---------------------------------------------------------------------------
// mcpToolContractReminder — stability snapshot
// ---------------------------------------------------------------------------

describe("mcpToolContractReminder", () => {
  it("is stable (snapshot)", () => {
    expect(mcpToolContractReminder()).toMatchInlineSnapshot(`
      "## MCP tool contract

      You are working on a task whose ID is shown in the task header at the top of this prompt and is also available as the \`LEDGER_TASK_ID\` environment variable. The \`runner.*\` MCP tools you have access to all require this task_id as their first argument; calls with any other task_id are rejected with a \`task_not_bound\` error.

      Emit \`runner.emit_event\` for each meaningful step. The event's required shape varies by kind (full schema in docs/_schemas/log-event.schema.json):
        - kind: \`"reasoning"\` — { text: string, subkind: \`"thinking"\` | \`"message"\` }
        - kind: \`"tool_call"\` — { callId: string, toolName: string, arguments: string (serialized JSON of the tool arguments) } (a summary of a non-MCP tool call: Read, Edit, Bash, etc.)
        - kind: \`"artifact"\` — { artifactKind: \`"doc_created"\` | \`"doc_updated"\` | \`"file_written"\` | \`"version_committed"\`, path: string } (a file or doc you wrote or modified)
      Do NOT emit kind: \`"status_change"\` events — the runner manages those transactionally; the validator rejects them with \`status_change_not_emittable\`.
      Malformed events (missing required fields) are rejected with \`invalid_event_shape\` and an AJV error list — fix the shape and retry.

      End with exactly one terminal call:
        - \`runner.complete_task\` — success
        - \`runner.fail_task\` — with an agent-supplied reason string (stored verbatim on the status_change event)
        - \`runner.await_human_review\` — with a review_payload \`{ summary: string, diffRef?: string }\`; the task pauses for the operator to approve or reject via \`/api/tasks/:id/approve|reject\`. On approve, a follow-up task may be created; on reject, the rationale is recorded and the task transitions to REJECTED."
    `);
  });

  it("includes task_not_bound error name", () => {
    expect(mcpToolContractReminder()).toContain("task_not_bound");
  });

  it("includes all three event kind names", () => {
    const reminder = mcpToolContractReminder();
    expect(reminder).toContain("reasoning");
    expect(reminder).toContain("tool_call");
    expect(reminder).toContain("artifact");
  });

  it("includes all three terminal call names", () => {
    const reminder = mcpToolContractReminder();
    expect(reminder).toContain("runner.complete_task");
    expect(reminder).toContain("runner.fail_task");
    expect(reminder).toContain("runner.await_human_review");
  });

  it("mentions artifactKind discriminant (S4 fix)", () => {
    expect(mcpToolContractReminder()).toContain("artifactKind");
  });

  it("mentions status_change_not_emittable", () => {
    expect(mcpToolContractReminder()).toContain("status_change_not_emittable");
  });
});

// ---------------------------------------------------------------------------
// requiredReadingSection
// ---------------------------------------------------------------------------

describe("requiredReadingSection", () => {
  it("formats non-empty path list with bullet points", () => {
    const result = requiredReadingSection(["CLAUDE.md", "docs/00-project.md"]);
    expect(result).toContain("## Required reading");
    expect(result).toContain("- CLAUDE.md");
    expect(result).toContain("- docs/00-project.md");
  });

  it("empty paths returns placeholder", () => {
    const result = requiredReadingSection([]);
    expect(result).toContain("## Required reading");
    expect(result).toContain("(no documents required for this task.)");
    expect(result).not.toContain("- ");
  });

  it("single path formats correctly", () => {
    const result = requiredReadingSection(["CLAUDE.md"]);
    expect(result).toContain("- CLAUDE.md");
  });
});

// ---------------------------------------------------------------------------
// taskHeaderBlock
// ---------------------------------------------------------------------------

describe("taskHeaderBlock", () => {
  it("includes task ID verbatim", () => {
    const task = makeTask("implement");
    expect(taskHeaderBlock(task, MOCK_CTX)).toContain(TASK_ID);
  });

  it("includes task type verbatim", () => {
    const task = makeTask("spec_review");
    expect(taskHeaderBlock(task, MOCK_CTX)).toContain("spec_review");
  });

  it("includes project root verbatim", () => {
    const task = makeTask("implement");
    expect(taskHeaderBlock(task, MOCK_CTX)).toContain(PROJECT_ROOT);
  });

  it("contains all three required fields", () => {
    const task = makeTask("implement");
    const block = taskHeaderBlock(task, MOCK_CTX);
    expect(block).toContain("Task ID:");
    expect(block).toContain("Task type:");
    expect(block).toContain("Project root:");
  });
});
