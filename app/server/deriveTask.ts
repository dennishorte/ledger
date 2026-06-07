/**
 * Task derivation — reads a full JSONL transcript and produces a typed Task
 * with claims, agent metadata, timing, and title.
 *
 * See spec §Design > Task derivation and §Design > Resource-claim derivation.
 */

import type {
  ResourceClaim,
  Task,
  TaskId,
  TaskSource,
  TaskStatus,
  TaskType,
} from "../src/lib/types.js";
import { serverIdForPath } from "./serverIdForPath.js";
import type { TranscriptEntry } from "./transcriptScan.js";
import type { ParsedLine } from "./transcriptParse.js";
import {
  inferTaskType,
  extractAiTitle,
  extractFirstUserPrompt,
  parseTranscriptFile,
} from "./transcriptParse.js";
import { deriveStatus } from "./transcriptStatus.js";

// ---------------------------------------------------------------------------
// Resource claim derivation (D6, D8)
// ---------------------------------------------------------------------------

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const READ_TOOLS = new Set(["Read"]);

/**
 * Derive a ResourceClaim from a tool call + result pair.
 * Returns null when no claim is applicable.
 */
function deriveClaimFromTool(
  toolName: string,
  toolArgs: string,
  isOk: boolean,
): ResourceClaim | null {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(toolArgs) as Record<string, unknown>;
  } catch {
    return null;
  }

  const filePath =
    typeof args["file_path"] === "string"
      ? args["file_path"]
      : typeof args["path"] === "string"
        ? args["path"]
        : null;

  if (!filePath) return null;

  if (READ_TOOLS.has(toolName)) {
    const nodeId = serverIdForPath(filePath);
    if (nodeId !== null) {
      return { kind: "node", nodeId, mode: "read" };
    }
    return { kind: "path", path: filePath, mode: "read" };
  }

  if (WRITE_TOOLS.has(toolName) && isOk) {
    const nodeId = serverIdForPath(filePath);
    if (nodeId !== null) {
      return { kind: "node", nodeId, mode: "write" };
    }
    return { kind: "path", path: filePath, mode: "write" };
  }

  return null;
}

