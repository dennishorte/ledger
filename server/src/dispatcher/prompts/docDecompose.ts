/**
 * Prompt template for doc_decompose tasks.
 *
 * Persona: doc decomposer — splits an oversized node into a parent coordination
 * manifest plus extracted child nodes.
 *
 * Status-aware (D12). Children inherit the target's lifecycle status so the
 * parent⊇children invariant holds (a parent is COMPLETE/VERIFY iff its children
 * are). Two modes fall out:
 *   - Mode A "forward"     — DRAFT/APPROVED/PLANNED target → PLANNED children;
 *                            child bodies are specs for what to build; ends with
 *                            runner.complete_task.
 *   - Mode B "retroactive" — COMPLETE/VERIFY target → children inherit that
 *                            status; child bodies describe already-shipped work;
 *                            the split lands via runner.await_human_review (the
 *                            agent is re-describing code it did not write and can
 *                            misrepresent, so the operator confirms it).
 * IN_PROGRESS is refused outright (do not fork a spec out from under a running
 * implementer). An unresolved target status (ctx.docs miss) defaults to the safe
 * forward/PLANNED case.
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
  const target = ctx.docs.find((n) => n.id === targetNodeId);
  const docRef = targetPath ?? `(spec doc for node ${targetNodeId})`;

  // Status-aware decomposition (D12). See file header for the two modes.
  const targetStatus = target?.status;
  const childStatus =
    targetStatus === "COMPLETE"
      ? "COMPLETE"
      : targetStatus === "VERIFY"
        ? "VERIFY"
        : "PLANNED";
  const isRetroactive = childStatus !== "PLANNED";

  // IN_PROGRESS guard — refuse rather than fork a spec out from under a running
  // implementer. The runner's claim intersection would already serialize it, but
  // decomposing mid-implementation is semantically wrong regardless.
  if (targetStatus === "IN_PROGRESS") {
    return [
      taskHeaderBlock(task, ctx),
      "",
      "# Doc decomposer persona",
      "",
      personaPreamble("doc_decompose"),
      "",
      "## Stop — do not decompose",
      "",
      `The target node \`${targetNodeId}\` (${docRef}) is **IN_PROGRESS** — it has active, in-flight implementation work. Decomposing it now would fork the spec out from under the running implementer and race its resource claim.`,
      "",
      "Do not read further and do not edit any file. Call `runner.await_human_review` with a summary stating that an IN_PROGRESS node cannot be safely decomposed — the operator should wait for it to reach VERIFY/COMPLETE (or cancel the in-flight task) and re-dispatch — then stop.",
      "",
      mcpToolContractReminder(),
    ].join("\n");
  }

  // Build the family: parent (if any) + all siblings sharing that parent.
  // Used only for required-reading context, not for resource claims.
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

  const hasFamily = familyPaths.length > 0;
  // Injected so the agent writes correct Created / Last Updated dates rather
  // than guessing — a guessed/absent Last Updated fails the schema's date format.
  const today = new Date().toISOString().slice(0, 10);
  const childIdBase = targetNodeId || "<target-node-id>";

  // Mode-aware child body placeholders (D12). Retroactive splits describe shipped
  // work in the past tense; forward splits are PLANNED stubs.
  const implNotesBody = isRetroactive
    ? "What shipped for this responsibility (extracted from the parent)."
    : "None yet.";
  const verificationBody = isRetroactive
    ? "What was built and how it was confirmed (past tense)."
    : "How completion will be confirmed.";

  // The exact schema both the reduced parent and every new child must satisfy.
  // (docs/_schemas/document-node.schema.json, validated by @ledger/parser.)
  const childSkeleton = [
    "```markdown",
    "# <Child Title>",
    "",
    `**Node ID:** \`${childIdBase}/01-example\``,
    `**Parent:** \`${childIdBase}\``,
    `**Status:** ${childStatus}`,
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
    implNotesBody,
    "",
    "## Verification",
    "",
    verificationBody,
    "",
    "## Children",
    "",
    "None.",
    "```",
  ].join("\n");

  const modeFraming = isRetroactive
    ? `This target is **${childStatus}** — its work has already shipped. You are **reorganizing existing documentation**, not planning new work. Each child must describe the *actual implemented design* extracted from the parent — read the referenced source under \`app/\`, \`server/\`, \`packages/\` as needed to stay accurate. Children inherit the target's \`${childStatus}\` status; write their Verification in the **past tense** (what was built and how it was confirmed). Do NOT invent scope or write forward-looking stubs.`
    : `This target is **${targetStatus ?? "not yet built"}** — its work is not yet implemented. You are **decomposing forward scope** into separately-implementable child specs. New children start at \`PLANNED\`; their bodies are specs for what each child must build.`;

  const statusStep = isRetroactive
    ? `New child docs are \`**Status:** ${childStatus}\` — they inherit the target's \`${childStatus}\` status because they document already-shipped work. Do NOT change the lifecycle Status of the target or any existing doc.`
    : "New child docs start at `**Status:** PLANNED`. Do NOT change the lifecycle Status of the target or any existing doc.";

  const terminalStep = isRetroactive
    ? "After every file is written and committed, call `runner.await_human_review` with a `review_payload.summary` describing the split (which responsibility went to which child). Because you are re-describing already-shipped work, the operator must confirm the split faithfully represents it before it lands — do NOT call `runner.complete_task`."
    : "Emit `runner.complete_task` only after every file is written and committed.";

  const steps = [
    `Read the spec at ${docRef}${hasFamily ? " plus the related family docs listed above" : ""}, and the doc schema in docs/02-schema.md. Understand the full scope before choosing where to cut.`,
    modeFraming,
    "Decide a decomposition into **2–5** child responsibilities, each a cohesive, separately-implementable unit. If you cannot find a clean multi-responsibility boundary (the doc is large but covers one concern), do NOT force a split — call `runner.await_human_review` with a summary explaining why and stop.",
    ...(hasFamily
      ? ["Existing sibling docs are part of the same family. Do NOT duplicate their scope — only extract responsibilities not already covered by them."]
      : []),
    `Reduce the target doc ${docRef} to a **parent coordination manifest**: keep concise top-level Requirements, a Design summary, and the Decisions table; move the detailed per-responsibility body out into the children. Keep the target's existing filename and Node ID — do NOT rename it. It is still validated as a full node (see the schema requirements below) and MUST retain all seven \`## \` sections, now with a populated \`## Children\` manifest.`,
    `For each child, create a new file at \`docs/${childIdBase}/<NN>-<slug>.md\`. Child Node IDs are sub-paths of the target (e.g. \`${childIdBase}/01-foo\`, \`${childIdBase}/02-bar\`).`,
    "Every doc you write — the reduced parent AND each new child — MUST conform to docs/_schemas/document-node.schema.json or the parser silently drops it from the graph:",
    statusStep,
    `Populate the target's \`## Children\` section with a manifest table — one row per new child:\n\n    | Child | Title | Depends on | Status |\n    |---|---|---|---|\n    | \`01-foo\` | Foo subsystem | \`—\` | ${childStatus} |\n\n   The \`Child\` cell is the backticked relative id; \`Depends on\` lists backticked sibling relative ids or \`—\`; \`Status\` is \`${childStatus}\` for the new children.`,
    `Add a \`### Decomposed ${today}\` subsection to the target's \`## Implementation Notes\` listing what was extracted into which child and why.`,
    "Use this exact skeleton for each child (fill in real content; keep all front-matter lines and all seven section headings):\n\n" + childSkeleton,
    terminalStep,
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
