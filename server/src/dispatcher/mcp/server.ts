import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { randomUUID } from "node:crypto";
import { requestContext } from "./requestContext.js";
import type {
  McpServerHandle,
  McpServerHandleInternal,
  McpServerOptions,
  MCPSessionId,
  SessionInitializedListener,
  SessionClosedListener,
} from "./types.js";

/**
 * The exact header name the SDK uses (lowercase, per the HTTP spec for header names
 * returned by Response and accepted by Request.headers.get()).
 * Extracted from the SDK source post-install to avoid hard-coded string drift in tests.
 */
export const MCP_SESSION_ID_HEADER = "mcp-session-id" as const;

/**
 * Synchronous factory — constructs McpServer + transport + Hono sub-app.
 * Does NOT call server.connect(transport); the caller must call _connect() before use.
 * Use createMcpServerAsync for the full boot sequence.
 */
export function createMcpServer(opts: McpServerOptions): McpServerHandleInternal {
  const activeSessions = new Set<MCPSessionId>();
  const initListeners = new Set<SessionInitializedListener>();
  const closeListeners = new Set<SessionClosedListener>();

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      const request = requestContext.getStore()?.request;
      activeSessions.add(sessionId);
      // Copy the listener set before iterating to guard against mutation-during-iteration
      // if a listener unsubscribes itself inside its own callback.
      for (const listener of [...initListeners]) {
        listener(sessionId, request);
      }
    },
    onsessionclosed: (sessionId) => {
      activeSessions.delete(sessionId);
      for (const listener of [...closeListeners]) {
        listener(sessionId);
      }
    },
  });

  const server = new McpServer({ name: "ledger-runner", version: opts.version });

  // Pre-register the tools capability so the server advertises it during initialize
  // and responds to tools/list with an empty list before any tool is registered.
  // The McpServer.setToolRequestHandlers() method is private in the TypeScript type
  // but exists at runtime; calling it eagerly is the correct approach since
  // 02-runner-tools will register tools on this server later.
  (server as unknown as { setToolRequestHandlers(): void }).setToolRequestHandlers();

  const mcpRoute = new Hono<Record<string, unknown>>().all("/", (c) => {
    const request = c.req.raw;
    return requestContext.run({ request }, () => transport.handleRequest(request));
  });

  const handle: McpServerHandleInternal = {
    server,
    transport,
    mcpRoute,
    activeSessions: () => activeSessions.size,
    onSessionInitialized(listener: SessionInitializedListener): () => void {
      initListeners.add(listener);
      return () => {
        initListeners.delete(listener);
      };
    },
    onSessionClosed(listener: SessionClosedListener): () => void {
      closeListeners.add(listener);
      return () => {
        closeListeners.delete(listener);
      };
    },
    async close(): Promise<void> {
      await server.close();
      // server.close() transitively calls transport.close() (per SDK source).
      // Call transport.close() defensively in case the cascade is not guaranteed
      // in future SDK versions; swallow AlreadyClosed-style errors.
      try {
        await transport.close();
      } catch {
        // already closed via server.close() cascade — safe to ignore
      }
    },
    _connect(): Promise<void> {
      return server.connect(transport);
    },
  };

  return handle;
}

/**
 * Async factory — calls server.connect(transport) and returns the public McpServerHandle.
 * Use this in loadProjectContext().
 */
export async function createMcpServerAsync(
  opts: McpServerOptions,
): Promise<McpServerHandle> {
  const handle = createMcpServer(opts);
  await handle._connect();
  // Return as the narrower public type — _connect is intentionally not on McpServerHandle.
  return handle;
}
