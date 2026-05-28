/**
 * registerRunnerTools — registers the five MCP runner tools on an McpServer.
 *
 * Each tool is a thin adapter over RunnerHandle / Store. The five tools:
 *   runner.emit_event         — append a non-status_change LogEvent to the bound task
 *   runner.complete_task      — transition RUNNING → COMPLETE
 *   runner.fail_task          — transition RUNNING → FAILED (agent-supplied reason, verbatim)
 *   runner.await_human_review — write reviewPayload then transition RUNNING → AWAITING_HUMAN_REVIEW
 *   runner.get_task           — read-only fetch (cross-task, no binding check per parent D8)
 *
 * Status pre-check (Spec Review N2): the three transition tools read store.getStatus(taskId)
 * before calling RunnerHandle to prevent double-transition writes when the task is not RUNNING.
 *
 * McpError + ErrorCode import: resolved via @modelcontextprotocol/sdk/types.js (SDK's ./* glob).
 * Confirmed against SDK 1.29.0. Fallback path if resolution fails: also re-exported from
 * @modelcontextprotocol/sdk/server/mcp.js.
 *
 * Spec: docs/06-agent-dispatcher/02-runner-tools.md §Design §"Tool registration"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { validateLogEvent } from "@ledger/parser";
import type { RunnerHandle, Store } from "../../runner/index.js";
import type { BindingRegistry } from "./binding.js";
import {
  emitEventShape,
  completeTaskShape,
  failTaskShape,
  awaitHumanReviewShape,
  getTaskShape,
} from "./toolSchemas.js";

export interface RunnerToolDeps {
  store: Store;
  handle: RunnerHandle;
  binding: BindingRegistry;
}

export function registerRunnerTools(server: McpServer, deps: RunnerToolDeps): void {
  const { store, handle, binding } = deps;

  // -------------------------------------------------------------------------
  // runner.emit_event
  // Append a non-status_change LogEvent to the bound task.
  // Zod gates the outer shape; validateLogEvent (ajv) gates the full union.
  // -------------------------------------------------------------------------

  server.registerTool(
    "runner.emit_event",
    {
      description:
        "Append a non-status_change LogEvent to the bound task. " +
        "Returns the materialized event row. " +
        "Rejects status_change kind (use runner.complete_task / fail_task / await_human_review instead).",
      inputSchema: emitEventShape,
    },
    (args, extra) => {
      const taskId = binding.requireBound(extra.sessionId, args.task_id);

      // Explicit rejection of status_change (D13)
      const candidate = args.event as Record<string, unknown>;
      if (candidate["kind"] === "status_change") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "status_change events are managed by the runner; use runner.complete_task / fail_task / await_human_review to transition",
          { reason: "status_change_not_emittable" },
        );
      }

      // Construct a candidate shape for ajv validation (synthetic fields are throwaway — D4 / Confidence note #3)
      // seq: 0 satisfies the schema's minimum: 0 constraint; the store overwrites it on append.
      const validationCandidate = {
        id: "_pre",
        taskId,
        seq: 0,
        at: "1970-01-01T00:00:00Z",
        ...candidate,
      };

      const result = validateLogEvent(validationCandidate);
      if (!result.ok) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "event failed LogEvent schema validation",
          { reason: "invalid_event_shape", errors: result.errors },
        );
      }

      // Pass the clean candidate (no sentinel fields) to the store (Confidence note #3)
      const row = handle.emit(
        taskId,
        candidate as Parameters<RunnerHandle["emit"]>[1],
      );

      return { content: [{ type: "text" as const, text: JSON.stringify(row) }] };
    },
  );

  // -------------------------------------------------------------------------
  // runner.complete_task
  // Transition the bound task RUNNING → COMPLETE.
  // -------------------------------------------------------------------------

  server.registerTool(
    "runner.complete_task",
    {
      description: "Transition the bound task RUNNING → COMPLETE.",
      inputSchema: completeTaskShape,
    },
    (args, extra) => {
      const taskId = binding.requireBound(extra.sessionId, args.task_id);

      // Status pre-check (Spec Review N2)
      const current = store.getStatus(taskId);
      if (current !== "RUNNING") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "task_not_running",
          { reason: "task_not_running", actual: current, expected: "RUNNING" },
        );
      }

      const task = handle.complete(taskId);
      return { content: [{ type: "text" as const, text: JSON.stringify({ status: task.status }) }] };
    },
  );

  // -------------------------------------------------------------------------
  // runner.fail_task
  // Transition the bound task RUNNING → FAILED with agent-supplied reason (verbatim).
  // -------------------------------------------------------------------------

  server.registerTool(
    "runner.fail_task",
    {
      description:
        "Transition the bound task RUNNING → FAILED with the agent-supplied reason " +
        "(stored verbatim on the status_change event).",
      inputSchema: failTaskShape,
    },
    (args, extra) => {
      const taskId = binding.requireBound(extra.sessionId, args.task_id);

      // Status pre-check (Spec Review N2)
      const current = store.getStatus(taskId);
      if (current !== "RUNNING") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "task_not_running",
          { reason: "task_not_running", actual: current, expected: "RUNNING" },
        );
      }

      const task = handle.fail(taskId, args.reason);
      return { content: [{ type: "text" as const, text: JSON.stringify({ status: task.status }) }] };
    },
  );

  // -------------------------------------------------------------------------
  // runner.await_human_review
  // Write reviewPayload then transition the bound task RUNNING → AWAITING_HUMAN_REVIEW.
  // Operator resolves via /api/tasks/:id/approve|reject (03-hitl-gate).
  // -------------------------------------------------------------------------

  server.registerTool(
    "runner.await_human_review",
    {
      description:
        "Write a reviewPayload row update, then transition the bound task " +
        "RUNNING → AWAITING_HUMAN_REVIEW. " +
        "Operator resolves via /api/tasks/:id/approve|reject.",
      inputSchema: awaitHumanReviewShape,
    },
    (args, extra) => {
      const taskId = binding.requireBound(extra.sessionId, args.task_id);

      // Status pre-check (Spec Review N2)
      const current = store.getStatus(taskId);
      if (current !== "RUNNING") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "task_not_running",
          { reason: "task_not_running", actual: current, expected: "RUNNING" },
        );
      }

      // Write reviewPayload first (non-transactional per D10; awaitHumanReview is durability boundary)
      store.updateReviewPayload(taskId, args.review_payload);
      const task = handle.awaitHumanReview(taskId);
      return { content: [{ type: "text" as const, text: JSON.stringify({ status: task.status }) }] };
    },
  );

  // -------------------------------------------------------------------------
  // runner.get_task
  // Read-only fetch of any task + events. No binding check (parent D8).
  // -------------------------------------------------------------------------

  server.registerTool(
    "runner.get_task",
    {
      description:
        "Read task state + events. Open across all project tasks (parent D8 — read is unbound).",
      inputSchema: getTaskShape,
    },
    (args) => {
      const task = store.loadTask(args.task_id);
      if (!task) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "task not found",
          { reason: "task_not_found", taskId: args.task_id },
        );
      }
      const events = store.getEvents(args.task_id);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ task, events }) },
        ],
      };
    },
  );
}
