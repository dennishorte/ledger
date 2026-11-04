/**
 * Prompt template for spec_review tasks.
 *
 * Persona: independent spec reviewer — cold, critical judgment.
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
    "app/src/lib/types.ts",
    "packages/parser/src/runner/types.ts",
    ".ledger/process/leaf-workflow.md",
    ".ledger/process/verification-signoff.md",
  ];

  const docRef = docPath ?? `(spec doc for node ${task.id})`;

  return [
    taskHeaderBlock(task, ctx),
    "",
    "# Spec reviewer persona",
    "",
    personaPreamble("spec_review"),
    "",
    requiredReadingSection(requiredReading),
    "",
    "## Success criteria",
    "",
    `1. Read the spec at ${docRef} and its parent/sibling specs as house-style benchmarks.`,
    "2. Lead with the requirements-fidelity rows from .ledger/process/verification-signoff.md (one per acceptance line, one per Requirements bullet tracing back to a line, one for the confirmation text). A bullet nothing asked for is FAIL. A Requirements bullet that names a file, component, library, or mechanism is FAIL.",
    "3. Then produce the sign-off matrix below — it doubles as the PRD coverage matrix.",
    "4. For non-PASS rows, group the findings by severity: Blocking (B), Should-fix (S), Nit (N). Each must cite the specific section and include a concrete suggested fix.",
    "5. The headline verdict (LGTM / NEEDS_MINOR_REVISIONS / NEEDS_MAJOR_REVISIONS) must be derivable from the fidelity rows and the matrix together.",
    "6. Record Confidence notes for the stage-4 implementer on any claims you could not mechanically verify (e.g., external API surface, type signatures).",
    "7. Complete with runner.complete_task if you deliver the review; runner.fail_task if a blocking prerequisite is missing.",
    "8. Do not review a PLANNED doc whose `**Requirements confirmed:**` line is missing or `unconfirmed`. Fail the task and say stage 1 is not finished. A DRAFT that predates the confirmation line may still be reviewed; mark the confirmation row N/A with that reason.",
    "",
    signOffMatrixReminder(
      "requirements-fidelity row (acceptance line, tracing bullet, confirmation text) and every PRD §-coverage item the spec must address and every Requirements bullet the spec declares",
    ),
    "",
    mcpToolContractReminder(),
  ].join("\n");
}
