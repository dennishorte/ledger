/**
 * Template registry — renderPrompt + defaultResourceClaims.
 *
 * Spec: docs/06-agent-dispatcher/04-prompt-templates.md §Design "index.ts — the registry"
 *
 * The typed Record<Persona, ...> registry gives compile-time exhaustiveness over the eight
 * dispatcher task types. A new TaskType added to Persona without an entry here fails at
 * compile time (S1 fix). The runtime isPersona guard handles the non-dispatcher types.
 *
 * defaultResourceClaims was promoted to @ledger/parser in 06-agent-dispatcher/05-dispatch-api
 * Spec Review S2 so both the server dispatch endpoint and the UI can import it directly.
 * Re-exported here to preserve the existing import paths from server/src/dispatcher/index.ts.
 */

// Re-export from @ledger/parser so existing import sites in this module keep compiling.
export { defaultResourceClaims } from "@ledger/parser";

import type { Task } from "@ledger/parser";
import type { ProjectContext } from "../../context.js";
import type { Persona } from "./shared.js";

import implement from "./implement.js";
import specReview from "./specReview.js";
import verify from "./verify.js";
import specDraft from "./specDraft.js";
import reverify from "./reverify.js";
import docRefactor from "./docRefactor.js";
import issueTriage from "./issueTriage.js";
import projectStatusReview from "./projectStatusReview.js";

const renderers: Record<Persona, (task: Task, ctx: ProjectContext) => string> = {
  implement,
  spec_review: specReview,
  verify,
  spec_draft: specDraft,
  reverify,
  doc_refactor: docRefactor,
  issue_triage: issueTriage,
  project_status_review: projectStatusReview,
};

/**
 * Narrowing guard: true if the task type has a dispatcher template.
 * The four non-dispatcher types (noop, human_review, operator_session, agent_task) return false.
 */
export function isPersona(type: Task["type"]): type is Persona {
  return (
    type !== "noop" &&
    type !== "human_review" &&
    type !== "operator_session" &&
    type !== "agent_task"
  );
}

/**
 * Render the full prompt string for a given task and project context.
 * Throws for non-dispatcher task types (noop, human_review, operator_session, agent_task).
 * TypeScript's exhaustiveness over Record<Persona, ...> catches missing template entries at
 * compile time; the runtime throw handles dynamically-passed non-dispatcher types.
 */
export function renderPrompt(task: Task, ctx: ProjectContext): string {
  if (!isPersona(task.type)) {
    throw new Error(
      `renderPrompt: no template for non-dispatcher task type "${task.type}"`,
    );
  }
  return renderers[task.type](task, ctx);
}

