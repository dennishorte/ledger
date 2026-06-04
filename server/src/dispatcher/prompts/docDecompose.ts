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
  const targetNodeId = primaryNodeId(task) ?? "";
  const targetPath = ctx.resolveDocPath(targetNodeId);

  // Build the family: parent (if any) + all siblings sharing that parent.
  const target = ctx.docs.find((n) => n.id === targetNodeId);
  const familyRootId = target?.parentId ?? (target ? targetNodeId : undefined);
  const familyMembers = familyRootId
    ? ctx.docs.filter((n) => n.id === familyRootId || n.parentId === familyRootId)
    : (target ? [target] : []);

  const familyPaths = familyMembers
    .map((n) => ctx.resolveDocPath(n.id))
    .filter((p): p is string => p !== undefined && p !== targetPath);

  const requiredReading = [
    "CLAUDE.md",
    "docs/00-project.md",
    ...(targetPath ? [targetPath] : []),
    ...familyPaths,
  ];

  const docRef = targetPath ?? `(spec doc for node ${targetNodeId})`;
  const hasFamily = familyPaths.length > 0;

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
    `1. Read the spec at ${docRef}${hasFamily ? " and all related family docs listed above" : ""}. Understand the full scope of the family before deciding on a decomposition boundary.`,
    "2. Reduce the target doc to a **parent coordination manifest**: keep top-level Requirements, Design summary, and Decisions; replace the detailed body with a children manifest section listing child node IDs.",
    "3. For each extracted responsibility, create a new child node file following the doc schema (Required sections: Requirements, Design, Decisions, Open Issues, Implementation Notes, Status). Set Status to PLANNED.",
    "4. Child node IDs must be sub-paths of the parent (e.g. if parent is `01-ui/02-dag`, children are `01-ui/02-dag/01-foo`, `01-ui/02-dag/02-bar`).",
    ...(hasFamily ? [
      "5. Existing sibling docs are part of the same family. Do not duplicate their scope — only decompose responsibilities not already covered by them.",
    ] : []),
    `${hasFamily ? "6" : "5"}. Do NOT change any doc's lifecycle Status field.`,
    `${hasFamily ? "7" : "6"}. Add a 'Decomposed YYYY-MM-DD' subsection to the target doc's Implementation Notes listing what was extracted into which child and why.`,
    `${hasFamily ? "8" : "7"}. Emit runner.complete_task when all files are committed.`,
    "",
    mcpToolContractReminder(),
  ].join("\n");
}
