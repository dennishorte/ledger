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
    "docs/_process/leaf-workflow.md",
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
    "2. Produce a PRD coverage matrix (Requirements §N → addressed / partial / missing).",
    "3. Group findings by severity: Blocking (B), Should-fix (S), Nit (N). Each finding must cite the specific section and include a concrete suggested fix.",
    "4. Emit a verdict: LGTM / NEEDS_MINOR_REVISIONS / NEEDS_MAJOR_REVISIONS.",
    "5. Record Confidence notes for the stage-4 implementer on any claims you could not mechanically verify (e.g., external API surface, type signatures).",
    "6. Complete with runner.complete_task if you deliver the review; runner.fail_task if a blocking prerequisite is missing.",
    "",
    mcpToolContractReminder(),
  ].join("\n");
}
