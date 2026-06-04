/**
 * Prompt template for doc_decompose tasks.
 *
 * Persona: doc decomposer — converts an oversized leaf into a parent node
 * with extracted child nodes, each starting at PLANNED.
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
    "docs/00-project.md",
    ...(docPath ? [docPath] : []),
  ];

  const docRef = docPath ?? `(spec doc for node ${task.id})`;

  return [
    taskHeaderBlock(task, ctx),
    "",
    "# Doc decomposer persona",
    "",
    personaPreamble("doc_decompose"),
    "",
    requiredReadingSection(requiredReading),
    "",
    "## Success criteria",
    "",
    `1. Read the spec at ${docRef}. Identify the distinct responsibilities it covers and decide on a decomposition boundary.`,
    "2. Reduce the original doc to a **parent coordination manifest**: keep top-level Requirements, Design summary, and Decisions; replace the detailed body with a children manifest section listing the extracted child node IDs.",
    "3. For each extracted responsibility, create a new child node file following the doc schema (Required sections: Requirements, Design, Decisions, Open Issues, Implementation Notes, Status). Set Status to PLANNED.",
    "4. Child node IDs must be sub-paths of the parent (e.g. if parent is `01-ui/02-dag`, children are `01-ui/02-dag/01-foo`, `01-ui/02-dag/02-bar`).",
    "5. Do NOT change the original doc's lifecycle Status field.",
    "6. Add a 'Decomposed YYYY-MM-DD' subsection to the original doc's Implementation Notes listing what was extracted into which child and why.",
    "7. Emit runner.complete_task when all files are committed.",
    "",
    mcpToolContractReminder(),
  ].join("\n");
}
