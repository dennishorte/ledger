# Task Runner

**Node ID:** `05-task-runner`
**Parent:** project root (`docs/00-project.md`)
**Status:** APPROVED
**Created:** 2026-05-27
**Last Updated:** 2026-05-27 (SPEC_REVIEW → APPROVED — audit applied)

**Dependencies:** `04-api-server`

---

## Requirements

Stand up the **in-house task runner** that PRD §5 commits to building natively in TypeScript on SQLite — DAG scheduling, resource locking, parallelism, HITL gates, and an append-only event log. Today the orchestration data layer is `01-ui/10-orchestration`, which derives a *descriptive* view of work by parsing Claude Code transcript JSONL after the fact. That bootstrap is honest about what it is: a phase-1 observability surface, not a control surface (PRD §11 explicit Open Issue: "Transcript ingestion couples the orchestration data layer to one agent runtime"). The runner replaces the descriptive view with a **prescriptive** one — tasks are *declared* with resource claims before execution, the scheduler enforces dependency ordering and write-claim non-conflict, and every state transition lands as a typed event in a queryable log.

This is the **control-surface hinge node.** `04-api-server` ships the project-scoped HTTP transport; this node fills it with a real task substrate. `06-agent-dispatcher` mounts onto it by registering Claude Code as the executor for `implement` / `spec_review` / `verify` task types; `07-health-daemon` mounts onto it by enqueuing `doc_refactor` / `reverify` / `issue_triage` tasks. Both downstream nodes are no-ops without the runner's tasks table, event log, and scheduler tick.

The end-state contract — what "this node done" looks like across all children:

1. **A SQLite-backed task store** at `.ledger/runner.db` (one database file per project, colocated with `.ledger/project.json` per PRD §7.1). Two tables: `tasks` (a materialized projection of the latest task state) and `events` (the append-only log — the source of truth from which `tasks` is a left-fold). A `migrations` table tracks applied schema versions; migrations are versioned `.sql` files run transactionally on server start. `better-sqlite3` as the driver (D1).
2. **A scheduler with a set-intersection conflict primitive.** A scheduler tick picks the highest-priority `PENDING` task whose `dependsOn` IDs are all `COMPLETE` and whose `resourceClaims` set does not conflict (under set-intersection on `(kind, target)` with at least one side `write`) with any in-flight task. Tick is event-driven, not polled (D5). Doc-refactor guard (PRD §6.5) is **not** a special-case code path — it falls out of `doc_refactor` tasks declaring an exclusive write claim on their target node (D6).
3. **An in-process executor registry.** The runner dispatches `PENDING → RUNNING` transitions to executors keyed by task type. v1 ships two: `noop` (synthetic, immediately COMPLETE; for testing) and `human_review` (blocks indefinitely in `AWAITING_HUMAN_REVIEW` until external approve/reject). All other task types (`implement`, `spec_draft`, `spec_review`, `verify`, `reverify`, `doc_refactor`, `issue_triage`, `project_status_review`) **have no executor in v1** — they sit in the queue as `PENDING` or `BLOCKED` until `06-agent-dispatcher` registers Claude Code as their executor (D8).
4. **A HITL gate end-to-end.** `human_review` tasks declare their predecessor's write claims and a `reviewPayload`. The scheduler sets `AWAITING_HUMAN_REVIEW` on dispatch and suspends. `POST /api/tasks/:id/approve` transitions `COMPLETE`; `POST /api/tasks/:id/reject` transitions `FAILED` with the rejection rationale captured in the event log, optionally enqueueing a follow-up task with the rationale as input. The scheduler re-ticks on each external transition. This is the framework's substrate for PRD §8.4's task-control console.
5. **Six new HTTP endpoints** on the existing Hono server from `04-api-server`. Read surface: `GET /api/tasks`, `GET /api/tasks/:id`, `GET /api/tasks/:id/stream` (SSE — log stream over the events table, with `Last-Event-ID` resume). Write surface: `POST /api/tasks` (operator injection — the only path to put a task into the queue in v1, since no dispatcher exists), `POST /api/tasks/:id/approve`, `POST /api/tasks/:id/reject`. No agent dispatch endpoint (that's `06-agent-dispatcher`'s `POST /api/dispatch`).
6. **UI consumer migration — additive, not replacing.** `useTaskList` / `useTask` / `useLogStream` start consulting `/api/tasks*` *in addition to* `/api/transcripts*`. Tasks from both sources are merged into a single list (operator-injected runner tasks coexist with transcript-derived sessions until `06-agent-dispatcher` retires the transcript path). `01-ui/04-tasks` gains "Approve" and "Reject" buttons in the inspector for tasks where `status === "AWAITING_HUMAN_REVIEW"` and `transcriptPath` is absent (i.e., runner-emitted). The transcript-derived rows render unchanged.
7. **Tests at every layer.** Store (migrations apply transactionally; round-trip task + events through the typed API; foreign-key constraints enforce parent/event integrity). Scheduler (dep ordering; conflict primitive; tick is fair under starvation; concurrent ticks are idempotent). HITL (approve transitions COMPLETE; reject captures rationale; suspension survives process restart by re-reading status from the DB). Endpoints (Hono `app.request()` against an in-memory DB; SSE resume from `Last-Event-ID`). UI hooks (mocked fetch; both-source merge; AWAITING_HUMAN_REVIEW button gating).

Decomposed into five sub-leaves per §Children. Each sub-leaf inherits this parent's Decisions and Open Issues, owns its own Spec Review + Implementation Review audit tables, and gates on its own Verification list. The five-leaf decomposition is deliberate — it mirrors `04-api-server`'s carve-up after that parent's first single-leaf implementer dispatch wall-clocked out at ~10–15% completion. PRD §5's 1000–1500 LOC estimate against five distinct concerns (store, scheduler, HITL, endpoints, UI) is the same shape, and the single-pass failure mode is the same risk.

**Out of scope for v1:**

