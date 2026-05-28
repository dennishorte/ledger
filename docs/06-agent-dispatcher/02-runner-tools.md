# Runner Tools + Binding Registry

**Node ID:** `06-agent-dispatcher/02-runner-tools`
**Parent:** `06-agent-dispatcher` (`docs/06-agent-dispatcher/00-agent-dispatcher.md`)
**Status:** SPEC_REVIEW
**Created:** 2026-05-28
**Last Updated:** 2026-05-28 (DRAFT → SPEC_REVIEW; reviewer dispatched in clean context)

**Dependencies:** `06-agent-dispatcher/01-mcp-server` (MCP scaffolding, session-lifecycle hooks, `ProjectContext.mcp`), `05-task-runner` (transitively: `RunnerHandle`, `Store`, the `Task` / `LogEvent` types and their ajv validators)

---

## Requirements

Mount the **five MCP tools** that dispatched Claude Code subprocesses call to report progress, complete or fail their assigned task, request human review, and read task state — and the **task-id binding registry** that prevents a subprocess from mutating a sibling's task. This is the leaf that turns `01-mcp-server`'s empty-tools handshake into a real RPC surface: post-implementation, `tools/list` on a connected MCP client returns five tools, and `tools/call` invocations land typed event/transition writes on the runner's events and tasks tables via `RunnerHandle`.

