/**
 * Task-ID binding registry for the MCP dispatcher layer.
 *
 * A `Map<MCPSessionId, TaskId>` populated via the `onSessionInitialized` hook
 * from `01-mcp-server`. Each mutating MCP tool calls `requireBound` to verify
 * the session is bound and the claimed task-id matches. `runner.get_task` is
 * exempt (parent D8 — cross-task reads are open).
 *
 * Three rejection modes under a single `task_not_bound` message string:
 *   - no_session        : extra.sessionId was undefined (SDK did not populate it)
 *   - session_not_bound : session exists but was not bound (no X-Ledger-Task-Id header)
 *   - task_id_mismatch  : claimed task_id does not match the bound task_id
 *
 * Spec: docs/06-agent-dispatcher/02-runner-tools.md §Design §"Binding registry"
 */

import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { MCPSessionId } from "./types.js";

export interface BindingRegistry {
  /**
   * Bind a session to a task. If taskId is undefined or empty (no header),
   * the bind is a no-op — the session exists but has no bound task.
   */
  bind(sessionId: MCPSessionId, taskId: string | undefined): void;
  /** Remove the binding for a session on close. */
  unbind(sessionId: MCPSessionId): void;
  /** Return the bound taskId for a session, or undefined if not bound. */
  lookup(sessionId: MCPSessionId): string | undefined;
  /**
   * Returns the bound taskId on hit.
   * Throws McpError(InvalidParams, "task_not_bound", { reason, ... }) on:
   *   - sessionId is undefined              → reason: "no_session"
   *   - session has no binding              → reason: "session_not_bound"
   *   - claimedTaskId !== bound taskId      → reason: "task_id_mismatch"
   */
  requireBound(sessionId: MCPSessionId | undefined, claimedTaskId: string): string;
  /** Test-only inspection: number of active bindings. */
  size(): number;
}

export function createBindingRegistry(): BindingRegistry {
  const map = new Map<MCPSessionId, string>();

  return {
    bind(sessionId, taskId) {
      // No header → no bind; subsequent tool calls will get session_not_bound.
      if (taskId === undefined || taskId.length === 0) return;
      map.set(sessionId, taskId);
    },
    unbind(sessionId) {
      map.delete(sessionId);
    },
    lookup(sessionId) {
      return map.get(sessionId);
    },
    requireBound(sessionId, claimedTaskId) {
      if (sessionId === undefined) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "task_not_bound",
          { reason: "no_session", claimedTaskId },
        );
      }
      const bound = map.get(sessionId);
      if (bound === undefined) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "task_not_bound",
          { reason: "session_not_bound", sessionId, claimedTaskId },
        );
      }
      if (bound !== claimedTaskId) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "task_not_bound",
          { reason: "task_id_mismatch", sessionId, claimedTaskId, boundTaskId: bound },
        );
      }
      return bound;
    },
    size() {
      return map.size;
    },
  };
}
