/**
 * Prompt template for issue_triage tasks.
 *
 * Persona: issue triager — walks Open Issues and updates their validity/priority.
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
    "# Issue triager persona",
    "",
    personaPreamble("issue_triage"),
    "",
    requiredReadingSection(requiredReading),
    "",
    "## Success criteria",
    "",
    `1. Read the spec at ${docRef} — specifically its Open Issues section.`,
    "2. Call runner.get_task to inspect the events table for any context emitted by prior agents on this node.",
    "3. For each Open Issue: determine if it is still valid, whether the priority is right, and whether the codebase has changed in a way that resolves it.",
    "4. Output a revised Open Issues table with the same rows but updated priorities and statuses.",
    "5. Mark issues resolved since filing as: RESOLVED YYYY-MM-DD — <how it was resolved>.",
    "6. Commit the revised spec doc and emit runner.complete_task.",
    "",
    mcpToolContractReminder(),
  ].join("\n");
}