This leaf is the **second foundational child** of `06-agent-dispatcher`. The parent's Children manifest names it as `The five MCP tools (runner.emit_event, runner.complete_task, runner.fail_task, runner.await_human_review, runner.get_task), thin adapters over RunnerHandle; tool-argument JSON Schema in docs/_schemas/dispatcher-tools.schema.json; task-id binding registry + cross-task rejection (task_not_bound MCP error); ajv validation on tool inbound; new store.updateReviewPayload(taskId, reviewPayload) one-liner method on the Store interface (extends 05-task-runner/01-store-schema's API; used only by the runner.await_human_review handler — Spec Review S3)`. Every clause is in scope.

It also performs **one cleanup**: retire the `setToolRequestHandlers()` private-method cast that `01-mcp-server` shipped as a documented deviation (logged as an Open Issue in that sibling for natural cleanup here). The first call to `McpServer.registerTool(...)` in this leaf re-enters the SDK's internal handler-registration path idempotently and through a public surface, removing the cast as a side effect.

In scope for v1:

1. **The five MCP tools, registered on `ProjectContext.mcp.server` during `loadProjectContext`** at boot. Each is a thin adapter over `RunnerHandle` (from `05-task-runner/02-scheduler`) or `Store` (`runner.get_task` only). Names use dot-separated MCP tool naming (the SDK does not enforce a format; dotted names mirror the parent spec verbatim and the pattern Anthropic Code's own tools use):
   - `runner.emit_event` — append a non-`status_change` `LogEvent` to the bound task's events table.
   - `runner.complete_task` — transition `RUNNING → COMPLETE` on the bound task.
   - `runner.fail_task` — transition `RUNNING → FAILED` with an agent-supplied reason on the bound task.
   - `runner.await_human_review` — write a `reviewPayload` row update, then transition `RUNNING → AWAITING_HUMAN_REVIEW` on the bound task. Suspends the subprocess until the operator resolves via the existing approve/reject endpoints from `05-task-runner/03-hitl-gate`.
   - `runner.get_task` — read-only fetch of any task in the project (parent D8 — cross-task reads are open; mutations are bound).
2. **The task-id binding registry** at `server/src/dispatcher/mcp/binding.ts`. A `Map<MCPSessionId, TaskId>` populated via `ProjectContext.mcp.onSessionInitialized((sessionId, request) => { ... })` (the hook surface `01-mcp-server` shipped). The hook callback reads `X-Ledger-Task-Id` off the inbound `Request` and registers `(sessionId → taskId)` in the registry. The corresponding `onSessionClosed(sessionId)` callback tears the entry down. Every mutating tool handler checks `binding.requireBound(sessionId, claimedTaskId)`; mismatches (including missing-binding-entirely) throw `McpError(InvalidParams, "task_not_bound", { reason: "task_not_bound", sessionId, claimedTaskId, boundTaskId? })`. `runner.get_task` is exempt (parent D8).
3. **The new `store.updateReviewPayload(taskId, reviewPayload)` method** on the `Store` interface at `server/src/runner/store.ts`. One-liner: `UPDATE tasks SET review_payload = ? WHERE id = ?` inside a prepared statement, no transaction (the only caller is `runner.await_human_review` and it follows immediately with `RunnerHandle.awaitHumanReview` which IS transactional). Returns void; throws if the task doesn't exist (FK violation against the existing `tasks` schema does not fire — UPDATE just affects 0 rows — so we explicitly check `changes === 0` and throw a typed error: `new Error("updateReviewPayload: task not found: <id>")`). Parent S3 wired this into the manifest; the leaf delivers.
4. **Zod schemas for tool arguments** at `server/src/dispatcher/mcp/toolSchemas.ts`. Each tool's `inputSchema` is a `ZodRawShape` passed to `McpServer.registerTool(...)`. The SDK validates inbound arguments against the Zod schema before invoking our handler; invalid args produce an SDK-generated JSON-RPC `InvalidParams` response without our handler being called. Zod is already a non-optional `peerDependencies` entry of `@modelcontextprotocol/sdk` (confirmed in the SDK's `package.json`), so no new top-level dep — but `server/package.json` adds it as a direct dep to make the import explicit (avoids a phantom-dependency lint complaint and pins the version next to `@modelcontextprotocol/sdk`'s acceptable range, `^3.25 || ^4.0`; this leaf installs the latest in that range at implementation time).
5. **Compose ajv validation inside `runner.emit_event`'s handler** for the inner `LogEvent` body — the parent's "same ajv runtime used by `04-api-endpoints` for `POST /api/tasks` input validation" prescription. The handler receives the agent-supplied `event` payload via Zod (shallow shape: `{ kind: string, ...rest }`), constructs a candidate `Omit<LogEvent, "id" | "taskId" | "seq" | "at">` shape, and runs it through the existing `validateLogEvent` from `@ledger/parser` (which validates against `docs/_schemas/log-event.schema.json` via ajv 2020). On failure: throw `McpError(InvalidParams, ...)` with the ajv error list in `data.errors`. On success: pass to `handle.emit(taskId, event)` which returns the materialized `LogEvent` row; the row is returned as the tool's `content` (JSON-stringified — D5).
6. **Wiring at `ProjectContext` load time.** `loadProjectContext` instantiates the binding registry (line ~`const binding = createBindingRegistry()`), subscribes it to the existing `mcp` handle (`mcp.onSessionInitialized((sessionId, request) => binding.bind(sessionId, request?.headers.get("X-Ledger-Task-Id") ?? undefined))` and the close hook), and then registers the five tools on `mcp.server`. Order matters: hooks must subscribe before any inbound request arrives. The MCP server's transport listens on Hono at `app.listen()` which happens AFTER `loadProjectContext` returns, so subscribing inside `loadProjectContext` is safely pre-listen.
7. **`ProjectContext.binding: BindingRegistry`** exposed read-only for test consumption and for `05-dispatch-api` to assert on. The registry's public surface: `bind(sessionId, taskId): void`, `unbind(sessionId): void`, `lookup(sessionId): TaskId | undefined`, `requireBound(sessionId, claimedTaskId): TaskId` (throws `McpError(InvalidParams, "task_not_bound", ...)` on any mismatch or missing binding).
8. **Per-handler `RequestHandlerExtra.sessionId` extraction.** The SDK's tool callback signature is `(args, extra) => ToolResult` where `extra` carries the current request context including `sessionId` (the SDK's stateful-session id). Each handler reads `extra.sessionId` to call `binding.requireBound(sessionId, args.task_id)` before any mutation. Read-only `runner.get_task` skips the bind check (parent D8).
9. **`docs/_schemas/dispatcher-tools.schema.json` — DEFERRED.** Parent §MCP tool surface called this out: "(D2 of `02-runner-tools`'s spec, deferred)." The leaf does NOT ship a hand-authored JSON Schema mirror of the Zod schemas. Two reasons: (a) consistent with `02-schema` D8, `03-project-metadata` D9, and `05-task-runner/01-store-schema`'s deferred-codegen stance — no other schema in `docs/_schemas/` is generated from code, so a hand-mirrored Zod-derived JSON Schema would be a one-off maintenance hazard; (b) Zod-to-JSON-Schema codegen via the `zod-to-json-schema` package (a sibling dep of the SDK; not currently used by us) is the natural future path. Logged as Open Issue. D2 below.
10. **Tests** at `server/test/dispatcher/mcp/{binding,tools}.test.ts`:
    - **Binding registry.** `bind` populates; `unbind` removes; `lookup` returns the right id or `undefined`; `requireBound` returns the id on hit and throws `McpError(InvalidParams, "task_not_bound", ...)` on miss or mismatch.
    - **Hook plumbing.** Wiring `binding.bind` into `mcp.onSessionInitialized` and triggering a fake init via the existing test pattern (Hono `app.fetch(request)` with an `X-Ledger-Task-Id` header) results in the binding being populated; the session-close path tears it down.
    - **Each of the five tools** invoked via the SDK's in-process client transport against the running Hono `app.fetch` handle. Cover: arg-schema validation rejection (Zod fires before our handler); task_not_bound rejection (foreign task id); happy-path success returning the right shape; the side effect on the store (events table for `emit_event`, status column for `complete_task` / `fail_task` / `await_human_review`); `get_task` returning the task + events.
    - **`runner.emit_event`** ajv path: a malformed `event` body (e.g., `kind: "reasoning"` with missing required `text`) round-trips an `InvalidParams` McpError with the ajv `errors` array in `data`.
    - **`runner.await_human_review`** side effect: `store.updateReviewPayload(taskId, payload)` is observed in a follow-up `loadTask(taskId)` (the `reviewPayload` column reflects the new value); the subsequent `awaitHumanReview` transition lands a status_change event.
    - **`store.updateReviewPayload`** unit-test: round-trip against `:memory:`. Update succeeds; update on missing id throws.
    - **`setToolRequestHandlers()` cast retired.** `01-mcp-server`'s Open Issue noted this; the test that previously failed without the cast (`tools/list` returning `MethodNotFound`) now passes naturally because `registerTool` re-enters the same code path through a public surface. The leaf removes the cast call from `dispatcher/mcp/server.ts` and verifies via the existing `01-mcp-server` test that the `tools` capability is still advertised at handshake time — the SDK's `registerTool` now drives it.
11. **Build / typecheck / lint / test green** across the workspace. Bundle delta on `app/` zero (no UI changes). Server `dist/` delta reported in Implementation Notes against the post-`01-mcp-server` baseline.

**Out of scope for this child:**

- **The `ClaudeCodeExecutor` subprocess spawning.** `03-claude-code-executor`. This leaf's tools handle whatever connects — including, in v1, the test-fixture MCP client. The first real consumer is `03-...`; this leaf does not couple to it.
- **Prompt templates.** `04-prompt-templates`. The agent receives prompts from `03-...`; this leaf does not care what the prompt says — only that the agent's tool calls land correctly.
- **The dispatch endpoint** (`POST /api/dispatch/:nodeId`) and the cancel endpoint (`POST /api/tasks/:id/cancel`). `05-dispatch-api`. Tasks reach RUNNING via the existing `POST /api/tasks` operator-injection from `05-task-runner/04-api-endpoints` until then.
- **Authoring `docs/_schemas/dispatcher-tools.schema.json`.** Deferred (item 9). Future codegen via `zod-to-json-schema` or a sibling pass that hand-authors all hand-authored schemas. Logged as Open Issue.
- **Rate limiting / quota on tool calls.** Parent Open Issue (`MCP tool-call rate limiting`). v1: single-user local; no caps.
- **Output schemas (`outputSchema` on `registerTool`).** The SDK supports declared output schemas; v1 returns opaque `content` (`type: "text"` with a JSON-stringified body of the materialized event / task). Output schemas would help typed-client consumers; defer until a non-test client exists.
- **`runner.emit_event` for `status_change` events.** Status-change events are written transactionally by `RunnerHandle.complete` / `fail` / `awaitHumanReview` and by the scheduler. The agent calls those tools to *transition* the task; emitting a synthetic `status_change` via `runner.emit_event` would race the real transition. The handler explicitly rejects `event.kind === "status_change"` with `McpError(InvalidParams, "status_change events are managed by the runner; use runner.complete_task / fail_task / await_human_review to transition")`.
- **MCP elicitations / structured user interaction.** The SDK has elicitations APIs (`UrlElicitationRequiredError` etc.); v1 does not surface them. The operator interaction surface is `AWAITING_HUMAN_REVIEW` via the existing approve/reject endpoints.
- **A `runner.list_tasks` tool.** The agent does not browse the project; it works on one task. If a future use case needs cross-task discovery, add then.
- **A `runner.append_to_artifact` or similar tool.** The agent's existing `Read`/`Edit`/`Write` tools handle filesystem; the MCP tool surface is *control* over the task lifecycle, not file IO.
- **Tool-call logging beyond the events table.** `runner.emit_event` is the agent's own report of its activity. The runner's internal logging (the existing Hono logger middleware) covers the HTTP-level visibility.
- **Concurrent tool calls from the same session.** The SDK serializes JSON-RPC requests per session by default; we do not add additional serialization. If the agent pipelines `emit_event` + `complete_task`, the SDK orders them in submission order.

---

## Design

### Repository layout after this node

```
ledger/
├── server/
│   ├── package.json                                # +zod direct dep (latest in ^3.25 || ^4.0)
│   ├── src/
│   │   ├── context.ts                              # modified — binding wired, tools registered
│   │   ├── runner/
│   │   │   └── store.ts                            # modified — updateReviewPayload added to Store interface + createStore
│   │   └── dispatcher/
│   │       ├── index.ts                            # modified — re-export BindingRegistry, registerRunnerTools
│   │       └── mcp/
│   │           ├── server.ts                       # modified — REMOVE setToolRequestHandlers() cast
│   │           ├── binding.ts                      # NEW — createBindingRegistry(), BindingRegistry interface
│   │           ├── tools.ts                        # NEW — registerRunnerTools(server, ctx, binding)
│   │           ├── toolSchemas.ts                  # NEW — Zod schemas for all five tools
│   │           └── types.ts                        # modified — BindingRegistry type
│   └── test/
│       └── dispatcher/
│           └── mcp/
│               ├── binding.test.ts                 # NEW
│               └── tools.test.ts                   # NEW — all five tools + ajv path + cast retired
└── docs/
    └── 06-agent-dispatcher/
        ├── 00-agent-dispatcher.md                  # modified — manifest row PLANNED → DRAFT → …
        └── 02-runner-tools.md                      # this spec
