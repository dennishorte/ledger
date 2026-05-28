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
