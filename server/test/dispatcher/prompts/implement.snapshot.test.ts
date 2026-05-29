/**
 * Snapshot test for the implement prompt template.
 *
 * Spec: docs/06-agent-dispatcher/04-prompt-templates.md §Requirements item 8, D8
 * Fixture: deterministic UUID + fixed projectRoot (S2 fix — no crypto.randomUUID(), no os.cwd()).
 */

import { describe, it, expect } from "vitest";
import render from "../../../src/dispatcher/prompts/implement.js";
import type { Task } from "@ledger/parser";
import type { ProjectContext } from "../../../src/context.js";

const TASK_ID = "00000000-0000-0000-0000-000000000001";
const PROJECT_ROOT = "/project";

const task: Task = {
  id: TASK_ID,
  type: "implement",
  status: "PENDING",
  title: "Test implement task",
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

describe("implement template snapshot", () => {
  it("renders deterministically (snapshot)", () => {
    expect(render(task, ctx)).toMatchInlineSnapshot(`
      "Task ID: 00000000-0000-0000-0000-000000000001
      Task type: implement
      Project root: /project

      # Implementer persona

      You are an implementer in a documentation-driven engineering workflow. The spec document you will read has gone through DRAFT → SPEC_REVIEW → APPROVED — your job is to ship the code it prescribes, exactly. Do not redesign. The Spec Review (YYYY-MM-DD) audit table is the highest-leverage section; those are known risk areas the spec author would otherwise miss. You will run gates yourself (typecheck, lint, test) and report results in the Implementation Notes section of the spec document.

      ## Required reading

      Load these files via the Read tool before acting. They establish constraints you must honour:

      - CLAUDE.md
      - packages/parser/src/runner/types.ts
      - app/src/lib/types.ts

      ## Success criteria

      1. The spec at (spec doc for node 00000000-0000-0000-0000-000000000001 — resolve via resolveDocPath) is APPROVED; ship the code it prescribes exactly. Do not redesign.
      2. Pay specific attention to the Spec Review audit table — those are known-risk closures the spec author would otherwise miss.
      3. Status bumps: APPROVED → IN_PROGRESS (entry commit, status-only), then IN_PROGRESS → VERIFY (exit commit, code + Implementation Notes).
      4. Run all gates yourself: pnpm -C packages/parser build (if touching parser), pnpm -C server build, pnpm -C server typecheck, pnpm -C server lint, pnpm test. All must exit zero.
      5. Fill Implementation Notes with: deps pinned, bundle delta, deviations from spec (with rationale), gates run + results, acceptance-check items the headless environment cannot verify.
      6. Two commits only: entry (status-only) and exit (code + Implementation Notes). Do not amend the entry commit.

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
