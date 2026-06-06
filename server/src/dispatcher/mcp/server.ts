import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { randomUUID } from "node:crypto";
import { requestContext } from "./requestContext.js";
import type {
  McpServerHandle,
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

interface Session {
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
  /** X-Ledger-Task-Id captured at initialize, used by closeTaskSessions(). */
  taskId: string | undefined;
}

/**
 * Per-session MCP server factory.
 *
 * The `WebStandardStreamableHTTPServerTransport` is single-session: once a client
 * sends `initialize` it flips `_initialized = true` and the SDK rejects every
 * subsequent `initialize` with `-32600 "Server already initialized"` (HTTP 400).
 * A single shared transport therefore serves at most ONE agent per server boot —
 * the bug fixed here (see docs/_investigations/dispatcher-hang-issue.md, CONFIRMED ROOT
 * CAUSE 2026-06-06).
 *
 * The correct stateful pattern (per the SDK) is one transport + one McpServer per
 * session. This factory keeps a `Map<sessionId, Session>` and:
 *   - on a request WITHOUT an mcp-session-id header → create a fresh transport +
 *     server (registerTools, connect) and let the SDK validate it is an
 *     `initialize`; the transport's onsessioninitialized adds it to the map.
 *   - on a request WITH a known mcp-session-id → route to that transport.
 *   - on a request WITH an unknown mcp-session-id → 404 (mirrors the SDK).
 *
 * No pre-connect tool-registration dance is needed any more (the old _connect()):
 * each per-session server registers tools then connects inside createSession,
 * before its transport handles the initialize.
 */
export function createMcpServer(opts: McpServerOptions): McpServerHandle {
  const sessions = new Map<MCPSessionId, Session>();
  const initListeners = new Set<SessionInitializedListener>();
  const closeListeners = new Set<SessionClosedListener>();

  // Idempotent teardown: remove from the map, close the McpServer (which
  // cascades to transport.close() per SDK source), and fire close listeners
  // exactly once. Safe to call from the SDK's onsessionclosed (DELETE path) and
  // from closeTaskSessions()/close() without double-firing.
  function removeSession(sessionId: MCPSessionId): boolean {
    const session = sessions.get(sessionId);
    if (session === undefined) return false;
    sessions.delete(sessionId);
    void session.server.close().catch(() => undefined);
    for (const listener of [...closeListeners]) {
      listener(sessionId);
    }
    return true;
  }

  async function createSession(): Promise<WebStandardStreamableHTTPServerTransport> {
    const server = new McpServer({ name: "ledger-runner", version: opts.version });
    opts.registerTools?.(server);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        const request = requestContext.getStore()?.request;
        const taskId = request?.headers.get("X-Ledger-Task-Id") ?? undefined;
        sessions.set(sessionId, { transport, server, taskId });
        // Copy the listener set before iterating to guard against mutation-during-iteration
        // if a listener unsubscribes itself inside its own callback.
        for (const listener of [...initListeners]) {
          listener(sessionId, request);
        }
      },
      // SDK fires this only on DELETE /mcp (webStandardStreamableHttp.js:576).
      onsessionclosed: (sessionId) => {
        removeSession(sessionId);
      },
    });

    // Register tools before connect (SDK requires the tools handler to exist
    // before the transport processes requests). connect() also calls
    // transport.start() (a no-op for streamable HTTP).
    await server.connect(transport);
    return transport;
  }

  const mcpRoute = new Hono<Record<string, unknown>>().all("/", async (c) => {
    const request = c.req.raw;
    const sessionId = request.headers.get(MCP_SESSION_ID_HEADER);

    if (sessionId !== null) {
      const session = sessions.get(sessionId);
      if (session === undefined) {
        // Unknown session id → 404, mirroring the SDK's own "Session not found".
        return c.json(
          { jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null },
          404,
        );
      }
      return requestContext.run({ request }, () => session.transport.handleRequest(request));
    }

    // No session id → new-session attempt. Create a fresh per-session transport
    // and let the SDK validate the body: a real `initialize` succeeds (and
    // onsessioninitialized registers it in the map); any other request hits an
    // uninitialized transport and is rejected 400. A throwaway transport that
    // never initializes is unreferenced after this request and eligible for GC.
    const transport = await createSession();
    return requestContext.run({ request }, () => transport.handleRequest(request));
  });

  return {
    mcpRoute,
    activeSessions: () => sessions.size,
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
    closeTaskSessions(taskId: string): number {
      let closed = 0;
      for (const [sessionId, session] of [...sessions.entries()]) {
        if (session.taskId === taskId) {
          if (removeSession(sessionId)) closed++;
        }
      }
      return closed;
    },
    async close(): Promise<void> {
      for (const [, session] of [...sessions.entries()]) {
        await session.server.close().catch(() => undefined);
      }
      sessions.clear();
    },
  };
}

/**
 * Async factory — retained for call sites/tests that awaited the old
 * connect-on-boot sequence. There is no global connect any more (per-session
 * connect happens lazily on each initialize), so this just wraps createMcpServer.
 */
export function createMcpServerAsync(
  opts: McpServerOptions,
): Promise<McpServerHandle> {
  return Promise.resolve(createMcpServer(opts));
}
