# MCP Server Scaffolding

**Node ID:** `06-agent-dispatcher/01-mcp-server`
**Parent:** `06-agent-dispatcher` (`docs/06-agent-dispatcher/00-agent-dispatcher.md`)
**Status:** DRAFT
**Created:** 2026-05-28
**Last Updated:** 2026-05-28

**Dependencies:** `05-task-runner` (workspace, server package, `ProjectContext`, Hono app)

---

## Requirements

Stand up the **MCP transport layer** that every later dispatcher sub-leaf sits on top of: instantiate an `@modelcontextprotocol/sdk` `McpServer`, wrap it in the SDK's Web Standards streamable-HTTP transport, mount it on the existing Hono app at `/mcp`, expose the SDK's `serverInfo` to MCP clients on the `initialize` handshake, and surface the transport's session-lifecycle hooks (`onsessioninitialized` / `onsessionclosed`) as a typed registration API that `02-runner-tools` will plug its task-id binding registry into. No tools registered yet (`02-runner-tools`), no executors (`03-claude-code-executor`), no prompt templates (`04-prompt-templates`), no dispatch endpoints (`05-dispatch-api`). The deliverable is a Hono route that completes an MCP `initialize` round-trip with a standalone MCP client and a `ProjectContext.mcp: McpServerHandle` reference the next sub-leaf will use to register the five runner tools.

This is the **first foundational child** of `06-agent-dispatcher`. The parent's Children manifest names this sub-leaf as `MCP server scaffolding mounted at POST /mcp: streamable-HTTP transport via @modelcontextprotocol/sdk, server factory + Hono route mount, serverInfo discovery, internal session lifecycle (open/close hooks for the binding registry from 02-runner-tools)`. The parent's Spec Review confidence notes flagged the SDK API surface as unverified ("`McpServer` + `StreamableHttpServerTransport` class names and the `Mcp-Session-Id` header semantics must be pinned at implementation time"); this child's DRAFT pins them upfront against the actually-installed SDK version (1.29.0 at draft time, 2026-05-28) — see §Design.

In scope for v1:

