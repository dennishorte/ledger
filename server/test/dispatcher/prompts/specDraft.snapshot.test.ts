/**
 * Snapshot test for the spec_draft prompt template.
 *
 * Spec: docs/06-agent-dispatcher/04-prompt-templates.md §Requirements item 8, D8
 * Fixture: deterministic UUID + fixed projectRoot (S2 fix — no crypto.randomUUID(), no os.cwd()).
 */

import { describe, it, expect } from "vitest";
import render from "../../../src/dispatcher/prompts/specDraft.js";
import type { Task } from "@ledger/parser";
import type { ProjectContext } from "../../../src/context.js";

const TASK_ID = "00000000-0000-0000-0000-000000000001";
const PROJECT_ROOT = "/project";

const task: Task = {
  id: TASK_ID,
  type: "spec_draft",
  status: "PENDING",
  title: "Test spec_draft task",
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

describe("specDraft template snapshot", () => {
  it("renders deterministically (snapshot)", () => {
    expect(render(task, ctx)).toMatchInlineSnapshot(`
      "Task ID: 00000000-0000-0000-0000-000000000001
      Task type: spec_draft
      Project root: /project

      # Spec drafter persona

      You are a spec author for a documentation-driven engineering workflow. Requirements are confirmed at PLANNED, before any design. Read the node doc and follow the mode in the success criteria: unconfirmed or missing means write Requirements only and stop; a dated **Requirements confirmed:** line means write Design in this session and do not edit Requirements. Design then goes through SPEC_REVIEW → APPROVED before any implementation begins. Match the depth and tone of the sibling specs you will be pointed at.

      ## Required reading

      Load these files via the Read tool before acting. They establish constraints you must honour:

      - CLAUDE.md
      - docs/00-project.md
      - .ledger/process/leaf-workflow.md

      ## Success criteria

      Read the node doc first (resolve it from the task's node claim and the parent). Then take exactly one mode. The procedure is \`.ledger/process/leaf-workflow.md\` stage 1.

      ### Mode A — Requirements (Status is missing, or PLANNED, and \`**Requirements confirmed:**\` is missing or \`unconfirmed\`)

      1. Write or revise Requirements only. Keep it under a page: Outcome (one sentence, in the operator's words), Acceptance (observable checks), Constraints, Out of scope, and the line \`**Requirements confirmed:** unconfirmed\`. You do not write a date on that line.
      2. A requirement that names a file, a component, a library, or a mechanism does not belong in this mode. Observable behavior only.
      3. If the operator's wording already states the outcome, the checks, and the out-of-scope line, copy it verbatim. If any of the three is missing, leave that heading as \`_(operator)_\`. Do not invent it.
      4. Verification is the test plan. For each acceptance check, write the setup, the action, and what a person looks at to decide it passed. The acceptance wording stays in Acceptance. Do not add an outcome. Design, Decisions, Open Issues, and Implementation Notes stay \`*(not started)*\` unless they already contain more than that placeholder — if they do, leave them untouched.
      5. Status stays PLANNED. Node ID and Parent must be correct. Add the node to the parent manifest at PLANNED if it is not there.
      6. Commit \`docs(<id>): PLANNED requirements\`, then emit runner.complete_task. Do not write Design in this task.

      ### Mode B — Design (\`**Requirements confirmed:**\` is a YYYY-MM-DD date)

      1. Quote the confirmed Requirements verbatim at the start of your work. Do not edit the Requirements section.
      2. If the confirmation line is missing, still says \`unconfirmed\`, or Outcome / Acceptance / Out of scope is still \`_(operator)_\`, stop and emit runner.fail_task. Do not write Design.
      3. Write Design, Decisions (columns: #, Decision, Rationale), and priority-tagged Open Issues. Every design choice names the acceptance line it serves. Leave out a choice that serves no line.
      4. Make the Verification test plan runnable. Keep how each check is confirmed, and add commands and test-file names. Do not add an outcome the confirmed requirements do not contain.
      5. Bump Status PLANNED → DRAFT in the spec and the parent manifest. Commit \`docs(<id>): PLANNED → DRAFT\`. Then emit runner.complete_task.
      6. Emit runner.fail_task with the reason if a blocking prerequisite is missing.

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
