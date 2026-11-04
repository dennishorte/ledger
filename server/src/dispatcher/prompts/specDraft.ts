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
    ".ledger/process/leaf-workflow.md",
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
    "Read the node doc first (resolve it from the task's node claim and the parent). Then take exactly one mode. The procedure is `.ledger/process/leaf-workflow.md` stage 1.",
    "",
    "### Mode A — Requirements (Status is missing, or PLANNED, and `**Requirements confirmed:**` is missing or `unconfirmed`)",
    "",
    "1. Write or revise Requirements only. Keep it under a page: Outcome (one sentence, in the operator's words), Acceptance (observable checks), Constraints, Out of scope, and the line `**Requirements confirmed:** unconfirmed`. You do not write a date on that line.",
    "2. A requirement that names a file, a component, a library, or a mechanism does not belong in this mode. Observable behavior only.",
    "3. If the operator's wording already states the outcome, the checks, and the out-of-scope line, copy it verbatim. If any of the three is missing, leave that heading as `_(operator)_`. Do not invent it.",
    "4. Verification repeats the same checks in the same words. Design, Decisions, Open Issues, and Implementation Notes stay `*(not started)*` unless they already contain more than that placeholder — if they do, leave them untouched.",
    "5. Status stays PLANNED. Node ID and Parent must be correct. Add the node to the parent manifest at PLANNED if it is not there.",
    "6. Commit `docs(<id>): PLANNED requirements`, then emit runner.complete_task. Do not write Design in this task.",
    "",
    "### Mode B — Design (`**Requirements confirmed:**` is a YYYY-MM-DD date)",
    "",
    "1. Quote the confirmed Requirements verbatim at the start of your work. Do not edit the Requirements section.",
    "2. If the confirmation line is missing, still says `unconfirmed`, or Outcome / Acceptance / Out of scope is still `_(operator)_`, stop and emit runner.fail_task. Do not write Design.",
    "3. Write Design, Decisions (columns: #, Decision, Rationale), and priority-tagged Open Issues. Every design choice names the acceptance line it serves. Leave out a choice that serves no line.",
    "4. Tighten Verification into runnable checks without adding an outcome the confirmed requirements do not contain.",
    "5. Bump Status PLANNED → DRAFT in the spec and the parent manifest. Commit `docs(<id>): PLANNED → DRAFT`. Then emit runner.complete_task.",
    "6. Emit runner.fail_task with the reason if a blocking prerequisite is missing.",
    "",
    mcpToolContractReminder(),
  ].join("\n");
}
