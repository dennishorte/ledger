/**
 * Canonical alert domain types (08-alerts).
 *
 * The algedonic channel raises an Alert when a task transitions to a critical
 * state (v1: FAILED). The same shape is delivered over two paths — the
 * /api/alerts SSE stream (UI banner) and the outbound webhook POST — so it
 * lives in @ledger/parser as the single source of truth, re-exported by
 * app/src/lib/types.ts (CLAUDE.md: domain types live where they're authoritative).
 */

import type { TaskId, TaskType } from "../runner/types.js";

export interface Alert {
  /** Monotonic per server boot. Doubles as the SSE id (Last-Event-ID resume) and React key. */
  seq: number;
  taskId: TaskId;
  taskTitle: string;
  taskType: TaskType;
  /** Extensible discriminant. v1 only raises "task_failed"; v2 may add "scan_finding", etc. */
  kind: "task_failed";
  /** Extensible severity band. v1 only raises "critical". */
  severity: "critical";
  /** Failure reason from the status_change event; "" when the event carried none. */
  reason: string;
  /** ISO 8601 timestamp the alert was raised. */
  at: string;
}