```

`docs/_schemas/dispatcher-tools.schema.json` is **not** authored in this leaf (item 9 / D2 — deferred).

### Zod schemas + tool registration

The five tools share a base argument: `task_id: z.string().min(1)`. Each tool's `inputSchema` is a `ZodRawShape` (plain object of Zod types) — the SDK's `registerTool` accepts `ZodRawShapeCompat | AnySchema`, and the raw-shape form is what the SDK's docs recommend.

```ts
// server/src/dispatcher/mcp/toolSchemas.ts
import { z } from "zod";

const taskId = z.string().min(1);

export const emitEventShape = {
  task_id: taskId,
  event: z.object({
    kind: z.string(),     // narrowed inside the handler via validateLogEvent (ajv)
  }).passthrough(),       // additional kind-specific fields ride through; validateLogEvent gates them
} as const;

export const completeTaskShape = {
  task_id: taskId,
} as const;

export const failTaskShape = {
  task_id: taskId,
  reason: z.string().min(1).max(2000),   // stored verbatim on the status_change event
} as const;

export const awaitHumanReviewShape = {
  task_id: taskId,
  review_payload: z.object({
    summary: z.string().min(1),
    diffRef: z.string().optional(),
  }),
} as const;

export const getTaskShape = {
  task_id: taskId,
} as const;
```

`z.object(...).passthrough()` on `emit_event.event` is critical: the Zod schema only validates the `kind` field at the SDK boundary; the kind-specific payload fields (`text`/`subkind` for `reasoning`, `callId`/`toolName` for `tool_call`, etc.) pass through unvalidated. The handler then runs the existing `validateLogEvent` (ajv) on the assembled shape — the ajv schema enforces the `oneOf` discriminated union from `docs/_schemas/log-event.schema.json` (Spec Review S4 of `05-task-runner/01-store-schema` already keyed `status_change.from` as optional for seq-0).

### Tool registration

```ts
// server/src/dispatcher/mcp/tools.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { validateLogEvent } from "@ledger/parser";
import type { BindingRegistry } from "./binding.js";
import type { RunnerHandle, Store } from "../../runner/index.js";
import {
  emitEventShape, completeTaskShape, failTaskShape,
  awaitHumanReviewShape, getTaskShape,
} from "./toolSchemas.js";

