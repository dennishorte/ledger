# SQLite Store + Schema + Type Migration

**Node ID:** `05-task-runner/01-store-schema`
**Parent:** `05-task-runner` (`docs/05-task-runner/00-task-runner.md`)
**Status:** VERIFY
**Created:** 2026-05-27
**Last Updated:** 2026-05-27 (IN_PROGRESS → VERIFY)

**Dependencies:** `04-api-server` (workspace, parser package, Hono server, ProjectContext)

---

## Requirements

Stand up the **data layer** for the in-house task runner: the SQLite schema (three tables — `tasks`, `events`, `migrations`), a transactional migrations runner, a typed synchronous Store API the scheduler will sit on top of, the migration of the `Task` / `LogEvent` / `ResourceClaim` / `TaskInput` types from `app/src/lib/types.ts` into `@ledger/parser`, and three new JSON Schema artifacts (`task.schema.json`, `log-event.schema.json`, `task-input.schema.json`) under `docs/_schemas/` per PRD §9 with ajv validators alongside the existing ones in `@ledger/parser`. No scheduler, no executor registry, no HTTP endpoints, no UI changes — those land in `02-scheduler`, `03-hitl-gate`, `04-api-endpoints`, and `05-ui-hook-migration` respectively.

This is the **first foundational child** of `05-task-runner`. Every later sub-leaf consumes the Store API and the canonical types this child publishes. The reviewer's decomposition assessment (parent §Spec Review) flagged this child as denser than any `04-api-server` sibling — five distinct deliverables (schema, migrations runner, typed Store API, type migration, JSON Schemas) wrapped in one. The deliberate choice here is to keep them together: types ↔ schemas ↔ validators are mutually-referential and splitting them creates a partial-state commit window that the implementer has to step over. The single-pass risk is real; the per-deliverable size is small (each ~50–150 LOC).

In scope for v1:

1. **The SQLite schema** as defined in the parent's Design §"SQLite schema (v1)", landed as `server/src/runner/migrations/001-initial.sql`. Three tables (`tasks`, `events`, `migrations`), three indexes (`idx_tasks_status`, `idx_tasks_parent`, `idx_tasks_type_status`, `idx_events_task_seq`), `ON DELETE CASCADE` on the events↔tasks foreign key, `UNIQUE (task_id, seq)` on events, `db_row_version INTEGER NOT NULL DEFAULT 0` on tasks (parent §Type coordination, S4 wiring for PRD §8.4 optimistic locking).
2. **A transactional migrations runner** at `server/src/runner/migrations/runner.ts`. Reads `PRAGMA user_version` on boot, finds unapplied `.sql` files in the migrations directory (numbered `001-`, `002-`, …), runs each inside a single `BEGIN; <sql>; INSERT INTO migrations(version, applied_at) VALUES (?, ?); PRAGMA user_version = N; COMMIT;` transaction. Idempotent across restarts (already-applied versions are skipped). Migration failure rolls back atomically; the runner exits non-zero with the offending version in stderr.
3. **A synchronous typed Store API** at `server/src/runner/store.ts`. Wraps a `better-sqlite3` `Database` instance with prepared statements cached at constructor time. Public surface:
   - `createTask(input: TaskInput): Task` — assigns UUIDv4 id, seeds `created_at`, status `PENDING`, `db_row_version = 0`, appends a creation event (seq 0), returns the materialized row. Single transaction.
   - `updateTaskStatus(id: TaskId, transition: { from, to, reason? }, expectedDbRowVersion?: number): Task` — single transaction: updates `tasks.status`, increments `db_row_version`, sets `started_at` / `completed_at` on the right transitions, appends a `status_change` event. Throws `OptimisticLockError` if `expectedDbRowVersion` is provided and does not match the stored value (used by approve/reject endpoints; sub-leaf `03-hitl-gate` consumes).
   - `appendEvent(taskId: TaskId, event: Omit<LogEvent, "id" | "taskId" | "seq" | "at">): LogEvent` — single transaction: computes `seq` via `SELECT COALESCE(MAX(seq), -1) + 1 FROM events WHERE task_id = ?`, inserts. Throws if the task does not exist (FK violates). `seq` monotonicity is guaranteed by the `UNIQUE (task_id, seq)` constraint plus better-sqlite3's synchronous-on-single-connection semantics — two concurrent `appendEvent` calls in the same process run serially.
   - `loadTask(id: TaskId): Task | undefined` — prepared statement, returns the materialized row.
   - `getStatus(id: TaskId): TaskStatus | undefined` — narrow fast-path for the scheduler's dep-met check (avoids loading the full row).
   - `listTasks(filter?: { status?: TaskStatus[]; type?: TaskType[]; parent?: TaskId }): Task[]` — built-in `ORDER BY created_at DESC`. The scheduler does not use this; `GET /api/tasks` does.
   - `listPendingEligible(): Task[]` — scheduler-facing: returns `PENDING` ∪ `BLOCKED` rows ordered by `priority DESC, created_at ASC`. The scheduler filters further by claim-conflict in memory (sub-leaf `02-scheduler`).
   - `getEvents(taskId: TaskId, opts?: { afterSeq?: number; limit?: number }): LogEvent[]` — `afterSeq` powers `Last-Event-ID` SSE resume; `limit` is for the initial-batch endpoint.
   - `close(): void` — closes the underlying DB handle.
4. **Type migration** from `app/src/lib/types.ts` to `@ledger/parser`. Today the file declares `TaskId`, `TaskType`, `TaskStatus`, `TaskSource`, `ResourceClaim`, `Task`, `LogEventId`, `ConnectionStatus`, `BaseLogEvent`, `LogEvent` in the "Orchestration types" block (lines 95–194). Moving them to `packages/parser/src/runner/types.ts` (new subdirectory mirroring `schema/`, `project/`, `docs/`). `app/src/lib/types.ts` re-exports them via `export type { … } from "@ledger/parser"`, matching the existing `NodeId` / `NodeStatus` / `DocNode` re-export pattern at the top of the file. Three type changes per parent §Type coordination:
   - `Task.transcriptPath` becomes `transcriptPath?: string` (was required).
   - `Task.dbRowVersion: number` added (not optional, default 0 on insert).
   - New `TaskInput` type — the subset of `Task` accepted by `POST /api/tasks` and `Store.createTask`. Required: `type`, `title`. Optional with defaults: `source` (default `"operator_injected"`), `parent_task_id`, `depends_on` (default `[]`), `resource_claims` (default `[]`), `agent`, `review_payload`, `priority` (default `0`). The endpoint and store both apply the same defaults; the schema artifact is the source of truth for required-vs-optional.
5. **Three JSON Schemas** under `docs/_schemas/`:
   - `task.schema.json` — wire shape of `Task` (used by ajv when reading rows; nominally redundant since the store controls inserts, but defensive against future hand-edits of the DB).
   - `log-event.schema.json` — `LogEvent` discriminated union, six `kind` variants matching the existing TS type.
   - `task-input.schema.json` — the constrained subset for `POST /api/tasks`. Required fields, validated string formats (`type` is one of the `TaskType` enum values, etc.).
