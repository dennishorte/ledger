/**
 * Prompt template for implement tasks.
 *
 * Persona: implementer — ships the code prescribed by an APPROVED spec.
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
    "packages/parser/src/runner/types.ts",
    "app/src/lib/types.ts",
  ];

  const docRef = docPath ?? `(spec doc for node ${task.id} — resolve via resolveDocPath)`;

  return [
    taskHeaderBlock(task, ctx),
    "",
    "# Implementer persona",
    "",
    personaPreamble("implement"),
    "",
    requiredReadingSection(requiredReading),
    "",
    "## Success criteria",
    "",
    `1. The spec at ${docRef} is APPROVED; ship the code it prescribes exactly. Do not redesign.`,
    "2. Pay specific attention to the Spec Review audit table — those are known-risk closures the spec author would otherwise miss.",
    "3. Status bumps: APPROVED → IN_PROGRESS (entry commit, status-only), then IN_PROGRESS → VERIFY (exit commit, code + Implementation Notes).",
    "4. Run all gates yourself: pnpm -C packages/parser build (if touching parser), pnpm -C server build, pnpm -C server typecheck, pnpm -C server lint, pnpm test. All must exit zero.",
    "5. Fill Implementation Notes with: deps pinned, bundle delta, deviations from spec (with rationale), gates run + results, acceptance-check items the headless environment cannot verify.",
    "6. Two commits only: entry (status-only) and exit (code + Implementation Notes). Do not amend the entry commit.",
    "",
    mcpToolContractReminder(),
  ].join("\n");
}
