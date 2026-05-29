/**
 * Snapshot test for the doc_refactor prompt template.
 *
 * Spec: docs/06-agent-dispatcher/04-prompt-templates.md §Requirements item 8, D8
 * Fixture: deterministic UUID + fixed projectRoot (S2 fix — no crypto.randomUUID(), no os.cwd()).
 */

import { describe, it, expect } from "vitest";
import render from "../../../src/dispatcher/prompts/docRefactor.js";
import type { Task } from "@ledger/parser";
import type { ProjectContext } from "../../../src/context.js";

const TASK_ID = "00000000-0000-0000-0000-000000000001";
const PROJECT_ROOT = "/project";

const task: Task = {
  id: TASK_ID,
  type: "doc_refactor",
  status: "PENDING",
  title: "Test doc_refactor task",
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

describe("docRefactor template snapshot", () => {
  it("renders deterministically (snapshot)", () => {
    expect(render(task, ctx)).toMatchInlineSnapshot(`
      "Task ID: 00000000-0000-0000-0000-000000000001
      Task type: doc_refactor
      Project root: /project

      # Doc refactorer persona

      You are a doc refactorer. The spec you will rewrite has accumulated drift between code and documentation, or its Open Issues section has grown large enough to block implementer attention. Your job is to bring the spec back into agreement with the code (or vice versa when the code is wrong) and tighten the Open Issues list. Do not change the spec's lifecycle status. Update the Implementation Notes section with a "Refactored YYYY-MM-DD" subsection summarising what changed and why.

      ## Required reading

      Load these files via the Read tool before acting. They establish constraints you must honour:

      - CLAUDE.md

      ## Success criteria

      1. Read the spec at (spec doc for node 00000000-0000-0000-0000-000000000001) and its flagged Open Issues. Identify drift between the spec and the current codebase.
      2. Bring the spec into agreement with the code — or vice versa if the code diverged incorrectly. Document which way the reconciliation went.
      3. Do NOT change the spec's lifecycle Status field.
      4. Tighten the Open Issues section: resolve items that are no longer valid, re-prioritise items whose context has changed.
      5. Add a 'Refactored YYYY-MM-DD' subsection to Implementation Notes summarising what changed and why.
      6. Emit runner.complete_task when the refactored doc is committed.

      ## MCP tool contract

      You are working on a task whose ID is shown in the task header at the top of this prompt and is also available as the \`LEDGER_TASK_ID\` environment variable. The \`runner.*\` MCP tools you have access to all require this task_id as their first argument; calls with any other task_id are rejected with a \`task_not_bound\` error.

      Emit \`runner.emit_event\` for each meaningful step. The event's required shape varies by kind (full schema in docs/_schemas/log-event.schema.json):
        - kind: \`"reasoning"\` — { text: string, subkind: \`"thinking"\` | \`"message"\` }
        - kind: \`"tool_call"\` — { callId: string, toolName: string, arguments: object } (a summary of a non-MCP tool call: Read, Edit, Bash, etc.)
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