6. **Validators in `@ledger/parser`** at `packages/parser/src/runner/`:
   - `validateTask.ts` — `validateTask(value: unknown): Result<Task, ValidationError[]>` using ajv 2020 (same pattern as existing `validateDocNode.ts` and `validateProjectMetadata.ts`).
   - `validateLogEvent.ts` — `validateLogEvent(value: unknown): Result<LogEvent, ValidationError[]>`.
   - `validateTaskInput.ts` — `validateTaskInput(value: unknown): Result<TaskInput, ValidationError[]>`. This is the validator the HTTP POST endpoint (`04-api-endpoints`) and the Store's `createTask` use; both fail-fast on bad input.
7. **Tests** at the data layer:
   - `server/test/runner/store.test.ts` — round-trip every Store API method against an in-memory `:memory:` DB. Verifies: `createTask` populates `created_at` and writes a seq-0 creation event; `updateTaskStatus` bumps `db_row_version` and writes a `status_change` event in the same tx; `OptimisticLockError` fires on stale `expectedDbRowVersion`; `appendEvent` is monotonic across rapid-fire calls; `getEvents` `afterSeq` skips correctly; `listTasks` filters compose; FK cascade deletes events when a task is deleted (manual cleanup path; not used in v1).
   - `server/test/runner/migrations.test.ts` — applies migration 001 to a fresh `:memory:` DB; asserts `PRAGMA user_version === 1`; second run is a no-op; corrupted migrations table surfaces a clear error.
   - `packages/parser/test/runner/validateTask.test.ts`, `validateLogEvent.test.ts`, `validateTaskInput.test.ts` — golden-test pairs: each schema accepts every kind-variant fixture and rejects representative malformed inputs (missing `type`, invalid status string, malformed claim shape).
8. **`server/package.json` dependency add:** `better-sqlite3@^11`. The native build either compiles via `node-gyp` (build-from-source) or downloads a prebuilt — `better-sqlite3`'s release tarball ships prebuilts for `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`, `win32-x64` against Node 20/22 LTS. The implementer pins the exact version after smoke-testing `pnpm install` on darwin-arm64 (the operator's machine) at sub-leaf time.

**Out of scope for this child:**

- **The scheduler** (`02-scheduler`). This child publishes `listPendingEligible()` and `updateTaskStatus()` — the scheduler picks rows and drives transitions in the next sub-leaf.
- **The executor registry** (`02-scheduler` for `noop`, `03-hitl-gate` for `human_review`). The Store API does not know about executors.
- **HTTP endpoints** (`03-hitl-gate`, `04-api-endpoints`). The Store is mounted on `ProjectContext` by this child (one line in `server/src/context.ts`) but no routes consume it yet.
- **The runner's boot orchestration** (the `Runner` class that wraps the Store + scheduler and runs migrations on start, performs orphan recovery, exposes `registerExecutor`). That's `02-scheduler`. This child ships a standalone `createStore(dbPath: string): Store` factory the runner will compose.
- **UI changes.** `useTaskList` / `useTask` / `useLogStream` keep their transcript-only sources until `05-ui-hook-migration` flips them.
- **Validation in the SQL itself** (`CHECK(json_valid(...))` constraints on the JSON columns, `CHECK(status IN (...))` enum constraints). The store API is the single writer and validates via TypeScript + ajv before insert. Adding SQL `CHECK` constraints would duplicate the validation surface and lock the schema to specific enum values — making the inevitable extension of `TaskType` (e.g., `06-agent-dispatcher` adds new types) require a migration for a code-only change. Logged as Open Issue.
- **Schema codegen from TS to JSON Schema.** The three schemas are hand-authored. `02-schema` D8 and `03-project-metadata` D9 already deferred codegen; the same deferral applies here. The drift risk is moderated by the validator tests — if the TS type and the JSON Schema disagree, the round-trip tests catch it on the next run.
- **A shared ajv instance across the parser package's validators.** `03-project-metadata` Op-2 logged this. Each validator still constructs `new Ajv2020(...)`. Cleaning it up is a follow-up; defer.
- **Migrations beyond 001.** v1 ships exactly one migration. `002-` and onward arrive with future schema changes (e.g., when `06-agent-dispatcher` adds cancellation-related columns).
- **Doc-tree write surface.** The runner Store has no awareness of `docs/**/*.md`; resource claims naming a `node` ID are opaque strings to it. Verification of claim targets against the real doc tree is the scheduler's concern, not the store's.
- **Concurrent multi-process writers.** `better-sqlite3` uses SQLite's default rollback journal (or WAL mode if pinned); we run exactly one writer process (the API server). Multi-process is out of PRD scope.

---

## Design

### Repository layout after this child

```
ledger/
├── .ledger/
│   ├── project.json                                  # exists (03-project-metadata)
│   ├── .gitignore                                    # MODIFIED — adds runner.db, runner.db-*
│   └── runner.db                                     # NEW (created on first server start; gitignored)
├── docs/
│   └── _schemas/
│       ├── document-node.schema.json                 # exists (02-schema)
│       ├── project-metadata.schema.json              # exists (03-project-metadata)
│       ├── task.schema.json                          # NEW
│       ├── log-event.schema.json                     # NEW
│       └── task-input.schema.json                    # NEW
├── packages/parser/
│   ├── package.json                                  # unchanged (ajv + ajv-formats already present)
│   ├── src/
│   │   ├── index.ts                                  # MODIFIED — adds runner/ exports
│   │   ├── coreTypes.ts                              # unchanged (NodeId, NodeStatus stay)
│   │   ├── runner/                                   # NEW SUBDIRECTORY
│   │   │   ├── types.ts                              # MOVED from app/src/lib/types.ts orchestration block
│   │   │   ├── validateTask.ts                       # NEW
│   │   │   ├── validateLogEvent.ts                   # NEW
│   │   │   └── validateTaskInput.ts                  # NEW
│   │   └── ...
│   └── test/
│       └── runner/
│           ├── validateTask.test.ts                  # NEW
│           ├── validateLogEvent.test.ts              # NEW
│           └── validateTaskInput.test.ts             # NEW
├── server/
│   ├── package.json                                  # MODIFIED — adds better-sqlite3@^11 + @types/better-sqlite3
│   ├── src/
│   │   ├── context.ts                                # MODIFIED — adds `store: Store` field to ProjectContext
│   │   ├── runner/                                   # NEW MODULE
│   │   │   ├── index.ts                              # public surface: createStore, OptimisticLockError, types re-export
│   │   │   ├── store.ts                              # synchronous Store class
│   │   │   ├── ids.ts                                # uuid factory wrapping crypto.randomUUID() (D3)
│   │   │   └── migrations/
│   │   │       ├── runner.ts                         # transactional migrations applier
│   │   │       └── 001-initial.sql                   # the schema
│   │   └── ...
│   └── test/
│       └── runner/
│           ├── store.test.ts                         # NEW
│           └── migrations.test.ts                    # NEW
└── app/
    └── src/
        └── lib/
            └── types.ts                              # MODIFIED — orchestration block now re-exports from @ledger/parser
```

