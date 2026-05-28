/**
 * HITL gate routes — POST /:id/approve + POST /:id/reject.
 *
 * Mounted at /api/tasks alongside tasksRoute (04-api-endpoints). Hono composes
 * multiple .route() calls onto the same prefix by URL pattern. This router
 * claims /:id/approve + /:id/reject; tasksRoute claims /, /:id, /:id/stream,
 * POST /. No path overlap.
 *
 * Spec: docs/05-task-runner/03-hitl-gate.md
 */

import { Hono } from "hono";
import {
  validateHitlApprove,
  validateHitlReject,
  validateTaskInput,
} from "@ledger/parser";
import type { TaskInput } from "@ledger/parser";
import { OptimisticLockError } from "../runner/store.js";
import { reasons } from "../runner/scheduler.js";
import type { ServerEnv } from "../server.js";

export const hitlRoute = new Hono<ServerEnv>()
  .post("/:id/approve", async (c) => {
    const project = c.get("project");
    const id = c.req.param("id");

    const task = project.runner.store.loadTask(id);
    if (task === undefined) return c.json({ error: "task_not_found" }, 404);
    if (task.status !== "AWAITING_HUMAN_REVIEW") {
      return c.json(
        {
          error: "wrong_status",
          expected: "AWAITING_HUMAN_REVIEW",
          actual: task.status,
        },
        409,
      );
    }

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const result = validateHitlApprove(raw);
    if (!result.ok) return c.json({ errors: result.errors }, 400);
    const { dbRowVersion, note } = result.input;

    const reason =
      note !== undefined && note.length > 0
        ? reasons.approvedWithNote(note)
        : reasons.APPROVED;

    try {
      const updated = project.runner.store.updateTaskStatus(
        id,
        { from: "AWAITING_HUMAN_REVIEW", to: "COMPLETE", reason },
        dbRowVersion,
      );
      project.runner.tick();
      return c.json({ task: updated }, 200);
    } catch (err) {
      if (err instanceof OptimisticLockError) {
        // Spec Review S5: use err.expected (from the thrown error), not the
        // request body's dbRowVersion. Equivalent value, structurally cleaner.
        return c.json(
          { error: "version_conflict", expected: err.expected, actual: err.actual },
          409,
        );
      }
      throw err;
    }
  })
  .post("/:id/reject", async (c) => {
    const project = c.get("project");
    const id = c.req.param("id");

    const task = project.runner.store.loadTask(id);
    if (task === undefined) return c.json({ error: "task_not_found" }, 404);
    if (task.status !== "AWAITING_HUMAN_REVIEW") {
      return c.json(
        {
          error: "wrong_status",
          expected: "AWAITING_HUMAN_REVIEW",
          actual: task.status,
        },
        409,
      );
    }

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    // Capture whether the request body explicitly supplied followUp.resourceClaims
    // BEFORE ajv's useDefaults: true fills in [] via the task-input.schema.json
    // $ref. The validator's `result.input.followUp.resourceClaims` will always
    // be defined post-validation; presence-vs-absence detection (D9) must use
    // the raw body. (Discovered during stage-4 implementation; spec's D9
    // pseudocode was written assuming raw `followUp` presence semantics.)
    const rawFollowUpClaimsPresent = (() => {
      if (typeof raw !== "object" || raw === null) return false;
      const obj = raw as Record<string, unknown>;
      if (!("followUp" in obj)) return false;
      const fu = obj.followUp;
      if (typeof fu !== "object" || fu === null) return false;
      return "resourceClaims" in (fu as Record<string, unknown>);
    })();

    const result = validateHitlReject(raw);
    if (!result.ok) return c.json({ errors: result.errors }, 400);
    const { dbRowVersion, reason: rejectionReason, followUp } = result.input;

    // D5: detail event written FIRST so the rationale survives even if the
    // status transition races with another writer and loses the OCC check.
    // appendEvent does NOT bump db_row_version (verified store.ts:371-381),
    // so the OCC token on the request body still matches the row's version
    // when updateTaskStatus runs below.
    project.runner.store.appendEvent(id, {
      kind: "error",
      message: "rejected_with_details",
      stack: rejectionReason,
    } as Parameters<typeof project.runner.store.appendEvent>[1]);

    let updated;
    try {
      updated = project.runner.store.updateTaskStatus(
        id,
        {
          from: "AWAITING_HUMAN_REVIEW",
          to: "FAILED",
          reason: reasons.rejected(rejectionReason),
        },
        dbRowVersion,
      );
    } catch (err) {
      if (err instanceof OptimisticLockError) {
        return c.json(
          { error: "version_conflict", expected: err.expected, actual: err.actual },
          409,
        );
      }
      throw err;
    }

    let followUpTask: ReturnType<typeof project.runner.createTask> | undefined;
    if (followUp !== undefined) {
      // D8: dependsOn force-cleared.
      // D9: resourceClaims defaults to rejected task's claims when the
      // operator did NOT explicitly set them (rawFollowUpClaimsPresent).
      // The validator already filled `followUp.resourceClaims` with [] via
      // useDefaults — so we check the raw body presence to make the right call.
      const followUpInput: TaskInput = {
        ...followUp,
        dependsOn: [],
        resourceClaims: rawFollowUpClaimsPresent
          ? followUp.resourceClaims
          : task.resourceClaims,
      };
      const fuResult = validateTaskInput(followUpInput);
      if (!fuResult.ok) {
        // D7: do NOT roll back the successful rejection. Return 200 with the
        // rejected task + followUpErrors so the operator sees the partial-success
        // shape and can re-inject via POST /api/tasks.
        return c.json({ task: updated, followUpErrors: fuResult.errors }, 200);
      }
      // Reload the follow-up after runner.createTask so the response carries
      // the post-tick state (noop completes synchronously). Mirrors the
      // 04-api-endpoints POST handler pattern at tasks.ts:171.
      const created = project.runner.createTask(fuResult.input);
      followUpTask = project.runner.store.loadTask(created.id) ?? created;
    }

    project.runner.tick();
    return c.json(
      followUpTask !== undefined ? { task: updated, followUpTask } : { task: updated },
      200,
    );
  });