1. **`@modelcontextprotocol/sdk@^1.29` added as a direct dependency** of `server/package.json`. Confirmed not currently present in `dependencies` or `devDependencies` as of 2026-05-28 (parent Spec Review N2 verified `execa` similarly). The version is pinned to a caret range against 1.29 — the SDK has held a stable v1 API surface for the streamable-HTTP transport since the `2025-06-18` MCP revision; 1.29 was the latest at draft time. v2 is in pre-alpha on the SDK's `main` branch and is explicitly out of scope.
2. **`server/src/dispatcher/` module** created (the namespace the parent's §Repository layout reserved). v1 ships only the `mcp/` subdirectory: `server.ts`, `types.ts`, `requestContext.ts`. `executor/`, `prompts/`, and `routes/dispatch.ts` land in later sub-leaves.
3. **The MCP server factory** at `server/src/dispatcher/mcp/server.ts`. Exported as `createMcpServer(opts: McpServerOptions): McpServerHandle`. Constructs the SDK's `McpServer` with `serverInfo: { name: "ledger-runner", version }`, constructs a `WebStandardStreamableHTTPServerTransport` in stateful mode (`sessionIdGenerator: () => crypto.randomUUID()`), connects them via `server.connect(transport)`, and returns the handle. The handle exposes the underlying `McpServer` (so `02-runner-tools` can call `server.registerTool(...)`), the request handler that the Hono mount delegates to, plus the session-lifecycle registration API (item 5).
4. **The Hono mount** at `server/src/dispatcher/mcp/server.ts`'s exported `mcpRoute: Hono` factory. Mounted via `app.route("/mcp", mcpRoute)` in `server/src/server.ts` alongside the existing `/api/_health`, `/api/project`, `/api/docs`, `/api/tasks` routes. The mount uses `app.all("/", handler)` (not `.post(...)`) because the streamable-HTTP transport handles **GET, POST, and DELETE** on the same path — GET opens the SSE listener stream, POST carries JSON-RPC requests, DELETE terminates a session client-side (D3). The Hono handler reads the inbound `Request`, captures the `X-Ledger-Task-Id` header into an `AsyncLocalStorage` request context (item 5), and delegates to the transport's `handleRequest(req)` Web Standards method.
5. **Session-lifecycle registration API + `AsyncLocalStorage` request context.** The SDK's `onsessioninitialized(sessionId)` callback receives only the new session ID — not the inbound HTTP request. The binding registry that `02-runner-tools` will ship needs to correlate the *MCP session ID* with the *Ledger task ID* that the dispatcher set in the inbound request's `X-Ledger-Task-Id` header. The leaf provides this correlation via `requestContext.ts`: an `AsyncLocalStorage<{ request: Request }>` whose `run(ctx, fn)` wraps every `transport.handleRequest(req)` call. The `McpServerHandle` exposes typed registration:
   ```ts
   handle.onSessionInitialized((sessionId, request) => { /* binding registry plugs in here */ });
   handle.onSessionClosed((sessionId) => { /* binding registry tears down here */ });
   ```
   The leaf's transport-options wiring resolves the inbound `request` via `requestContext.getStore()?.request` inside the SDK's `onsessioninitialized` callback and fans out to every registered listener. The registration functions return unsubscribe callbacks (matching Node EventEmitter idioms). Multiple listeners are supported (initially one, from `02-runner-tools`; future tracing or metrics could add more).
6. **`ProjectContext.mcp: McpServerHandle`** wired during `loadProjectContext()` in `server/src/context.ts`. Same pattern as `ProjectContext.runner` from `05-task-runner/02-scheduler` (`Requirements item 9` in that sibling). Lifetime: created on context load, closed on context teardown (which today happens only at process exit — `05-task-runner` has no teardown either; revisit when the framework lands a long-running multi-project mode).
7. **`/api/_health` extension.** The existing health route returns `{ ok, startedAt }`; add a `dispatcher` field reporting `"ready"` plus the count of currently bound sessions (`activeSessions: number`). The session count is read off the leaf's internal session-tracking set (`Set<MCPSessionId>` mutated by the same `onsessioninitialized` / `onsessionclosed` plumbing — item 5). The dispatcher's `activeSessions` is independent of the binding registry's task-id map (which `02-runner-tools` will own); this leaf tracks raw session presence for the health snapshot.
8. **Tests** at `server/test/dispatcher/mcp/server.test.ts`:
   - **Handshake.** A standalone MCP client (using the SDK's in-process client transport against an in-memory pair, or against a real Hono test fetch handle) completes `initialize` and receives `serverInfo: { name: "ledger-runner", version: "0.1.0" }` and an empty `tools` list (no `02-runner-tools` registrations in this leaf).
   - **Stateful session.** The `initialize` response carries an `Mcp-Session-Id` header (set by the SDK in stateful mode); a subsequent POST with the same header succeeds; a POST without it returns 400; a POST with an unrecognised value returns 404.
   - **Session-lifecycle hooks.** Registering an `onSessionInitialized` listener captures the new `sessionId` *and* the request's `X-Ledger-Task-Id` header (via the leaf's `requestContext`). Registering an `onSessionClosed` listener fires when the client sends a `DELETE /mcp` with the session-id header.
   - **Multiple listeners.** Two `onSessionInitialized` registrations both fire. Returning the unsubscribe callback and invoking it removes that listener; the other still fires on subsequent sessions.
   - **Health snapshot.** `GET /api/_health` returns `dispatcher: "ready"` with `activeSessions === N` matching the count of open sessions.
9. **Build / typecheck / lint / test green** across the workspace after the dep add and the new module. Bundle delta on `app/` is **zero** — this leaf adds nothing to the UI; the `app` bundle is unchanged. Server-side dep add: `@modelcontextprotocol/sdk@^1.29` plus its transitive deps; size impact reported in Implementation Notes against the named baseline (pre-add `pnpm -C server build` artifact size).

**Out of scope for this child:**

- **The five MCP tools.** `runner.emit_event`, `runner.complete_task`, `runner.fail_task`, `runner.await_human_review`, `runner.get_task` — all `02-runner-tools`. This leaf's `serverInfo` discovery response will show an empty `tools` array; that is the correct DRAFT-time state.
- **The task-id binding registry + cross-task rejection.** `02-runner-tools` D-?? will introduce a `Map<MCPSessionId, TaskId>` populated by the `onSessionInitialized` hook this leaf exposes; the registry, the `task_not_bound` error, the per-tool argument check — all next sub-leaf. This leaf ships only the *hook surface* the registry will plug into.
- **`store.updateReviewPayload(taskId, reviewPayload)`.** Parent §MCP tool surface flagged this as a new one-liner Store method introduced by `02-runner-tools` (parent Spec Review S3). Not in this leaf.
- **The dispatcher's `claude` subprocess.** `03-claude-code-executor`. The MCP server in this leaf has no concept of "an executor" — it's a pure JSON-RPC server. Subprocess management, exit-code mapping, MCP config JSON generation: all later.
- **Prompt templates.** `04-prompt-templates`. The MCP server does not render prompts; it serves tool calls.
- **`POST /api/dispatch/:nodeId` and `POST /api/tasks/:id/cancel`.** `05-dispatch-api`. The HTTP endpoints that wire the UI Dispatch / Cancel buttons to runner task creation are not part of MCP — they are the operator-facing surface that *triggers* a dispatch, which in turn spawns a subprocess that connects back to this leaf's MCP server.
- **Authentication / Authorization on `/mcp`.** Parent D5 inherits `04-api-server` D4 + `05-task-runner` D13: `127.0.0.1`-bind, OS firewall is the perimeter, no tokens. The leaf does not register an `authInfo` middleware on the transport. The `WebStandardStreamableHTTPServerTransport`'s `allowedHosts` / `allowedOrigins` / `enableDnsRebindingProtection` options are flagged `@deprecated` in the SDK in favour of external middleware — the leaf relies on the bind address and skips configuring them.
- **`eventStore` for MCP session resumability.** The transport's `EventStore` option enables MCP-protocol-level event resumption across reconnects. The runner's existing `/api/tasks/:id/stream` SSE channel from `04-api-endpoints` already provides resumability via `Last-Event-ID` for the events table; that is the operator-facing observability surface. The MCP session is internal — it lives for one dispatched subprocess and dies with it; no resumability is meaningful. Inherits the parent's D-implicit "MCP session is bound to one task" stance.
- **The SDK's v2 (pre-alpha) API.** The SDK's `main` branch carries a v2 in development. This leaf pins v1 and explicitly does not track v2 until it ships.
- **`StreamableHTTPServerTransport` (the Node-wrapper class).** The SDK ships *two* transports: the Node-flavoured `StreamableHTTPServerTransport` (wraps the web-standards one with `IncomingMessage`/`ServerResponse` compatibility) and the `WebStandardStreamableHTTPServerTransport` (Request/Response directly). Hono runs on Web Standards natively (the `@hono/node-server` adapter does Node↔Web conversion at the listen layer, not the route layer); the right pick is the web-standards transport. The Node-wrapper is mentioned only to disambiguate; the leaf does not use it.
- **MCP resources + MCP prompts.** Parent D6. Empty `resources` and `prompts` lists in the server's discovery response are the v1 state. The `McpServer` API has `registerResource` / `registerPrompt` methods; no calls in this leaf or any sibling.
- **Hot-reload of the McpServer.** Restart-required for any change to tool registrations. The `tsx watch` dev mode re-runs `createServer(project)` on src changes, which re-instantiates the McpServer — adequate for v1.

---

## Design

### Repository layout after this node

```
ledger/
├── server/
│   ├── package.json                                # +@modelcontextprotocol/sdk@^1.29 in deps
│   ├── src/
│   │   ├── server.ts                               # modified — app.route("/mcp", mcpRoute)
│   │   ├── context.ts                              # modified — ProjectContext.mcp wired
│   │   ├── routes/
│   │   │   └── health.ts                           # modified — dispatcher line + activeSessions
│   │   └── dispatcher/                             # NEW
│   │       ├── index.ts                            # public surface; re-exports createMcpServer
│   │       └── mcp/
│   │           ├── server.ts                       # NEW — createMcpServer + mcpRoute factory
│   │           ├── requestContext.ts               # NEW — AsyncLocalStorage<{ request: Request }>
│   │           └── types.ts                        # NEW — McpServerHandle, McpServerOptions
│   └── test/
│       └── dispatcher/
│           └── mcp/
│               └── server.test.ts                  # NEW — handshake + session + hooks
└── docs/
    └── 06-agent-dispatcher/
        ├── 00-agent-dispatcher.md                  # modified — manifest row PLANNED→DRAFT→…
        └── 01-mcp-server.md                        # this spec
```

The `dispatcher/` namespace is the parent's D3 reservation. v1 ships only `mcp/`; siblings add `executor/`, `prompts/`, and the dispatch route. No top-level `packages/dispatcher/` workspace package (parent D3).

### Pinned SDK surface (verified against `@modelcontextprotocol/sdk@1.29.0` at draft time)

Both classes live under the package's `./server` export. The leaf's imports:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  WebStandardStreamableHTTPServerTransport,
  type WebStandardStreamableHTTPServerTransportOptions,
} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
```

`McpServer` constructor: `new McpServer(serverInfo: Implementation, options?: ServerOptions)` where `Implementation = { name: string; version: string }`. Other relevant surface used by this leaf:

- `server.connect(transport: Transport): Promise<void>` — wires the transport.
- `server.close(): Promise<void>` — teardown (called from `ProjectContext` teardown when one exists).
- `server.registerTool(...)` — **not called in this leaf**, but exposed via `McpServerHandle.server` so `02-runner-tools` can call it.

`WebStandardStreamableHTTPServerTransport` constructor: `new WebStandardStreamableHTTPServerTransport(options?: WebStandardStreamableHTTPServerTransportOptions)`. The leaf passes:

```ts
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),               // crypto.randomUUID; stateful mode
  onsessioninitialized: (sessionId) => {                // SDK invokes inside handleRequest
    const request = requestContext.getStore()?.request; // ALS-resolved; see §Request context
    activeSessions.add(sessionId);
    for (const listener of initListeners) listener(sessionId, request);
  },
  onsessionclosed: (sessionId) => {
    activeSessions.delete(sessionId);
    for (const listener of closeListeners) listener(sessionId);
  },
  // enableJsonResponse: omitted (default false; SSE streams preferred)
  // eventStore: omitted (out of scope)
  // allowedHosts/allowedOrigins/enableDnsRebindingProtection: omitted (deprecated; 127.0.0.1-bind is perimeter)
});
```

Method used: `transport.handleRequest(req: Request, options?: HandleRequestOptions): Promise<Response>` — Web Standards in, Web Standards out, perfect Hono fit.

The SDK's `2025-06-18` MCP revision is what 1.29 ships against (parent D1). The protocol version flows through the JSON-RPC payload; no leaf-level pinning needed.

### Hono mount + request handler

```ts
// server/src/dispatcher/mcp/server.ts
import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { randomUUID } from "node:crypto";
import { requestContext } from "./requestContext.js";
import type { McpServerHandle, McpServerOptions } from "./types.js";