/** Deduplicate claims by (kind, target, mode). */
function dedupClaims(claims: ResourceClaim[]): ResourceClaim[] {
  const seen = new Set<string>();
  const result: ResourceClaim[] = [];
  for (const claim of claims) {
    const key =
      claim.kind === "node"
        ? `node:${claim.nodeId}:${claim.mode}`
        : `path:${claim.path}:${claim.mode}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(claim);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main derivation function
// ---------------------------------------------------------------------------

/**
 * Derive a full Task (including resource claims) from a TranscriptEntry.
 * Reads the JSONL file from disk.
 */
export function deriveTask(entry: TranscriptEntry): Task {
  const taskId: TaskId =
    entry.kind === "session"
      ? `session:${entry.id}`
      : `agent:${entry.id}`;

  const { events, lines } = parseTranscriptFile(taskId, entry.jsonlPath);

  // Extract model from first assistant line.
  // ParsedLine spreads the raw object fields, so "message" is accessible as unknown.
  let model: string | undefined;
  for (const line of lines) {
    if (line.type === "assistant") {
      const rawLine = line as ParsedLine & Record<string, unknown>;
      const message = rawLine["message"];
      if (typeof message === "object" && message !== null) {
        const msgModel = (message as Record<string, unknown>)["model"];
        if (typeof msgModel === "string") {
          model = msgModel;
          break;
        }
      }
    }
  }

  // Extract timestamps from ParsedLine.timestamp (set in parseLine).
  let createdAt: string | undefined;
  let lastAt: string | undefined;
  for (const line of lines) {
    if (typeof line.timestamp === "string") {
      if (!createdAt) createdAt = line.timestamp;
      lastAt = line.timestamp;
    }
  }
  const now = new Date().toISOString();
  const resolvedCreatedAt = createdAt ?? now;

  // Status
  const status: TaskStatus = deriveStatus(entry.jsonlPath);

  // Title (D14)
  let title: string;
  if (entry.kind === "subagent" && entry.meta?.description) {
    title = entry.meta.description;
  } else {
    const aiTitle = extractAiTitle(lines);
    if (aiTitle) {
      title = aiTitle;
    } else {
      const prompt = extractFirstUserPrompt(lines);
      if (prompt) {
        title = prompt;
      } else {
        const shortId = entry.id.slice(0, 8);
        title = `Operator session ${shortId}`;
      }
    }
  }

  // Type
  let type: TaskType;
  let source: TaskSource;
  let parentTaskId: TaskId | undefined;
  let persona: string | undefined;

  if (entry.kind === "session") {
    type = "operator_session";
    source = "operator_injected";
  } else {
    // Sub-agent
    const desc = entry.meta?.description ?? "";
    type = inferTaskType(desc);
    source = "agent_generated";
    parentTaskId = entry.parentSessionId
      ? `session:${entry.parentSessionId}`
      : undefined;
    persona = entry.meta?.agentType;
  }

  // Resource claims from tool call/result pairs
  const claims: ResourceClaim[] = [];

  // Build a map from callId → tool name + args
  const toolCallMap = new Map<
    string,
    { toolName: string; arguments: string }
  >();

  for (const event of events) {
    if (event.kind === "tool_call") {
      toolCallMap.set(event.callId, {
        toolName: event.toolName,
        arguments: event.arguments,
      });
    } else if (event.kind === "tool_result") {
      const callInfo = toolCallMap.get(event.callId);
      if (callInfo) {
        const claim = deriveClaimFromTool(
          callInfo.toolName,
          callInfo.arguments,
          event.status === "ok",
        );
        if (claim) claims.push(claim);
      }
    }
  }

  // Sub-agent worktree path claim
  if (entry.meta?.worktreePath) {
    claims.push({
      kind: "path",
      path: entry.meta.worktreePath,
      mode: "write",
    });
  }

  // completedAt
  const completedAt =
    status === "COMPLETE" && lastAt ? lastAt : undefined;

  const task: Task = {
    id: taskId,
    type,
    status,
    title,
    source,
    parentTaskId,
    dependsOn: [],
    resourceClaims: dedupClaims(claims),
    agent:
      model !== undefined || persona !== undefined
        ? { model: model ?? "unknown", persona }
        : undefined,
    dbRowVersion: 0,
    priority: 0,
    createdAt: resolvedCreatedAt,
    startedAt: resolvedCreatedAt,
    completedAt,
    transcriptPath: entry.jsonlPath,
  };

  return task;
}

// ---------------------------------------------------------------------------
// Parent status rollup (10-orchestration Open Issue, HIGH)
// ---------------------------------------------------------------------------

/**
 * "Incompleteness" rank — higher means less complete. A parent's rolled-up
 * status is the status with the highest rank across {itself} ∪ {transitive
 * children}, so a parent never reads more-complete than its least-complete
 * descendant. Ordering per the originating Open Issue:
 *   RUNNING > AWAITING_HUMAN_REVIEW > BLOCKED > PENDING > FAILED > COMPLETE.
 * CANCELLED slots between FAILED and COMPLETE (terminal, but did not complete).
 * Transcript derivation only emits RUNNING/AWAITING_HUMAN_REVIEW/COMPLETE today;
 * the full table keeps the function total and correct if reused over runner tasks.
 */
const STATUS_INCOMPLETENESS: Record<TaskStatus, number> = {
  RUNNING: 6,
  AWAITING_HUMAN_REVIEW: 5,
  BLOCKED: 4,
  PENDING: 3,
  FAILED: 2,
  CANCELLED: 1,
  COMPLETE: 0,
};

/**
 * Downgrade each parent task's status to the least-complete status across its
 * own status and all transitive children. Pure: returns a new array; tasks with
 * no children (or already at the worst status) are returned unchanged. When a
 * parent is downgraded off COMPLETE, its `completedAt` is cleared so the two
 * fields stay consistent.
 *
 * Fixes the "parent COMPLETE while children still RUNNING/AWAITING_REVIEW"
 * inconsistency: `deriveStatus` derives each transcript in isolation, so a quiet
 * operator_session flips COMPLETE even while its sub-agents are mid-flight.
 */
export function applyParentStatusRollup(tasks: Task[]): Task[] {
  const byId = new Map<TaskId, Task>(tasks.map((t) => [t.id, t]));
  const childrenOf = new Map<TaskId, TaskId[]>();
  for (const t of tasks) {
    const parent = t.parentTaskId;
    if (parent !== undefined && byId.has(parent)) {
      const siblings = childrenOf.get(parent) ?? [];
      siblings.push(t.id);
      childrenOf.set(parent, siblings);
    }
  }

  const memo = new Map<TaskId, TaskStatus>();
  const visiting = new Set<TaskId>();

  function effectiveStatus(id: TaskId): TaskStatus {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const self = byId.get(id);
    if (self === undefined) return "COMPLETE"; // unreachable: ids come from `tasks`
    // Cycle guard. `parentTaskId` forms a forest so cycles are impossible; this is
    // purely defensive against corrupt data. Return the max-rank status so a cycle
    // can never *suppress* a downgrade (fail toward surfacing, never hiding).
    if (visiting.has(id)) return "RUNNING";

    visiting.add(id);
    let worst = self.status;
    for (const childId of childrenOf.get(id) ?? []) {
      const childStatus = effectiveStatus(childId);
      if (STATUS_INCOMPLETENESS[childStatus] > STATUS_INCOMPLETENESS[worst]) {
        worst = childStatus;
      }
    }
    visiting.delete(id);
    memo.set(id, worst);
    return worst;
  }

  return tasks.map((t) => {
    const rolled = effectiveStatus(t.id);
    if (rolled === t.status) return t;
    return {
      ...t,
      status: rolled,
      completedAt: rolled === "COMPLETE" ? t.completedAt : undefined,
    };
  });
}