- **All `06-agent-dispatcher` concerns.** No MCP integration, no Claude Code subprocess management, no transcript ingestion replacement. The runner's executor for every "real" task type (`implement`, `verify`, `spec_review`, etc.) is unregistered in v1 — those tasks stay `PENDING` indefinitely if injected. v1 only proves end-to-end behaviour with `noop` and `human_review` synthetic flows. `06-agent-dispatcher` registers real executors against the runner's `registerExecutor(type, fn)` API.
- **All `07-health-daemon` concerns.** No background process scanning for stale nodes, oversized docs, or orphaned issues. No daemon-enqueued tasks. The runner accepts task injection via `POST /api/tasks` but does not enqueue anything itself in v1. When the daemon lands it becomes a separate process that hits the same endpoint with `source: "daemon_triggered"`.
- **Replay mode.** PRD §8.6 explicitly DEFERRED in v0.5.1 (out of v1 scope). The event log primitive *is* in scope — it's load-bearing for the runner itself — but the replay UI and any "rewind state to event N" tooling are not. Replay is a `SELECT` over the historical range when it ships; v1 just ensures the events table can answer that query.
- **Retiring `01-ui/10-orchestration` transcript ingestion.** The transcript bootstrap continues to run. Removing it would leave the UI empty until `06-agent-dispatcher` lands. The additive coexistence in Requirements item 6 is the v1 contract; full retirement is `06-agent-dispatcher`'s deliverable per the PRD §14 Open Issue "Transcript ingestion couples the orchestration data layer to one agent runtime."
- **Cross-project task scheduling.** PRD §7.1 commits to one project per server process. The runner's DB is per-project; the scheduler is per-process. Multi-project routing is not in scope.
- **Distributed execution / remote workers.** All executors run in the API server's Node process. No worker pools, no message queue, no Redis. The runner is in-process plumbing. PRD §5: "Same stack as the UI; no language boundary."
- **Priority inheritance / preemption / quotas.** Priority is a single integer; FIFO within priority. No "high-priority task preempts running low-priority task." No per-resource quotas. v1 scheduler is the simplest viable thing.
- **Task cancellation while RUNNING.** v1 cannot cancel a task whose executor is mid-flight (the `noop` executor is synchronous so cancellation is moot; the `human_review` executor is already in a suspended state and is "cancellable" by `reject`). `POST /api/tasks/:id/cancel` is logged as a follow-up Open Issue — it requires cooperative executor abort which is `06-agent-dispatcher`'s problem (kill the Claude Code subprocess).
- **Backpressure / rate limiting.** Task injection has no caps. Single-operator local-only — no abuse vector. The scheduler's natural rate is "as fast as executors complete," which is `human_review`-bounded in v1.
- **Authentication / authorization on write endpoints.** Inherits the v1 posture from `04-api-server` D4 — server binds to `127.0.0.1`, OS firewall is the perimeter, no tokens. POST endpoints are unauthenticated for the same reason GET endpoints are.
- **Schema migrations on the document tree.** This node's migrations are SQL files for the runner's own DB. The doc tree's "migrations" are markdown rewrites and live in the `doc_refactor` task type itself — they're tasks, not schema files.
- **Garbage collection of completed tasks or old events.** v1 keeps every task and every event forever in the DB. At a few hundred tasks per project the file stays under 10 MB; revisit when it doesn't. A `VACUUM` cron is a follow-up. Old events are the only meaningful storage cost; the events-per-task ratio is bounded by what executors emit.
- **Observability beyond the event log.** No metrics export, no `/api/runner/metrics`, no Prometheus, no OpenTelemetry. The event log is the metric source; aggregation is the UI's job.
- **Operator CLI subcommands** (`ledger task list`, `ledger task approve`, etc.). The UI calls the API directly. A CLI surface is a polish item; defer until the UI gaps become operator pain.
- **Breakpoint insertion** (PRD §8.4: "pause execution after a specified task completes"). The closest v1 analog is for the operator to manually `POST /api/tasks` a `human_review` task with the to-be-paused task in its `depends_on` — but this requires the operator to know the dep IDs and to time the insertion before the dependent task is dispatched. A proper breakpoint surface (post-hoc `dependsOn` insertion, or scheduler-level "pause-after" hooks) is deferred; logged as an Open Issue.
- **Priority override** (PRD §8.4: "bump a queued task ahead of non-dependent tasks"). The `priority` column exists on `tasks` and is honoured by the scheduler's `ORDER BY priority DESC`, but no v1 endpoint mutates it after creation. `PATCH /api/tasks/:id` for priority + claims is deferred to a v2 task-control surface paired with breakpoint insertion.

---

## Design

### Repository layout after this node

```
ledger/                                          # repo root (pnpm workspace — already)
├── .ledger/
│   ├── project.json                             # exists (03-project-metadata)
│   └── runner.db                                # new — runtime, gitignored (D2)
├── docs/
│   ├── 05-task-runner/
│   │   ├── 00-task-runner.md                    # this spec (parent)
│   │   ├── 01-store-schema.md                   # child — store + migrations + typed API
│   │   ├── 02-scheduler.md                      # child — tick loop + conflict primitive
│   │   ├── 03-hitl-gate.md                      # child — human_review semantics + approve/reject
│   │   ├── 04-api-endpoints.md                  # child — /api/tasks* HTTP surface
│   │   └── 05-ui-hook-migration.md              # child — useTask*/useLogStream additive migration
│   └── ...                                      # existing tree
├── server/                                      # existing (04-api-server) — extended
│   ├── package.json                             # adds better-sqlite3 dep
│   ├── src/
│   │   ├── runner/                              # new module — runner plumbing
│   │   │   ├── index.ts                         # public surface: Runner class + factory
│   │   │   ├── store.ts                         # SQLite typed API (createTask, appendEvent, ...)
│   │   │   ├── migrations/
│   │   │   │   ├── 001-initial.sql              # tasks + events + migrations tables
│   │   │   │   └── runner.ts                    # applies migrations transactionally on boot
│   │   │   ├── scheduler.ts                     # tick loop + dep-met + conflict primitive
│   │   │   ├── conflict.ts                      # pure set-intersection helper
│   │   │   ├── executors.ts                     # registry + noop + human_review built-ins
│   │   │   ├── events.ts                        # emit + subscribe + SSE bridge
│   │   │   └── types.ts                         # internal types (mirrors @ledger/parser/Task)
│   │   ├── routes/
│   │   │   └── tasks.ts                         # new — /api/tasks, /:id, /:id/stream,
│   │   │                                        #        POST /, /:id/approve, /:id/reject
│   │   ├── context.ts                           # extended — Runner instance on ProjectContext
│   │   └── server.ts                            # extended — mounts /api/tasks route
│   └── test/
│       ├── runner/                              # new — store + scheduler + HITL tests
│       │   ├── store.test.ts
│       │   ├── conflict.test.ts
│       │   ├── scheduler.test.ts
│       │   ├── executors.test.ts
│       │   └── hitl.test.ts
│       └── tasks.test.ts                        # new — HTTP endpoint tests
├── app/
│   └── src/
│       ├── lib/
│       │   ├── useTaskList.ts                   # modified — merge /api/tasks + /api/transcripts
│       │   ├── useTask.ts                       # modified — try /api/tasks/:id, fall back to /api/transcripts/:id
│       │   └── useLogStream.ts                  # modified — same dual-source pattern
│       └── components/tasks/
│           └── TaskInspector.tsx                # modified — Approve/Reject buttons for runner tasks
└── packages/parser/                             # existing — Task / LogEvent types may need light extension
    └── src/                                     # see §Type coordination below
```

The runner module is namespaced under `server/src/runner/` rather than promoted to its own workspace package (`packages/runner/`). Rationale in D3.

### SQLite schema (v1)