export function createMcpServer(opts: McpServerOptions): McpServerHandle {
  const activeSessions = new Set<string>();
  const initListeners = new Set<(sessionId: string, request: Request | undefined) => void>();
  const closeListeners = new Set<(sessionId: string) => void>();

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      const request = requestContext.getStore()?.request;
      activeSessions.add(sessionId);
      for (const listener of initListeners) listener(sessionId, request);
    },
    onsessionclosed: (sessionId) => {
      activeSessions.delete(sessionId);
      for (const listener of closeListeners) listener(sessionId);
    },
  });

  const server = new McpServer({ name: "ledger-runner", version: opts.version });
  // server.connect(transport) is async; the caller awaits via createMcpServerAsync below.

  const mcpRoute = new Hono().all("/", async (c) => {
    const request = c.req.raw;
    return requestContext.run({ request }, () => transport.handleRequest(request));
  });

  return {
    server,
    transport,
    mcpRoute,
    activeSessions: () => activeSessions.size,
    onSessionInitialized(listener) {
      initListeners.add(listener);
      return () => initListeners.delete(listener);
    },
    onSessionClosed(listener) {
      closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
    close: async () => {
      await server.close();
      await transport.close();
    },
    _connect: () => server.connect(transport),  // called by createMcpServerAsync; not on the public type
  };
}

