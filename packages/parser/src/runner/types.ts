/**
 * Canonical runner domain types.
 *
 * Moved from app/src/lib/types.ts (orchestration block) to @ledger/parser
 * in 05-task-runner/01-store-schema per parent D4. app/src/lib/types.ts
 * re-exports these for backward compatibility.
 *
 * Three changes vs the original:
 *   - Task.transcriptPath is now optional (was required)
 *   - Task.dbRowVersion: number added (PRD §8.4 OCC)
 *   - TaskType gains "noop" (v1 synthetic executor, Spec Review B1)
 *   - LogEvent status_change.from is now from?: TaskStatus (Spec Review S4)
 *   - TaskInput type added (subset accepted by POST /api/tasks)
 */

import type { NodeId } from "../coreTypes.js";

export type TaskId = string;

export type TaskType =
  | "spec_draft"
  | "spec_review"
  | "implement"
  | "verify"
  | "doc_refactor"
  | "issue_triage"
  | "human_review"
  | "reverify"
  | "project_status_review"
  | "operator_session"
  | "agent_task"
  | "noop"; // v1 synthetic executor (parent D8, Spec Review B1)

export type TaskStatus =
  | "PENDING"
  | "RUNNING"
  | "BLOCKED"
  | "AWAITING_HUMAN_REVIEW"
  | "COMPLETE"
  | "FAILED"
  | "CANCELLED";

export type TaskSource =
  | "agent_generated"
  | "operator_injected"
  | "daemon_triggered";

/**
 * Resource claim — phase-1 these are descriptive (derived from observed tool
 * calls), not prescriptive (declared upfront and enforced by the runner).
 */
export type ResourceClaim =
  | { kind: "node"; nodeId: NodeId; mode: "read" | "write" }
  | { kind: "path"; path: string; mode: "read" | "write" };

export interface Task {
  id: TaskId;
  type: TaskType;
  status: TaskStatus;
  title: string;
  source: TaskSource;
  parentTaskId?: TaskId;
  dependsOn: TaskId[];
  resourceClaims: ResourceClaim[];
  agent?: { model: string; persona?: string };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  reviewPayload?: { summary: string; diffRef?: string };
  /**
   * Required for optimistic concurrency on HITL approve/reject endpoints (PRD §8.4).
   * Defaults to 0 on insert; bumped on every UPDATE.
   */
  dbRowVersion: number;
  priority: number;
  /**
   * Absolute path to the source JSONL on disk.
   * Server-internal; never rendered in the UI.
   * Optional — runner-emitted tasks have no transcript (Spec Review B2).
   */
  transcriptPath?: string;
}

/**
 * The subset of Task accepted by POST /api/tasks and Store.createTask.
 *
 * Note: transcriptPath deliberately absent — only the transcript bootstrap
 * path (app/server/deriveTask.ts) sets it, and that path constructs Task
 * objects directly rather than going through createTask(). (Spec Review N3.)
 */
export interface TaskInput {
  type: TaskType;
  title: string;
  source?: TaskSource; // default "operator_injected"
  parentTaskId?: TaskId;
  dependsOn?: TaskId[]; // default []
  resourceClaims?: ResourceClaim[]; // default []
  agent?: { model: string; persona?: string };
  reviewPayload?: { summary: string; diffRef?: string };
  priority?: number; // default 0
}

export type LogEventId = string;
export type ConnectionStatus = "stub" | "live" | "ended" | "missing";

export interface BaseLogEvent {
  id: LogEventId;
  taskId: TaskId;
  at: string; // ISO 8601
  seq: number; // monotonic per task
}

export type LogEvent = BaseLogEvent &
  (
    | { kind: "reasoning"; text: string; subkind: "thinking" | "message" }
    | {
        kind: "tool_call";
        callId: string;
        toolName: string;
        arguments: string /* serialized JSON */;
      }
    | {
        kind: "tool_result";
        callId: string;
        status: "ok" | "error";
        body: string;
        durationMs?: number;
      }
    | {
        kind: "artifact";
        artifactKind:
          | "doc_created"
          | "doc_updated"
          | "file_written"
          | "version_committed";
        path: string;
        docNodeId?: NodeId;
        summary?: string;
      }
    | {
        kind: "status_change";
        from?: TaskStatus; // optional: absent on seq-0 creation event (Spec Review S4)
        to: TaskStatus;
        reason?: string;
      }
    | { kind: "error"; message: string; stack?: string }
  );