```sql
-- 001-initial.sql

CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY,                    -- UUIDv4
  type            TEXT NOT NULL,                       -- TaskType
  status          TEXT NOT NULL,                       -- TaskStatus
  title           TEXT NOT NULL,
  source          TEXT NOT NULL,                       -- TaskSource
  parent_task_id  TEXT REFERENCES tasks(id),           -- nullable
  depends_on      TEXT NOT NULL DEFAULT '[]',          -- JSON: TaskId[]
  resource_claims TEXT NOT NULL DEFAULT '[]',          -- JSON: ResourceClaim[]
  agent           TEXT,                                -- JSON: { model, persona? } — NULL legal (operator-injected tasks may have no agent)
  review_payload  TEXT,                                -- JSON: { summary, diffRef? } — NULL legal (non-human_review tasks)
  db_row_version  INTEGER NOT NULL DEFAULT 0,          -- bumped on every UPDATE (HITL approve/reject 409 check; PRD §8.4)
  priority        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,                       -- ISO 8601
  started_at      TEXT,
  completed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_parent      ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_type_status ON tasks(type, status);

CREATE TABLE IF NOT EXISTS events (
  id        TEXT PRIMARY KEY,                          -- UUIDv4
  task_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  seq       INTEGER NOT NULL,                          -- monotonic per task, starts at 0
  at        TEXT NOT NULL,                             -- ISO 8601
  kind      TEXT NOT NULL,                             -- LogEvent.kind
  payload   TEXT NOT NULL,                             -- JSON of kind-specific fields
  UNIQUE (task_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_events_task_seq ON events(task_id, seq);

CREATE TABLE IF NOT EXISTS migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
```

`tasks` is a *projection* of the events stream — every column except `id`, `type`, `title`, `source`, `parent_task_id`, `depends_on`, `resource_claims`, and `created_at` is derivable from the event log. The projection is materialized for query speed (D7: SQLite is fast, but folding the event log on every list-tasks call would still be wasted work). Inserts and mutations on `tasks` happen *only* inside a transaction that also appends a corresponding event, ensuring the projection cannot drift from the log.

`events` is append-only — no `UPDATE`, no `DELETE`. The `(task_id, seq)` uniqueness guarantee is enforced at the SQL level so concurrent emitters cannot race. The `seq` field starts at 0 per task and increments by 1 per event; the store API computes it inside the same transaction as the insert.

`payload`'s JSON shape per `kind` matches the `LogEvent` discriminated union in `@ledger/parser` (re-exported via `app/src/lib/types.ts`). The parser package gains a `LogEventPayload<Kind>` type extractor so the store API can validate-on-insert (D9).

### Scheduler tick

**Task state machine (v1):**

| Status | Entry condition | Exit transitions |
|---|---|---|
| `PENDING` | Created via `POST /api/tasks` or `runner.createTask(...)`. Has not yet been evaluated by the scheduler. | → `RUNNING` (scheduler picks it), → `BLOCKED` (scheduler evaluated and found it ineligible) |
| `BLOCKED` | Scheduler evaluated and rejected because of (a) at least one `dependsOn` row not in `COMPLETE`, (b) a write-claim conflict with an in-flight task, or (c) no executor registered for `tasks.type`. The triggering condition is recorded in the latest `status_change` event's `reason` field (see §Status reasons). | → `PENDING` (state changes elsewhere — dep COMPLETE, conflicting task COMPLETE, executor registered — re-evaluates next tick), → `RUNNING` (direct transition when re-evaluation succeeds), → `FAILED` (if `reason` was a `FAILED` dependency and operator cancels via `reject` flow once that lands) |
| `RUNNING` | Scheduler dispatched the task to its registered executor. The row is in the in-flight working set; its `resource_claims` are held. | → `AWAITING_HUMAN_REVIEW` (only via the `human_review` executor calling `runner.awaitHumanReview`), → `COMPLETE` (executor called `runner.complete`), → `FAILED` (executor called `runner.fail`, or process restart caught it mid-flight) |
| `AWAITING_HUMAN_REVIEW` | A `human_review` executor suspended. Claims remain held; the scheduler does not re-tick for this task until an external approve/reject. | → `COMPLETE` (`POST /:id/approve`), → `FAILED` (`POST /:id/reject`) |
| `COMPLETE` | Terminal. Claims released. Dependents become eligible on the next tick. | (none) |
| `FAILED` | Terminal. Claims released. Dependents remain `BLOCKED` (D11). | (none) |
| `CANCELLED` | Reserved type-level value. Not produced by any v1 transition (cancellation deferred — see Out of scope). The DB `status` column accepts it so the type compiles cleanly across the wire; v1 row count is structurally 0. | (none in v1) |

A tick runs the following on each scheduler-relevant event:

```
1. Load the in-flight working set: { tasks WHERE status = 'RUNNING' }.
2. Compute the in-flight claim set: union of resource_claims across the working set.
3. SELECT one row from tasks WHERE:
     status IN ('PENDING', 'BLOCKED') AND
     no row in depends_on has status != 'COMPLETE' AND
     resource_claims does not conflict with the in-flight claim set
   ORDER BY priority DESC, created_at ASC
   LIMIT 1.
4. If found AND an executor is registered for tasks.type:
     transition row → RUNNING (appends a status_change event in the same tx);
     invoke the executor asynchronously (await is not in the tx);
     the executor reports back via the runner's emit API.
5. If found AND no executor is registered:
     transition row → BLOCKED with reason 'blocked_no_executor'
     (status_change event in the same tx); tick yields.
6. If no eligible row found AND there exists a PENDING row whose deps are not all COMPLETE
   OR whose claims conflict:
     transition each such row PENDING → BLOCKED with the appropriate reason
     ('blocked_by_dep' or 'blocked_by_claim_conflict'); tick yields.
7. Repeat from step 1 until no eligible task remains. Each pick is its own transaction.
```

**Status reasons** (the `reason` field of the `status_change` event):

| Reason | Emitted when |
|---|---|
| `blocked_by_dep:<dep_task_id>` | A `dependsOn` row is not `COMPLETE`. The first failing dep is named. |
| `blocked_by_claim_conflict:<conflicting_task_id>` | A write-claim conflict with an in-flight task. The conflicting task is named. |
| `blocked_no_executor` | No executor registered for `tasks.type`. |
| `approved` | `human_review` task approved. |
| `rejected:<short rationale>` | `human_review` task rejected. Full rationale in the event payload. |
| `orphaned_on_restart` | Runner restart found the task in `RUNNING`; transitioned to `FAILED`. |

The scheduler is **event-driven, not polled**: a tick is invoked on (a) task creation, (b) task status change, (c) any executor completing. Polling is rejected because at v1 scale tick cost is microseconds and idle CPU is more valuable than fast-path latency reduction. (D5.)

**Conflict primitive** (`runner/conflict.ts`):

```ts
export function conflicts(a: ResourceClaim[], b: ResourceClaim[]): boolean {
  for (const x of a) {
    for (const y of b) {
      if (claimKey(x) !== claimKey(y)) continue;
      if (x.mode === "write" || y.mode === "write") return true;
    }
  }
  return false;
}

function claimKey(c: ResourceClaim): string {
  return c.kind === "node" ? `node:${c.nodeId}` : `path:${c.path}`;
}
```