export async function createMcpServerAsync(opts: McpServerOptions): Promise<McpServerHandle> {
  const handle = createMcpServer(opts);
  await handle._connect();
  return handle;
}
```

The async wrapper exists because `server.connect(transport)` is a Promise; `loadProjectContext()` is already async (parser load is async), so awaiting it during context construction is natural. The split keeps `createMcpServer` synchronous-testable in unit tests that don't need the connect wiring (pure handle-shape assertions).

### Request context (`AsyncLocalStorage`)

```ts
// server/src/dispatcher/mcp/requestContext.ts
import { AsyncLocalStorage } from "node:async_hooks";

export interface McpRequestContext {
  request: Request;
}

export const requestContext = new AsyncLocalStorage<McpRequestContext>();
```

The Hono handler wraps `transport.handleRequest(req)` with `requestContext.run({ request: req }, fn)`. Inside the SDK's `onsessioninitialized` callback (which runs synchronously within the same async stack as the `handleRequest` invocation), `requestContext.getStore()` resolves to the wrapping store — giving the leaf's hook fan-out access to the inbound `Request` and therefore to `request.headers.get("X-Ledger-Task-Id")`.

Why ALS and not a per-request transport: `WebStandardStreamableHTTPServerTransport` is **stateful by design** — its internal session map (`_streamMapping`, `_requestToStreamMapping`, `_initialized`, etc. per the d.ts) lives on the instance. A per-request transport would lose all session state between requests, defeating the SDK's session model. The ALS pattern is the canonical Node way to thread per-request data through synchronously-invoked callbacks of a long-lived object.

### `ProjectContext` wiring

```ts
// server/src/context.ts (relevant change)
import { createMcpServerAsync } from "./dispatcher/mcp/server.js";
import type { McpServerHandle } from "./dispatcher/mcp/types.js";

