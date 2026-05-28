# Task API Endpoints + SSE Bridge + Operator Injection

**Node ID:** `05-task-runner/04-api-endpoints`
**Parent:** `05-task-runner` (`docs/05-task-runner/00-task-runner.md`)
**Status:** DRAFT
**Created:** 2026-05-27
**Last Updated:** 2026-05-27 (DRAFT — pre-review)

**Dependencies:** `05-task-runner/02-scheduler` (Runner instance, scheduler, store wired on `ProjectContext`)

---

## Requirements

Ship the **read surface and operator-injection surface** of the runner over HTTP, mounted on the existing Hono server from `04-api-server`. Four endpoints land in this sub-leaf:

- `GET /api/tasks` — list with `status`, `type`, `parent` filters.
- `GET /api/tasks/:id` — single task + its events.
- `GET /api/tasks/:id/stream` — Server-Sent Events log stream with `Last-Event-ID` resume, 15 s heartbeat, 60 s auto-close grace after terminal status.
- `POST /api/tasks` — operator injection, validates against `task-input.schema.json` via `validateTaskInput`.

This sub-leaf also lands the **in-process pub/sub bridge** the parent's §HITL gate / §Endpoints sections imply: `server/src/runner/events.ts` with a small `EventBus` (`subscribe(taskId, cb)`, `publish(taskId)`, `close()`) plus a `withPublishing(store, bus)` Store decorator that publishes a "task-changed" signal after every write. The SSE handler subscribes per task and on each signal queries `store.getEvents(taskId, { afterSeq: <emitted> })` for the new events to relay. The `02-scheduler` Open Issue "No in-process pub/sub for events" is closed by this child.

`03-hitl-gate`'s approve/reject endpoints live in `server/src/routes/hitl.ts` (not this child's `tasks.ts`) per the parent's §Endpoints carve-up. The two router files mount independently on the same Hono app.

In scope for v1:

1. **`server/src/routes/tasks.ts`** — Hono sub-router exporting `tasksRoute` mounted at `/api/tasks` by `server.ts`. Four route handlers:
   - `GET /` → 200 `{ tasks: Task[] }`. Query params (all optional, all repeatable): `?status=PENDING&status=RUNNING`, `?type=noop&type=implement`, `?parent=<TaskId>`. Default order: `created_at DESC` (matches `Store.listTasks`'s built-in order). All filters compose via the Store's existing `listTasks({ status?, type?, parent? })` filter shape. Unknown query params are ignored; malformed `status`/`type` values that don't match the enum are rejected with 400 (or — see D3 — passed through as no-match filters that return an empty list; D3 picks one).
   - `GET /:id` → 200 `{ task: Task, events: LogEvent[] }`. 404 if the id does not resolve to a row. Events are returned in `seq ASC` order (the Store's `getEvents` default).
   - `GET /:id/stream` → SSE per §SSE contract below. 404 on a missing id (sent as the initial HTTP response, not as an SSE frame, since SSE is only opened on success).
   - `POST /` → 201 `{ task: Task }`. Body is parsed as JSON, validated via `validateTaskInput`, fields normalised through `Store.createTask`'s default-application path (defaults pinned by the schema, not by this route). Bad JSON → 400 with `{ error: "invalid_json" }`. Schema failure → 400 with `{ errors: ValidationError[] }`. The endpoint calls `runner.createTask(...)` (not `store.createTask`) so the scheduler tick fires synchronously after insertion. Returns the post-tick `Task` (so for a `noop` task the response already shows `status: "COMPLETE"`).
2. **`server/src/runner/events.ts`** — new module:
   - `EventBus` interface: `subscribe(taskId, cb): () => void` (returns unsubscribe fn), `publish(taskId): void`, `close(): void` (drops all subscriptions).
   - `createEventBus(): EventBus` — `Map<TaskId, Set<callback>>`. Publish iterates subscribers for the taskId; iteration is over a snapshot so a callback can unsubscribe itself mid-iteration without skipping siblings (D5).
   - `withPublishing(store: Store, bus: EventBus): Store` — Store decorator that wraps `createTask`, `appendEvent`, and `updateTaskStatus` to call `bus.publish(taskId)` after each successful write. Read methods (`loadTask`, `getStatus`, `listTasks`, `listPendingEligible`, `getEvents`) pass through unchanged. `close()` closes both the underlying Store and the bus.
3. **`server/src/runner/scheduler.ts`** — extended:
   - `createRunner(store, registry?, bus?)` accepts an optional `EventBus`. Default: `createEventBus()`. The Runner stores the bus in its closure and exposes it as `runner.events: EventBus`.
   - `Runner` interface gains a `readonly events: EventBus` field.
   - No changes to the tick / dispatch / handle implementation — the bus is wired purely via the wrapped store (D4). The scheduler doesn't know about the bus; it just writes to `store` (which is the publishing wrapper at production-wiring time).
4. **`server/src/runner/index.ts`** — extended:
   - `createRunnerForProject` constructs `const bus = createEventBus()`, then `const publishingStore = withPublishing(createStore(db), bus)`, then `recoverOrphans(publishingStore)` (so orphan-recovery transitions also publish), then `createRunner(publishingStore, undefined, bus)`. The Runner's `events` field is the same `bus` reference; subscribers see all writes, including the orphan-recovery transitions that fire before any executor exists.
   - Re-exports added: `EventBus`, `createEventBus`, `withPublishing`.
5. **`server/src/server.ts`** — one new line: `app.route("/api/tasks", tasksRoute);` mounted alongside the existing `/api/_health`, `/api/project`, `/api/docs` routes. `03-hitl-gate` will add `app.route("/api/tasks", hitlRoute)` next to it; Hono allows multiple `.route()` calls onto the same prefix and they compose by URL.
6. **SSE contract** (`GET /api/tasks/:id/stream`):
   - Open: server resolves the task (404 if missing) → opens SSE → emits all events with `seq > lastSeq` where `lastSeq` is parsed from the `Last-Event-ID` header (default `-1`, meaning emit everything starting at seq 0).
   - Subscribe: handler subscribes via `runner.events.subscribe(taskId, callback)`. Callback is invoked on every `bus.publish(taskId)`. Callback re-queries `store.getEvents(taskId, { afterSeq: emittedSeq })`, writes each event as `id: <seq>\ndata: <json>\n\n`, and updates `emittedSeq`.
   - Heartbeat: every 15 s, write `: ping\n\n` (SSE comment line — clients ignore but the TCP write keeps the connection alive through proxies). Same constant as `01-ui/10-orchestration` D7's contract.
   - Auto-close: 60 s after the task's status first enters `COMPLETE`, `FAILED`, or `CANCELLED`. Implementation: the subscribe-callback checks the task status after publishing; on first terminal-status observation, start a 60 s timer that closes the stream (`event: close\ndata: {"reason":"task_terminal"}\n\n` then `res.end()`). Matches the transcript bootstrap's `SSE_AUTO_CLOSE_QUIET_MS` constant.
   - Unsubscribe: on client disconnect (Hono's `c.req.raw.signal.aborted` / `stream.aborted`), call the unsubscribe function and clear the heartbeat + auto-close timers. No leaked subscribers (D6).
   - Concurrency: multiple SSE clients can subscribe to the same task; each gets its own subscriber slot in the bus's `Set<callback>`. The bus does not deduplicate — every subscriber callback fires per publish.
7. **Validation**:
   - `POST /api/tasks` body is validated by `validateTaskInput(raw)` (already shipped in `01-store-schema`). On `result.ok === false`, return 400 with `{ errors: result.errors }` matching the existing pattern used by `routes/docs.ts:33` (`return c.json({ errors: result.errors }, 422)` — TODO: pick 400 vs 422 consistently, see D7).
   - The validator applies defaults (`source: "operator_injected"`, `dependsOn: []`, `resourceClaims: []`, `priority: 0`) when ajv is configured with `useDefaults: true`. Confirm `01-store-schema`'s `validateTaskInput` is configured this way; if not, the route applies the same defaults explicitly before calling `runner.createTask` (D8).
8. **Tests**:
   - `server/test/tasks.test.ts` — Hono `app.request()` against a fresh in-memory project context. Cases:
     - GET / empty list → 200 `{ tasks: [] }`.
     - GET / with seeded tasks → 200 `{ tasks: [...] }` ordered `created_at DESC`.
     - GET /?status=PENDING&status=BLOCKED&type=noop&parent=<id> → applies all filters.
     - GET /:id → 200 `{ task, events }` with events seq-ordered ASC.
     - GET /:id → 404 on missing id.
     - GET /:id/stream open + first event delivery → SSE frame with `id: <seq>\ndata: <json>`.
     - GET /:id/stream with `Last-Event-ID: 1` → only emits events with seq > 1.
     - GET /:id/stream auto-close after terminal status + 60 s (use `vi.useFakeTimers()` to compress the wait).
     - GET /:id/stream → 404 on missing id (HTTP status, not SSE).
     - POST / with valid body → 201, task is COMPLETE (noop), events include creation + dispatch + completion.
     - POST / with missing `type` → 400 `{ errors: [...] }`.
     - POST / with malformed JSON → 400 `{ error: "invalid_json" }`.
     - POST / with `dependsOn: [missing-id]` → 201 (accepts; task stays BLOCKED — per parent §Open Issue, no creation-time validation).
   - `server/test/runner/events.test.ts` — unit tests for the EventBus + withPublishing wrapper:
     - `subscribe + publish` → callback fires with taskId.
     - Multiple subscribers on same taskId → all fire.
     - Subscriber on `taskA` does NOT fire on `publish("taskB")`.
     - Unsubscribe function removes the subscriber.
     - Calling unsubscribe twice is idempotent.
     - `close()` drops all subscribers; subsequent `publish` is a no-op.
     - `withPublishing(store, bus)` — every Store write method publishes the right taskId; read methods don't publish; the wrapper preserves return values.
     - Snapshot-iteration: a callback that unsubscribes itself during publish does not skip subsequent callbacks for the same task (D5 regression test).

**Out of scope for this child:**

- **`POST /api/tasks/:id/approve` and `/reject`.** Those live in `server/src/routes/hitl.ts` (`03-hitl-gate`). The `:id` URL space under `/api/tasks` is shared but Hono composes multiple `.route("/api/tasks", ...)` mounts cleanly — each router declares its own paths.
- **`PATCH /api/tasks/:id`** for breakpoint insertion / priority override (parent §Out of scope, deferred to v2).
- **`POST /api/tasks/:id/cancel`** — parent §Open Issues, deferred to `06-agent-dispatcher`.
- **Bulk endpoints.** `POST /api/tasks` is one-task-per-request. Parent §Open Issues "no bulk endpoints"; revisit when the daemon lands.
- **Authentication.** Inherits `04-api-server` D4 (127.0.0.1-bind, no tokens).
- **Cross-origin / CORS.** Same as existing endpoints — same-origin via Vite proxy in dev, no CORS at all in prod.
- **OpenAPI / typed client codegen.** Parent §Open Issues, inherited from `04-api-server`.
- **Rate limiting / backpressure.** Single-operator local-only.
- **The `human_review` executor + suspension semantics.** That's `03-hitl-gate`. v1 with only `noop` registered: a `human_review` task injected via `POST /api/tasks` lands BLOCKED with `blocked_no_executor` until `03-hitl-gate` ships its executor.
- **UI consumer migration.** `useTaskList` / `useTask` / `useLogStream` are flipped to dual-source by `05-ui-hook-migration`. With `04-api-endpoints` merged, the runner endpoints exist; with `05-ui-hook-migration` merged, the UI consumes them.
- **Transcript bootstrap retirement.** `06-agent-dispatcher`'s scope. The new `/api/tasks*` endpoints coexist with `/api/transcripts*` until then.
- **Persistent or cross-process pub/sub.** `EventBus` is an in-process `Map`. A future multi-process architecture would need a real message broker; out of v1 PRD scope.
- **Schema changes.** No migrations. Reuses the schema and types from `01-store-schema`.
- **Detailed error taxonomy beyond the four codes named above** (200, 201, 400, 404). 422 vs 400 for schema failures is a D7 decision; no other status codes added.

---

## Design

### Repository layout after this child

```
ledger/
├── docs/
│   └── 05-task-runner/
│       └── 04-api-endpoints.md                       # this spec
├── server/
│   ├── src/
│   │   ├── server.ts                                 # MODIFIED — one new app.route() line
│   │   ├── routes/
│   │   │   ├── docs.ts                               # unchanged
│   │   │   ├── health.ts                             # unchanged
│   │   │   ├── project.ts                            # unchanged
│   │   │   └── tasks.ts                              # NEW — GET / + GET /:id + GET /:id/stream + POST /
│   │   └── runner/
│   │       ├── index.ts                              # MODIFIED — wires bus into createRunnerForProject; re-exports
│   │       ├── store.ts                              # unchanged
│   │       ├── scheduler.ts                          # MODIFIED — adds bus param + Runner.events field
│   │       ├── conflict.ts                           # unchanged
│   │       ├── executors.ts                          # unchanged
│   │       ├── ids.ts                                # unchanged
│   │       ├── migrations/                           # unchanged
│   │       └── events.ts                             # NEW — EventBus + withPublishing wrapper
│   └── test/
│       ├── tasks.test.ts                             # NEW — endpoint tests via app.request()
│       └── runner/
│           ├── events.test.ts                        # NEW — EventBus + withPublishing unit tests
│           ├── conflict.test.ts                      # unchanged
│           ├── executors.test.ts                     # unchanged
│           ├── scheduler.test.ts                     # unchanged
│           ├── orphan-recovery.test.ts               # unchanged
│           ├── store.test.ts                         # unchanged
│           └── migrations.test.ts                    # unchanged
└── (app/, packages/parser/)                          # unchanged
```

### `EventBus` + `withPublishing`

```ts
// server/src/runner/events.ts
import type { TaskId } from "@ledger/parser";
import type { Store } from "./store.js";

export type TaskChangedCallback = (taskId: TaskId) => void;

export interface EventBus {
  /** Subscribe to publish events for one taskId. Returns an unsubscribe fn. */
  subscribe(taskId: TaskId, cb: TaskChangedCallback): () => void;
  /** Notify all subscribers for a taskId. No-op if no subscribers. */
  publish(taskId: TaskId): void;
  /** Drop all subscriptions. */
  close(): void;
}

export function createEventBus(): EventBus {
  const subs = new Map<TaskId, Set<TaskChangedCallback>>();

  return {
    subscribe(taskId, cb) {
      let set = subs.get(taskId);
      if (set === undefined) {
        set = new Set();
        subs.set(taskId, set);
      }
      set.add(cb);
      return () => {
        const s = subs.get(taskId);
        if (s === undefined) return;
        s.delete(cb);
        if (s.size === 0) subs.delete(taskId);
      };
    },
    publish(taskId) {
      const set = subs.get(taskId);
      if (set === undefined) return;
      // Snapshot to allow a callback to unsubscribe itself mid-iteration (D5).
      for (const cb of Array.from(set)) cb(taskId);
    },
    close() {
      subs.clear();
    },
  };
}

export function withPublishing(store: Store, bus: EventBus): Store {
  return {
    createTask(input) {
      const t = store.createTask(input);
      bus.publish(t.id);
      return t;
    },
    appendEvent(taskId, event) {
      const ev = store.appendEvent(taskId, event);
      bus.publish(taskId);
      return ev;
    },
    updateTaskStatus(id, transition, expected) {
      const t = store.updateTaskStatus(id, transition, expected);
      bus.publish(id);
      return t;
    },
    loadTask: store.loadTask,
    getStatus: store.getStatus,
    listTasks: store.listTasks,
    listPendingEligible: store.listPendingEligible,
    getEvents: store.getEvents,
    close() {
      bus.close();
      store.close();
    },
  };
}
```

The wrapper does not change behavior for any caller — every method's return value is identical to the underlying Store's. The only observable effect is that subscribers see a notification after every successful write. Failed writes (validation errors thrown by the Store, FK violations) propagate normally and do not publish.

### Runner integration

```ts
// server/src/runner/scheduler.ts (excerpt of changes)
export interface Runner {
  readonly store: Store;
  readonly events: EventBus;                            // NEW
  createTask(input: TaskInput): Task;
  registerExecutor(type: Task["type"], exec: Executor): void;
  tick(): void;
  close(): void;
}

export function createRunner(
  store: Store,
  registry: ExecutorRegistry = createDefaultRegistry(),
  bus: EventBus = createEventBus(),                     // NEW — defaults to a fresh bus
): Runner {
  // ... existing body unchanged ...
  return {
    store,
    events: bus,                                        // NEW
    // ... rest unchanged ...
  };
}
```

The defaulted `bus` parameter means existing call sites (`createRunner(store)` in tests) continue to work — they get a fresh bus they can ignore. Tests that need to assert publish behavior pass an explicit bus instance and subscribe to it.

```ts
// server/src/runner/index.ts (excerpt of changes)
import { createEventBus, withPublishing } from "./events.js";

export type { EventBus } from "./events.js";
export { createEventBus, withPublishing } from "./events.js";

export function createRunnerForProject({ projectRoot }: { projectRoot: string }): Runner {
  const dbPath = join(projectRoot, ".ledger", "runner.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const { applied } = applyMigrations(db);
  if (applied.length > 0) {
    console.log(`runner: applied migration(s) ${applied.map(String).join(", ")}`);
  } else {
    const version = db.pragma("user_version", { simple: true }) as number;
    console.log(`runner: schema is current at user_version=${String(version)}`);
  }

  const bus = createEventBus();
  const store = withPublishing(createStore(db), bus);

  const { recovered } = recoverOrphans(store);
  if (recovered > 0) {
    console.log(`runner: recovered ${String(recovered)} orphaned task(s) (RUNNING → FAILED)`);
  }

  return createRunner(store, undefined, bus);
}

export function createStoreForProject(project: { projectRoot: string }): Store {
  // Backwards-compat shim — still returns a publishing-wrapped Store, since
  // we cannot easily un-wrap. Callers that subscribe via runner.events still work;
  // callers that don't subscribe see no behavior change.
  return createRunnerForProject(project).store;
}
```

### `tasks.ts` route

```ts
// server/src/routes/tasks.ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { validateTaskInput } from "@ledger/parser";
import type { TaskStatus, TaskType, TaskId } from "@ledger/parser";
import type { ServerEnv } from "../server.js";

const TERMINAL_STATUSES = new Set<TaskStatus>(["COMPLETE", "FAILED", "CANCELLED"]);
const SSE_HEARTBEAT_MS = 15_000;
const SSE_AUTO_CLOSE_MS = 60_000;

export const tasksRoute = new Hono<ServerEnv>()
  .get("/", (c) => {
    const project = c.get("project");
    const url = new URL(c.req.url);
    const status = url.searchParams.getAll("status") as TaskStatus[];
    const type = url.searchParams.getAll("type") as TaskType[];
    const parent = url.searchParams.get("parent") ?? undefined;
    const filter = {
      ...(status.length > 0 ? { status } : {}),
      ...(type.length > 0 ? { type } : {}),
      ...(parent !== undefined ? { parent } : {}),
    };
    const tasks = project.runner.store.listTasks(filter);
    return c.json({ tasks });
  })
  .get("/:id", (c) => {
    const project = c.get("project");
    const id = c.req.param("id");
    const task = project.runner.store.loadTask(id);
    if (task === undefined) return c.json({ error: "task_not_found" }, 404);
    const events = project.runner.store.getEvents(id);
    return c.json({ task, events });
  })
  .get("/:id/stream", (c) => {
    const project = c.get("project");
    const id = c.req.param("id");
    const task = project.runner.store.loadTask(id);
    if (task === undefined) return c.json({ error: "task_not_found" }, 404);

    const lastEventIdHeader = c.req.header("Last-Event-ID");
    let lastSeq = -1;
    if (typeof lastEventIdHeader === "string") {
      const parsed = parseInt(lastEventIdHeader, 10);
      if (Number.isFinite(parsed)) lastSeq = parsed;
    }

    return streamSSE(c, async (stream) => {
      let emittedSeq = lastSeq;
      let terminalSince: number | undefined;

      async function flush(): Promise<void> {
        const fresh = project.runner.store.getEvents(id, { afterSeq: emittedSeq });
        for (const ev of fresh) {
          await stream.writeSSE({
            id: String(ev.seq),
            data: JSON.stringify(ev),
          });
          emittedSeq = ev.seq;
        }
        // Check terminal status after flushing.
        const current = project.runner.store.getStatus(id);
        if (current !== undefined && TERMINAL_STATUSES.has(current) && terminalSince === undefined) {
          terminalSince = Date.now();
        }
      }

      // Initial backfill — emit anything with seq > lastSeq.
      await flush();

      const unsubscribe = project.runner.events.subscribe(id, () => {
        // Synchronous callback can't await; defer to the next microtask.
        // We tolerate ordering: subscribers may see multiple publishes
        // collapsed into one flush — getEvents() reads everything new.
        void flush();
      });

      const heartbeat = setInterval(() => {
        void stream.writeSSE({ data: "", event: "ping" }).catch(() => undefined);
      }, SSE_HEARTBEAT_MS);

      const autoCloseTicker = setInterval(() => {
        if (terminalSince !== undefined && Date.now() - terminalSince >= SSE_AUTO_CLOSE_MS) {
          clearInterval(heartbeat);
          clearInterval(autoCloseTicker);
          unsubscribe();
          void stream.writeSSE({
            event: "close",
            data: JSON.stringify({ reason: "task_terminal" }),
          }).then(() => stream.close());
        }
      }, 1_000);

      stream.onAbort(() => {
        clearInterval(heartbeat);
        clearInterval(autoCloseTicker);
        unsubscribe();
      });

      // Keep the handler alive until the client disconnects or auto-close fires.
      // streamSSE awaits this promise; resolving it ends the response.
      await new Promise<void>((resolve) => {
        stream.onAbort(resolve);
      });
    });
  })
  .post("/", async (c) => {
    const project = c.get("project");
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const result = validateTaskInput(raw);
    if (!result.ok) {
      return c.json({ errors: result.errors }, 400);
    }
    const task = project.runner.createTask(result.value);
    return c.json({ task }, 201);
  });
```

The SSE handler is the densest piece. Key invariants:

- The `flush()` callback re-queries from `seq > emittedSeq` on every publish — robust to missed publishes (e.g., if two publishes fire faster than the JS event loop can drain, the second flush sees nothing new because the first already drained both).
- `subscribe()`'s callback is sync; `flush` is async. The `void flush()` is fire-and-forget — events are sent in the next microtask. This is intentional: SSE writes can be slow (network), and blocking the publisher (which is the scheduler's `bus.publish` call inside `withPublishing`) would block the scheduler's tick. The cost is that publishers don't get backpressure if a subscriber is slow; v1 acceptable since SSE clients are local-only.
- Terminal-status detection is checked after every flush. Once a terminal status is observed, `terminalSince` is set and the auto-close ticker (running every 1 s) will close the stream after 60 s have elapsed. The 60 s grace covers any trailing events that arrive shortly after the terminal transition.
- `stream.onAbort` cleans up both timers and unsubscribes. Multiple `onAbort` handlers are stacked — the second one resolves the awaited promise that keeps the handler alive. Hono's `StreamingApi` allows multiple onAbort registrations (verified against `hono@4.12.23` types; if it allows only one, we collapse into a single handler that does both jobs — see D9).

### `server.ts` mount

```ts
// server/src/server.ts (line added)
import { tasksRoute } from "./routes/tasks.js";
// ... existing imports unchanged ...

export function createServer(project: ProjectContext): Hono<ServerEnv> {
  const app = new Hono<ServerEnv>();
  app.use("*", logger());
  app.use("*", async (c, next) => { c.set("project", project); await next(); });
  app.route("/api/_health", healthRoute);
  app.route("/api/project", projectRoute);
  app.route("/api/docs", docsRoute);
  app.route("/api/tasks", tasksRoute);                  // NEW
  return app;
}
```

`03-hitl-gate` will add a second mount: `app.route("/api/tasks", hitlRoute)` after the line above. Hono merges multiple `.route()` mounts onto the same prefix by URL — both routers contribute non-overlapping paths (`/api/tasks/:id/approve` and `/:id/reject` for hitl; everything else for tasks).

### Acceptance check (manual)

A reviewer running the worktree must observe:

1. `pnpm install` unchanged from baseline.
2. `pnpm -C server typecheck`, `lint`, `build`, `test` exit zero. Test count delta ≈ +18 (≥13 endpoint tests + ≥5 EventBus tests).
3. `pnpm -C app typecheck`, `lint`, `build` exit zero. No app source touched.
4. `pnpm -C packages/parser test` unchanged.
5. Boot the server: `pnpm -C server dev /Users/dennis/code/ledger`. Existing endpoints still respond identically (`GET /api/_health`, `/api/project`, `/api/docs`, `/api/docs/:nodeId`). The new endpoints respond:
   - `curl http://127.0.0.1:4180/api/tasks` → `{"tasks":[]}` on a fresh DB.
   - `curl -X POST http://127.0.0.1:4180/api/tasks -H 'Content-Type: application/json' -d '{"type":"noop","title":"smoke"}'` → 201 with `task.status === "COMPLETE"`.
   - `curl http://127.0.0.1:4180/api/tasks` after the POST → returns the task.
   - `curl http://127.0.0.1:4180/api/tasks/<id>` → returns `{task, events}` with 3 events.
6. SSE smoke: `curl -N http://127.0.0.1:4180/api/tasks/<id>/stream` while injecting events via a second terminal (or a held `human_review` task once `03-hitl-gate` lands). Frames arrive within ~10 ms of the publish; heartbeats arrive every 15 s; the stream auto-closes 60 s after the task hits a terminal status.
7. `curl -H 'Last-Event-ID: 0' http://127.0.0.1:4180/api/tasks/<id>/stream` against a COMPLETE noop task emits only events with `seq > 0` (so seq 1 + seq 2 — the dispatch + completion events) and auto-closes after 60 s.
8. `curl http://127.0.0.1:4180/api/tasks/nonexistent` → 404 `{"error":"task_not_found"}`.
9. `curl http://127.0.0.1:4180/api/tasks/nonexistent/stream` → 404 (HTTP response, not an SSE frame).
10. `curl -X POST http://127.0.0.1:4180/api/tasks -H 'Content-Type: application/json' -d '{"type":"bogus","title":"x"}'` → 400 with `{errors: [...]}` (the `type` enum check fails).
11. `curl -X POST http://127.0.0.1:4180/api/tasks -H 'Content-Type: application/json' -d 'not json'` → 400 `{"error":"invalid_json"}`.

Operator note: items 1–4 + 9 + 10 + 11 are headless-verifiable (via `app.request()` in `tasks.test.ts`); items 5–8 require a live server + curl.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Hono's `streamSSE` helper (`hono/streaming`) for the SSE handler, not a hand-rolled `Response` with a `ReadableStream` | `streamSSE` provides `writeSSE({id, data, event})`, `onAbort`, `stream.close()`, and the right HTTP headers (`text/event-stream`, `Cache-Control: no-store`, `Connection: keep-alive`) by default. Pinned at `hono@4.12.23` (current workspace). Hand-rolling would duplicate that surface for no gain. |
| D2 | The pub/sub is a `withPublishing(store, bus)` Store decorator, not direct `bus.publish()` calls inside `scheduler.ts` | Two reasons: (a) **minimizes shared-file conflict surface with `03-hitl-gate`** which also extends `scheduler.ts` (per leaf-workflow known-limitation "parallel-worktree shared-file conflicts"); the only `scheduler.ts` change here is the bus param + `events` field — no per-write-site changes. (b) Every Store write goes through the decorator, including `recoverOrphans` and any direct `store.updateTaskStatus` calls that future sub-leaves might add — the publish couldn't be forgotten. The cost is one indirection per write; negligible. |
| D3 | Malformed `status`/`type` query params are passed through as no-match filters (return empty list), NOT rejected with 400 | The Store's `listTasks` builds a dynamic `status IN (?, ?, ...)` query. An unknown status (e.g., `?status=FROOB`) generates `status IN ('FROOB')` which matches zero rows. Rejecting at the route level would require duplicating the `TaskStatus` / `TaskType` enum check from the schema; the empty-result behavior is already defensive and unambiguous (the operator sees zero results and corrects). Future hardening (a real 400) is mechanical when an OpenAPI spec lands. |
| D4 | Scheduler `tick`/`dispatch` code is unchanged — no per-write-site `bus.publish` calls | Follows from D2. The bus is wired purely via the wrapped Store. The scheduler doesn't import `events.ts`; the file's diff in this child is constrained to: (a) `EventBus` import in `scheduler.ts`'s type imports, (b) `bus: EventBus = createEventBus()` constructor param, (c) `events: bus` in the returned object. Three lines, all in `createRunner`'s signature/return. |
| D5 | `bus.publish` iterates over an `Array.from(set)` snapshot, not the live `Set` | Allows a subscriber callback to unsubscribe itself (or another subscriber) mid-publish without skipping siblings. The alternative — iterating the live `Set` — would skip the next element if the current callback removed itself. Tested explicitly. |
| D6 | SSE subscriber cleanup is via `stream.onAbort` registering an unsubscribe + interval clears | Hono's `StreamingApi` exposes `onAbort` which fires on client disconnect (TCP close, browser navigation, fetch AbortController). Without this, every SSE connection leaks a subscriber. v1's connection count is small (one operator's browser tabs) but the leak compounds across reconnects during dev hot-reloads. |
| D7 | Schema validation failures return 400 (Bad Request), not 422 (Unprocessable Entity) | The existing `routes/docs.ts:33` returns 422 for `validateDocNode` failures. Inconsistent with HTTP convention (422 is for syntactically-valid but semantically-invalid bodies — appropriate for `validateDocNode` since the JSON is well-formed and the schema mismatch is semantic). For `validateTaskInput`, returning 400 is honest: the operator is submitting an invalid request that should never have been sent. The inconsistency between routes is logged as an Open Issue; coordinated cleanup deferred. |
| D8 | The route does NOT re-apply schema defaults manually; trusts `validateTaskInput` with `useDefaults: true` | `01-store-schema` configures ajv with `useDefaults: true` (per its §JSON Schemas paragraph: "the validator constructs ajv with `useDefaults: true`"). The route's `result.value` already has defaults populated; no need to duplicate. If the implementer finds the ajv config doesn't apply defaults as documented, fall back to explicit per-field defaults matching the schema (`source ?? "operator_injected"`, etc.) and log a follow-up. |
| D9 | Multiple `stream.onAbort` handlers stacked, if Hono allows; otherwise one combined handler | Verified Hono's `StreamingApi.onAbort` accepts repeated registrations (verified against `hono@4.12.23` source). If a future Hono version changes this, the implementer collapses to a single `onAbort(() => { clearInterval(heartbeat); clearInterval(autoCloseTicker); unsubscribe(); resolveKeepAlive(); })`. Same semantics. |
| D10 | The `flush()` callback queries `getEvents({ afterSeq: emittedSeq })` on every publish — never trusts a single notify to mean exactly one event | Decouples subscriber from publisher. If two publishes race and the JS event loop coalesces them, the second flush sees nothing new (already drained). If the bus is ever extended to batch notifications, no subscriber changes. Costs one indexed SELECT per publish; sub-millisecond at v1 scale (events table indexed `(task_id, seq)`). |
| D11 | The auto-close ticker runs at 1 Hz (1000 ms interval), checking elapsed time against `terminalSince` | Compromise between latency and CPU. A 100 ms ticker would close ~one second earlier on average; 1 Hz matches the transcript bootstrap's interval. The 60 s grace is the contract — sub-second precision on its expiry is not. |
| D12 | `withPublishing` wraps reads as pass-through method references, not as new closures | `loadTask: store.loadTask` (no `() => store.loadTask(...)`) — preserves `this` binding correctly because the Store methods are factory-closure functions, not class methods. Saves allocation. If any Store method ever relies on `this`, this breaks; flagged in Open Issues. |

---

## Open Issues

- **SSE backpressure absent.** A slow subscriber (slow client / paused tab) doesn't slow the publisher. The bus fires `void flush()` which kicks off async writes; if the client never drains the network buffer, the Node TCP write queue fills until the process is OOM. v1 single-operator-local: extremely unlikely. Logged for if multi-client / WAN access lands. *(Priority: LOW.)*
- **`bus.publish` is fully synchronous; a callback that throws halts other callbacks for the same task.** v1 callbacks are only the SSE handler's `void flush()`, which can't throw (the catch on flush would log internally). But if `03-hitl-gate` or `06-agent-dispatcher` later add their own subscribers, an uncaught throw would block siblings. Add a try/catch wrapper around each callback invocation in `bus.publish` if a future use case introduces non-fire-and-forget callbacks. *(Priority: LOW.)*
- **`withPublishing` pass-through methods break if Store methods relied on `this`.** Today they don't (the Store is a factory-closure pattern). If `01-store-schema` ever refactors to a class with `this`-bound methods, the wrapper's method references would lose binding. D12 logs the assumption. *(Priority: TRIVIAL — depends on future architectural drift.)*
- **422 vs 400 inconsistency between `docs.ts` and `tasks.ts`.** D7 chose 400 for this route; `routes/docs.ts:33` uses 422. Coordinated cleanup deferred. *(Priority: LOW.)*
- **No `createStoreForProject` un-wrap.** The backwards-compat shim still returns the publishing-wrapped Store. Tests that constructed a Store via this shim and called `store.updateTaskStatus` directly would still see publish side-effects; with no subscribers, this is a no-op. If some future test wants a "raw" Store explicitly without a bus, it should call `createStore(new Database(":memory:"))` directly (which is what `server/test/runner/store.test.ts` already does). *(Priority: TRIVIAL — observability concern, not a correctness one.)*
- **SSE `event: ping` vs SSE comment `: ping`.** D11 spec uses `event: ping` because Hono's `writeSSE` requires `data`. The transcript bootstrap uses the SSE comment form (`: ping\n\n`) which is more idiomatic (clients ignore the comment entirely). Switching to `data: ""` with `event: "ping"` is observed by EventSource as a "ping" event — clients that pre-register an event listener may see a stream of empty pings. Existing UI hooks (`useLogStream`) ignore unknown event types so this is non-breaking; logged for if a heartbeat-counter ever matters. *(Priority: TRIVIAL.)*
- **No SSE rate-limit on `getEvents` per publish.** If the scheduler emits 1000 events in rapid succession (executor reporting many tool calls), each triggers a flush. At v1 scale this is dozens of microseconds; at v1000+ events-per-second it would dominate the SSE handler. Acceptable for v1; revisit if executor verbosity grows. *(Priority: LOW.)*
- **No body-size limit on `POST /api/tasks`.** Hono accepts arbitrarily large bodies. A malicious operator could send a 100 MB `title`. v1 local-only; ignore. *(Priority: TRIVIAL.)*
- **No `If-None-Match` / caching on `GET /api/tasks`.** Every list call re-queries. At v1 scale (≤100 tasks) trivial. Logged for when UI polling cadence matters. *(Priority: TRIVIAL.)*
- **Hono `streamSSE` behavior under `app.request()` testing.** `streamSSE` returns a `Response` with a streaming body; Hono's test harness exposes the body as a `ReadableStream`. Reading the first frame in a test requires `await response.body!.getReader().read()`. The SSE auto-close test using `vi.useFakeTimers()` may interact poorly with the real `setInterval` inside `streamSSE`'s heartbeat — implementer to verify. If `streamSSE` doesn't cooperate with fake timers, fall back to a real-time test with a 1 ms heartbeat constant injected via env override (or just skip the auto-close timer test headlessly and rely on the operator's stage-8 curl). *(Priority: LOW — discovery risk.)*

---

## Spec Review (2026-05-27)

*(none yet — pre-review)*

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this child moves to `VERIFY`, the verifier confirms:

1. The full Acceptance check list (1–11) passes.
2. `GET /api/tasks` empty / with-data, filter-composition (`status` × `type` × `parent`), default ordering.
3. `GET /api/tasks/:id` 200 with task + events; 404 on missing id.
4. `POST /api/tasks` 201 on valid; 400 on schema failure; 400 on invalid JSON; `result.value` defaults applied (source, dependsOn, resourceClaims, priority).
5. `GET /api/tasks/:id/stream` opens, emits initial backfill, emits subsequent events via the bus, sends heartbeats, auto-closes 60 s after a terminal status. `Last-Event-ID` resume skips already-emitted events. Client disconnect unsubscribes.
6. `EventBus.subscribe` returns a working unsubscribe fn; `publish` only notifies subscribers for the named taskId; closing the bus drops everyone. Snapshot iteration: a callback that unsubscribes itself does not skip siblings.
7. `withPublishing` publishes on every write method; pass-through on reads; preserves return values byte-for-byte.
8. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` exit zero at the workspace root.
9. No regressions on `04-api-server`'s existing endpoints (`/api/_health`, `/api/project`, `/api/docs`, `/api/docs/:nodeId`).
10. No regressions on `02-scheduler`'s tests (the `bus` parameter defaults preserve existing behavior).
11. The `02-scheduler` Open Issue "No in-process pub/sub for events" is struck-through with a pointer to this child.

---

## Children

None.