Two read claims on the same resource do not conflict. Any pair where at least one side is `write` conflicts. The function is O(|a|·|b|) — at v1 scale (≤10 claims per task, ≤10 in-flight tasks) this is negligible.

**Dependency check** is the boolean `dependsOn.every(id => store.getStatus(id) === "COMPLETE")`. `FAILED` dependencies block forever — the dependent task is `BLOCKED` with reason `blocked_by_dep:<failed-id>` and the operator decides whether to cancel it (via the future cancellation API) or retry the failed predecessor (no automatic propagation in v1; D11).

### Executor registry

```ts
// runner/executors.ts
export interface Executor {
  /** Called when the scheduler transitions a task PENDING → RUNNING. */
  run(task: Task, runner: RunnerHandle): Promise<void> | void;
}

export interface RunnerHandle {
  emit(taskId: TaskId, event: Omit<LogEvent, "id" | "taskId" | "seq" | "at">): void;
  complete(taskId: TaskId): void;
  fail(taskId: TaskId, reason: string): void;
  awaitHumanReview(taskId: TaskId): void;  // human_review only
}

const registry = new Map<TaskType, Executor>();
export function registerExecutor(type: TaskType, executor: Executor): void;
export function lookupExecutor(type: TaskType): Executor | undefined;
```

v1 built-ins:

- `noop` — calls `runner.complete(task.id)` synchronously inside `run()`. For tests and scheduler dogfooding.
- `human_review` — calls `runner.awaitHumanReview(task.id)` (which transitions `RUNNING → AWAITING_HUMAN_REVIEW` and emits a `status_change` event), then returns immediately. The task waits for an external `approve`/`reject` to transition further.

Every other `TaskType` is unregistered in v1. The scheduler logs `'blocked_no_executor'` and the task stays `PENDING` until `06-agent-dispatcher` registers an executor for it.

### HITL gate

A `human_review` task is created with:

