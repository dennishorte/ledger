/**
 * Snapshot test for the verify prompt template.
 *
 * Spec: docs/06-agent-dispatcher/04-prompt-templates.md §Requirements item 8, D8
 * Fixture: deterministic UUID + fixed projectRoot (S2 fix — no crypto.randomUUID(), no os.cwd()).
 */

import { describe, it, expect } from "vitest";
import render from "../../../src/dispatcher/prompts/verify.js";
import type { Task } from "@ledger/parser";
import type { ProjectContext } from "../../../src/context.js";

const TASK_ID = "00000000-0000-0000-0000-000000000001";
const PROJECT_ROOT = "/project";

const task: Task = {
  id: TASK_ID,
  type: "verify",
  status: "PENDING",
  title: "Test verify task",
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

describe("verify template snapshot", () => {
  it("renders deterministically (snapshot)", () => {
    expect(render(task, ctx)).toMatchInlineSnapshot(`
      "Task ID: 00000000-0000-0000-0000-000000000001
      Task type: verify
      Project root: /project

      # Verifier persona

      You are an implementation verifier. The implementer ran in a worktree; you run cold against their diff. Run all gates yourself: pnpm typecheck, pnpm lint, pnpm test. Spot-check the implementer's claims against the actual code. Produce the sign-off matrix in .ledger/process/verification-signoff.md, findings by severity, and deviation assessments. Be terse but specific. Do not change lifecycle status.

      ## Required reading

      Load these files via the Read tool before acting. They establish constraints you must honour:

      - CLAUDE.md
      - .ledger/process/leaf-workflow.md
      - .ledger/process/verification-signoff.md

      ## Success criteria

      1. Read the spec at (spec doc for node 00000000-0000-0000-0000-000000000001) and the worktree diff (git diff main..HEAD from the project root).
      2. Run all gates: pnpm -C packages/parser build (if relevant), pnpm -C server build, pnpm -C server typecheck, pnpm -C server lint, pnpm test. All must exit zero.
      3. Spot-check the implementer's Implementation Notes claims against the actual code — types, bundle delta, deviation rationale.
      4. Produce the sign-off matrix below, led by the R0 row from .ledger/process/verification-signoff.md: Requirements text unchanged since \`**Requirements confirmed:**\`, or a \`**Requirements amended:**\` line records the change. N/A when the node predates the confirmation line. A rewrite of Requirements to match the code, with no amendment, is FAIL.
      5. The disposition is defined in .ledger/process/verification-signoff.md. Do not restate it.
      6. For non-PASS rows, group findings by severity.
      7. Acceptance items that need a human browser walk are N/A for you (reason: operator gate).
      8. A passing disposition ends with runner.complete_task. The other two end with runner.await_human_review. Do not call runner.fail_task for a review that reached a judgment.

      ## Sign-off matrix (primary artifact)

      Produce a Markdown table with exactly one row per R0 Requirements-text row, every Requirements bullet, and every Acceptance-check item in the spec. The result, the row verdicts, and the three steps are in .ledger/process/verification-signoff.md. Do not restate them.

      | # | Item (verbatim or tight paraphrase) | Verdict | Evidence | Resolution |
      |---|-------------------------------------|---------|----------|------------|

      Record the matrix, apply a fully specified fix only when that file allows it, and recompute. Do not change lifecycle status. A passing disposition ends with \`runner.complete_task\`. The other two end with \`runner.await_human_review\`. Do not call \`runner.fail_task\` for a review that reached a judgment. After a fix, recompute and then branch on that disposition.

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