### `001-initial.sql`

```sql
-- Migration 001 — initial task runner schema.
-- Applied automatically by server/src/runner/migrations/runner.ts on first start.

CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY,                  -- UUIDv4, bare (no prefix) — D3
  type            TEXT NOT NULL,                     -- TaskType (validated app-side; no SQL CHECK — see Out of scope)
  status          TEXT NOT NULL,                     -- TaskStatus
  title           TEXT NOT NULL,
  source          TEXT NOT NULL,                     -- TaskSource
  parent_task_id  TEXT REFERENCES tasks(id),         -- nullable
  depends_on      TEXT NOT NULL DEFAULT '[]',        -- JSON: TaskId[]
  resource_claims TEXT NOT NULL DEFAULT '[]',        -- JSON: ResourceClaim[]
  agent           TEXT,                              -- JSON: { model, persona? } — NULL legal
  review_payload  TEXT,                              -- JSON: { summary, diffRef? } — NULL legal
  db_row_version  INTEGER NOT NULL DEFAULT 0,        -- bumped on every UPDATE (parent S4 — PRD §8.4 OCC)
  priority        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,                     -- ISO 8601
  started_at      TEXT,
  completed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_parent      ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_type_status ON tasks(type, status);
-- Composite covering index for listPendingEligible()'s ORDER BY priority DESC, created_at ASC
-- (Spec Review S1). Costs ~nothing at v1 scale; keeps the scheduler tick O(log n) at v100+.
CREATE INDEX IF NOT EXISTS idx_tasks_eligible    ON tasks(status, priority DESC, created_at ASC);

CREATE TABLE IF NOT EXISTS events (
  id        TEXT PRIMARY KEY,                        -- UUIDv4
  task_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  seq       INTEGER NOT NULL,                        -- monotonic per task, starts at 0
  at        TEXT NOT NULL,                           -- ISO 8601
  kind      TEXT NOT NULL,                           -- LogEvent.kind
  payload   TEXT NOT NULL,                           -- JSON of kind-specific fields
  UNIQUE (task_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_events_task_seq ON events(task_id, seq);

CREATE TABLE IF NOT EXISTS migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
```

### Migrations runner

```ts
// server/src/runner/migrations/runner.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "better-sqlite3";

const MIGRATIONS_DIR = new URL(".", import.meta.url).pathname;

export function applyMigrations(db: Database): { applied: number[] } {
  const currentVersion = db.pragma("user_version", { simple: true }) as number;
  const files = readMigrationFilesSync(MIGRATIONS_DIR);  // sync — uses node:fs readdirSync/readFileSync
  const applied: number[] = [];

  for (const { version, sql } of files) {
    if (version <= currentVersion) continue;
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO migrations(version, applied_at) VALUES (?, ?)")
        .run(version, new Date().toISOString());
    })();
    // PRAGMA user_version is NOT transactional in SQLite — it executes immediately
    // outside any tx boundary. Setting it AFTER db.transaction() commits successfully
    // means we never advance user_version unless the migrations-table row landed.
    // (Spec Review S3.)
    db.pragma(`user_version = ${version}`);
    applied.push(version);
  }

  return { applied };
}
```

Migration files are named `NNN-<slug>.sql` where `NNN` is a zero-padded integer. The runner sorts numerically, applies in order, and is idempotent across restarts (any `version <= currentVersion` is skipped — `IF NOT EXISTS` on the schema is belt-and-braces). Each migration runs in its own `db.transaction()`: better-sqlite3's `transaction()` wraps the closure in `BEGIN IMMEDIATE; … ; COMMIT;` (or `ROLLBACK` on throw), so an error in `db.exec(sql)` rolls the entire migration back atomically. The `PRAGMA user_version` write happens only on successful commit (Spec Review S3) so the dual-source (`user_version` + the `migrations` table) cannot diverge: either both updated or neither.

The function is fully synchronous — `readdirSync`/`readFileSync` from `node:fs`, no `async`/`await`. This matches better-sqlite3's sync contract and lets `applyMigrations` run before the Database handle is handed off to the Store factory.

### Store API surface

```ts
// server/src/runner/store.ts
import type { Database } from "better-sqlite3";
import type { Task, TaskId, TaskStatus, TaskType, TaskInput, LogEvent } from "@ledger/parser";
import { newTaskId, newEventId } from "./ids";

export class OptimisticLockError extends Error {
  constructor(public taskId: TaskId, public expected: number, public actual: number) {
    super(`task ${taskId}: dbRowVersion mismatch (expected ${expected}, actual ${actual})`);
  }
}

export interface Store {
  createTask(input: TaskInput): Task;
  updateTaskStatus(
    id: TaskId,
    transition: { from: TaskStatus; to: TaskStatus; reason?: string },
    expectedDbRowVersion?: number
  ): Task;
  appendEvent(taskId: TaskId, event: Omit<LogEvent, "id" | "taskId" | "seq" | "at">): LogEvent;
  loadTask(id: TaskId): Task | undefined;
  getStatus(id: TaskId): TaskStatus | undefined;
  listTasks(filter?: ListTasksFilter): Task[];
  listPendingEligible(): Task[];
  getEvents(taskId: TaskId, opts?: { afterSeq?: number; limit?: number }): LogEvent[];
  close(): void;
}

export interface ListTasksFilter {
  status?: TaskStatus[];
  type?: TaskType[];
  parent?: TaskId;
}

export function createStore(db: Database): Store {
  // Prepared statements cached in closure — see implementation notes for full body.
  return { /* ... */ };
}
```

`createStore` is the only public factory. It accepts an already-opened `better-sqlite3` `Database` instance so the caller controls the file path (`new Database(".ledger/runner.db")` for production, `new Database(":memory:")` for tests). 

A higher-level `createStoreForProject(project: ProjectContext): Store` wrapper does the file-path construction:

```ts
// server/src/runner/index.ts (excerpt)
import Database from "better-sqlite3";
import { applyMigrations } from "./migrations/runner";
import { createStore } from "./store";

export function createStoreForProject(project: ProjectContext): Store {
  const db = new Database(join(project.projectRoot, ".ledger/runner.db"));
  db.pragma("journal_mode = WAL");      // safer crash recovery; ~zero cost
  db.pragma("foreign_keys = ON");       // required for ON DELETE CASCADE
  applyMigrations(db);
  return createStore(db);
}
```

