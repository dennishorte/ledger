/**
 * Public surface of the dispatcher module — the surface 02-runner-tools imports.
 *
 * Re-exports: createMcpServerAsync, McpServerHandle, MCPSessionId,
 * SessionInitializedListener, SessionClosedListener.
 *
 * NOT re-exported: McpServerHandleInternal, _connect — internal to mcp/server.ts.
 */

export { createMcpServerAsync, MCP_SESSION_ID_HEADER } from "./mcp/server.js";
export type {
  McpServerHandle,
  MCPSessionId,
  SessionInitializedListener,
  SessionClosedListener,
} from "./mcp/types.js";
