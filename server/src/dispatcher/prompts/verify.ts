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
  signOffMatrixReminder,
  primaryNodeId,
} from "./shared.js";

export default function render(task: Task, ctx: ProjectContext): string {
  const docPath = ctx.resolveDocPath(primaryNodeId(task) ?? "");
  const parentPath = task.parentTaskId ? ctx.resolveDocPath(task.parentTaskId) : undefined;

  const requiredReading = [
    "CLAUDE.md",
    ...(docPath ? [docPath] : []),
    ...(parentPath ? [parentPath] : []),
    ".ledger/process/leaf-workflow.md",
    ".ledger/process/verification-signoff.md",
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
    "4. Produce the sign-off matrix below, led by the R0 row from .ledger/process/verification-signoff.md: Requirements text unchanged since `**Requirements confirmed:**`, or a `**Requirements amended:**` line records the change. N/A when the node predates the confirmation line. A rewrite of Requirements to match the code, with no amendment, is FAIL.",
    "5. The disposition is defined in .ledger/process/verification-signoff.md. Do not restate it.",
    "6. For non-PASS rows, group findings by severity.",
    "7. Acceptance items that need a human browser walk are N/A for you (reason: operator gate).",
    "8. A passing disposition ends with runner.complete_task. The other two end with runner.await_human_review. Do not call runner.fail_task for a review that reached a judgment.",
    "",
    signOffMatrixReminder(
      "R0 Requirements-text row, every Requirements bullet, and every Acceptance-check item in the spec",
    ),
    "",
    mcpToolContractReminder(),
  ].join("\n");
}
