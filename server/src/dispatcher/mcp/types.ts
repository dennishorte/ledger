import type { Hono } from "hono";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export type MCPSessionId = string;

export interface McpServerOptions {
  /** Version string surfaced in serverInfo to MCP clients on initialize. */
  version: string;
}

export type SessionInitializedListener = (
  sessionId: MCPSessionId,
  request: Request | undefined,
) => void;
export type SessionClosedListener = (sessionId: MCPSessionId) => void;

export interface McpServerHandle {
  /** The underlying SDK server; siblings call registerTool on this. */
  readonly server: McpServer;
  /** The SDK transport instance; exposed for advanced use (tests). */
  readonly transport: WebStandardStreamableHTTPServerTransport;
  /**
   * The Hono sub-app mounted at /mcp by createServer.
   * Typed as `Hono<Record<string, unknown>>` (effectively `Hono<any>` env) because the
   * sub-app does not consume ServerEnv variables — it only delegates to transport.handleRequest.
   * Mounting onto a Hono<ServerEnv> parent via app.route works because Hono's .route() accepts
   * a sub-app with a structurally-compatible (looser) env type.
   */
  readonly mcpRoute: Hono<Record<string, unknown>>;
  /** Current count of open MCP sessions (raw session presence). Read by /api/_health. */
  activeSessions(): number;
  /** Subscribe to session-initialized events. Returns an unsubscribe callback. */
  onSessionInitialized(listener: SessionInitializedListener): () => void;
  /** Subscribe to session-closed events. Returns an unsubscribe callback. */
  onSessionClosed(listener: SessionClosedListener): () => void;
  /** Teardown — closes both server and transport. Not called in v1 (no project teardown path). */
  close(): Promise<void>;
}

/**
 * Internal handle shape returned by createMcpServer (the synchronous factory).
 * Adds the _connect lifecycle method that createMcpServerAsync consumes once at boot.
 * Not exported from server/src/dispatcher/index.ts — only createMcpServerAsync is.
 */
export interface McpServerHandleInternal extends McpServerHandle {
  _connect(): Promise<void>;
}
