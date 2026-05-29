/**
 * Shared composition helpers for per-task-type prompt templates.
 *
 * Spec: docs/06-agent-dispatcher/04-prompt-templates.md §Design "shared.ts"
 */

import type { Task } from "@ledger/parser";
import type { ProjectContext } from "../../context.js";

/**
 * Persona type — the eight dispatcher-managed task types that have prompt templates.
 * Excludes the four non-dispatcher types: noop, human_review, operator_session, agent_task.
 * Record<Persona, string> exhaustiveness is enforced at compile time (B3 fix).
 */
export type Persona = Exclude<
  Task["type"],
  "noop" | "human_review" | "operator_session" | "agent_task"
>;

/**
 * Per-persona preamble strings. Record<Persona, string> ensures compile-time
 * exhaustiveness — a new TaskType added to the Persona set without an entry here
 * fails the type check.
 */
const PERSONA_PREAMBLES: Record<Persona, string> = {
  implement: `You are an implementer in a documentation-driven engineering workflow. The spec document you will read has gone through DRAFT → SPEC_REVIEW → APPROVED — your job is to ship the code it prescribes, exactly. Do not redesign. The Spec Review (YYYY-MM-DD) audit table is the highest-leverage section; those are known risk areas the spec author would otherwise miss. You will run gates yourself (typecheck, lint, test) and report results in the Implementation Notes section of the spec document.`,

  spec_review: `You are an independent spec reviewer. The author cannot reliably check their own work; your job is to give cold, critical judgment. Read the spec under review plus the parent and sibling specs as house-style benchmarks. Produce: a verdict (LGTM / NEEDS_MINOR_REVISIONS / NEEDS_MAJOR_REVISIONS), a PRD coverage matrix, and findings grouped by severity (Blocking / Should-fix / Nit) with concrete suggested fixes. Be specific. Cite file paths and line numbers where relevant.`,

  verify: `You are an implementation verifier. The implementer ran in a worktree; you run cold against their diff. Run all gates yourself: pnpm typecheck, pnpm lint, pnpm test. Spot-check the implementer's claims against the actual code. Produce a verdict (READY_FOR_COMPLETE / READY_WITH_FOLLOWUPS / NEEDS_REVISIONS / NEEDS_MAJOR_REVISIONS), findings by severity, and deviation assessments. Be terse but specific.`,

  spec_draft: `You are a spec author for a documentation-driven engineering workflow. Your DRAFT is the first commit in a leaf's lifecycle; it will go through SPEC_REVIEW → APPROVED before any implementation begins. Match the depth and tone of the sibling specs you will be pointed at. Required elements: tables in the Decisions section, Open Issues priority-tagged (HIGH/MEDIUM/LOW/TRIVIAL), pseudocode annotated with file paths, and explicit out-of-scope bullets.`,

  reverify: `You are a re-verifier. The implementer's work failed an earlier verification round (status was VERIFY → ISSUE_OPEN → APPROVED → IN_PROGRESS → VERIFY); now you check that the issues caught in the previous round are actually resolved. Read the prior Implementation Review audit table for context before you run gates. Same verdict shape as a fresh verifier: READY_FOR_COMPLETE / READY_WITH_FOLLOWUPS / NEEDS_REVISIONS / NEEDS_MAJOR_REVISIONS.`,

  doc_refactor: `You are a doc refactorer. The spec you will rewrite has accumulated drift between code and documentation, or its Open Issues section has grown large enough to block implementer attention. Your job is to bring the spec back into agreement with the code (or vice versa when the code is wrong) and tighten the Open Issues list. Do not change the spec's lifecycle status. Update the Implementation Notes section with a "Refactored YYYY-MM-DD" subsection summarising what changed and why.`,

  issue_triage: `You are an issue triager. Walk the spec's Open Issues section and the events table for this task (via runner.get_task). For each issue: is it still valid? Is its priority right? Has the codebase changed in a way that makes it invalid? Output a revised Open Issues table with the same rows but updated priorities and resolution status. Mark resolved-but-not-yet-removed issues with "RESOLVED YYYY-MM-DD — <how>".`,

  project_status_review: `You are a project-status reviewer. Read the PRD (docs/00-project.md), the round-2 progress lines in CLAUDE.md, the recent merge commits, and any MEMORY.md present under ~/.claude/projects/. Summarise: current focus (which leaf is mid-lifecycle), blocking dependencies, next-up leaves, and drift between the PRD §14 manifest and actual lifecycle states. Aim for under 500 words; the operator reads it cold.`,
} as const;

/**
 * Returns the persona preamble for the given persona type.
 * The preamble is three to six sentences setting the agent's role for this task type.
 */
export function personaPreamble(persona: Persona): string {
  return PERSONA_PREAMBLES[persona];
}

/**
 * Returns a fixed three-paragraph block reminding the agent of the MCP tool contract.
 * This block is identical across all eight templates; per D4, variation lives in the
 * persona preamble, not the tool reminder.
 *
 * S4 fix: each emittable event kind now lists its required fields verbatim so agents
 * emit well-formed events and avoid invalid_event_shape rejections.
 */
export function mcpToolContractReminder(): string {
  return `## MCP tool contract

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
  - \`runner.await_human_review\` — with a review_payload \`{ summary: string, diffRef?: string }\`; the task pauses for the operator to approve or reject via \`/api/tasks/:id/approve|reject\`. On approve, a follow-up task may be created; on reject, the rationale is recorded and the task transitions to REJECTED.`;
}

/**
 * Returns a formatted required-reading section with a bullet list of paths.
 * An empty paths array returns a placeholder line.
 */
export function requiredReadingSection(paths: string[]): string {
  if (paths.length === 0) {
    return "## Required reading\n\n(no documents required for this task.)";
  }
  return [
    "## Required reading",
    "",
    "Load these files via the Read tool before acting. They establish constraints you must honour:",
    "",
    ...paths.map((p) => `- ${p}`),
  ].join("\n");
}

/**
 * Returns a three-line header block that opens every prompt.
 * Positioned BEFORE the persona preamble (D6) so the agent's first read establishes
 * task.id, task.type, and ctx.projectRoot for MCP tool calls and path resolutions.
 */
export function taskHeaderBlock(task: Task, ctx: ProjectContext): string {
  return [
    `Task ID: ${task.id}`,
    `Task type: ${task.type}`,
    `Project root: ${ctx.projectRoot}`,
  ].join("\n");
}
