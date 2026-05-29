/**
 * Prompt template for project_status_review tasks.
 *
 * Persona: project-status reviewer — summarises current focus, blockers, and drift.
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
  const requiredReading = [
    "CLAUDE.md",
    "docs/00-project.md",
    "~/.claude/projects/<project-id>/memory/MEMORY.md (if present — your Read tool will return an error if absent; that is expected)",
  ];

  return [
    taskHeaderBlock(task, ctx),
    "",
    "# Project-status reviewer persona",
    "",
    personaPreamble("project_status_review"),
    "",
    requiredReadingSection(requiredReading),
    "",
    "## Success criteria",
    "",
    "1. Read docs/00-project.md §14 (the top-level manifest) and walk the children manifests to find the current leaf focus.",
    "2. Read recent merge-commit messages (git log --oneline --merges -20 from the project root).",
    "3. Read CLAUDE.md's round-2 progress lines for the current backend phase.",
    "4. Read MEMORY.md if it exists (the operator's auto-memory system; ignore if absent).",
    "5. Produce a summary under 500 words covering: current focus, blocking dependencies, next-up leaves, and drift between PRD §14 and actual lifecycle states.",
    "6. Emit runner.complete_task with the summary as the completion note.",
    "",
    mcpToolContractReminder(),
  ].join("\n");
}
