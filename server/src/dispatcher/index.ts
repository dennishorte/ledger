/**
 * Public surface of the dispatcher module.
 *
 * Re-exports from 01-mcp-server: createMcpServerAsync, McpServerHandle, MCPSessionId,
 * SessionInitializedListener, SessionClosedListener, MCP_SESSION_ID_HEADER.
 *
 * Re-exports from 02-runner-tools: createBindingRegistry, BindingRegistry, registerRunnerTools.
 *
 * Re-exports McpServerHandleInternal for context.ts (must call registerTool before _connect).
 */

export { createMcpServer, createMcpServerAsync, MCP_SESSION_ID_HEADER } from "./mcp/server.js";
export type {
  McpServerHandle,
  McpServerHandleInternal,
  MCPSessionId,
  SessionInitializedListener,
  SessionClosedListener,
} from "./mcp/types.js";

export { createBindingRegistry } from "./mcp/binding.js";
export type { BindingRegistry } from "./mcp/binding.js";
export { registerRunnerTools } from "./mcp/tools.js";
export type { RunnerToolDeps } from "./mcp/tools.js";

// 03-claude-code-executor exports
export { createCancellationRegistry } from "./executor/cancellation.js";
export type { CancellationRegistry } from "./executor/cancellation.js";
export { createClaudeCodeExecutor } from "./executor/claudeCode.js";