export interface ProjectContext {
  // ... existing fields ...
  mcp: McpServerHandle;
}

export async function loadProjectContext(projectRoot: string): Promise<ProjectContext> {
  // ... existing setup ...
  const mcp = await createMcpServerAsync({ version: SERVER_VERSION });
  return {
    // ... existing fields ...
    mcp,
  };
}
```

`SERVER_VERSION` is the `@ledger/server` package version (`"0.1.0"` at draft time), read at build time from `server/package.json` via a small `version.ts` helper or via `import { version } from "../package.json" assert { type: "json" }`. The exact wiring is implementer's choice; the spec's invariant is `mcp.server`'s `serverInfo.version` equals the server package's published version.

### Hono mount

```ts
// server/src/server.ts (relevant change)
export function createServer(project: ProjectContext): Hono<ServerEnv> {
  const app = new Hono<ServerEnv>();
  app.use("*", logger());
  app.use("*", async (c, next) => {
    c.set("project", project);
    await next();
  });
  app.route("/api/_health", healthRoute);
  app.route("/api/project", projectRoute);
  app.route("/api/docs", docsRoute);
  app.route("/api/tasks", tasksRoute);
  app.route("/api/tasks", hitlRoute);
  app.route("/mcp", project.mcp.mcpRoute);           // NEW — note: /mcp, not /api/mcp (parent §Requirements item 5)
  return app;
}
```

`/mcp` is at the top level, not under `/api/*`. Rationale: MCP is a distinct protocol surface (JSON-RPC, not REST), and the URL the dispatcher writes into the per-subprocess MCP config JSON is `http://127.0.0.1:4180/mcp` per parent §MCP config JSON. Co-locating it with REST under `/api/` would be misleading. The Vite dev proxy (`app/vite.config.ts`) needs no change because the UI never calls `/mcp`; only dispatched subprocesses do, and they target the API server directly on port 4180.

### Health endpoint extension

```ts
// server/src/routes/health.ts (modified)
export const healthRoute = new Hono<ServerEnv>().get("/", (c) => {
  const project = c.get("project");
  return c.json({
    ok: true,
    startedAt: project.startedAt,
    dispatcher: {
      status: "ready",
      activeSessions: project.mcp.activeSessions(),
    },
  });
});
```

`dispatcher.status: "ready"` is a constant in v1 (the MCP server is either created or `loadProjectContext` itself failed and the server never booted). A richer status ladder (`"degraded"`, `"draining"`) lands when there is something to degrade to.

### Type additions

```ts
// server/src/dispatcher/mcp/types.ts
import type { Hono } from "hono";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export type MCPSessionId = string;

export interface McpServerOptions {
  /** Version string surfaced in serverInfo to MCP clients on initialize. */
  version: string;
}

export type SessionInitializedListener = (sessionId: MCPSessionId, request: Request | undefined) => void;
export type SessionClosedListener = (sessionId: MCPSessionId) => void;