export interface RunnerToolDeps {
  store: Store;
  handle: RunnerHandle;
  binding: BindingRegistry;
}

export function registerRunnerTools(server: McpServer, deps: RunnerToolDeps): void {
  const { store, handle, binding } = deps;

  server.registerTool(
    "runner.emit_event",
    {
      description: "Append a non-status_change LogEvent to the bound task. Returns the materialized event row.",
      inputSchema: emitEventShape,
    },
    async (args, extra) => {
      const taskId = binding.requireBound(extra.sessionId, args.task_id);
      const candidate = { ...args.event };
      if (candidate.kind === "status_change") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "status_change events are managed by the runner; use runner.complete_task / fail_task / await_human_review to transition",
          { reason: "status_change_not_emittable" },
        );
      }
      const result = validateLogEvent({ id: "_pre", taskId, seq: -1, at: "1970-01-01T00:00:00Z", ...candidate });
      if (!result.ok) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "event failed LogEvent schema validation",
          { reason: "invalid_event_shape", errors: result.errors },
        );
      }
      const row = handle.emit(taskId, candidate as Parameters<RunnerHandle["emit"]>[1]);
      return { content: [{ type: "text", text: JSON.stringify(row) }] };
    },
  );

  server.registerTool(
    "runner.complete_task",
    {
      description: "Transition the bound task RUNNING → COMPLETE.",
      inputSchema: completeTaskShape,
    },
    async (args, extra) => {
      const taskId = binding.requireBound(extra.sessionId, args.task_id);
      const task = handle.complete(taskId);
      return { content: [{ type: "text", text: JSON.stringify({ status: task.status }) }] };
    },
  );

  server.registerTool(
    "runner.fail_task",
    {
      description: "Transition the bound task RUNNING → FAILED with the agent-supplied reason (stored verbatim).",
      inputSchema: failTaskShape,
    },
    async (args, extra) => {
      const taskId = binding.requireBound(extra.sessionId, args.task_id);
      const task = handle.fail(taskId, args.reason);
      return { content: [{ type: "text", text: JSON.stringify({ status: task.status }) }] };
    },
  );

  server.registerTool(
    "runner.await_human_review",
    {
      description: "Write a reviewPayload row update, then transition the bound task RUNNING → AWAITING_HUMAN_REVIEW. Operator resolves via /api/tasks/:id/approve|reject.",
      inputSchema: awaitHumanReviewShape,
    },
    async (args, extra) => {
      const taskId = binding.requireBound(extra.sessionId, args.task_id);
      store.updateReviewPayload(taskId, args.review_payload);
      const task = handle.awaitHumanReview(taskId);
      return { content: [{ type: "text", text: JSON.stringify({ status: task.status }) }] };
    },
  );

  server.registerTool(
    "runner.get_task",
    {
      description: "Read task state + events. Open across all project tasks (D8 of parent — read is unbound).",
      inputSchema: getTaskShape,
    },
    async (args) => {
      const task = store.loadTask(args.task_id);
      if (!task) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "task not found",
          { reason: "task_not_found", taskId: args.task_id },
        );
      }
      const events = store.getEvents(args.task_id);
      return { content: [{ type: "text", text: JSON.stringify({ task, events }) }] };
    },
  );
}
```

The tool callback signature is `(args, extra) => ToolResult`. `extra` carries `sessionId` (the SDK's stateful-session id, populated by the transport on every request after `initialize`). The pre-bound `taskId` returned by `requireBound` is the *bound* task id from the registry — for non-`get_task` tools, we use this rather than `args.task_id` to defend against the case where `args.task_id` matched but the binding entry had a different (impossible) value. In practice `requireBound` already enforces equality, so the returned value equals `args.task_id`; the assignment is documentation that the bound id is the authoritative one.

### Binding registry

```ts
// server/src/dispatcher/mcp/binding.ts
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { MCPSessionId } from "./types.js";

