/**
 * MCP server scaffolding tests.
 *
 * Spec: docs/06-agent-dispatcher/01-mcp-server.md §Requirements item 8
 *
 * Tests use Hono's app.fetch() as the transport fetch backend — no real TCP socket.
 * The SDK Client + StreamableHTTPClientTransport exercise the same code path a real
 * MCP client would; only the network layer is replaced with in-process dispatch.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMcpServer, createMcpServerAsync, MCP_SESSION_ID_HEADER } from "../../../src/dispatcher/mcp/server.js";
import type { McpServerHandle } from "../../../src/dispatcher/mcp/types.js";

// ---------------------------------------------------------------------------
// Helper: build a Hono app with /mcp mounted from a handle and a custom fetch
// that delegates to app.fetch. Returns the fetch function the client uses.
// ---------------------------------------------------------------------------

function buildTestApp(handle: McpServerHandle): {
  testFetch: typeof fetch;
  cleanup: () => Promise<void>;
} {
  const app = new Hono().route("/mcp", handle.mcpRoute);

  const testFetch: typeof fetch = (input, init) => {
    const req = typeof input === "string" ? new Request(input, init) : input instanceof URL ? new Request(input.toString(), init) : input;
    return app.fetch(req);
  };

  return {
    testFetch,
    cleanup: () => handle.close(),
  };
}

// Build a fully-connected McpServerHandle for use in tests
async function makeHandle(): Promise<McpServerHandle> {
  return createMcpServerAsync({ version: "0.1.0" });
}

// Build an MCP Client connected to the test app's /mcp endpoint
async function makeConnectedClient(handle: McpServerHandle): Promise<{
  client: Client;
  transport: StreamableHTTPClientTransport;
  testFetch: typeof fetch;
  cleanup: () => Promise<void>;
}> {
  const { testFetch, cleanup } = buildTestApp(handle);

  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost/mcp"),
    { fetch: testFetch },
  );

  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(transport);

  return { client, transport, testFetch, cleanup };
}

// ---------------------------------------------------------------------------
// Test teardown registry: close handles + transports after each test
// ---------------------------------------------------------------------------

const teardowns: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const td of teardowns.splice(0)) {
    await td().catch(() => undefined);
  }
});

// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------

describe("MCP handshake", () => {
  it("initialize returns serverInfo { name: 'ledger-runner', version: '0.1.0' }", async () => {
    const handle = await makeHandle();
    const { client, cleanup } = await makeConnectedClient(handle);
    teardowns.push(cleanup);

    // getServerVersion() returns the server's serverInfo reported during initialize.
    // tools/list is NOT called here — the SDK does not register the tools handler until
    // the first registerTool call, so listTools() would return -32601 on a bare server.
    // The five-tool assertion lives in server/test/dispatcher/mcp/tools.test.ts.
    const info = client.getServerVersion();
    expect(info).toMatchObject({ name: "ledger-runner", version: "0.1.0" });
  });
});

// ---------------------------------------------------------------------------
// Stateful session — Mcp-Session-Id header round-trip
// ---------------------------------------------------------------------------

describe("Stateful session", () => {
  it("initialize response carries mcp-session-id header", async () => {
    const handle = await makeHandle();
    teardowns.push(() => handle.close());

    const app = new Hono().route("/mcp", handle.mcpRoute);

    // Send a raw initialize POST — the SDK will set mcp-session-id in the response
    const initBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "raw-client", version: "0.0.1" },
      },
    });

    const initRes = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: initBody,
      }),
    );

    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers.get(MCP_SESSION_ID_HEADER);
    expect(typeof sessionId).toBe("string");
    expect(sessionId).not.toBe("");
  });

  it("POST without mcp-session-id after initialize returns 400", async () => {
    const handle = await makeHandle();
    teardowns.push(() => handle.close());

    const app = new Hono().route("/mcp", handle.mcpRoute);

    // First, initialize the session
    await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "raw-client", version: "0.0.1" },
          },
        }),
      }),
    );

    // Now POST without the session-id header
    const res = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("POST with unrecognised mcp-session-id returns 404", async () => {
    const handle = await makeHandle();
    teardowns.push(() => handle.close());

    const app = new Hono().route("/mcp", handle.mcpRoute);

    // Initialize first
    await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "raw-client", version: "0.0.1" },
          },
        }),
      }),
    );

    // POST with a made-up session ID
    const res = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          [MCP_SESSION_ID_HEADER]: "00000000-0000-0000-0000-000000000000",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        }),
      }),
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Session-lifecycle hooks
// ---------------------------------------------------------------------------

describe("Session-lifecycle hooks", () => {
  it("onSessionInitialized fires with (sessionId, request) and X-Ledger-Task-Id is accessible", async () => {
    const handle = await makeHandle();
    teardowns.push(() => handle.close());

    const app = new Hono().route("/mcp", handle.mcpRoute);

    const captured: { sessionId: string; taskId: string | null }[] = [];
    handle.onSessionInitialized((sessionId, request) => {
      captured.push({
        sessionId,
        taskId: request?.headers.get("X-Ledger-Task-Id") ?? null,
      });
    });

    const taskId = "task-abc-123";

    const initRes = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          "X-Ledger-Task-Id": taskId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test-client", version: "0.0.1" },
          },
        }),
      }),
    );

    expect(initRes.status).toBe(200);
    expect(captured).toHaveLength(1);
    const first = captured[0];
    expect(first).toBeDefined();
    if (first !== undefined) {
      expect(typeof first.sessionId).toBe("string");
      expect(first.taskId).toBe(taskId);
    }
  });

  it("onSessionClosed fires when DELETE /mcp with session-id is sent", async () => {
    const handle = await makeHandle();
    teardowns.push(() => handle.close());

    const app = new Hono().route("/mcp", handle.mcpRoute);

    const closedIds: string[] = [];
    handle.onSessionClosed((sid) => { closedIds.push(sid); });

    // Initialize
    const initRes = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test-client", version: "0.0.1" },
          },
        }),
      }),
    );

    const sessionId = initRes.headers.get(MCP_SESSION_ID_HEADER);
    expect(typeof sessionId).toBe("string");

    // DELETE to close the session
    const deleteRes = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "DELETE",
        headers: {
          [MCP_SESSION_ID_HEADER]: sessionId as string,
          "MCP-Protocol-Version": "2025-03-26",
        },
      }),
    );

    expect(deleteRes.status).toBe(200);
    expect(closedIds).toContain(sessionId);
  });
});

// ---------------------------------------------------------------------------
// Multiple listeners
// ---------------------------------------------------------------------------

describe("Multiple listeners", () => {
  it("two onSessionInitialized registrations both fire", async () => {
    const handle = await makeHandle();
    teardowns.push(() => handle.close());

    const app = new Hono().route("/mcp", handle.mcpRoute);

    const listener1 = vi.fn();
    const listener2 = vi.fn();
    handle.onSessionInitialized(listener1);
    handle.onSessionInitialized(listener2);

    await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test-client", version: "0.0.1" },
          },
        }),
      }),
    );

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it("unsubscribing one listener stops it from firing; the other continues", async () => {
    // Use a fresh server per test (transport is stateful — cannot reuse)
    const handle1 = await makeHandle();
    teardowns.push(() => handle1.close());

    const app1 = new Hono().route("/mcp", handle1.mcpRoute);

    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const unsub1 = handle1.onSessionInitialized(listener1);
    handle1.onSessionInitialized(listener2);

    // First session — both fire
    await app1.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test-client", version: "0.0.1" },
          },
        }),
      }),
    );

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);

    // Unsubscribe listener1; use a new handle for the second session
    // (transport is stateful — can only initialize once per instance)
    unsub1();

    const handle2 = await makeHandle();
    teardowns.push(() => handle2.close());
    const app2 = new Hono().route("/mcp", handle2.mcpRoute);
    handle2.onSessionInitialized(listener1);
    handle2.onSessionInitialized(listener2);
    const unsub1b = handle2.onSessionInitialized(listener1);
    unsub1b(); // immediately unsubscribe listener1

    // Second session on handle2 — only listener2 should fire (listener1 was unsubbed)
    await app2.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test-client", version: "0.0.1" },
          },
        }),
      }),
    );

    // listener1: only called once (from handle1's session)
    // listener2: called twice (once per handle)
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Health snapshot via activeSessions()
// ---------------------------------------------------------------------------

describe("Health snapshot — activeSessions()", () => {
  it("activeSessions() returns 0 before any session, 1 after initialize, 0 after DELETE", async () => {
    const handle = await makeHandle();
    teardowns.push(() => handle.close());

    const app = new Hono().route("/mcp", handle.mcpRoute);

    expect(handle.activeSessions()).toBe(0);

    // Initialize a session
    const initRes = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test-client", version: "0.0.1" },
          },
        }),
      }),
    );

    const sessionId = initRes.headers.get(MCP_SESSION_ID_HEADER);
    expect(handle.activeSessions()).toBe(1);

    // DELETE the session
    await app.fetch(
      new Request("http://localhost/mcp", {
        method: "DELETE",
        headers: {
          [MCP_SESSION_ID_HEADER]: sessionId as string,
          "MCP-Protocol-Version": "2025-03-26",
        },
      }),
    );

    expect(handle.activeSessions()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createMcpServer (sync factory) — internal tests
// ---------------------------------------------------------------------------

describe("createMcpServer (sync factory)", () => {
  it("returns a valid handle shape without calling _connect", () => {
    const handle = createMcpServer({ version: "0.1.0" });
    // These should all be present without needing connect()
    expect(typeof handle.activeSessions).toBe("function");
    expect(handle.activeSessions()).toBe(0);
    expect(typeof handle.onSessionInitialized).toBe("function");
    expect(typeof handle.onSessionClosed).toBe("function");
    expect(typeof handle.close).toBe("function");
    expect(typeof handle._connect).toBe("function");
    expect(handle.mcpRoute).toBeDefined();
    expect(handle.server).toBeDefined();
    expect(handle.transport).toBeDefined();
  });

  it("createMcpServerAsync connects the server and returns a working handle", async () => {
    const pub = await createMcpServerAsync({ version: "0.1.0" });
    teardowns.push(() => pub.close());
    // Should be fully functional — activeSessions, mcpRoute, listeners all present
    expect(pub.activeSessions()).toBe(0);
    expect(pub.mcpRoute).toBeDefined();
  });
});