export interface McpServerHandle {
  /** The underlying SDK server; siblings call registerTool on this. */
  readonly server: McpServer;
  /** The SDK transport instance; exposed for advanced use (tests). */
  readonly transport: WebStandardStreamableHTTPServerTransport;
  /** The Hono sub-app mounted at /mcp by createServer. */
  readonly mcpRoute: Hono;
  /** Current count of bound MCP sessions. Read by /api/_health. */
  activeSessions(): number;
  /** Subscribe to session-initialized events. Returns an unsubscribe callback. */
  onSessionInitialized(listener: SessionInitializedListener): () => void;
  /** Subscribe to session-closed events. Returns an unsubscribe callback. */
  onSessionClosed(listener: SessionClosedListener): () => void;
  /** Teardown — closes both server and transport. Not called in v1 (no project teardown path). */
  close(): Promise<void>;
}
```

No new `LogEvent` kinds, no new `Task` fields, no new schema artifacts. The MCP server transports the existing `runner/` runtime types verbatim; the leaf's surface is pure infrastructure.

### Acceptance check (manual, end-to-end)

1. `pnpm install` succeeds with the new `@modelcontextprotocol/sdk@^1.29` dep on `darwin-arm64` (the operator's machine).
2. `pnpm -C packages/parser build` (unchanged) and `pnpm -C server build` complete clean.
3. `pnpm -C server dev /Users/dennis/code/ledger` boots; the existing `/api/*` endpoints continue to respond.
4. `GET http://127.0.0.1:4180/api/_health` returns `{ ok: true, startedAt: <ISO>, dispatcher: { status: "ready", activeSessions: 0 } }`.
5. A standalone MCP client (constructed from the SDK's client surface; or `curl -X POST http://127.0.0.1:4180/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}'`) completes the `initialize` handshake and receives `serverInfo: { name: "ledger-runner", version: "0.1.0" }` and an empty `tools` list.
6. The `initialize` response's headers contain an `Mcp-Session-Id` value; a follow-up `tools/list` POST with that header succeeds (returns the empty list); a follow-up POST without the header returns 400; a POST with a fabricated session id returns 404.
7. `GET /api/_health` after step 5 shows `activeSessions: 1`; after `DELETE /mcp` with the session header, `activeSessions: 0`.
8. `pnpm typecheck` / `pnpm lint` / `pnpm build` / `pnpm test` all exit zero across the workspace.
9. No regressions on existing endpoints (`/api/_health`, `/api/project`, `/api/docs`, `/api/tasks*`, including the SSE stream). The UI continues to load and the DAG, Tasks, Logs panels remain operational.

The Acceptance check is intentionally narrower than the parent's roll-up (parent §Acceptance check items 3–6 require dispatched-subprocess behaviour that no leaf in this build before `05-dispatch-api` can satisfy). This leaf's gate is the handshake + session-lifecycle plumbing only.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Use `WebStandardStreamableHTTPServerTransport` (not the Node-wrapper `StreamableHTTPServerTransport`) | Hono runs on Web Standard Request/Response objects natively. The Node-wrapper exists to adapt the web-standards core to Express-style `IncomingMessage`/`ServerResponse`; in Hono, `c.req.raw` is *already* a Web Standard Request, so the wrapper is wasted work. The d.ts's own `Hono.js usage` example shows the web-standards transport mounted via `app.all('/mcp', async (c) => transport.handleRequest(c.req.raw))`, confirming the picked pattern. |
| D2 | Stateful mode (`sessionIdGenerator: () => crypto.randomUUID()`) | Stateless mode is incompatible with parent D7's task-id binding scheme: without a stable session ID, there is nothing to bind a task to. Stateful mode auto-populates `Mcp-Session-Id` response headers, validates session continuity on subsequent requests, and supplies the `onsessioninitialized` / `onsessionclosed` hooks the binding registry plugs into. UUIDv4 is the SDK's documented choice. |
| D3 | Hono mount uses `app.all("/", handler)` (not `.post`) under the `/mcp` route | `WebStandardStreamableHTTPServerTransport.handleRequest` services **GET** (SSE listener stream), **POST** (JSON-RPC), and **DELETE** (terminate session). A `.post`-only mount would return 404/405 on the SDK client's GET and DELETE traffic and break sessions. The parent spec's `POST /mcp` shorthand is informal; the implementation must accept all three methods on the same path. Flagged here so the implementer does not silently scope the mount down. |
| D4 | Mount path is `/mcp` (top level), not `/api/mcp` | MCP is a JSON-RPC protocol, not part of the REST API surface. Co-locating under `/api/` would be misleading. The parent's §MCP config JSON pins `url: "http://127.0.0.1:4180/mcp"`; matching that pin removes one source of drift. The Vite dev proxy is unaffected (it only forwards `/api/*`); dispatched subprocesses target the API server directly, so no proxy path is needed. |
| D5 | Session-to-request correlation via `AsyncLocalStorage` | The SDK's `onsessioninitialized(sessionId)` callback gives the new session ID but not the inbound `Request`. The binding registry that `02-runner-tools` ships needs the `X-Ledger-Task-Id` header off the inbound request. Alternatives: (a) per-request transport — broken, transport is stateful by design; (b) custom middleware that mutates the SDK's internal state — fragile, couples to SDK internals; (c) ALS that wraps `handleRequest` — canonical Node pattern, zero SDK coupling, works because `onsessioninitialized` is called synchronously within the same async stack as `handleRequest`. ALS wins. |
| D6 | Session-lifecycle hooks expose `(sessionId, request)` to listeners, not just `(sessionId)` | The leaf could have hidden the ALS resolution behind the hook and exposed only `sessionId`, forcing `02-runner-tools` to re-derive the header somehow. That would push the ALS leak to the next sub-leaf. Instead the leaf does the ALS read once at the SDK callback and fans the `request` out to every listener. The listener type is `(sessionId, request: Request \| undefined) => void` — `undefined` only in the pathological case where the SDK invokes the hook outside the ALS scope (test fixture quirks), which the implementer must guard against. |
| D7 | Multi-listener pattern (`Set<Listener>` + unsubscribe) over single-handler-slot | Single-handler-slot is simpler but breaks when the framework lands a second consumer (metrics, tracing, a future audit log). The multi-listener pattern costs ~5 LOC extra and matches Node's EventEmitter convention. The unsubscribe callback is critical for tests that register a listener, observe its firing, then de-register before the next test asserts nothing fires. |
| D8 | `/api/_health` reports `activeSessions: number`, not the full session map | The session map's contents (which `MCPSessionId` strings are live) are operationally irrelevant; the count is what the operator and future health-daemon care about. Exposing the full map would also leak a partial view of in-flight dispatcher work — partial because the task-id binding lives in `02-runner-tools` and would not be in this leaf's session set. The count is the right scope. |
| D9 | `SERVER_VERSION` for `serverInfo.version` is the `@ledger/server` package version, not the project's `0.0.0` root version | The MCP `serverInfo.version` identifies the *runner-side MCP server implementation*, not the project being managed. `@ledger/server@0.1.0` is the implementation; `ledger-monorepo@0.0.0` is the workspace shell. Decoupling the two means a bumped server version is visible to MCP clients (useful for compatibility diagnostics) independently of the workspace shell version. |
| D10 | No `eventStore`, no resumability on the MCP session | The runner's existing `/api/tasks/:id/stream` already provides resumability via `Last-Event-ID` for the operator-facing events. MCP-protocol-level resumability is internal to the JSON-RPC channel between the dispatched subprocess and the runner; the subprocess never reconnects in v1 (a SIGTERM or crash drops the session and the executor fails the task — no resume). Adding `EventStore` would buy nothing and require persistence beyond the existing events table. Defer to a "long-running detachable agent" story if that ever lands. |
| D11 | DNS-rebinding-protection options (`allowedHosts`, `allowedOrigins`, `enableDnsRebindingProtection`) left unset | The SDK marks them `@deprecated` in favour of external middleware, and the 127.0.0.1-bind perimeter (parent D5) already addresses the threat. Setting them would add noise without changing the security posture. |
| D12 | `enableJsonResponse: false` (default) — SSE streams preferred | The SDK's default behaviour returns SSE for streaming responses (tool calls that emit progress events). Switching to JSON-only responses would shrink the transport surface but break the agent's ability to receive partial results from long tool calls. v1 keeps the default. |
| D13 | Synchronous `createMcpServer` + async `createMcpServerAsync` wrapper | `server.connect(transport)` returns a Promise; integration code (`loadProjectContext`) wants `await`. Splitting the factory keeps the bulk of construction synchronous (testable with no `await` ceremony) while exposing the async wrapper for the wiring site. The internal `_connect()` method is an implementation detail not on the public `McpServerHandle` type. |

---

## Open Issues

- **`onsessioninitialized` invocation outside ALS scope.** D6 acknowledges: if the SDK ever invokes `onsessioninitialized` outside the ALS-wrapped `handleRequest` call (e.g., from an internal timer, or a future SDK refactor), `requestContext.getStore()` returns `undefined` and listeners receive `request: undefined`. The binding registry in `02-runner-tools` must then either skip binding or fall back to an error. Mitigation: a defensive log if the listener fires with `undefined`. *(Priority: LOW — SDK 1.29 source confirms synchronous-within-handleRequest invocation; future SDK versions may change this.)*
- **`Mcp-Session-Id` header constant is not exported by the SDK.** The d.ts references `Mcp-Session-Id` semantics in comments but the literal header name is buried inside the transport's internal validation. The acceptance check and tests must hard-code the string. If a future SDK release renames it, the tests catch it before main breaks; the leaf does not expose its own constant for it. *(Priority: TRIVIAL — header name is fixed by the MCP spec, not the SDK.)*
- **No teardown path for `ProjectContext.mcp`.** `loadProjectContext` returns a `ProjectContext` and the process exits when the server stops; there is no `unloadProjectContext`. The leaf adds `mcp.close(): Promise<void>` for symmetry but it is unused in v1. Same pattern as `05-task-runner`'s `runner.close()` situation. When a long-running multi-project mode lands, `ProjectContext` teardown gets revisited and `mcp.close()` gets called. *(Priority: LOW — inherited.)*
- **In-memory session map vulnerable to process restart.** Sessions registered before a server restart are lost; the dispatched subprocesses' next tool call will fail with the SDK's 404 (unknown session) and the subprocess will exit. The runner's existing orphan-recovery (`05-task-runner/02-scheduler`) will transition the now-RUNNING-with-no-process tasks to FAILED with `orphaned_on_restart`. So the failure mode is benign — operator sees the task fail with a clear reason. Persistence of the session map (e.g., to `runner.db`) is out of scope and probably never desirable (sessions are ephemeral by design). *(Priority: TRIVIAL — documented to acknowledge the design choice.)*
- **`MCPSessionId` is `string` not a branded type.** The leaf's types use `string`. Mixing with `TaskId` (also currently `string` in `@ledger/parser/runner/types.ts`) at the binding-registry call site loses some type safety. Branding both would help; defer until either type sees a real swap-bug. *(Priority: TRIVIAL.)*
- **Tests use the SDK client against an in-process Hono fetch handle, not a real network round-trip.** The acceptance check item 5 calls out a real `curl` invocation, but the automated test layer uses `app.fetch(request)` directly (Hono's testing convention) to avoid spinning a TCP listener. The two paths exercise the same `WebStandardStreamableHTTPServerTransport.handleRequest` code, so coverage is equivalent; the operator's manual `curl` step in §Acceptance check is the integration smoke. *(Priority: TRIVIAL — documented to prevent future "why no real fetch?" question.)*

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this leaf moves from `VERIFY` to `COMPLETE`, the verifier confirms:

1. **Build / typecheck / lint / test.** `pnpm install`, `pnpm -C packages/parser build`, `pnpm -C server build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` all exit zero. Bundle delta on `app/` is exactly zero (no UI changes). Server `dist/` delta is reported in Implementation Notes against a pre-add baseline.
2. **MCP handshake.** Acceptance check items 5 and 6 pass against a running server: `initialize` returns `serverInfo: { name: "ledger-runner", version: "0.1.0" }` and an empty `tools` list; the `Mcp-Session-Id` header round-trip works; bad session ids return the documented 400/404.
3. **Session lifecycle hooks fire.** A test listener registered via `handle.onSessionInitialized(...)` receives `(sessionId, request)` with `request.headers.get("X-Ledger-Task-Id")` matching the inbound test fixture. The session-closed hook fires on DELETE.
4. **Health snapshot.** `GET /api/_health` reports `dispatcher.status === "ready"` and `dispatcher.activeSessions` tracks live sessions correctly.
5. **No regressions.** All `04-api-server` and `05-task-runner` endpoint shapes unchanged. The DAG, Tasks, Logs panels load and function. The `noop` and `human_review` runner executors continue to work end-to-end.
6. **Spec ↔ code alignment.** The `serverInfo.name`, version-resolution path, ALS pattern, and mount path match this spec's §Design. Any deviation lands in Implementation Notes with a rationale; silent drift is a verification failure.
7. **Parent manifest row updated** to `COMPLETE (v1)` and PRD §14's `06-agent-dispatcher` parent-status note updated to reflect "1/5 children COMPLETE" (or whatever fraction the merge sequence lands at). Cross-doc sync per leaf-workflow stage 10.

---

## Children

None. This leaf has no further decomposition.
