/**
 * Zod schemas (raw shapes) for the five MCP runner tools.
 *
 * Each shape is a ZodRawShapeCompat — a plain object of Zod types — passed to
 * McpServer.registerTool(...). The SDK validates inbound arguments against the
 * schema before invoking our handler; invalid args produce an SDK-generated
 * JSON-RPC InvalidParams response without our handler being called.
 *
 * All five tools share the base `task_id: z.string().min(1)` argument.
 * The `runner.emit_event` tool's `event` field uses `.passthrough()` so
 * kind-specific payload fields ride through; validateLogEvent (ajv) gates them
 * inside the handler (D4).
 *
 * Spec: docs/06-agent-dispatcher/02-runner-tools.md §Design §"Zod schemas + tool registration"
 */

import { z } from "zod";

const taskId = z.string().min(1);

export const emitEventShape = {
  task_id: taskId,
  // z.looseObject() (Zod 4) is the replacement for .passthrough() — allows extra fields to pass through.
  // The outer shape only validates `kind`; kind-specific payload fields ride through to validateLogEvent (ajv).
  event: z.looseObject({
    kind: z.string(),
  }),
} as const;

export const completeTaskShape = {
  task_id: taskId,
} as const;

export const failTaskShape = {
  task_id: taskId,
  reason: z.string().min(1).max(2000), // stored verbatim on the status_change event
} as const;

export const awaitHumanReviewShape = {
  task_id: taskId,
  review_payload: z.object({
    summary: z.string().min(1),
    diffRef: z.string().optional(),
  }),
} as const;

export const getTaskShape = {
  task_id: taskId,
} as const;
