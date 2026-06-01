/**
 * Prompt template for doc_refactor tasks.
 *
 * Persona: doc refactorer — closes drift between spec and code.
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
  ];

  const docRef = docPath ?? `(spec doc for node ${task.id})`;

  return [
    taskHeaderBlock(task, ctx),
    "",
    "# Doc refactorer persona",
    "",
    personaPreamble("doc_refactor"),
    "",
    requiredReadingSection(requiredReading),
    "",
    "## Success criteria",
    "",
    `1. Read the spec at ${docRef} and its flagged Open Issues. Identify drift between the spec and the current codebase.`,
    "2. Bring the spec into agreement with the code — or vice versa if the code diverged incorrectly. Document which way the reconciliation went.",
    "3. Do NOT change the spec's lifecycle Status field.",
    "4. Tighten the Open Issues section: resolve items that are no longer valid, re-prioritise items whose context has changed.",
    "5. Add a 'Refactored YYYY-MM-DD' subsection to Implementation Notes summarising what changed and why.",
    "6. Emit runner.complete_task when the refactored doc is committed.",
    "",
    mcpToolContractReminder(),
  ].join("\n");
}
