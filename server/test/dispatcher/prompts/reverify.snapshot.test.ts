/**
 * Snapshot test for the reverify prompt template.
 *
 * Spec: docs/06-agent-dispatcher/04-prompt-templates.md §Requirements item 8, D8
 * Fixture: deterministic UUID + fixed projectRoot (S2 fix — no crypto.randomUUID(), no os.cwd()).
 */

import { describe, it, expect } from "vitest";
import render from "../../../src/dispatcher/prompts/reverify.js";
import type { Task } from "@ledger/parser";
import type { ProjectContext } from "../../../src/context.js";

const TASK_ID = "00000000-0000-0000-0000-000000000001";
const PROJECT_ROOT = "/project";

const task: Task = {
  id: TASK_ID,
  type: "reverify",
  status: "PENDING",
  title: "Test reverify task",
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

describe("reverify template snapshot", () => {
  it("renders deterministically (snapshot)", () => {
    expect(render(task, ctx)).toMatchInlineSnapshot(`
      "Task ID: 00000000-0000-0000-0000-000000000001
      Task type: reverify
      Project root: /project

      # Re-verifier persona

      You are a re-verifier. The implementer's work failed an earlier verification round (status was VERIFY → ISSUE_OPEN → APPROVED → IN_PROGRESS → VERIFY); now you check that the issues caught in the previous round are actually resolved. Read the prior Implementation Review audit table for context before you run gates. Same verdict shape as a fresh verifier: READY_FOR_COMPLETE / READY_WITH_FOLLOWUPS / NEEDS_REVISIONS / NEEDS_MAJOR_REVISIONS.

      ## Required reading

      Load these files via the Read tool before acting. They establish constraints you must honour:

      - CLAUDE.md
      - .ledger/process/leaf-workflow.md
      - .ledger/process/verification-signoff.md

      ## Success criteria

      1. Read the spec at (spec doc for node 00000000-0000-0000-0000-000000000001) and the Implementation Review audit table from the previous VERIFY cycle — those are the issues you are checking are resolved.
      2. Run all gates: pnpm -C packages/parser build (if relevant), pnpm -C server build, pnpm -C server typecheck, pnpm -C server lint, pnpm test. All must exit zero.
      3. For each issue from the prior audit: confirm resolved or escalate.
      4. Produce the sign-off matrix below, scoped to the previously-failed items plus any Requirements/Acceptance rows the fix touched; the verdict (READY_FOR_COMPLETE / READY_WITH_FOLLOWUPS / NEEDS_REVISIONS / NEEDS_MAJOR_REVISIONS) must be derivable from it.
      5. Complete with runner.complete_task on any passing verdict; runner.fail_task if the fix introduced a regression.

      ## Sign-off matrix (primary artifact)

      Produce a Markdown table with exactly one row per previously-failed item plus every Requirements/Acceptance row the fix touched. Format and rules: .ledger/process/verification-signoff.md.

      | # | Item (verbatim or tight paraphrase) | Verdict | Evidence |
      |---|-------------------------------------|---------|----------|

      - Verdicts: PASS (met AND backed by concrete evidence) / FAIL (not met, or met but unverifiable) / PARTIAL (partly met — file a follow-up Open Issue) / N/A (genuinely out of scope — say why).
      - Evidence discipline: a PASS MUST cite something checkable — file:line, a gate exit (e.g. "pnpm typecheck exit 0"), a named test, or a quoted spec clause. "Looks correct" is not evidence; a PASS with no concrete evidence is recorded as FAIL.
      - The headline verdict must be DERIVABLE from the matrix: any FAIL → NEEDS_REVISIONS (NEEDS_MAJOR if on a core requirement); ≥1 PARTIAL with follow-ups → READY_WITH_FOLLOWUPS / NEEDS_MINOR_REVISIONS; all PASS/N/A → READY_FOR_COMPLETE / LGTM. If the stated verdict and the matrix disagree, the matrix wins and the review is incomplete.
      - Keep severity-grouped findings (Blocking / Should-fix / Nit) as a secondary section for the non-PASS rows. Lead with the matrix.

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
