/**
 * Prompt template for doc_decompose tasks.
 *
 * Persona: doc decomposer — converts an oversized leaf into a parent node
 * with extracted child nodes, each starting at PLANNED.
 *
 * The dispatched task carries a single write claim on the target node, so
 * primaryNodeId(task) is always the dispatched leaf. The decomposition *family*
 * (parent + siblings) is recomputed here purely to seed required-reading
 * context — it deliberately does NOT mirror the resource claims (see
 * routes/dispatch.ts).
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
  // Used only for required-reading context, not for resource claims.
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
    "docs/02-schema.md",
    "docs/_schemas/document-node.schema.json",
    ...(targetPath ? [targetPath] : []),
    ...familyPaths,
  ];

  const docRef = targetPath ?? `(spec doc for node ${targetNodeId})`;
  const hasFamily = familyPaths.length > 0;
  // Injected so the agent writes correct Created / Last Updated dates rather
  // than guessing — a guessed/absent Last Updated fails the schema's date format.
  const today = new Date().toISOString().slice(0, 10);
  const childIdBase = targetNodeId || "<target-node-id>";

  // The exact schema both the reduced parent and every new child must satisfy.
  // (docs/_schemas/document-node.schema.json, validated by @ledger/parser.)
  const childSkeleton = [
    "```markdown",
    "# <Child Title>",
    "",
    `**Node ID:** \`${childIdBase}/01-example\``,
    `**Parent:** \`${childIdBase}\``,
    "**Status:** PLANNED",
    `**Created:** ${today}`,
    `**Last Updated:** ${today}`,
    "",
    "---",
    "",
    "## Requirements",
    "",
    "What this child must deliver.",
    "",
    "## Design",
    "",
    "How it will be built.",
    "",
    "## Decisions",
    "",
    "None yet.",
    "",
    "## Open Issues",
    "",
    "None yet.",
    "",
    "## Implementation Notes",
    "",
    "None yet.",
    "",
    "## Verification",
    "",
    "How completion will be confirmed.",
    "",
    "## Children",
    "",
    "None.",
    "```",
  ].join("\n");

  const steps = [
    `Read the spec at ${docRef}${hasFamily ? " plus the related family docs listed above" : ""}, and the doc schema in docs/02-schema.md. Understand the full scope before choosing where to cut.`,
    "Decide a decomposition into **2–5** child responsibilities, each a cohesive, separately-implementable unit. If you cannot find a clean multi-responsibility boundary (the doc is large but covers one concern), do NOT force a split — call `runner.await_human_review` with a summary explaining why and stop.",
    ...(hasFamily
      ? ["Existing sibling docs are part of the same family. Do NOT duplicate their scope — only extract responsibilities not already covered by them."]
      : []),
    `Reduce the target doc ${docRef} to a **parent coordination manifest**: keep concise top-level Requirements, a Design summary, and the Decisions table; move the detailed per-responsibility body out into the children. Keep the target's existing filename and Node ID — do NOT rename it. It is still validated as a full node (see the schema requirements below) and MUST retain all seven \`## \` sections, now with a populated \`## Children\` manifest.`,
    `For each child, create a new file at \`docs/${childIdBase}/<NN>-<slug>.md\`. Child Node IDs are sub-paths of the target (e.g. \`${childIdBase}/01-foo\`, \`${childIdBase}/02-bar\`).`,
    "Every doc you write — the reduced parent AND each new child — MUST conform to docs/_schemas/document-node.schema.json or the parser silently drops it from the graph:",
    `New child docs start at \`**Status:** PLANNED\`. Do NOT change the lifecycle Status of the target or any existing doc.`,
    `Populate the target's \`## Children\` section with a manifest table — one row per new child:\n\n    | Child | Title | Depends on | Status |\n    |---|---|---|---|\n    | \`01-foo\` | Foo subsystem | \`—\` | PLANNED |\n\n   The \`Child\` cell is the backticked relative id; \`Depends on\` lists backticked sibling relative ids or \`—\`; \`Status\` is PLANNED for new children.`,
    `Add a \`### Decomposed ${today}\` subsection to the target's \`## Implementation Notes\` listing what was extracted into which child and why.`,
    "Use this exact skeleton for each child (fill in real content; keep all front-matter lines and all seven section headings):\n\n" + childSkeleton,
    "Emit `runner.complete_task` only after every file is written and committed.",
  ];

  // The hard schema requirements, called out so a careful agent cannot miss
  // the two fields that most often get dropped (Last Updated, the Children
  // section). These are the exact reasons the prior decompose produced
  // graph-invisible children.
  const schemaBlock = [
    "### Required doc shape (schema v1)",
    "",
    "Front-matter lines, in this order, immediately under the `# Title`:",
    "",
    "- `**Node ID:** `\\`<full-id>\\`",
    "- `**Parent:** `\\`<parent-id>\\`",
    "- `**Status:** <STATUS>` — a front-matter line, NOT a `## ` section",
    `- \`**Created:** ${today}\` — required, ISO \`YYYY-MM-DD\``,
    `- \`**Last Updated:** ${today}\` — required, ISO \`YYYY-MM-DD\` (a missing/non-date value is rejected)`,
    "- `**Dependencies:** `\\`<sibling-id>\\` — optional; omit or use `—` for none",
    "",
    "Exactly these seven `## ` sections, in order: **Requirements, Design, Decisions, Open Issues, Implementation Notes, Verification, Children**.",
    "",
    "A leaf child's `## Children` body is the single word `None.` (the parent's `## Children` holds the manifest table from the success criteria).",
  ].join("\n");

  return [
    taskHeaderBlock(task, ctx),
    "",
    "# Doc decomposer persona",
    "",
    personaPreamble("doc_decompose"),
    "",
    requiredReadingSection(requiredReading),
    "",
    schemaBlock,
    "",
    "## Success criteria",
    "",
    ...steps.map((s, i) => `${String(i + 1)}. ${s}`),
    "",
    mcpToolContractReminder(),
  ].join("\n");
}
