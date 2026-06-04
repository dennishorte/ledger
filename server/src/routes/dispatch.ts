/**
 * POST /api/dispatch/:nodeId — operator-facing dispatch endpoint.
 *
 * Synthesises a Task for a doc node and submits it through runner.createTask.
 * Type is inferred from the node's lifecycle status unless overridden in body.
 *
 * Spec: docs/06-agent-dispatcher/05-dispatch-api.md §Design dispatch handler shape
 */

import { Hono } from "hono";
import { defaultResourceClaims } from "@ledger/parser";
import type { TaskType, NodeStatus, ResourceClaim, DocNode } from "@ledger/parser";
import type { ServerEnv } from "../server.js";

/**
 * For doc_decompose, return write claims covering the whole family — the
 * parent node (if any) and all its children — so concurrent decompose
 * operations on any member of the family conflict and queue rather than race.
 *
 * Family definition:
 *   - Target has a parent  → family root is the parent; family = parent + all its children
 *   - Target is a parent (has children, no parent) → family = target + all its children
 *   - Target is an isolated leaf → family = target only (falls back to default)
 */
function decomposeResourceClaims(nodeId: string, docs: readonly DocNode[]): ResourceClaim[] {
  const target = docs.find((n) => n.id === nodeId);
  if (target === undefined) return [{ kind: "node", nodeId, mode: "write" }];

  const familyRootId = target.parentId ?? nodeId;
  const familyMembers = docs.filter(
    (n) => n.id === familyRootId || n.parentId === familyRootId,
  );

  if (familyMembers.length <= 1) {
    // Isolated node — no family to broaden to
    return [{ kind: "node", nodeId, mode: "write" }];
  }

  return familyMembers.map((n) => ({ kind: "node" as const, nodeId: n.id, mode: "write" as const }));
}

// Lifecycle status → inferred task type. Status values not in this map
// produce 409 no_inferred_type unless the body overrides `type`. (D4)
const TYPE_INFERENCE: Partial<Record<NodeStatus, TaskType>> = {
  APPROVED: "implement",
  VERIFY: "verify",
  DRAFT: "spec_review",
} as const;

export const dispatchRoute = new Hono<ServerEnv>().post("/:nodeId", async (c) => {
  const project = c.get("project");
  const nodeId = c.req.param("nodeId");
  const node = project.docs.find((n) => n.id === nodeId);
  if (node === undefined) return c.json({ error: "node_not_found", nodeId }, 404);

  const body = (await c.req.json().catch(() => ({}))) as {
    type?: TaskType;
    priority?: number;
    resourceClaims?: ResourceClaim[];
  };

  const inferredType = body.type ?? TYPE_INFERENCE[node.status];
  if (inferredType === undefined) {
    return c.json(
      {
        error: "no_inferred_type",
        nodeStatus: node.status,
        // Spec Review S1: differentiated hint so the operator can tell why
        // their click failed. Each branch maps to actionable operator guidance.
        hint:
          node.status === "PLANNED"
            ? "Node is PLANNED — not yet ready for dispatch. Draft the spec first (set Status: DRAFT) or pick a different node."
            : node.status === "SPEC_REVIEW"
            ? "Node is SPEC_REVIEW — currently under review. Wait for the review to land (SPEC_REVIEW → APPROVED) or pick a different node."
            : node.status === "IN_PROGRESS"
            ? "Node is IN_PROGRESS — already running. Check the Tasks panel for the in-flight dispatch."
            : node.status === "COMPLETE"
            ? "Node is COMPLETE — no work to dispatch. Pick a different node or override the type via body."
            : `Node is in ${node.status}; dispatch is only valid for APPROVED, VERIFY, or DRAFT nodes.`,
      },
      409,
    );
  }

  // Synthesise a Task-shaped object to pass to defaultResourceClaims;
  // the helper reads `task.id`, `task.type`, and `task.parentTaskId`.
  // Confidence note #4: this minimum shape is sufficient.
  // defaultResourceClaims accepts Pick<Task, "id" | "type" | "parentTaskId">.
  const claims = body.resourceClaims ?? (
    inferredType === "doc_decompose"
      ? decomposeResourceClaims(nodeId, project.docs)
      : defaultResourceClaims({ id: nodeId, type: inferredType, parentTaskId: undefined })
  );

  const title = `Dispatch ${inferredType} on ${nodeId}`;
  const task = project.runner.createTask({
    type: inferredType,
    title,
    source: "operator_injected",
    agent: { model: "claude-code", persona: inferredType },
    resourceClaims: claims,
    ...(body.priority !== undefined ? { priority: body.priority } : {}),
  });
  return c.json({ task }, 201);
});