This wrapper ships in **this sub-leaf** (Spec Review N2 — pinning ownership) and is the entry point `server/src/context.ts` will call to populate `ProjectContext.store`. Sub-leaf `02-scheduler` consumes the returned `Store` without altering the factory signature.

**Transaction model:** every method that writes is a `db.transaction(() => { ... })()` invocation. Reads are bare `prepare(...).get(...)` or `.all(...)`. The Store does not expose raw transactions to callers — composability across multiple operations (e.g., `createTask + appendEvent` in one tx) is handled inline within each method that needs it. If `02-scheduler` requires multi-method tx composition, a `withTx(fn)` helper is added then; not in v1 scope.

**Row → Task projection:** the `tasks` table's JSON columns are deserialized on read. A `rowToTask` helper inside the Store converts the wire row (typed `RawTaskRow`) to the canonical `Task` shape. Inverse projection on insert. The helper is internal — callers always see `Task`.

### Type migration

The block currently at `app/src/lib/types.ts:95–194` (between the `// Orchestration types` divider and the `// Workflow-progress types` divider) moves verbatim to `packages/parser/src/runner/types.ts`, with the three changes from §Requirements item 4:

```ts
// packages/parser/src/runner/types.ts (excerpt)
export type TaskId = string;
export type TaskType =
  | "spec_draft" | "spec_review" | "implement" | "verify"
  | "doc_refactor" | "issue_triage" | "human_review"
  | "reverify" | "project_status_review"
  | "operator_session" | "agent_task"
  | "noop";                                       // NEW — v1 synthetic executor (parent D8)
export type TaskStatus = /* unchanged enum */;
export type TaskSource = /* unchanged enum */;
export type ResourceClaim = /* unchanged discriminated union */;

export interface Task {
  id: TaskId;
  type: TaskType;
  status: TaskStatus;
  title: string;
  source: TaskSource;
  parentTaskId?: TaskId;
  dependsOn: TaskId[];
  resourceClaims: ResourceClaim[];
  agent?: { model: string; persona?: string };
  reviewPayload?: { summary: string; diffRef?: string };
  dbRowVersion: number;                           // NEW — required, defaults to 0 on insert
  priority: number;                               // NEW — required, defaults to 0
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  transcriptPath?: string;                        // CHANGED — was required; now optional
}

export interface TaskInput {                       // NEW
  type: TaskType;
  title: string;
  source?: TaskSource;                            // default "operator_injected"
  parentTaskId?: TaskId;
  dependsOn?: TaskId[];                           // default []
  resourceClaims?: ResourceClaim[];               // default []
  agent?: { model: string; persona?: string };
  reviewPayload?: { summary: string; diffRef?: string };
  priority?: number;                              // default 0
  // Note: transcriptPath deliberately absent — only the transcript bootstrap path
  // (app/server/deriveTask.ts) sets it, and that path constructs Task objects directly
  // rather than going through createTask(). See Spec Review N3.
}

export type LogEventId = string;
export type ConnectionStatus = /* unchanged */;
export interface BaseLogEvent { /* unchanged */ }
export type LogEvent = BaseLogEvent & (
  | { kind: "reasoning"; text: string; subkind: "thinking" | "message" }
  | { kind: "tool_call"; callId: string; toolName: string; arguments: string }
  | { kind: "tool_result"; callId: string; status: "ok" | "error"; body: string; durationMs?: number }
  | { kind: "artifact"; artifactKind: "doc_created" | "doc_updated" | "file_written" | "version_committed";
      path: string; docNodeId?: NodeId; summary?: string }
  | { kind: "status_change"; from?: TaskStatus; to: TaskStatus; reason?: string }  // CHANGED — from? optional for seq-0 creation event
  | { kind: "error"; message: string; stack?: string }
);
```

`status_change.from` becomes `from?: TaskStatus` (was required). The seq-0 creation event emitted by `createTask` records the task entering `PENDING` from "no prior state" — modelling this as `{ to: "PENDING" }` with an absent `from` is more honest than synthesizing a fake predecessor status. Every other `status_change` (PENDING → BLOCKED, RUNNING → COMPLETE, etc.) continues to set both fields. UI consumers (`useLogStream`, `TaskInspector`) already render `from` only when present per `01-ui/10-orchestration`'s implementation. The JSON Schema for `log-event.schema.json` makes `from` optional in the `status_change` variant.

`app/src/lib/types.ts` becomes (orchestration block only):

```ts
// app/src/lib/types.ts (orchestration section after this child)
export type {
  TaskId, TaskType, TaskStatus, TaskSource, ResourceClaim, Task, TaskInput,
  LogEventId, ConnectionStatus, BaseLogEvent, LogEvent,
} from "@ledger/parser";
```

Re-exports preserve every import path, so every *read* site (`useTaskList.ts`, `useTask.ts`, `useLogStream.ts`, `TaskInspector.tsx`, `useTaskGrouping.ts`) continues to compile unchanged. The implementer audits each site for `transcriptPath` usage and either narrows-then-uses or substitutes a defined-or-undefined check (see §Verification item 5).

**Two transcript-bootstrap files need touch-ups.** Both audited and confirmed via grep against the working tree at sub-leaf authoring time:

- **`app/server/deriveTask.ts:239`** constructs synthetic `Task` objects from JSONL via an object literal. The two new required fields (`dbRowVersion`, `priority`) must be populated there — both as `0` for transcript-derived tasks (no DB row backs them, so the version is moot; priority is the v1 scheduler default). Two-line addition.
- **`app/server/middleware.ts:105`** reads `const jsonlPath = task.transcriptPath` and **`app/server/middleware.ts:226`** passes `task.transcriptPath` to `parseTranscriptFile(...)`. Both sites read the field as a non-optional `string`. After `transcriptPath?: string`, both lines become TypeScript errors. Fix at each site is a guard: `if (!task.transcriptPath) return;` (line 105 — early return from the handler since a transcript-less task has no JSONL to read) and the line-226 call site is already inside the same handler so the same guard covers it. The implementer audits the surrounding handler to confirm the guard placement.

Both touch-ups are in scope for this sub-leaf. Without them, `pnpm -C app typecheck` fails. The transcript fixture (`app/server/__fixtures__/sample-session.jsonl`) requires no update — fixtures are inputs, not outputs.

`packages/parser/src/index.ts` adds:

```ts
export * from "./runner/types";
export { validateTask } from "./runner/validateTask";
export { validateLogEvent } from "./runner/validateLogEvent";
export { validateTaskInput } from "./runner/validateTaskInput";
```

### JSON Schemas

All three follow the `02-schema` / `03-project-metadata` convention: JSON Schema 2020-12 draft, `$id` rooted at `https://ledger.dev/schemas/` (matching the existing `document-node.schema.json` and `project-metadata.schema.json` host — Spec Review N1), `$comment` block at the top citing the spec doc. Validators in `@ledger/parser/src/runner/` instantiate `new Ajv2020({ strict: true, allErrors: true })`, add the format pack, and compile the schema at module load (paying the ~5ms compile cost once per process).