- `type: "human_review"`
- `parent_task_id`: the task whose output is being reviewed (typically an `implement` or `spec_review` task, in `06-agent-dispatcher`'s world)
- `resource_claims`: copied from the parent — the review holds the same write claims, preventing other tasks from racing with the operator's read of the parent's output
- `review_payload: { summary, diffRef? }` — what the operator sees in the inspector

When dispatched by the scheduler:

1. Scheduler picks the task, transitions `PENDING → RUNNING`, invokes the `human_review` executor.
2. Executor calls `runner.awaitHumanReview(task.id)` → transitions `RUNNING → AWAITING_HUMAN_REVIEW`, emits `status_change`.
3. Executor returns; scheduler does **not** release the task's claims (the claim hold is the point — it blocks downstream tasks from reading half-reviewed output).

External transitions:

- `POST /api/tasks/:id/approve` with body `{ note?: string, dbRowVersion: number }` → transitions `AWAITING_HUMAN_REVIEW → COMPLETE`, releases claims, re-ticks the scheduler. Event log entry: `{ kind: "status_change", from: "AWAITING_HUMAN_REVIEW", to: "COMPLETE", reason: "approved" }`. 409 if the stored `db_row_version` no longer matches the request's value (PRD §8.4 optimistic locking).
- `POST /api/tasks/:id/reject` with body `{ reason: string, dbRowVersion: number, followUp?: TaskInput }` → transitions `AWAITING_HUMAN_REVIEW → FAILED` with `reason: "rejected:<short rationale>"` in the event log (full rationale in the event payload's `details` field). Releases claims, re-ticks. Same 409 semantics as approve. If `followUp` is provided, enqueues it as a new task with:
  - `dependsOn: []` — the rejected task is terminal; the follow-up has no waiting predecessor in the runner's view (the conceptual dependency on "operator wrote rejection rationale" is captured in the follow-up's `review_payload.summary`).
  - `resource_claims` — operator's choice. The natural default (which the UI should pre-fill) is the rejected task's claim set, holding the same write claims so downstream tasks stay blocked until the follow-up either completes or is itself rejected. If `followUp.resource_claims` is omitted on the request body, the endpoint copies the rejected task's claims as the default.

Terminal states for SSE auto-close purposes: `COMPLETE`, `FAILED`, `CANCELLED`. The 60s grace window after entering one of these closes the stream cleanly (matches `01-ui/10-orchestration` D7's contract).

Process restart durability: the runner's startup sequence loads all `AWAITING_HUMAN_REVIEW` tasks from the DB and treats them as still-suspended. The scheduler does not auto-retry them. The `RUNNING` rows on the other hand are crash victims — startup transitions them `RUNNING → FAILED` with reason `"orphaned: runner restarted while task was in flight"` and emits a `status_change` event. v1 makes no attempt to recover in-flight executor state; that's a `06-agent-dispatcher` concern (Claude Code subprocess state is in its own transcript and cannot be resumed by the runner).

### Endpoints in v1

Endpoint-to-child ownership map (resolves the children-manifest cross-reference flagged by Spec Review S6):

| Endpoint | Ships in child |
|---|---|
| `GET /api/tasks` | `04-api-endpoints` |
| `GET /api/tasks/:id` | `04-api-endpoints` |
| `GET /api/tasks/:id/stream` (SSE) | `04-api-endpoints` |
| `POST /api/tasks` (operator injection) | `04-api-endpoints` |
| `POST /api/tasks/:id/approve` | `03-hitl-gate` |
| `POST /api/tasks/:id/reject` | `03-hitl-gate` |

Approve/reject routes mount under the same `/api/tasks/:id/...` namespace as the rest but live in `server/src/routes/hitl.ts` (`03-hitl-gate`) rather than `server/src/routes/tasks.ts` (`04-api-endpoints`). Both files mount onto the same Hono app from `04-api-server`. The split keeps each child's diff focused; the URL grouping is a routing detail, not a file-organization one.

```
GET /api/tasks
  → 200 { tasks: Task[] }
  Query params (all optional, repeatable):
    ?status=PENDING&status=RUNNING        — filter by status (multi)
    ?type=implement&type=verify           — filter by type (multi)
    ?parent=<TaskId>                      — filter by parent_task_id
  Default order: created_at DESC.

GET /api/tasks/:id
  → 200 { task: Task, events: LogEvent[] }
  → 404 if id does not resolve.

GET /api/tasks/:id/stream
  → SSE; emits new LogEvents as they are appended.
  Headers: Last-Event-ID: <seq> to resume after a given seq.
  Heartbeat: ": ping\n\n" every 15s.
  Auto-close: 60s after task status reaches a terminal state (COMPLETE / FAILED / CANCELLED).

POST /api/tasks
  Body: TaskInput { type, title, source, parent_task_id?, depends_on?, resource_claims?,
                    agent?, review_payload?, priority? }
  → 201 { task: Task }     — id assigned, status = PENDING, events seeded with creation event
  → 400 on schema validation failure (zod or ajv; D9 — to be pinned in 01-store-schema)
  Required-field defaults: source = "operator_injected", depends_on = [], resource_claims = [],
  priority = 0.

POST /api/tasks/:id/approve
  Body: { note?: string }
  → 200 { task: Task }
  → 404 if id does not resolve
  → 409 if task.status !== "AWAITING_HUMAN_REVIEW"

POST /api/tasks/:id/reject
  Body: { reason: string, followUp?: TaskInput }
  → 200 { task: Task, followUpTask?: Task }
  → 400 if reason is empty
  → 404 / 409 same as approve
```

The endpoints live in `server/src/routes/tasks.ts`, mounted at `/api/tasks` by `server.ts`. They consume the `RunnerHandle` exposed on the `ProjectContext` (D3).

### Type coordination across packages

The `Task` and `LogEvent` types live today in `app/src/lib/types.ts` (introduced by `01-ui/10-orchestration`). The runner needs the same shapes. Two options:

1. **Move them to `@ledger/parser`** alongside `NodeId` / `NodeStatus` / `DocNode`. Aligns with `02-parser-extraction`'s D5 (canonical types live in `@ledger/parser`); the UI re-exports them.
2. **Duplicate in `server/src/runner/types.ts`** to keep `@ledger/parser` schema-focused.

Going with option 1 (D4). The concrete type changes:

- **`Task.transcriptPath` becomes optional** — was `transcriptPath: string` (required by the transcript-only world); becomes `transcriptPath?: string` (absent for runner-emitted tasks). This is a *breaking* change at every consumer site that destructures `transcriptPath` without a null check. Sub-leaf `01-store-schema` audits every reference and either narrows-then-uses or substitutes a defined-or-undefined check. Today's consumers (`useTaskList`, `useTask`, `TaskInspector`, `useTaskGrouping`) all read `transcriptPath` for either display (server-internal — never rendered per `10-orchestration` line 142 comment) or source-disambiguation (the dual-source migration in `05-ui-hook-migration` uses presence/absence as the runner-vs-transcript discriminator). `app/src/lib/types.ts` retains the `export type { Task, LogEvent } from "@ledger/parser"` re-export so the existing import sites keep compiling.
- **`Task.dbRowVersion: number` added (not optional — defaults to 0 on insert).** Used by the store for **optimistic-concurrency on the HITL approve/reject endpoints**, matching PRD §8.4's explicit requirement ("optimistic locking against the task's current status — rejects if the task has been moved by another actor mid-review"). Each successful update to a `tasks` row increments `dbRowVersion`; approve/reject requests carry the version they observed and 409 if the stored version has moved (sub-leaf `03-hitl-gate` ships the endpoint semantics). v1 single-writer scenarios still happen rarely — e.g., the operator opens two browser tabs and clicks Approve in both — and the 409 is the honest answer.
- **A new `TaskInput` type** for `POST /api/tasks` body validation (subset of `Task`: `type`, `title`, `source?`, `parent_task_id?`, `depends_on?`, `resource_claims?`, `agent?`, `review_payload?`, `priority?`). Required fields and defaults are pinned per D9. Lives in `@ledger/parser` alongside `Task`.
- **`TaskStatus`'s `CANCELLED` value is preserved.** No v1 transition produces it; the SQLite schema accepts it as a legal `status` column value (no `CHECK` constraint enumerates the legal set in v1 — see N3 below). The wire type stays whole so adding cancellation in `06-agent-dispatcher` is a no-schema-change deliverable.

The migration of `Task` / `LogEvent` from `app/src/lib/types.ts` → `@ledger/parser` happens in sub-leaf `01-store-schema` (the first sub-leaf that needs the types in `server/`). `app/src/lib/types.ts` keeps the re-exports for source compatibility — matches the existing `NodeId` / `NodeStatus` / `DocNode` pattern. The `transcriptPath?` optionality is part of the same commit so consumers see one consistent type after the migration, not a half-state.

### UI consumer migration: additive dual-source

`useTaskList`, `useTask`, `useLogStream` flip to query *both* the runner endpoints and the transcript endpoints, merging results. The merger is a one-screen helper:

```ts
function mergeTasks(runnerTasks: Task[], transcriptTasks: Task[]): Task[] {
  // Runner tasks take precedence on id collision (won't happen in v1 — different id prefixes).
  const byId = new Map<TaskId, Task>();
  for (const t of transcriptTasks) byId.set(t.id, t);
  for (const t of runnerTasks)    byId.set(t.id, t);
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
```

Source disambiguation in the UI is by `transcriptPath` presence (transcript-derived) vs absence (runner-emitted). The `TaskInspector` renders Approve/Reject buttons only for the runner-emitted, AWAITING_HUMAN_REVIEW case — preserving `01-ui/04-tasks`'s "no mutation of task state" stance for transcript-derived rows (which have no corresponding API surface anyway).

### Acceptance check (end-to-end, manual)

Distributed across sub-leaf verification gates; the parent's roll-up is:

1. `pnpm install` succeeds with the added `better-sqlite3` dep.
2. `pnpm -C server dev /Users/dennis/code/ledger` boots; on first start it creates `.ledger/runner.db` and applies migration 001. On restart, the file is reused without re-applying migrations.
3. `curl -X POST http://127.0.0.1:4180/api/tasks -d '{"type":"noop","title":"smoke test","source":"operator_injected"}'` returns `201` with a task body whose status flips to `COMPLETE` on the very next poll of `GET /api/tasks/:id`.
4. `curl -X POST .../api/tasks -d '{"type":"human_review","title":"approve me","source":"operator_injected","review_payload":{"summary":"test diff"}}'` returns `201`; the task sits in `AWAITING_HUMAN_REVIEW`; `POST /:id/approve` transitions it `COMPLETE` and the SSE stream emits the status_change.
5. Conflict primitive: create two tasks with conflicting write claims on the same node; the second transitions `PENDING → BLOCKED` with reason `blocked_by_claim_conflict:<first-task-id>` while the first is in flight. Completing the first un-blocks the second on the next tick.
6. SSE resume: open the stream, append an event, disconnect, reopen with `Last-Event-ID: <seq>` — no duplicate events, first delivered event is `seq + 1`.
7. Process restart: a task in `RUNNING` is transitioned `FAILED` on next boot with the orphan reason; a task in `AWAITING_HUMAN_REVIEW` is still pending review on next boot.
8. UI: visit `/tasks` with the runner running and at least one runner task injected; the table shows both runner and transcript rows; clicking a runner task in `AWAITING_HUMAN_REVIEW` shows Approve/Reject buttons; clicking Approve triggers a `queryClient.invalidateQueries(["tasks"])` and the row reflects `COMPLETE` on the next render (≤1s in practice; ≤30s worst case if the explicit invalidation is omitted and the hook's poll-interval handles it).
9. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` exit zero across all workspace packages.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | `better-sqlite3` as the SQLite driver | Synchronous API maps naturally to the runner's tx-per-tick model — no need to thread a Promise through every store call. Battle-tested, fast, single C-extension dep. Alternative `node:sqlite` (built into Node 22+) is still experimental; we'd accept its flag-gated status to remove a native-dep build step but at the cost of stability. `libsql` adds remote-DB features we don't need. The native dep does require `pnpm install` to compile on first run (or download a prebuilt); acceptable for an internal tool. |
| D2 | One DB per project at `.ledger/runner.db`; file is gitignored | Matches PRD §7.1's project-scoped server (one project per process → one DB). Colocating with `.ledger/project.json` keeps all project-local runtime state in one directory. Gitignored because the events table is operational state, not document content — version history of completed agent runs belongs in the event log within the DB, not in `git log`. The `.ledger/.gitignore` (added by `03-project-metadata`) gains `runner.db` and `runner.db-*` (SQLite WAL/SHM siblings). |
| D3 | Runner is a module inside `server/`, not its own `packages/runner/` workspace package | The runner has exactly one consumer (the API server in the same process). Promoting it to a separate package would add workspace boundary overhead — separate `package.json`, separate `tsconfig`, dependency declaration across the boundary — for no second consumer in sight. PRD §5: "Same stack as the UI; no language boundary." The internal module boundary (`server/src/runner/`) gives clean unit-test isolation without the workspace-package tax. If `07-health-daemon` lands as a separate Node process consuming the runner library, we revisit and promote. |
| D4 | `Task` / `LogEvent` move from `app/src/lib/types.ts` to `@ledger/parser` | Aligns with `02-parser-extraction`'s D5 ("canonical types live in `@ledger/parser`; UI re-exports"). The runner needs these types in `server/`, and reaching into `app/` for them is the same coupling `04-api-server` rejected for `DocNode`. The re-export from `app/src/lib/types.ts` preserves every existing import site. |
| D5 | Scheduler is event-driven, not polled | Tick cost is microseconds at v1 scale; idle CPU is more valuable. Triggers: task created, task status changed, executor completed. Polling at e.g. 1 Hz would burn CPU on idle and add up to 1s of latency on the path from "task became eligible" to "task picked." Event-driven also makes the test surface deterministic — fire a trigger, assert the tick's effect; no `setTimeout`/`waitFor` flakiness. |
| D6 | Doc-refactor guard (PRD §6.5) is **not** a special code path | The guard rule is "refactor tasks may not execute while any other claim holds on the same node." That is exactly what the conflict primitive computes when a `doc_refactor` task declares an exclusive `write` claim on its target node. No `if (task.type === "doc_refactor")` in the scheduler. The PRD's natural-language rule maps cleanly onto the runner's set-intersection primitive — a small win for the resource-claim model. |
| D7 | `tasks` is a materialized projection of the `events` left-fold, not a pure view | The pure view ("fold events at query time") is conceptually clean but defeats query plans — filtering by status, listing pending tasks, joining on parent all become per-row fold passes. Materialized projection writes are within the same transaction as the event append so divergence is structurally prevented. PRD §5: "Current state is a left-fold of events; replay is a `SELECT` over a historical range" — the projection does not change the replay story (replay is still the event scan); it just keeps the live read path fast. |
| D8 | v1 ships exactly two executors: `noop` (synthetic) and `human_review` (suspending) | Real executors (`implement`, `verify`, etc.) belong to `06-agent-dispatcher`, which dispatches Claude Code subprocesses via MCP. Coupling that into the runner now would tangle the dependency edge declared in PRD §14 ("`06-agent-dispatcher` depends on `05-task-runner`"). The two synthetic executors are enough to dogfood: `noop` exercises the scheduler tick + dep ordering + conflict primitive end-to-end; `human_review` exercises the HITL gate + suspension + claim-hold end-to-end. The substrate is provably correct on synthetic flows before agent dispatch lands. |
| D9 | Task and LogEvent payload validation uses ajv against new JSON Schemas in `docs/_schemas/` | Matches the convention `02-schema` and `03-project-metadata` established. New artifacts: `docs/_schemas/task.schema.json`, `docs/_schemas/log-event.schema.json`, `docs/_schemas/task-input.schema.json` (subset of Task for POST bodies). Validators live in `@ledger/parser` alongside the existing ones. The store API validates on insert; the HTTP endpoints validate on inbound POST. Rejected alternative: zod (introduces a new validation library when ajv is already wired and tree-shakes cleanly). |
| D10 | UI migration is **additive** (dual-source), not replacing | Until `06-agent-dispatcher` lands, the runner has no agent-emitted tasks — only operator-injected synthetic ones. Retiring transcript ingestion would empty the UI. Additive merger keeps the existing observability surface alive while the new control surface bootstraps. Full retirement of `01-ui/10-orchestration`'s transcript bootstrap is `06-agent-dispatcher`'s deliverable. |
| D11 | `FAILED` dependencies block dependents forever (no automatic cancellation propagation) | A dependent of a failed task could plausibly want either (a) cancellation (the work is moot) or (b) waiting (the operator might rerun the failed task). Auto-propagating either way is wrong half the time. v1 leaves the dependent `BLOCKED` with a status reason naming the failed dependency; the operator decides via the inspector. When the operator interface for that decision matures, an "auto-cancel on FAILED dep" project setting can be added per-task or per-project. |
| D12 | SSE for log streams, with `Last-Event-ID` resume by SQL query | Consistent with `01-ui/10-orchestration` D7. The runner's events table indexes `(task_id, seq)` so resume is a direct query: `SELECT … WHERE task_id = ? AND seq > ? ORDER BY seq`. Simpler than maintaining an in-memory ring buffer; correct across process restarts because the DB is the buffer. Heartbeat / auto-close behaviour matches `10-orchestration`'s existing contract so the UI's `useLogStream` hook needs no semantic changes. |
| D13 | No write authentication in v1 (POST endpoints unauthenticated) | Inherits `04-api-server` D4's posture: `127.0.0.1`-bind, OS firewall is the perimeter. Same threat model for POST as GET — single-user local-only. The runner's POST endpoints are no more sensitive than the doc-tree itself (which an attacker on `localhost` could already write to via the filesystem). If a future remote-access story lands, auth is the right answer alongside `--host 0.0.0.0`; both must land together. |

---

## Open Issues

- **`POST /api/tasks/:id/cancel` is not in v1.** Without cooperative executor abort there is no honest way to cancel a `RUNNING` task. The `noop` executor is synchronous (no cancel point); the `human_review` "executor" is already suspended (cancellable via reject). Real-executor cancellation lands with `06-agent-dispatcher` (kill the Claude Code subprocess + emit a `CANCELLED` status_change). Logged here so it doesn't get lost. *(Priority: MEDIUM — operator pain when 06 lands; not blocking for v1.)*
- **Backpressure on operator-injected tasks.** `POST /api/tasks` has no rate limit. An operator script-looping could DOS itself (the DB would degrade before the runner did). Acceptable for single-user local-only. *(Priority: TRIVIAL.)*
- **DB file growth.** Events accumulate. At a few hundred tasks the DB is well under 10 MB; at tens of thousands the file becomes notable. `VACUUM` does not reclaim event rows (they're live data). When this hurts, the answer is partition-by-month or a separate cold-storage table, not deletion. *(Priority: LOW — surfaces at runtime if the framework sees heavy use; defer.)*
- **`better-sqlite3` native build.** First `pnpm install` after this node compiles the C extension (or downloads a prebuilt) — on a fresh box without build tools this can fail. Mitigated by prebuilt binaries (`@better-sqlite3/prebuilt` resolves for common platforms). Document the requirement in CLAUDE.md. *(Priority: LOW.)*
- **Time source.** The runner timestamps events via `new Date().toISOString()`. In a future replay scenario where event ordering across machines matters, this becomes a clock-skew issue. v1 is single-machine — no problem yet. *(Priority: TRIVIAL.)*
- **`status_change` event author.** Today every status_change is emitted by the runner itself. When the dispatcher lands, agent-driven status changes (e.g., an agent self-reporting `FAILED`) need an attribution field (`who: "runner" | "agent" | "operator"`). Logged here to thread the type forward into `06-agent-dispatcher`'s scope. *(Priority: LOW.)*
- **No bulk endpoints.** `POST /api/tasks` is one-task-per-request. Bulk task injection (e.g., a doc-tree-wide reverify pass) is N round-trips. Adequate for v1; revisit when the daemon lands and might enqueue tens of tasks per scan. *(Priority: LOW.)*
- **OpenAPI / typed client.** Inherited from `04-api-server`'s Open Issue of the same name; this node makes the surface larger and slightly increases the case for codegen. Still defer until a non-TS consumer exists (the `06-agent-dispatcher` MCP server). *(Priority: LOW — inherited.)*
- ~~**UI affordance for `BLOCKED` reason inspection.**~~ → Folded into `05-ui-hook-migration`'s scope per Spec Review S6 — manifest entry now names the inspector-UX work explicitly.
- **Breakpoint insertion + priority override (PRD §8.4).** v1 ships neither. Breakpoints have a workaround (operator injects a `human_review` task with `dependsOn` set), but post-hoc breakpoint insertion requires `PATCH /api/tasks/:id` for `depends_on` mutation, which is not in v1. Priority override is the simpler half — `PATCH /api/tasks/:id { priority }` is ~20 LOC — but ships together with breakpoints as a v2 task-control surface so the operator gets a coherent control story in one release. *(Priority: MEDIUM — direct PRD §8.4 ask; surfaced once `06-agent-dispatcher` has tasks worth pausing.)*

---

## Spec Review (2026-05-27)

Independent spec review was run against this DRAFT in a clean Sonnet context. Verdict: NEEDS_MINOR_REVISIONS — two blocking, six should-fix, five nits. PRD coverage matrix returned full Addressed across §5/§6.3/§6.5/§7.1/§8.6/§10; §8.4 was flagged Partial (breakpoint + priority-override not addressed). All findings applied or explicitly resolved. Audit:

| # | Finding | Resolution |
|---|---------|------------|
| B1 | Reviewer claimed the `## Spec Review` section was missing. | Not applied — false alarm. The section heading existed at line 429 of the DRAFT (placeholder body `*(none yet — pre-review)*` per house style). Now populated by this audit, dated, satisfying the structural requirement. Audit kept for traceability. |
| B2 | `BLOCKED` was used ambiguously as both a status (`status = 'BLOCKED'`) and a status-reason string across the spec (scheduler tick step 4 said "stays PENDING" while D11 said "leaves the dependent BLOCKED" and Acceptance check 5 said "stays PENDING"). Mechanically inconsistent — implementer cannot write store tests without a pinned state machine. | Added a "Task state machine (v1)" table to Design with one row per status and explicit entry conditions; rewrote the scheduler tick pseudocode so `PENDING → BLOCKED` transitions are explicit (steps 5–6 added); added a "Status reasons" enumeration (`blocked_by_dep:<id>`, `blocked_by_claim_conflict:<id>`, `blocked_no_executor`, `approved`, `rejected:<rationale>`, `orphaned_on_restart`). D11 text and Acceptance check items 5 + 7 reworded to match. |
| S1 | `Task.transcriptPath` becoming optional is a breaking change at every consumer site that destructures without a null check — spec needed to call this out and pin the coordinated re-export update. Also: `CANCELLED` in `TaskStatus` not addressed by the schema. | §Type coordination rewritten: `transcriptPath?: string` syntax pinned, consumer-site audit assigned to sub-leaf `01-store-schema`, `app/src/lib/types.ts` re-export coordination noted. `CANCELLED` covered: SQLite `status` column accepts the value (no CHECK constraint); type stays whole; state-machine table notes the row count is structurally 0 in v1. |
| S2 | PRD §8.4's breakpoint insertion and priority override are not addressed and not deferred. | Added two Out of scope bullets with PRD §8.4 citations and the workaround note (operator can inject a `human_review` task with `dependsOn`, but post-hoc dep insertion needs `PATCH /api/tasks/:id` which is also deferred). Also bumped the corresponding Open Issue from absent to MEDIUM-priority. |
| S3 | `POST /api/tasks/:id/reject` with `followUp` was under-specified: dep handling, claim inheritance, SSE auto-close on `FAILED`. | §HITL gate's external-transitions block now pins: `followUp.dependsOn = []`; `followUp.resource_claims` defaults to the rejected task's claims (UI pre-fills, request can override); `FAILED` is in the SSE auto-close terminal set alongside `COMPLETE` and `CANCELLED`. |
| S4 | `Task.dbRowVersion` rationale ("v1 has no two-writer scenarios") conflicted with PRD §8.4's explicit "optimistic locking against the task's current status" requirement. | §Type coordination rewritten: `dbRowVersion` becomes non-optional (`number`, defaults to 0 on insert, bumped on every UPDATE), explicitly wired to the approve/reject 409 semantics, PRD §8.4 cited. Two-tab Approve race documented as the honest v1 use case. SQLite schema gains `db_row_version` column. |
| S5 | Reviewer flagged the section order as deviating from house style — Spec Review section position. | Not applied — same false alarm as B1. Section order matched house style already; just the audit table was a placeholder, now populated. |
| S6 | Endpoint-to-child ownership ambiguous: approve/reject endpoints described in §Endpoints in v1 but the Children manifest assigned them to `03-hitl-gate`. | Added an endpoint-to-child mapping table at the top of §Endpoints in v1 making each endpoint's child owner explicit; clarifying note that approve/reject live in `server/src/routes/hitl.ts` (`03-hitl-gate`) while everything else lives in `server/src/routes/tasks.ts` (`04-api-endpoints`), both mounted on the same Hono app. |
| N1 | Status-reason strings (`blocked_by_claim_conflict`, `blocked_no_executor`) used bare without a typed definition. | Covered by the new "Status reasons" enumeration table under §Scheduler tick. The `reason` field is the existing `status_change` event payload field per `LogEvent` already; no new type added. |
| N2 | Acceptance check item 8 used `staleTime` (an implementation detail of the consumer hook) as the timing gate. | Reworded to specify `queryClient.invalidateQueries(["tasks"])` as the explicit refresh trigger with `≤1s in practice; ≤30s worst case`. |
| N3 | `agent` SQLite column has no NOT NULL constraint (correct — runner-injected tasks may have no agent), but the spec didn't note this explicitly. | Added inline column comments to the migration SQL: `-- NULL legal` on `agent` and on `review_payload`. |
| N4 | `05-ui-hook-migration` child manifest entry's title under-described the inspector-UX work bundled into it. | Manifest row rewritten with a leading bold-tag "**UI hook migration + inspector UX for runner tasks.**" and named-out scope: hook migration, Approve/Reject buttons with `dbRowVersion` wiring, `BLOCKED` reason surfacing. The corresponding Open Issue is now struck-through with a pointer to the child. |
| N5 | `CANCELLED` in the SSE auto-close terminal set without an explicit note that no v1 transition produces it. | Covered by S1's state-machine row and Type coordination paragraph. SSE auto-close terminal set kept as `{COMPLETE, FAILED, CANCELLED}` so the contract stays whole for `06-agent-dispatcher`'s cancellation work. |

Reviewer's **Confidence notes** (recorded so the stage-4 implementer of `01-store-schema` spot-checks them):

- `better-sqlite3` prebuilt URL pinning at sub-leaf implementation time.
- Per-task `seq` monotonicity is correct only if the store API computes `seq` atomically inside the same write transaction as the event insert — sub-leaf `01-store-schema` must verify (the spec asserts it; the implementer's tests must exercise concurrent emits on the same task).
- `mergeTasks` id-collision claim depends on transcript IDs staying `session:<uuid>` / `agent:<id>` and runner IDs being bare UUIDv4. Sub-leaf `01-store-schema` pins the runner-task-id format explicitly.

Reviewer's **decomposition assessment** flagged `01-store-schema` as denser than any sibling in `04-api-server` (5–7 distinct deliverables: schema, migrations runner, typed store API, type migration, three new JSON Schemas). Noted as a soft watch-item for the sub-leaf author; the natural split point if it needs decomposition is `[schema + migrations]` first, `[typed store API + type migration]` second. No structural change to the parent's manifest in this audit pass.

Nothing punted. All B/S/N findings landed.

---

## Implementation Notes

*(none yet — pre-implementation; decomposition into children below)*

---

## Verification

When this parent moves to `VERIFY` (all children COMPLETE), the verifier confirms:

1. Every child sub-leaf's own Verification gate passed and is recorded in its own doc.
2. The end-to-end Acceptance check above (items 1–9) passes against the merged main branch.
3. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` exit zero across all workspace packages.
4. No regressions on `04-api-server`'s endpoints (`GET /api/_health`, `/api/project`, `/api/docs`, `/api/docs/:nodeId`) — same response shapes, same status codes.
5. No regressions on `01-ui/10-orchestration`'s endpoints (`GET /api/transcripts*`) — the transcript bootstrap remains live.
6. The `.ledger/runner.db` file is created on first server start, migration 001 applies cleanly, the file is in `.gitignore`.
7. CLAUDE.md "Running the app" section updated to note the runner DB (`.ledger/runner.db`); §14 of `docs/00-project.md` shows `05-task-runner` as COMPLETE.

---

## Children

| ID | Title | Depends on | Status |
|----|-------|------------|--------|
| `01-store-schema` | SQLite store: `tasks` + `events` + `migrations` tables, transactional migrations runner, typed store API (`createTask`, `appendEvent`, `loadTask`, `listTasks`, `getEvents`), `Task`/`LogEvent` migration to `@ledger/parser`, JSON Schemas for `task.schema.json`/`log-event.schema.json`/`task-input.schema.json` in `docs/_schemas/` + validators in `@ledger/parser` | `04-api-server` | COMPLETE (v1, 2026-05-27) |
| `02-scheduler` | Scheduler tick (event-driven), conflict primitive (`runner/conflict.ts`), executor registry with `noop` built-in, dep-met check, status_change event emission, process-restart crash recovery (`RUNNING → FAILED` orphan transition) | `01-store-schema` | COMPLETE (v1, 2026-05-27) |
| `03-hitl-gate` | `human_review` executor + suspension semantics (`RUNNING → AWAITING_HUMAN_REVIEW`, claims held), `POST /api/tasks/:id/approve` + `/reject` endpoints with rationale capture and optional follow-up enqueue, restart durability for suspended tasks | `02-scheduler`, `04-api-endpoints` | COMPLETE (v1, 2026-05-28) |
| `04-api-endpoints` | Read endpoints (`GET /api/tasks`, `/:id`, `/:id/stream` SSE with `Last-Event-ID` resume), operator-injection endpoint (`POST /api/tasks`) with `TaskInput` validation against the schema, in-process pub/sub bridge (`runner/events.ts`) closing `02-scheduler`'s pub/sub Open Issue | `02-scheduler` | COMPLETE (v1, 2026-05-27) |
| `05-ui-hook-migration` | **UI hook migration + inspector UX for runner tasks.** `useTaskList`/`useTask`/`useLogStream` flip to additive dual-source (`/api/tasks*` + `/api/transcripts*` merger using `transcriptPath` presence as runner-vs-transcript discriminator); `TaskInspector` Approve/Reject buttons gated on `runner-emitted ∧ AWAITING_HUMAN_REVIEW` (sending the observed `dbRowVersion` on each request per PRD §8.4 optimistic locking); `BLOCKED` row reason surfaced from latest `status_change` event's `reason` field (resolves the Open Issue "UI affordance for `BLOCKED` reason inspection") | `03-hitl-gate`, `04-api-endpoints` | ISSUE_OPEN |

Build order is determined by the dependency edges above. Sequential: `01` → `02` → `{03, 04}` (parallelizable after `02` — `03` adds endpoints + executor; `04` adds read endpoints + injection; no file overlap) → `05` (consumes both). The manual workflow today serializes the parallel pair; the runner's eventual ability to declare claims on shared spec files (e.g., `server/src/routes/tasks.ts` if both `03` and `04` were to write to it) would catch the conflict — but the planned carve-up keeps `03`'s endpoints in their own router file mounted alongside `04`'s, so even concurrent dispatches wouldn't clash.

Out-of-scope items from this parent's Requirements (real executors, transcript ingestion retirement, replay UI, cancellation, multi-project, backpressure, auth, GC, bulk endpoints, observability) apply to every child — none reintroduce a deferred concern. Each child spec cites this parent's Decisions table for architectural inheritance rather than restating.
