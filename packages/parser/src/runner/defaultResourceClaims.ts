/**
 * Default resource claims per task type.
 *
 * Promoted from server/src/dispatcher/prompts/index.ts to @ledger/parser
 * in 06-agent-dispatcher/05-dispatch-api Spec Review S2, so both the dispatch
 * endpoint and the UI's confirmation dialog can import directly without a
 * client/server mirror or drift-detection test.
 *
 * The function is a pure switch over Task["type"] returning ResourceClaim[].
 * All type dependencies (Task, ResourceClaim) are already canonical in @ledger/parser.
 *
 * Per parent D11: verify/reverify include a conditional second entry for parentTaskId.
 * All claim objects include the discriminant kind: "node".
 */

import type { Task, ResourceClaim } from "./types.js";

export function defaultResourceClaims(task: Pick<Task, "id" | "type" | "parentTaskId">): ResourceClaim[] {
  switch (task.type) {
    case "implement":
    case "spec_draft":
    case "doc_refactor":
    case "doc_decompose":
    case "issue_triage":
      return [{ kind: "node", nodeId: task.id, mode: "write" }];

    case "spec_review":
      return [{ kind: "node", nodeId: task.id, mode: "read" }];

    case "verify":
    case "reverify":
      return [
        { kind: "node", nodeId: task.id, mode: "read" },
        ...(task.parentTaskId
          ? [{ kind: "node" as const, nodeId: task.parentTaskId, mode: "read" as const }]
          : []),
      ];

    case "project_status_review":
      return [{ kind: "node", nodeId: "00-project", mode: "read" }];

    default:
      // noop, human_review, operator_session, agent_task — not dispatcher-managed
      return [];
  }
}
