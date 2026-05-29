/**
 * Prompt template for verify tasks.
 *
 * Persona: implementation verifier — runs cold against the implementer's diff.
 * Spec: docs/06-agent-dispatcher/04-prompt-templates.md §Requirements item 5
 */

import type { Task } from "@ledger/parser";
import type { ProjectContext } from "../../context.js";
import {
  taskHeaderBlock,
  personaPreamble,
  mcpToolContractReminder,
  requiredReadingSection,
} from "./shared.js";

export default function render(task: Task, ctx: ProjectContext): string {
  const docPath = ctx.resolveDocPath(task.id);
  const parentPath = task.parentTaskId ? ctx.resolveDocPath(task.parentTaskId) : undefined;

  const requiredReading = [
    "CLAUDE.md",
    ...(docPath ? [docPath] : []),
    ...(parentPath ? [parentPath] : []),
    "docs/process/leaf-workflow.md",
  ];

  const docRef = docPath ?? `(spec doc for node ${task.id})`;

  return [
    taskHeaderBlock(task, ctx),
    "",
    "# Verifier persona",
    "",
    personaPreamble("verify"),
    "",
    requiredReadingSection(requiredReading),
    "",
    "## Success criteria",
    "",
    `1. Read the spec at ${docRef} and the worktree diff (git diff main..HEAD from the project root).`,
    "2. Run all gates: pnpm -C packages/parser build (if relevant), pnpm -C server build, pnpm -C server typecheck, pnpm -C server lint, pnpm test. All must exit zero.",
    "3. Spot-check the implementer's Implementation Notes claims against the actual code — types, bundle delta, deviation rationale.",
    "4. Emit a verdict: READY_FOR_COMPLETE / READY_WITH_FOLLOWUPS / NEEDS_REVISIONS / NEEDS_MAJOR_REVISIONS.",
    "5. Group findings by severity. READY_WITH_FOLLOWUPS means the code ships but follow-up items are filed in Open Issues.",
    "6. Complete with runner.complete_task on any passing verdict; runner.await_human_review with a summary if you need operator confirmation on a borderline finding.",
    "",
    mcpToolContractReminder(),
  ].join("\n");
}
