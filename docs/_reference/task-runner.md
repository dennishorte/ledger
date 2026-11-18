# Task runner — current-state reference

**Scope:** `server/src/runner/`. SQLite task store, scheduler, human-review
gate. Domain types live in `@ledger/parser` ([`parser.md`](parser.md)).
**Last verified:** `f531fad825137e51ba44f49353d6e749d24378fd` on `main`.
**Owning nodes:** [`05-task-runner`](../05-task-runner/00-task-runner.md) and
its children `01-store-schema`, `02-scheduler`, `03-hitl-gate`, `04-api-endpoints`.
**Regenerate the module map:** `find server/src/runner -type f \( -name '*.ts' -o -name '*.sql' \) | sort | while read f; do printf '%5d  %s\n' "$(wc -l < "$f")" "$f"; done`

Database file: `<project>/.ledger/runner.db` (WAL sidecars `runner.db-wal`,
`runner.db-shm`). All three are gitignored. `journal_mode = WAL` and
`foreign_keys = ON` are set in `createRunnerForProject` (`runner/index.ts`).

## 1. Module map

| File | Lines | Role |
|---|---:|---|
| `index.ts` | 63 | `createRunnerForProject`: open DB, migrate, wrap store with the event bus, recover orphans, return a `Runner` |
| `store.ts` | 548 | `Store` over `better-sqlite3`. Tasks, events, scans |
| `scheduler.ts` | 300 | Tick loop, status reasons, `recoverOrphans` |
| `conflict.ts` | 28 | `conflicts(a, b)` — write/write or write/read on the same target |
| `executors.ts` | 55 | `Executor`, `RunnerHandle`, `noop`, `human_review`, default registry |
| `events.ts` | 109 | In-process bus. `withPublishing` emits after `createTask`, `appendEvent`, and `updateTaskStatus`. `deleteTask`, `updateReviewPayload`, and `insertScan` are not published |
| `ids.ts` | 16 | UUIDv4 task and event ids |
| `migrations/runner.ts` | 69 | Apply `NNN-*.sql` in order. `PRAGMA user_version` advances after each commit |
| `migrations/001-initial.sql` | 44 | `tasks`, `events`, `migrations` |
| `migrations/002-health-scans.sql` | 10 | `health_scans` |

Current schema version is `user_version=2`. A boot with nothing pending logs
`runner: schema is current at user_version=2`.

## 2. Entry points

| Call | Effect |
|---|---|
| `createRunnerForProject({ projectRoot })` | Open the DB, migrate, recover orphans, return the runner. Called once from `loadProjectContext` |
| `runner.createTask(input)` | Insert `PENDING`, append the seq-0 `status_change`, tick. Returns the inserted row, captured before the tick |
| `runner.registerExecutor(type, exec)` | Map a `TaskType` to an executor. Overwrite logs a warning |
| `runner.tick()` | Run the scheduler. Re-entrant calls set a flag; they do not nest |
| `runner.handle.complete` / `fail` | `RUNNING` → `COMPLETE` or `FAILED`, then tick |
| `runner.handle.awaitHumanReview` | `RUNNING` → `AWAITING_HUMAN_REVIEW`. Does not tick |
| `runner.handle.emit` | Append a non-status event |
| `recoverOrphans(store)` | Every `RUNNING` row → `FAILED` reason `orphaned_on_restart` |

Built-in executors (`executors.ts`): `noop` completes immediately.
`human_review` calls `awaitHumanReview`. `loadProjectContext` then registers
one shared `ClaudeCodeExecutor` for the nine dispatcher types
([`dispatcher.md`](dispatcher.md)). `operator_session` and `agent_task` have
no executor.

HTTP wrappers live in `server/src/routes/tasks.ts` and `routes/hitl.ts`.
See [`api-server.md`](api-server.md).

## 3. Data contracts

**`tasks`** (`001-initial.sql`): `id` (bare UUIDv4), `type`, `status`,
`title`, `source`, `parent_task_id`, `depends_on` JSON, `resource_claims`
JSON, `agent` JSON, `review_payload` JSON, `db_row_version` (starts at 0,
bumped on every status update; `updateReviewPayload` leaves it unchanged), `priority` (default 0), `created_at`, `started_at`,
`completed_at`. Indexes on status, parent, `(type, status)`, and
`(status, priority DESC, created_at ASC)` for the eligible-queue read.

