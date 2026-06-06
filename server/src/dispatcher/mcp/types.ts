import type { Hono } from "hono";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type MCPSessionId = string;

export interface McpServerOptions {
  /** Version string surfaced in serverInfo to MCP clients on initialize. */
  version: string;
  /**
   * Per-session tool registration. Invoked once for each new `McpServer` the
   * factory creates — i.e. once per inbound `initialize` (one transport +
   * server per session; see server.ts). Callers register the runner tools here
   * (`(server) => registerRunnerTools(server, deps)`). Must run BEFORE the
   * server connects to its transport, which the factory guarantees.
   */
  registerTools?: (server: McpServer) => void;
}

export type SessionInitializedListener = (
  sessionId: MCPSessionId,
  request: Request | undefined,
) => void;
export type SessionClosedListener = (sessionId: MCPSessionId) => void;

export interface McpServerHandle {
  /**
   * The Hono sub-app mounted at /mcp by createMcpServer. It routes each request
   * to its per-session transport (keyed by the `mcp-session-id` header) and
   * creates a fresh transport + server on each `initialize`.
   * Typed as `Hono<Record<string, unknown>>` (effectively `Hono<any>` env) because the
   * sub-app does not consume ServerEnv variables — it only delegates to transport.handleRequest.
   * Mounting onto a Hono<ServerEnv> parent via app.route works because Hono's .route() accepts
   * a sub-app with a structurally-compatible (looser) env type.
   */
  readonly mcpRoute: Hono<Record<string, unknown>>;
  /** Current count of open MCP sessions. Read by /api/_health. */
  activeSessions(): number;
  /** Subscribe to session-initialized events. Returns an unsubscribe callback. */
  onSessionInitialized(listener: SessionInitializedListener): () => void;
  /** Subscribe to session-closed events. Returns an unsubscribe callback. */
  onSessionClosed(listener: SessionClosedListener): () => void;
  /**
   * Force-close every session bound to `taskId` (matched on the X-Ledger-Task-Id
   * header captured at initialize). Called by the executor when a dispatched
   * subprocess exits/is killed so the agent's MCP session does not leak — claude
   * does not reliably send DELETE /mcp on exit. Fires onSessionClosed listeners
   * and returns the number of sessions closed. Idempotent.
   */
  closeTaskSessions(taskId: string): number;
  /** Teardown — closes every live session (server + transport). */
  close(): Promise<void>;
}