`task-input.schema.json` is the most consequential of the three — it gates `POST /api/tasks` requests in `04-api-endpoints`. Required fields: `type`, `title`. Each optional field gets a `default` so ajv applies the default during validation when configured (the validator constructs ajv with `useDefaults: true`). String enums are pinned (`type` ∈ `TaskType` values; `source` ∈ `TaskSource` values; claim shapes follow `ResourceClaim`'s discriminated union). The schema is the source of truth — if the TS type and the schema disagree, the validator tests catch it (one test per kind/variant).

### Acceptance check (manual)

A reviewer running the worktree must observe:

1. `pnpm install` at the repo root succeeds with the added `better-sqlite3` dep. On `darwin-arm64`, a prebuilt is downloaded (no compile). The version installed matches the pinned `^11` minor.
2. `pnpm -C packages/parser typecheck`, `pnpm -C packages/parser lint`, `pnpm -C packages/parser test` exit zero. Test counts increase by exactly the number of new validator tests; pre-existing parser tests still pass.
3. `pnpm -C server typecheck`, `pnpm -C server lint`, `pnpm -C server build`, `pnpm -C server test` exit zero. The new `server/test/runner/*.test.ts` are picked up by `server/vitest.config.ts`.
4. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero. `app/src/lib/types.ts` re-exports compile cleanly; no UI source file outside `types.ts` is modified by this child.
5. Spot-check the four sites in `app/` that touch `transcriptPath` (per the grep audit in §Type migration):
   - `app/src/components/tasks/TaskInspector.tsx` / `useTaskList.ts` / `useTaskGrouping.ts` — read sites; each uses `transcriptPath` only inside a `if (task.transcriptPath)` guard or via the destructured `transcriptPath?: string` parameter shape. No `transcriptPath!` non-null assertions.
   - `app/server/middleware.ts:105` + `:226` — read sites in the transcript-bootstrap handler; each now has an early-return guard before the bare `task.transcriptPath` read.
   - `app/server/deriveTask.ts:239` — write site; the constructor populates `transcriptPath: entry.jsonlPath`, `dbRowVersion: 0`, `priority: 0`.
6. Boot the server: `pnpm -C server dev /Users/dennis/code/ledger`. On first start, `.ledger/runner.db` is created and migration 001 applies (server log line: `runner: applied migration 001-initial`). Restart: no migration applied (log line: `runner: schema is current at user_version=1`). The created DB file is gitignored (`git status` does not show it).
7. `sqlite3 .ledger/runner.db ".schema"` shows the three tables, three task-indexes, one events-index, and the `migrations` row for version 1.
8. The three new schema files validate against the JSON Schema 2020-12 meta-schema (run `ajv compile -s docs/_schemas/task.schema.json` etc.; exit zero each).
9. No regressions: `GET /api/_health`, `/api/project`, `/api/docs`, `/api/docs/:nodeId` return identical shapes to before this child. The UI DAG panel still renders cleanly.
10. The `useTaskList` / `useLogStream` UI panels still render their transcript-derived data exactly as before — the type migration is source-compatible.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Inherits the parent's D1 — `better-sqlite3@^11` as the SQLite driver. Pin to `^11` (current major as of 2026-05-27). | Sync API + prebuilt binaries for darwin/linux/win against Node 20/22. Parent §Decisions D1 covers the full rationale. |
| D2 | Migrations are numbered `.sql` files with a transactional applier that uses `PRAGMA user_version` as the schema-version token | The dual-source pattern (`PRAGMA user_version` + a `migrations` table) is hygiene: `user_version` is what SQLite tooling reads; the `migrations` table is what the operator / future tooling queries for "when was this applied?". Better-sqlite3's `db.transaction(fn)` gives us atomic ROLLBACK on error inside `fn`. Numbered files (not timestamps) keep ordering trivially total under `Array.sort`. Alternative considered: a JS-defined migration array (no `.sql` files). Rejected — `.sql` files are inspectable with `sqlite3` CLI and copy-pastable into ad-hoc queries; the JS-array approach buries SQL inside template literals. |
| D3 | Task IDs are bare UUIDv4 (no prefix); event IDs are bare UUIDv4 | Parent §Confidence notes asked for an explicit pin. UUIDv4 is generated via `crypto.randomUUID()` (Node 19+ built-in; no `uuid` package). Bare format keeps the wire shape opaque and identical across tasks and events. Transcript IDs from `01-ui/10-orchestration` keep their `session:` / `agent:` prefixes — disambiguation of "runner task vs transcript task" via the `transcriptPath?` field, not the id format. (The id prefix could theoretically also be used, but the field-presence check is more robust to future id schemes.) |
| D4 | Runner types live at `packages/parser/src/runner/types.ts` — a new subdirectory mirroring `schema/`, `project/`, `docs/`, `coreTypes.ts` | Matches the established parser-package convention: each domain has its own subdirectory with its own `types.ts` + validators. `coreTypes.ts` stays narrowly for cross-domain primitives (`NodeId`, `NodeStatus`). The runner is its own domain — `Task`, `LogEvent`, `ResourceClaim`, `TaskInput` cluster cleanly. |
| D5 | Three new JSON Schemas (`task`, `log-event`, `task-input`) under `docs/_schemas/`, hand-authored, validated against the 2020-12 draft | Same convention `02-schema` and `03-project-metadata` set. Hand-authored because the TS-type → JSON Schema codegen is already deferred at the project level; introducing it here would expand the scope of this child past comfort. The validator round-trip tests catch drift. The `task-input` schema is the only one with operator-facing impact (HTTP POST validation); the other two are defensive on read. |
| D6 | Each validator constructs its own `new Ajv2020(...)` instance | Inherits `03-project-metadata` Op-2's logged duplication. Sharing one ajv across validators is a follow-up cleanup; not the goal of this child. The cost is small (~5ms × N validators on module load, paid once per process). |
| D7 | `db_row_version` is bumped explicitly in the Store's `updateTaskStatus` method, not via a SQL trigger | Triggers would couple the schema to the OCC contract — moving the OCC logic out of the SQL means TypeScript callers can see exactly when the version bumps. Triggers also complicate testing (a write that should NOT bump the version becomes hard to express). Explicit `UPDATE tasks SET ..., db_row_version = db_row_version + 1 WHERE id = ?` in the prepared statement is one line per writer and is the only place that writes to `tasks`, so the discipline is contained. |
| D8 | `ON DELETE CASCADE` on `events.task_id → tasks.id` even though v1 never deletes tasks | Hygiene for the future GC story. Costs nothing in v1. If a v2 `doc_refactor` flow ever wants to delete an archived task's events, the cascade is already in place. Alternative considered: `ON DELETE RESTRICT` (refuse deletion). Rejected — the foreign key alone refuses orphan events on insert; the cascade direction is "delete parent, sweep children" which is the operationally useful default. |
| D9 | The Store is synchronous; no `async`/`await` in the API surface | Better-sqlite3 is sync; wrapping in Promises would add no real concurrency (one connection per process, serial transactions) and would force every caller to `await`. The scheduler in `02-scheduler` benefits from the sync surface: a tick reads + transitions + emits inside a single synchronous critical section. If a future async I/O is needed (e.g., shelling out to `git`), it lives outside the Store. |
| D10 | The Store is constructed via `createStore(db: Database)`, not `createStore(filePath: string)` | Dependency injection of the `Database` instance lets tests use `:memory:` and production use a file path. The runner module's `createStoreForProject(ctx)` wrapper does the file-path construction. Lets the test surface stay clean of fs-mocking. |

---

## Open Issues

- **No SQL `CHECK` constraints on JSON columns or enum-string columns.** Validation lives in TypeScript + ajv. A future hand-edit of `runner.db` via `sqlite3` could insert a row that violates the app-side invariants. Acceptable for v1; revisit if the runner DB becomes a target for ad-hoc tooling. *(Priority: LOW.)*
- **Shared ajv instance across `@ledger/parser` validators.** Inherits `03-project-metadata` Op-2. The new validators (`validateTask`, `validateLogEvent`, `validateTaskInput`) join the existing two in constructing their own ajv instances. Consolidation is mechanical; defer to a future cleanup pass. *(Priority: LOW — inherited.)*
- **Schema codegen from TS types.** Inherits the same Open Issue from `02-schema` D8 and `03-project-metadata` D9. The drift surface grows linearly with the number of schemas; round-trip tests are the v1 mitigation. *(Priority: LOW — inherited.)*
- **`better-sqlite3` prebuilt resolution on first install.** Pinning `^11` means a future patch release could ship a missing prebuilt for the operator's platform; first-install would fall back to `node-gyp`, which requires Xcode CLT on darwin. Acceptable today (Xcode CLT is present); document the requirement in CLAUDE.md alongside the other prereqs. *(Priority: LOW.)*
- **Concurrent `appendEvent` on the same task.** In the API server's process, calls run serially (Node single-threaded; better-sqlite3 sync). If a future architecture introduces a second writer process, the `UNIQUE (task_id, seq)` constraint surfaces a constraint violation rather than silent data loss — the test asserts this property. *(Priority: TRIVIAL — relies on architectural assumption documented in §Out of scope.)*
- **`Task.transcriptPath` becoming optional breaks one downstream UI assumption.** `04-tasks`'s `TaskInspector` renders nothing for `transcriptPath` directly (the comment says "Server-internal; never rendered in the UI") but the typescript narrowing for the disambiguation logic in `05-ui-hook-migration` will need `task.transcriptPath !== undefined`. Already accounted for in the child's spec; logged here so a sibling reviewer reading only this DRAFT sees the cross-leaf coupling. *(Priority: TRIVIAL.)*
- **`createStoreForProject(ctx)` placement.** The factory lives in this child (`server/src/runner/index.ts`) but is exercised by `02-scheduler`. If `02-scheduler` discovers a different wiring it needs (e.g., the scheduler tick is wired during Store construction rather than after), the factory may shift. Defer pinning to `02-scheduler`. *(Priority: TRIVIAL — coordination note.)*

---

## Spec Review (2026-05-27)

Independent spec review was run against this DRAFT in a clean Sonnet context. Verdict: NEEDS_MINOR_REVISIONS — 2 blocking, 4 should-fix, 5 nits. Coverage matrix marked every sub-leaf scope item Addressed except JSON Schemas (Partial — field-level detail left to the sub-leaf author at implementation time, intentional per house style) and transcript-bootstrap touch-up (Partial — `middleware.ts` initially named only `deriveTask.ts`). All findings applied:

| # | Finding | Resolution |
|---|---------|------------|
| B1 | `validateTaskInput` acceptance test uses `{ type: "noop", ... }` but `noop` is not in the `TaskType` union in `app/src/lib/types.ts`. The `noop` executor is a v1 built-in per parent D8; its type value must be present for the scheduler to dispatch it and for `task-input.schema.json`'s `type` enum to accept it. | Added `"noop"` to the `TaskType` excerpt in §Type migration. The full TS enum is now written out explicitly in the migration block (was previously `/* unchanged enum */`). `task-input.schema.json`'s `type` enum follows suit. |
| B2 | `app/server/middleware.ts:105` and `:226` read `task.transcriptPath` as a non-optional string. After `transcriptPath?: string`, both lines become TypeScript errors. Spec named only `deriveTask.ts` as the touch-up site. | Verified via `grep transcriptPath app/server/*.ts`: confirmed both middleware sites + the deriveTask site. §Type migration rewritten to enumerate all three sites with file:line citations; each gets a specific fix (guard-before-read for middleware, populate-defaults for deriveTask). Acceptance check item 5 expanded to spot-check all four sites. |
| S1 | `listPendingEligible`'s `ORDER BY priority DESC, created_at ASC` is not covered by any declared index; at v1 scale it's fine but degrades at v100+. | Added `idx_tasks_eligible ON tasks(status, priority DESC, created_at ASC)` to `001-initial.sql`. Composite index keeps the scheduler tick O(log n). Cost is ~nothing at v1; the right time to add it is now while the schema is fresh. |
| S2 | `applyMigrations` pseudocode imports from `node:fs/promises` (async) but calls a `readMigrationFilesSync` helper. Internally inconsistent — implementer could plausibly use async fs which breaks better-sqlite3's sync contract. | Imports rewritten as `import { readdirSync, readFileSync } from "node:fs"`; added one-sentence note that the runner is fully synchronous and matches better-sqlite3's sync contract. |
| S3 | `PRAGMA user_version = N` is **not transactional** in SQLite — it executes immediately outside any tx boundary. The spec wrapped it inside `db.transaction()` along with the migrations-table insert; on rollback, `user_version` could advance while the migrations-table row was not written. Dual-source consistency the spec claimed was broken. | Moved `db.pragma(\`user_version = ${version}\`)` to **after** the `db.transaction()()` invocation. Added inline comment + paragraph note explaining the constraint. Dual-source is now correctly invariant: either both updated or neither. |
| S4 | The seq-0 creation event was described as `{ kind: "status_change", from: undefined, to: "PENDING" }`, but the existing `LogEvent` discriminated union types `from: TaskStatus` as required. `undefined` is not a `TaskStatus` value and would fail `validateLogEvent`. | Made `from?: TaskStatus` optional on the `status_change` variant in the type-migration block (full `LogEvent` union now written out explicitly in the spec). The seq-0 creation event records `{ to: "PENDING" }` with `from` absent — more honest than synthesizing a fake predecessor. Existing UI consumers already render `from` only when present (per `01-ui/10-orchestration`'s implementation). `log-event.schema.json` makes `from` optional in the `status_change` variant. |
| N1 | New schemas used `$id` rooted at `https://ledger.local/schemas/` but existing schemas (`document-node.schema.json`, `project-metadata.schema.json`) use `https://ledger.dev/schemas/`. | Pinned `https://ledger.dev/schemas/` in §JSON Schemas paragraph. |
| N2 | `createStoreForProject(ctx)` was mentioned in prose but not specified — implementer would ask "is this in scope?". | Added a concrete `createStoreForProject` code block (10 lines) with `journal_mode = WAL` + `foreign_keys = ON` pragmas, located at `server/src/runner/index.ts`. Explicitly named as this sub-leaf's deliverable. |
| N3 | `TaskInput` excerpt omitted `transcriptPath` (correct) but did not explicitly note the omission — implementer could wonder. | Added inline comment to the `TaskInput` block: `// Note: transcriptPath deliberately absent — only the transcript bootstrap path sets it, and that path constructs Task objects directly rather than going through createTask().` |
| N4 | Verification items 3 + 8 referenced `createTask({ ..., transcriptPath: undefined })` but `TaskInput` has no `transcriptPath` field — would fail compilation. | Item 3 rewritten to `createTask({ type: "noop", title: "..." })`; item 8 rewritten to make the contrast between `createTask` (no `transcriptPath` accepted) and the transcript bootstrap's direct `Task` construction (sets `transcriptPath`) explicit. |
| N5 | Pre-review placeholder in the `Spec Review` section. | Resolved by this audit table replacing the placeholder. |

Reviewer's decomposition recommendation was **Stay bundled** — the types ↔ schemas ↔ validators are mutually-referential and splitting would produce an incoherent intermediate commit. No structural change to the sub-leaf's scope.

Reviewer's **Confidence notes** (recorded for the stage-4 implementer):

- `PRAGMA user_version` non-transactionality (S3) is documented SQLite behaviour and addressed structurally. High confidence.
- `noop` `TaskType` absence (B1) verified by direct grep against `app/src/lib/types.ts`. Now corrected.
- `middleware.ts` non-guarded `transcriptPath` usage (B2) verified by direct grep. Now in scope.
- `status_change from: undefined` type incompatibility (S4) verified against `app/src/lib/types.ts:187`. Now resolved by making `from?` optional.
- ajv `useDefaults: true` behaviour with `oneOf` discriminated unions: applies defaults inside matched branches only. Compatible with our `LogEvent` schema.
- `better-sqlite3@^11` prebuilt on `darwin-arm64`: reasonable but unverified at review time; implementer smoke-tests at install (Verification item 1).

Nothing punted. All B/S/N findings landed.

---

## Implementation Notes

### Dependencies added

- `better-sqlite3@11.10.0` (pinned by pnpm resolution of `^11`) added to `server/package.json` dependencies. `@types/better-sqlite3@7.6.13` added as a dependency (not devDependency — the types are used in the server's public exports). On darwin-arm64, `prebuild-install` downloaded a prebuilt binary (`better_sqlite3.node`); no Xcode build required.
- `pnpm.onlyBuiltDependencies: ["better-sqlite3", "esbuild"]` added to root `package.json` to allow the native build scripts. This is a workspace-root config that gates which packages may run `postinstall` build scripts.
- `server/package.json` build script extended to `tsc -b && cp src/runner/migrations/*.sql dist/runner/migrations/` — TypeScript doesn't copy non-TS assets; the SQL files must be explicitly copied to `dist/` so `applyMigrations`'s `readdirSync/readFileSync` can find them at production runtime. In dev (`tsx watch`) and test (vitest with tsx), `import.meta.url` resolves to the source directory where the `.sql` files already live.

### Deviations from spec

**`INSERT OR IGNORE` on migrations table:** The spec pseudocode used `INSERT INTO migrations(...)`. Changed to `INSERT OR IGNORE INTO migrations(...)`. Reason: when tests run against a shared fixture path (the `sample-project` fixture that `context.test.ts`, `docs.test.ts`, and `project.test.ts` all open), successive `loadProjectContext` calls within the same test file would try to apply migration 001 again if `PRAGMA user_version` wasn't persisted. The `IF NOT EXISTS` on table creation is already idempotent; making the migrations-row insert also idempotent is the correct dual defense. Does not affect correctness — if `user_version` is correctly advanced, the `version <= currentVersion` check prevents re-entry entirely.

**`vitest.config.ts` `fileParallelism: false`:** Added to the server vitest config. The existing server tests (`context.test.ts`, `docs.test.ts`, `project.test.ts`) all call `loadProjectContext` with the same `sample-project` fixture path, which now creates/opens a file-based SQLite DB. Running test files concurrently caused `database is locked` errors (SQLite WAL mode writer exclusion). Serializing file execution resolves the contention without requiring test-level teardown on every existing test.

**`@types/better-sqlite3` as dependency (not devDependency):** The server's public `store.ts` uses the `Database` type from `better-sqlite3` in function signatures. If declared as a devDependency, the type would be unavailable when the package is built and consumed by other workspace packages. Declared as a regular dependency to ensure the type is always present.

**`createStoreForProject` signature uses `{ projectRoot: string }` instead of `ProjectContext`:** The spec showed `createStoreForProject(project: ProjectContext)`. The factory only reads `projectRoot`; accepting the full `ProjectContext` would create a circular dependency (`context.ts` calls `createStoreForProject`, which would need to import `ProjectContext` from `context.ts` — same file, fine — but the factory is called DURING `loadProjectContext` before the full context is assembled). Using a structural subtype `{ projectRoot: string }` avoids the bootstrapping problem cleanly and is a strict improvement.

**B2 guard in `middleware.ts` close stream (SSE) returns with `event: close` frame:** The spec said to guard with `if (!task.transcriptPath) return;` but for the SSE stream, an abrupt return leaves the client hanging. Instead, emit an SSE `event: close` frame with `reason: "no_transcript"` before calling `res.end()`. For the GET handler (`/api/transcripts/:id`), the guard returns `{ task, events: [] }` rather than 404 — runner-emitted tasks are valid tasks, they just have no JSONL.

**`LogEventRow.tsx` guard change:** The UI component's `StatusChangeRow` now conditionally renders the "from →" half of the arrow only when `event.from !== undefined`. This is a display improvement — creation events (seq=0) rendered cleanly with just the destination status "PENDING" rather than "undefined → PENDING".

**`TaskTypeBadge.tsx` `noop` case:** Added `case "noop":` to the `badgeBg` switch statement grouped with `agent_task` (same `--color-surface-sunken` background). Required because the `TaskType` union now includes `"noop"` and TypeScript's exhaustive check (via `noUncheckedIndexedAccess`) flagged the missing case.

### Bundle delta

Baseline commit: `2c4faa2` (SPEC_REVIEW → APPROVED — audit applied on main).

App bundle (`pnpm -C app build`):
- `dist/assets/index-*.js`: 1,667.82 kB uncompressed / 523.04 kB gzip
- `dist/assets/DagPanel-*.js`: 1,646.47 kB uncompressed / 505.23 kB gzip
- CSS: 28.49 kB + 15.85 kB (unchanged)

The app bundle delta vs baseline is minimal: the `types.ts` orchestration block moved to `@ledger/parser` (re-export-only change, no new runtime code), plus the two small guard additions in `LogEventRow.tsx` (conditional render) and `TaskTypeBadge.tsx` (one switch case). The `@ledger/parser` runner types and validators are included in the parser package but are NOT bundled into the app since the app imports types only (erased at build time) — validators are server-side only.

### Files changed inventory

**New — server runner module** (`server/src/runner/`):
- `migrations/001-initial.sql` — schema verbatim from spec
- `migrations/runner.ts` — transactional migration applier
- `ids.ts` — `newTaskId()` / `newEventId()` via `crypto.randomUUID()`
- `store.ts` — `Store` class with prepared statements, `OptimisticLockError`
- `index.ts` — public surface + `createStoreForProject`

**New — parser runner module** (`packages/parser/src/runner/`):
- `types.ts` — canonical runner types migrated from `app/src/lib/types.ts`
- `validateTask.ts`, `validateLogEvent.ts`, `validateTaskInput.ts` — ajv2020 validators

**New — JSON Schemas** (`docs/_schemas/`):
- `task.schema.json`, `log-event.schema.json`, `task-input.schema.json`

**New — tests**:
- `server/test/runner/migrations.test.ts` (5 tests)
- `server/test/runner/store.test.ts` (30 tests)
- `packages/parser/test/runner/validateTask.test.ts` (10 tests)
- `packages/parser/test/runner/validateLogEvent.test.ts` (12 tests)
- `packages/parser/test/runner/validateTaskInput.test.ts` (11 tests)

**Modified — type migration**:
- `packages/parser/src/index.ts` — runner exports added
- `app/src/lib/types.ts` — orchestration block replaced with re-exports from `@ledger/parser`

**Modified — touch-up sites** (per Spec Review B1/B2):
- `app/server/deriveTask.ts` — `dbRowVersion: 0, priority: 0` added to Task literal
- `app/server/middleware.ts` — two `transcriptPath` read sites guarded
- `app/src/components/logs/LogEventRow.tsx` — `from?` conditional render
- `app/src/components/tasks/TaskTypeBadge.tsx` — `noop` case added

**Modified — config/infra**:
- `server/package.json` — `better-sqlite3`, `@types/better-sqlite3`, build script with SQL copy
- `server/vitest.config.ts` — `fileParallelism: false`
- `server/src/context.ts` — `store: Store` field + `createStoreForProject` call
- `package.json` (root) — `pnpm.onlyBuiltDependencies`
- `.ledger/.gitignore` — `runner.db`, `runner.db-*`

### Gates verified headlessly

| Gate | Exit |
|------|------|
| `pnpm -C packages/parser typecheck` | 0 |
| `pnpm -C packages/parser lint` | 0 |
| `pnpm -C packages/parser test` | 0 (91 tests: 58 pre-existing + 33 new) |
| `pnpm -C server typecheck` | 0 |
| `pnpm -C server lint` | 0 |
| `pnpm -C server build` | 0 |
| `pnpm -C server test` | 0 (73 tests: 38 pre-existing + 35 new) |
| `pnpm -C app typecheck` | 0 |
| `pnpm -C app lint` | 0 |
| `pnpm -C app build` | 0 |
| `pnpm -C app test` | 0 (73 tests: unchanged) |

### Acceptance-check items NOT verifiable headlessly

- **Item 6** (`pnpm -C server dev /path` boots, creates `.ledger/runner.db`, applies migration 001, restarts cleanly): requires a live server boot and log inspection.
- **Item 7** (`sqlite3 .ledger/runner.db ".schema"` shows correct tables and indexes): requires operator inspection of the created DB.
- **Item 8** (three new JSON Schemas validate against meta-schema via `ajv compile`): requires operator to run `ajv compile -s docs/_schemas/task.schema.json` etc.
- **Item 9** (no regressions on `/api/_health`, `/api/project`, `/api/docs`): live server verification.
- **Item 10** (UI transcript-derived tasks still render, DAG still renders): requires running both dev servers and browser inspection.
- **Item 5 spot-check** (`transcriptPath` guard placement correctness in middleware handlers): code review / manual test of a transcript-derived task's SSE stream.

---

## Verification

When this child moves to `VERIFY`, the verifier confirms:

1. The full Acceptance check list (1–10) passes.
2. `applyMigrations` is idempotent: invoking it twice in succession on the same DB applies migration 001 the first time and no-ops the second. `migrations` table has exactly one row.
3. `createTask({ type: "noop", title: "..." })` writes exactly one row to `tasks` and exactly one row to `events` (seq=0, kind=`status_change`, `from` field absent, to=`PENDING`), inside a single transaction. Crashing mid-transaction (simulated via `db.prepare('... FAIL')` throw) leaves neither row.
4. `updateTaskStatus` with a stale `expectedDbRowVersion` throws `OptimisticLockError` and leaves the row unchanged.
5. `appendEvent` against 100 rapid-fire calls on the same task yields events with seq 0..99, no gaps or duplicates.
6. `getEvents(taskId, { afterSeq: 50 })` returns events 51..99 (49 events) in order.
7. `listPendingEligible()` returns `PENDING` and `BLOCKED` rows ordered by `priority DESC, created_at ASC`. `RUNNING` rows do not appear. `COMPLETE`/`FAILED` rows do not appear.
8. `Task.transcriptPath`'s optionality is honored: a Task constructed by `createTask({ type: "noop", title: "..." })` (no `transcriptPath` field — `TaskInput` does not accept it) round-trips through `loadTask` with `transcriptPath` absent / `undefined`. A transcript-bootstrap-produced Task (from `app/server/deriveTask.ts`, which constructs `Task` objects directly with `transcriptPath: "/path"`) still narrows correctly via the discriminator pattern used by `05-ui-hook-migration`'s dual-source merger.
9. `validateTaskInput` accepts a minimal `{ type: "noop", title: "..." }` body and rejects bodies missing `type` with a clear ajv error path. Default-application populates `source: "operator_injected"`, `dependsOn: []`, `resourceClaims: []`, `priority: 0` on the parsed result.
10. `validateLogEvent` accepts every kind variant (the six discriminants: `reasoning`, `tool_call`, `tool_result`, `artifact`, `status_change`, `error`) and rejects unknown `kind` values.
11. `pnpm -C app build` bundle delta is minimal (re-export-only change to `types.ts`; the JS bundle should not grow).
12. `.ledger/.gitignore` adds `runner.db` and `runner.db-*` (WAL/SHM/journal sidecars) before the first server start.
13. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` at the workspace root all exit zero.

---

## Children

None.