**`events`:** `id`, `task_id` (cascade delete), `seq` (unique per task,
starts at 0), `at`, `kind`, `payload` JSON of the kind-specific fields.

**`health_scans`:** `id`, `scanned_at`, `findings` JSON. Written only by the
scanner ([`health-scanner.md`](health-scanner.md)).

**Tick order** (`scheduler.ts` `tickOnce`): load the claim-holding set
(`RUNNING` and `AWAITING_HUMAN_REVIEW`) → walk `PENDING`/`BLOCKED` in
`priority DESC, created_at ASC` → dispatch at most one task, then loop.

A candidate is blocked, first reason that applies:

| Check | Reason |
|---|---|
| A `dependsOn` id whose status is not `COMPLETE` | `blocked_by_dep:<id>` |
| `conflicts` with a claim-holding task | `blocked_by_claim_conflict:<id>` |
| No executor registered | `blocked_no_executor` |

The same reason is not written twice (`lastReason`). Dependency failure wins
over a claim conflict.

**`conflicts`** (`conflict.ts`): same `node:<id>` or `path:<path>`, and at
least one side is `write`. Two reads do not conflict. Symmetric.

**Human review.** `AWAITING_HUMAN_REVIEW` keeps its claims, so a conflicting
task stays blocked until approve or reject. Approve → `COMPLETE` with reason
`approved` or `approved: <note>` (note sliced to 80). Reject → `FAILED` with
`rejected: <rationale>` sliced to 80, after an `error` event whose `stack`
holds the full text. Optional follow-up has `dependsOn` forced to `[]` and,
when the body omitted claims, copies the rejected task's claims
(`routes/hitl.ts`).

**Failure and cancel reasons** in the `reasons` object (`scheduler.ts`):
`cancelled_by_operator`, `subprocess_exit_without_terminal_status`,
`subprocess_failed:<tail>` (tail sliced to 80), `subprocess_timeout`,
`subprocess_idle`, `executor_internal_error:<msg>` (message sliced to 80).
A thrown executor writes a separate string, `executor_error: <message>`,
with a space after the colon and the full message. That string is not in
`reasons`.

## 4. Runtime state surfaces

| Surface | Lifetime | Survives restart |
|---|---|---|
| `tasks`, `events`, `health_scans` | SQLite file | Yes |
| `db_row_version` | Column on the task row | Yes. HITL clients send it back |
| Executor registry | `Map` on the `Runner` | No. Rebuilt at boot: `noop`, `human_review`, then the nine Claude types |
| Event bus subscribers | In-process | No. Per-task log streams subscribe for one task id |
| `ticking` / `pending` | Two booleans on the tick trampoline | No |

`listPendingEligible` is the only read the tick uses for candidates. Claim
holders are a separate `listTasks({ status: ["RUNNING", "AWAITING_HUMAN_REVIEW"] })`.

## 5. Invariants

- A task is inserted `PENDING`. Nothing runs inside `createTask` except the
  tick that follows the insert. [`00-project`](../00-project.md) §6.3.
- `updateTaskStatus` writes `WHERE id = ?`. `from` is copied onto the
  status event and is not compared with the current row, so a later call
  overwrites the status. A stale `dbRowVersion`, when the caller passed one,
  is what rejects the write.
- Callers that pass `dbRowVersion` also get an optimistic-lock check.
  `appendEvent` does not bump `db_row_version` (reject writes the detail
  event first, then the status update, and the client's version still matches).
- Orphan recovery touches `RUNNING` only. `AWAITING_HUMAN_REVIEW`,
  `PENDING`, and `BLOCKED` stay. [`05-task-runner/03-hitl-gate`](../05-task-runner/03-hitl-gate.md).
- One tick dispatches at most one task, then yields to the trampoline, so a
  synchronous `noop` completion can unblock the next row without recursion.
- Unknown `dependsOn` ids throw from `createTask`. The HTTP layer turns that
  into 400 `invalid_dependsOn`.

## 6. Active migration

The store is at migration 002. There is no pending migration in
`server/src/runner/migrations/`.

`TaskSource` still includes `daemon_triggered`. The v2 scanner does not
create tasks. The value is unused by current writers. The task log is the
`events` table.
