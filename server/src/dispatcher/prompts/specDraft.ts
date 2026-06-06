/**
 * Prompt template for spec_draft tasks.
 *
 * Persona: spec author — writes the DRAFT that seeds a leaf's lifecycle.
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
  const parentPath = task.parentTaskId ? ctx.resolveDocPath(task.parentTaskId) : undefined;

  const requiredReading = [
    "CLAUDE.md",
    ...(parentPath ? [parentPath] : []),
    "docs/00-project.md",
    "docs/_process/leaf-workflow.md",
  ];

  return [
    taskHeaderBlock(task, ctx),
    "",
    "# Spec drafter persona",
    "",
    personaPreamble("spec_draft"),
    "",
    requiredReadingSection(requiredReading),
    "",
    "## Success criteria",
    "",
    "1. Read sibling specs under the same parent directory as gold-standard benchmarks for depth and tone.",
    "2. Follow the schema in docs/00-project.md §6.1: Required sections are Requirements, Design, Decisions, Open Issues, Implementation Notes, Status.",
    "3. Decisions table must have columns: #, Decision, Rationale.",
    "4. Open Issues must be priority-tagged (HIGH/MEDIUM/LOW/TRIVIAL).",
    "5. Design section must include: repository layout after this node, pseudocode annotated with file paths, explicit out-of-scope bullets.",
    "6. Status starts at DRAFT. Node ID and Parent fields must be correct.",
    "7. Emit runner.complete_task when the DRAFT file is committed; runner.fail_task with the reason if a blocking prerequisite is missing.",
    "",
    mcpToolContractReminder(),
  ].join("\n");
}
