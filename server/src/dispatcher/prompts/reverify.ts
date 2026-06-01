/**
 * Prompt template for reverify tasks.
 *
 * Persona: re-verifier — checks that previously-caught issues are resolved.
 * Spec: docs/06-agent-dispatcher/04-prompt-templates.md §Requirements item 5
 */

import type { Task } from "@ledger/parser";
import type { ProjectContext } from "../../context.js";
import {
  taskHeaderBlock,
  personaPreamble,
  mcpToolContractReminder,
  requiredReadingSection,
  primaryNodeId,
} from "./shared.js";

export default function render(task: Task, ctx: ProjectContext): string {
  const docPath = ctx.resolveDocPath(primaryNodeId(task) ?? "");
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
    "# Re-verifier persona",
    "",
    personaPreamble("reverify"),
    "",
    requiredReadingSection(requiredReading),
    "",
    "## Success criteria",
    "",
    `1. Read the spec at ${docRef} and the Implementation Review audit table from the previous VERIFY cycle — those are the issues you are checking are resolved.`,
    "2. Run all gates: pnpm -C packages/parser build (if relevant), pnpm -C server build, pnpm -C server typecheck, pnpm -C server lint, pnpm test. All must exit zero.",
    "3. For each issue from the prior audit: confirm resolved or escalate.",
    "4. Emit a verdict using the same ladder as a fresh verifier: READY_FOR_COMPLETE / READY_WITH_FOLLOWUPS / NEEDS_REVISIONS / NEEDS_MAJOR_REVISIONS.",
    "5. Complete with runner.complete_task on any passing verdict; runner.fail_task if the fix introduced a regression.",
    "",
    mcpToolContractReminder(),
  ].join("\n");
}