export interface BindingRegistry {
  bind(sessionId: MCPSessionId, taskId: string | undefined): void;
  unbind(sessionId: MCPSessionId): void;
  lookup(sessionId: MCPSessionId): string | undefined;
  /**
   * Returns the bound taskId on hit; throws McpError(InvalidParams, "task_not_bound", ...) on:
   *   - no binding for sessionId
   *   - claimedTaskId does not match the binding
   */
  requireBound(sessionId: MCPSessionId | undefined, claimedTaskId: string): string;
  /** Test-only inspection. */
  size(): number;
}

export function createBindingRegistry(): BindingRegistry {
  const map = new Map<MCPSessionId, string>();
  return {
    bind(sessionId, taskId) {
      if (taskId === undefined || taskId.length === 0) return;  // no header → no bind; tool calls will fail with task_not_bound
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
```

Three rejection modes, all under the same `task_not_bound` message string with a distinguishing `reason` in `data`. The reason taxonomy is internal/documented but stable; the message string is what shows up in the agent's MCP-error response, and the agent sees one consistent label regardless of which rejection mode fired.

### `store.updateReviewPayload` — one-liner addition

```ts
// server/src/runner/store.ts (additive)
export interface Store {
  // ... existing methods ...
  /**
   * UPDATE tasks SET review_payload = ? WHERE id = ?.
   * Caller (runner.await_human_review tool) follows with handle.awaitHumanReview(id)
   * for the actual status transition. No transaction here — the transition's status_change
   * append is the durability boundary.
   * Throws if the task does not exist.
   */
  updateReviewPayload(taskId: TaskId, reviewPayload: ReviewPayload): void;
}
```

Inside `createStore`:

```ts
const stmtUpdateReviewPayload = db.prepare<[string, string]>(
  `UPDATE tasks SET review_payload = ? WHERE id = ?`,
);

// ... inside the returned Store object:
updateReviewPayload(taskId, reviewPayload) {
  const json = JSON.stringify(reviewPayload);
  const info = stmtUpdateReviewPayload.run(json, taskId);
  if (info.changes === 0) {
    throw new Error(`updateReviewPayload: task not found: ${taskId}`);
  }
}
```

`ReviewPayload` is the existing type in `@ledger/parser/runner/types.ts` (added by `03-hitl-gate`); no new type. The `info.changes === 0` check is the typed-error path; the prepared statement caches at construction time per the existing store pattern.

### Wiring at `loadProjectContext`

```ts
// server/src/context.ts (additive — relevant fragment)
import { createBindingRegistry } from "./dispatcher/mcp/binding.js";
import { registerRunnerTools } from "./dispatcher/mcp/tools.js";
import type { BindingRegistry } from "./dispatcher/mcp/binding.js";

export interface ProjectContext {
  // ... existing fields ...
  mcp: McpServerHandle;
  binding: BindingRegistry;  // NEW — exposed for tests; 05-dispatch-api may read for diagnostics
}

export async function loadProjectContext(opts: { projectPath: string; port: number }): Promise<ProjectContext> {
  // ... existing setup through runner + mcp ...
  const binding = createBindingRegistry();
  mcp.onSessionInitialized((sessionId, request) => {
    const taskId = request?.headers.get("X-Ledger-Task-Id") ?? undefined;
    binding.bind(sessionId, taskId);
  });
  mcp.onSessionClosed((sessionId) => {
    binding.unbind(sessionId);
  });
  registerRunnerTools(mcp.server, { store: runner.store, handle: runner.handle, binding });
  return {
    // ... existing fields ...
    mcp,
    binding,
  };
}
```

`runner.handle` — the `RunnerHandle` returned by `createRunner` — needs to be exposed on the `Runner` type for `registerRunnerTools` to consume. Currently `Runner` (from `05-task-runner/02-scheduler`) exposes `createTask`, `registerExecutor`, `tick` per CLAUDE.md but not the underlying `RunnerHandle`. The leaf adds a `handle: RunnerHandle` getter on the `Runner` interface — additive, surfaces the existing internal `handle` variable from `createRunner`. The handle is the same object the registered executors receive; safe to expose to the tools layer because tool calls run in HTTP-request stacks separate from executor `run()` calls (no concurrent mutation of in-memory state — the Store's `better-sqlite3` connection is the synchronization point).

Order in `loadProjectContext` is critical: hook subscriptions before tool registration is fine (tools don't fire during init), but tool registration MUST happen before `app.listen()` — and `app.listen` happens in `bin/ledger.ts` after `loadProjectContext` returns, so the order in the function body is uncoupled from listen.

### Retire the `setToolRequestHandlers()` cast in `01-mcp-server`'s `server.ts`

```diff
// server/src/dispatcher/mcp/server.ts
- // 01-mcp-server deviation: force tools-capability advertisement at handshake time.
- // 02-runner-tools' registerTool() calls will idempotently re-call this through a
- // public surface; remove this cast then.
- (server as unknown as { setToolRequestHandlers(): void }).setToolRequestHandlers();
```

The cast disappears entirely. The first `server.registerTool(...)` call in `registerRunnerTools` (now invoked during `loadProjectContext` per the wiring above) re-enters the same internal handler-registration path through the SDK's `_createRegisteredTool → setToolRequestHandlers` chain — confirmed in `mcp.js` line 650. The existing test in `01-mcp-server`'s test file that asserts `tools/list` returns an empty array continues to pass (now returns the five registered tools after this leaf — that test gets a corresponding update OR moves to assert "tools/list returns at least one tool" in keeping with backwards-compat).

The corresponding Open Issue in `01-mcp-server.md` (`setToolRequestHandlers() private-method cast for eager capability advertisement`) is closed in this leaf's commit via a sibling-edit note in §Implementation Notes; the entry is updated to "RESOLVED 2026-05-28 by `02-runner-tools` registerTool() side effect."

### `01-mcp-server`'s test update

`server/test/dispatcher/mcp/server.test.ts` has a test asserting `tools/list` returns `{ tools: [] }` — pre-this-leaf accurate, post-this-leaf wrong. Two options:

- **A.** Update the existing test to assert `tools` count ≥ 5 and that all five tool names match.
- **B.** Add new tests in this leaf's `tools.test.ts` that cover the five-tool advertisement; relax the existing `01-mcp-server` test to assert "tools array is present" without count.

Decision: **A**. The advertised-tool set is meaningful behaviour; under-asserting is worse than the slight cross-leaf coupling. The change is one line in the existing test; it's mechanical and documents that "now there are tools."

### Acceptance check (manual, end-to-end)

1. `pnpm install` succeeds with the added `zod` dep (SDK's peer was already satisfied transitively; adding the direct entry pins it explicitly).
2. `pnpm -C packages/parser build`, `pnpm -C server build` complete clean.
3. `pnpm -C server dev /Users/dennis/code/ledger` boots; existing `/api/*` and `/mcp` endpoints respond.
4. `POST /mcp initialize` returns `serverInfo: { name: "ledger-runner", version: "0.1.0" }` AND `tools/list` (subsequent POST) returns five tools: `runner.emit_event`, `runner.complete_task`, `runner.fail_task`, `runner.await_human_review`, `runner.get_task`.
5. End-to-end happy path: operator POSTs `/api/tasks` with `type: "noop"` (or `type: "implement"` if a dispatcher executor is registered — not in this leaf), gets a task id, opens an MCP session with `X-Ledger-Task-Id: <id>`, calls `runner.emit_event` with a `reasoning` event, calls `runner.complete_task`. Then `GET /api/tasks/:id` shows `status: COMPLETE` and `GET /api/tasks/:id/stream` (or initial `/events`) includes the agent's reasoning event.
6. Foreign task id rejection: open a session with `X-Ledger-Task-Id: A`, call `runner.emit_event` with `task_id: B` → MCP `InvalidParams` error with `data.reason: "task_id_mismatch"`.
7. Missing `X-Ledger-Task-Id` header: session opens (binding does not register), `runner.emit_event` → `task_not_bound` with `data.reason: "session_not_bound"`.
8. Malformed event payload: `runner.emit_event` with `event: { kind: "reasoning" }` (missing `text` and `subkind`) → `InvalidParams` with `data.reason: "invalid_event_shape"` and `data.errors` carrying the ajv errors.
9. `runner.get_task` cross-task: from session bound to A, call `runner.get_task` with `task_id: B` → returns B's task + events (no binding check; parent D8).
10. `runner.await_human_review` happy path: agent calls with `review_payload: { summary: "..." }`; `GET /api/tasks/:id` shows `reviewPayload` populated and `status: AWAITING_HUMAN_REVIEW`. Operator approves via `POST /api/tasks/:id/approve` → status transitions per `03-hitl-gate`.
11. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` exit zero across all workspace packages.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | High-level `McpServer.registerTool(...)` with Zod `inputSchema` — NOT the low-level `server.setRequestHandler(CallToolRequestSchema, ...)` with manual ajv | The SDK's `registerTool` integrates: tool listing in `tools/list`, argument validation, request routing, and the public-API path that retires `01-mcp-server`'s `setToolRequestHandlers()` private-method cast. Going low-level would require duplicating all four of those concerns. Zod is non-optional peer of the SDK; no new top-level dep beyond making the import explicit. The parent's prescription "ajv on tool inbound" is honoured for the *LogEvent body* validation inside `runner.emit_event` (D4) — the heaviest piece of validation — while Zod handles the tool-arg shape. |
| D2 | `docs/_schemas/dispatcher-tools.schema.json` deferred (not authored in this leaf) | Parent §MCP tool surface flagged this as "(D2 of `02-runner-tools`'s spec, deferred)" — explicit forward-reference. Consistent with `02-schema` D8, `03-project-metadata` D9, and `05-task-runner/01-store-schema`'s deferred-codegen stance. Hand-mirroring a Zod schema would be a one-off maintenance hazard; Zod-to-JSON-Schema codegen via `zod-to-json-schema` (sibling dep of the SDK) is the natural future path when a non-Zod-aware consumer needs the doc. v1 ships zero codegen. |
| D3 | Tool names use dot-separated namespacing (`runner.emit_event`, etc.), not snake_case (`runner_emit_event`) or kebab (`runner-emit-event`) | Parent spec uses the dotted form throughout; matches Anthropic Code's own built-in tool naming (`Read`, `Bash` are bare, but plugins use dotted). The MCP spec does not constrain the format. Dotted names also read naturally in the agent's chain-of-thought ("calling runner.complete_task"). |
| D4 | `runner.emit_event` validates the `event` body with the existing `validateLogEvent` (ajv) from `@ledger/parser` — Zod only validates the outer shape | The LogEvent discriminated union is canonical in `docs/_schemas/log-event.schema.json` and already has an ajv validator in the parser package (`05-task-runner/01-store-schema`'s deliverable item 6). Re-implementing it as a Zod discriminated union would duplicate the source of truth and risk drift. Composing Zod for the outer shape + ajv for the body uses each tool where it's strongest: Zod gates trivial shape rejection at the SDK boundary, ajv gates the rich discriminated-union semantics inside the handler. |
| D5 | Tool results return `content: [{ type: "text", text: JSON.stringify(payload) }]`, not structured `outputSchema`-driven responses | The MCP spec's `tool/call` response shape is `{ content: Array<TextContent | ImageContent | ResourceContent>, isError?: boolean }`. The SDK supports an optional `outputSchema` that the SDK validates the handler's structured return value against. v1 does not declare output schemas — adds plumbing without a non-test consumer (the only client today is the test fixture, which parses the JSON itself). When a typed-client consumer (e.g., a Python operator script) emerges, adding `outputSchema` is purely additive. |
| D6 | Binding registry is in-memory `Map`, not persisted to `runner.db` | Inherited from `01-mcp-server` Open Issue ("In-memory session map vulnerable to process restart"). Persisting bindings would require a teardown story (write at session close) and a restart-recovery story (orphan-binding cleanup) — neither is meaningful in v1 because dispatched subprocesses die when the API server restarts, and the runner's orphan-recovery (`05-task-runner/02-scheduler`) catches the RUNNING tasks left behind. The binding is ephemeral on purpose. |
| D7 | `requireBound`'s rejection mode taxonomy (`no_session`, `session_not_bound`, `task_id_mismatch`) is internal-data-only; the user-visible message is always `"task_not_bound"` | The agent doesn't need to distinguish the three modes operationally — all three mean "you cannot mutate this task." The reason taxonomy is useful for the operator debugging via the agent's emitted error log and for tests asserting on specific rejection cases. Keeping the message string stable and surfacing the reason via `data` is the standard JSON-RPC error convention. |
| D8 | `runner.get_task` does NOT check the binding; cross-task reads are open per parent D8 | The agent has filesystem access to `.ledger/runner.db` and could read any task by querying SQLite directly. The MCP tool exposing the same read is no more permissive than the existing capability. The benefit is ergonomic: the agent doesn't need to know SQLite's schema; the tool returns a structured response. Mutations remain bound (D7 enforces). |
| D9 | `Runner` interface gains a `handle: RunnerHandle` getter — the existing internal `handle` from `createRunner` becomes a public read-only property | The tools layer needs `RunnerHandle` to call `emit` / `complete` / `fail` / `awaitHumanReview`. The existing surface (`createTask`, `registerExecutor`, `tick`) is the executor-facing API; the tools layer is a sibling consumer that needs the executor-style handle without being an executor. Exposing it preserves the executor's invariant (handle is callable from any async context, not just executor `run()`) — `better-sqlite3`'s synchronous-on-single-connection model already serializes mutations. |
| D10 | `store.updateReviewPayload` is a one-liner non-transactional UPDATE; the follow-up `awaitHumanReview` transition handles durability | Composing the two in a transaction would force the tool handler to participate in a `better-sqlite3` transaction, which would couple this leaf's tools to the Store's transaction primitive in a way the existing approve/reject endpoints do not. The status_change event from `awaitHumanReview` IS the durability boundary; if the handler crashes between the UPDATE and the transition, the task is still RUNNING (no status change), and the operator-visible state is consistent (next agent retry, or operator cancel, drives forward). Logged as a TRIVIAL Open Issue. |
| D11 | Zod added as a direct `dependencies` entry in `server/package.json`, not relied on as a transitive of the SDK | The SDK declares Zod as a non-optional peer with version range `^3.25 || ^4.0`. Relying on the transitive means our import resolves through pnpm's phantom-dependency rules, which lint can flag and which break if the SDK's peer range narrows. Direct dep is explicit, lint-clean, and pinned next to the SDK in `package.json`. The dep is the same physical install — no bundle delta. |
| D12 | The five tool registrations happen in `loadProjectContext`, not in `01-mcp-server`'s `createMcpServerAsync` factory | The factory's job is transport scaffolding; tool registration is a domain concern. Co-locating in `loadProjectContext` keeps the McpServer factory generic (testable with no domain coupling) and puts the wiring next to `runner` + `mcp` which the tools need. Mirrors the pattern from `01-mcp-server`'s §Design: factory creates, context wires. |
| D13 | The `runner.emit_event` handler rejects `event.kind === "status_change"` with `InvalidParams` | Status-change events are written transactionally by `RunnerHandle.complete` / `fail` / `awaitHumanReview` and by the scheduler. Allowing the agent to inject a synthetic `status_change` via `runner.emit_event` would race the real transition, corrupt the events stream's ordering invariant (status changes interleave with their causing transition), and provide no value the existing transition tools don't already cover. Explicit rejection with a helpful message is the right shape. |

---

## Open Issues

- **Tool-call rate limiting.** Inherited from parent. A misbehaving agent could call `runner.emit_event` thousands of times per second. v1: no caps. Mitigation when surfaced: per-session event-count budget (e.g., 10k events/task) that fails the task with `runaway_emit`. *(Priority: LOW — single-user local; agent misbehavior is the operator's debugging problem.)*
- **No `outputSchema` declarations on tool registrations.** D5 deferred this. When a typed-client consumer emerges (Python script, web inspector), adding `outputSchema` is additive. *(Priority: LOW — pending non-test consumer.)*
- **`docs/_schemas/dispatcher-tools.schema.json` not authored.** D2 deferred. Future Zod-to-JSON-Schema codegen via `zod-to-json-schema` (already a transitive dep of the SDK) is the natural path. *(Priority: LOW — inherited from the codebase's broader deferred-codegen stance.)*
- **`runner.await_human_review` non-transactional UPDATE.** D10 acknowledges: the `updateReviewPayload` UPDATE and the subsequent `awaitHumanReview` transition are two writes; a crash between them leaves the task RUNNING with the new `reviewPayload`. Functionally benign (operator cancel or agent retry both drive forward), but a strict-correctness argument for composing them in a transaction exists. The composition would couple the tool to `better-sqlite3`'s transaction primitive — out of scope for v1. *(Priority: TRIVIAL — benign failure mode; recovery paths handle it.)*
- **`Runner.handle` exposure widens the executor-facing API to a tools-facing consumer.** D9 made the choice; the API now has two callers (executors via `run(task, handle)` and tools via `registerRunnerTools(mcp.server, { handle, ... })`). If a future leaf needs to constrain the tools' surface (e.g., disallow `complete` for certain agents), branding the consumer in the handle's type would help. Defer until needed. *(Priority: TRIVIAL.)*
- **Binding registry is process-local; no cross-process awareness.** Inherited from `01-mcp-server`. Multi-process scenarios (one runner serving multiple subprocesses across machines) are out of scope; the registry would need a distributed map (Redis, etc.) and v1's MCP transport is bound to `127.0.0.1` regardless. *(Priority: TRIVIAL — Phase-2 concern.)*
- **`status_change`-via-`runner.emit_event` rejection (D13) is enforced in the handler, not at the Zod schema** Catching this at the Zod level would require either a Zod discriminated-union over all valid kinds (duplicating the JSON Schema) or a `.refine()` callback. The handler-level reject is simpler and the failure mode (a single user-visible `InvalidParams` error) is identical. *(Priority: TRIVIAL.)*

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this leaf moves from `VERIFY` to `COMPLETE`, the verifier confirms:

1. **Build / typecheck / lint / test.** `pnpm install`, `pnpm -C packages/parser build`, `pnpm -C server build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` all exit zero. Bundle delta on `app/` is exactly zero (no UI changes). Server `dist/` delta is reported in Implementation Notes against the post-`01-mcp-server` baseline (320K).
2. **Five tools registered.** `tools/list` on a connected MCP client returns five entries: `runner.emit_event`, `runner.complete_task`, `runner.fail_task`, `runner.await_human_review`, `runner.get_task`. Each carries its description and `inputSchema`.
3. **`setToolRequestHandlers()` cast removed.** `server/src/dispatcher/mcp/server.ts` no longer contains the cast; the file's compiled output is smaller by the cast block; the `01-mcp-server` Open Issue for it is marked RESOLVED in this leaf's commit message.
4. **Binding registry round-trip.** `binding.bind(sessionId, taskId)` populates; `binding.unbind(sessionId)` removes; `binding.requireBound(sessionId, claimedTaskId)` throws the right `task_not_bound` McpError on each of the three failure modes (D7).
5. **`store.updateReviewPayload`.** New method on `Store`; round-trip test passes; raises on missing id; the existing `Store` consumers (`createTask`, `updateTaskStatus`, etc.) continue to work unchanged.
6. **End-to-end via real MCP client.** Acceptance check items 4–10 pass against a running server. Item 11 covers the test suite.
7. **No regressions.** `04-api-server` endpoints unchanged. `05-task-runner` endpoints unchanged. `01-mcp-server`'s session-lifecycle hooks fire as before (the new binding-registry subscription is *in addition to* — does not replace — the leaf's own `activeSessions` tracking).
8. **Parent manifest row** updated to `COMPLETE (v1)`; PRD §14 row for `06-agent-dispatcher` reflects 2/5 children COMPLETE; CLAUDE.md round-2 dispatcher line synced.

---

## Children

None. This leaf has no further decomposition.
