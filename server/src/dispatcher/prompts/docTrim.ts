/**
 * Prompt template for doc_trim tasks.
 *
 * Persona: doc trimmer — reduces an oversized spec doc to below the health
 * scanner's sizeThresholdTokens without losing load-bearing content.
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

  const requiredReading = [
    "CLAUDE.md",
    ...(docPath ? [docPath] : []),
  ];

  const docRef = docPath ?? `(spec doc for node ${task.id})`;

  return [
    taskHeaderBlock(task, ctx),
    "",
    "# Doc trimmer persona",
    "",
    personaPreamble("doc_trim"),
    "",
    requiredReadingSection(requiredReading),
    "",
    "## Success criteria",
    "",
    `1. Read the spec at ${docRef} and measure its size (character count / 4 ≈ token estimate).`,
    "2. Identify removable content: superseded history blocks (e.g. archived v1 sections), verbose rationale that is now self-evident, duplicate content, and bloated Implementation Notes from past iterations.",
    "3. Remove or condense that content. Do NOT delete active decisions, open issues, acceptance criteria, or design constraints that are still load-bearing.",
    "4. Confirm the doc is materially smaller. If the original was flagged at ~N tokens, aim for at least a 20% reduction.",
    "5. Do NOT change the spec's lifecycle Status field.",
    "6. Add a 'Trimmed YYYY-MM-DD' subsection to Implementation Notes listing what was removed and why.",
    "7. Emit runner.complete_task when the trimmed doc is committed.",
    "",
    mcpToolContractReminder(),
  ].join("\n");
}
