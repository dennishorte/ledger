/**
 * ID generators for the task runner.
 *
 * Task IDs and event IDs are bare UUIDv4 (no prefix), generated via
 * crypto.randomUUID() (Node 19+ built-in — no uuid package required, D3).
 */

import type { TaskId, LogEventId } from "@ledger/parser";

export function newTaskId(): TaskId {
  return crypto.randomUUID();
}

export function newEventId(): LogEventId {
  return crypto.randomUUID();
}
