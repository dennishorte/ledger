/**
 * Snapshot test for the spec_review prompt template.
 *
 * Spec: docs/06-agent-dispatcher/04-prompt-templates.md §Requirements item 8, D8
 * Fixture: deterministic UUID + fixed projectRoot (S2 fix — no crypto.randomUUID(), no os.cwd()).
 */

import { describe, it, expect } from "vitest";
import render from "../../../src/dispatcher/prompts/specReview.js";
import type { Task } from "@ledger/parser";
import type { ProjectContext } from "../../../src/context.js";

const TASK_ID = "00000000-0000-0000-0000-000000000001";
const PROJECT_ROOT = "/project";

const task: Task = {
  id: TASK_ID,
  type: "spec_review",
  status: "PENDING",
  title: "Test spec_review task",
  source: "operator_injected",
  dependsOn: [],
  resourceClaims: [],
  dbRowVersion: 0,
  priority: 0,
  createdAt: "2026-05-28T00:00:00.000Z",
};

const ctx: ProjectContext = {
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

describe("specReview template snapshot", () => {
  it("renders deterministically (snapshot)", () => {
    expect(render(task, ctx)).toMatchInlineSnapshot(`
      "Task ID: 00000000-0000-0000-0000-000000000001
      Task type: spec_review
      Project root: /project

      # Spec reviewer persona

      You are an independent spec reviewer. The author cannot reliably check their own work; your job is to give cold, critical judgment. Read the spec under review plus the parent and sibling specs as house-style benchmarks. Produce: a verdict (LGTM / NEEDS_MINOR_REVISIONS / NEEDS_MAJOR_REVISIONS), a PRD coverage matrix, and findings grouped by severity (Blocking / Should-fix / Nit) with concrete suggested fixes. Be specific. Cite file paths and line numbers where relevant.

      ## Required reading

      Load these files via the Read tool before acting. They establish constraints you must honour:

      - CLAUDE.md
      - app/src/lib/types.ts
      - packages/parser/src/runner/types.ts
      - docs/_process/leaf-workflow.md

      ## Success criteria

      1. Read the spec at (spec doc for node 00000000-0000-0000-0000-000000000001) and its parent/sibling specs as house-style benchmarks.
      2. Produce a PRD coverage matrix (Requirements §N → addressed / partial / missing).
      3. Group findings by severity: Blocking (B), Should-fix (S), Nit (N). Each finding must cite the specific section and include a concrete suggested fix.
      4. Emit a verdict: LGTM / NEEDS_MINOR_REVISIONS / NEEDS_MAJOR_REVISIONS.
      5. Record Confidence notes for the stage-4 implementer on any claims you could not mechanically verify (e.g., external API surface, type signatures).
      6. Complete with runner.complete_task if you deliver the review; runner.fail_task if a blocking prerequisite is missing.

      ## MCP tool contract

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
});
