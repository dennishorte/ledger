# Scheduler + Executor Registry + Conflict Primitive + Orphan Recovery

**Node ID:** `05-task-runner/02-scheduler`
**Parent:** `05-task-runner` (`docs/05-task-runner/00-task-runner.md`)
**Status:** COMPLETE (v1, 2026-05-27)
**Created:** 2026-05-27
**Last Updated:** 2026-05-27 (VERIFY → COMPLETE — operator verification green)

**Dependencies:** `05-task-runner/01-store-schema` (Store API, runner types, `.ledger/runner.db`)

---

## Requirements

Stand up the **control loop** on top of `01-store-schema`'s data layer: the event-driven scheduler tick, the pure set-intersection conflict primitive, the in-process executor registry seeded with the `noop` built-in, the dep-met fast-path, transactional `status_change` event emission on every transition, and once-at-boot orphan recovery for `RUNNING` rows the previous process abandoned. No HTTP endpoints, no `human_review` executor, no SSE bridge, no UI changes — those land in `03-hitl-gate`, `04-api-endpoints`, and `05-ui-hook-migration` respectively.

This is the **first child to ship a `Runner` class** — the wrapper around the Store that owns the executor registry, drives the tick, and exposes `RunnerHandle` to executors. `04-api-endpoints` mounts a `Runner` instance onto `ProjectContext`; `03-hitl-gate` registers `human_review` against it; `06-agent-dispatcher` registers the real executors against it. Everything downstream consumes this child's `Runner` surface.

In scope for v1:

1. **A pure conflict primitive** at `server/src/runner/conflict.ts`: `conflicts(a: ResourceClaim[], b: ResourceClaim[]): boolean` per the parent's pseudocode. Set-intersection on `(kind, target)` where at least one side is `write`. Symmetric, O(|a|·|b|). No dependencies on Store or DB — pure function, trivially unit-testable.
2. **An executor registry** at `server/src/runner/executors.ts`: `Executor` interface, `noop` built-in implementation (calls `handle.complete(task.id)` synchronously inside `run()`), registry helpers (`registerExecutor(type, exec)`, `lookupExecutor(type): Executor | undefined`). The registry is a `Map<TaskType, Executor>` owned by the `Runner` instance — not a process-global — so tests can construct fresh runners without state bleed.
3. **A `Runner` class** at `server/src/runner/scheduler.ts` plus a `createRunnerForProject({ projectRoot })` factory at `server/src/runner/index.ts`. Public surface:
   - `runner.store: Store` — the underlying Store (for read endpoints).
   - `runner.createTask(input: TaskInput): Task` — wraps `store.createTask(input)` then `scheduleTick()`. Single entry point for task injection that any code path takes — `store.createTask` direct is only used by tests.
   - `runner.registerExecutor(type, exec): void` — registers an executor for a task type. Overwrites prior registration with a console warning (defensive; v1 use cases register once at boot).
   - `runner.tick(): void` — triggers a scheduler tick. Idempotent under concurrent calls (re-entrancy pattern below).
   - `runner.close(): void` — closes the underlying Store.
4. **An event-driven scheduler tick** with the state machine, status reasons, and conflict primitive exactly as the parent's §Scheduler tick section pins. Implementation specifics that the parent leaves to the sub-leaf:
   - **Re-entrancy pattern (D1).** A tick runs synchronously to completion (all DB writes via better-sqlite3 are sync) — but `noop`'s `handle.complete()` calls `scheduleTick()` from inside `run()`, which would re-enter the loop if uncoordinated. Pattern: the Runner holds two booleans (`ticking`, `pending`); `scheduleTick()` sets `pending = true` if a tick is already in-flight and returns; the outer tick loop is a `do { pending = false; tickOnce(); } while (pending);` trampoline. Recursive `complete()` calls become "one more pass," not stack growth.
   - **Triggers wired in this sub-leaf:** (a) `runner.createTask` calls `scheduleTick()` after the Store insert; (b) `handle.complete` / `handle.fail` call `scheduleTick()` after the Store transition. The third trigger from the parent ("task status change") is implicitly covered — every status-changing path goes through `handle.complete` or `handle.fail` (and in `03-hitl-gate`, through `handle.awaitHumanReview` + the approve/reject endpoints which call `scheduleTick()` themselves).
   - **Working set definition (D2).** The "in-flight working set" whose `resource_claims` are held is `status IN ('RUNNING', 'AWAITING_HUMAN_REVIEW')` — not `'RUNNING'` alone. `AWAITING_HUMAN_REVIEW` holds claims by design (parent §HITL gate item 3: "scheduler does **not** release the task's claims"). The query lives in this sub-leaf even though no v1 test in `02-scheduler` produces `AWAITING_HUMAN_REVIEW` rows — `03-hitl-gate` will exercise the AWAITING-tasks-block-conflicting-tasks behaviour without re-touching the scheduler.
   - **Dep-met check** uses `store.getStatus(depId) === "COMPLETE"` per dependency. `FAILED` deps surface a `blocked_by_dep:<failed-id>` reason and the dependent stays `BLOCKED` forever (parent D11). `undefined` (dep not found) is treated as not-complete; the dependent stays `BLOCKED` with a `blocked_by_dep:<missing-id>` reason. (No referential integrity check on `tasks.depends_on` at the SQL level — it's a JSON array, not a foreign key.)
   - **Reason precedence on transition to BLOCKED.** If a row is ineligible for multiple reasons (e.g., both a missing dep and a claim conflict), the dep is named first (`blocked_by_dep` wins over `blocked_by_claim_conflict`). The scheduler picks the first failing dep in `depends_on` array order; the conflict check only runs if all deps are COMPLETE. This is deterministic and matches the natural evaluation order in the dispatch pseudocode.
5. **`RunnerHandle` (subset surface for v1).** Methods shipped in this sub-leaf: `emit(taskId, event)` (delegates to `store.appendEvent`), `complete(taskId)` (transitions `RUNNING → COMPLETE`, emits `status_change`, calls `scheduleTick`), `fail(taskId, reason)` (transitions `RUNNING → FAILED` with reason captured in the `status_change` event payload, emits, calls `scheduleTick`). `awaitHumanReview` is **not** added by this sub-leaf — that's `03-hitl-gate`. The `Executor` interface accepts the v1 `RunnerHandle`; adding `awaitHumanReview` later is a non-breaking method addition.
6. **Status-reason constants** at `server/src/runner/scheduler.ts` (or a sub-file `reasons.ts` if it grows past ~20 LOC, but starting inline). Exported strings/builders matching the parent's enumeration: `blocked_by_dep(depId)`, `blocked_by_claim_conflict(conflictingId)`, `BLOCKED_NO_EXECUTOR`, `ORPHANED_ON_RESTART`. The `approved` and `rejected:<rationale>` reasons land with `03-hitl-gate`. Inlining a string-builder helper keeps the format pinned in one place — sub-leaves consuming reasons (`05-ui-hook-migration` parses them to surface BLOCKED rationale) can import from one source.
7. **Orphan recovery on boot.** Inside `createRunnerForProject`, after the Store is constructed and migrations have applied, scan for rows with `status = 'RUNNING'` and transition each to `FAILED` with reason `orphaned_on_restart`. Each transition is a single transaction (Store's `updateTaskStatus` already handles this); the `status_change` event records the orphaning. `AWAITING_HUMAN_REVIEW` rows are **left untouched** — they re-enter the suspended state on next boot (parent §HITL gate "Process restart durability"). `BLOCKED` rows are also left untouched — the next scheduler tick re-evaluates them.
8. **Scheduler dispatches the working set, not just one task.** The pseudocode's "Repeat from step 1 until no eligible task remains" means the trampoline keeps dispatching tasks as long as eligible ones exist. Three independent non-conflicting `noop` tasks injected before a tick runs should all transition through `RUNNING → COMPLETE` inside the same `tick()` invocation (because `noop.run` calls `handle.complete` synchronously, which sets `pending = true`, and the outer loop iterates). The test asserts this end-to-end ordering.
9. **`context.ts` wiring.** `ProjectContext` gains a `runner: Runner` field. The existing `store: Store` field stays — `runner.store` is the same reference; the existing `store`-typed callers (none yet outside tests as of `01-store-schema` COMPLETE) continue to work. `loadProjectContext` constructs the runner via `createRunnerForProject({ projectRoot })`, then assigns both `runner` and `store` (where `store = runner.store`). Reverting after `04-api-endpoints` lands is one line (drop the `store` field; tests adjust).
10. **Tests at every layer.** Unit (pure conflict primitive), executor registry (registration semantics, `noop` round-trip), integration (scheduler against in-memory store: dispatch, dep ordering, claim conflicts, blocked-no-executor, blocked-by-dep, blocked-by-conflict, BLOCKED→PENDING re-evaluation on predecessor completion, multiple non-conflicting parallel dispatches, fairness under priority), orphan recovery (RUNNING on boot → FAILED, AWAITING_HUMAN_REVIEW preserved, BLOCKED preserved).

**Out of scope for this child:**

- **The `human_review` executor.** `03-hitl-gate` adds it plus the `awaitHumanReview` method on `RunnerHandle`. This sub-leaf ships only `noop`; the registry surface accepts any executor (the registry is just a typed Map).
- **HTTP endpoints.** `04-api-endpoints` mounts `GET/POST /api/tasks*`. This child does not touch `server/src/routes/` or `server/src/server.ts` (beyond the `context.ts` wiring already noted).
- **SSE log streaming + in-process pub/sub.** `04-api-endpoints` adds `runner/events.ts` (the parent's planned subscriber bridge) when SSE lands. This sub-leaf writes events to the DB only — subscribers are not notified in-process; an SSE consumer in `04` will either poll the DB or subscribe through a wrapper added then.
- **UI changes.** `05-ui-hook-migration` flips `useTaskList` / `useTask` / `useLogStream` to dual-source. This child's only UI-visible effect (after `04-api-endpoints` lands) is that runner-emitted tasks appear in the merged list — but with `04` deferred, no UI consumer sees them yet.
- **Real executors** (`implement`, `verify`, `spec_review`, `doc_refactor`, `issue_triage`, `reverify`, `spec_draft`, `project_status_review`, `operator_session`, `agent_task`). Per parent D8 and the state-machine table, these stay unregistered in v1 → `blocked_no_executor`. `06-agent-dispatcher` registers them.
- **Task cancellation.** Parent §Out of scope. `POST /api/tasks/:id/cancel` isn't in v1.
- **Breakpoint insertion / priority override / `PATCH /api/tasks/:id`.** Parent §Out of scope.
- **Schema changes.** No migrations. The schema from `01-store-schema` covers everything this sub-leaf needs (`status_change` event kind, `db_row_version` on tasks, etc.).
- **Cross-process scheduler coordination.** PRD §7.1: one project per server process. The runner is in-process. No locking beyond SQLite's built-in writer exclusion.
- **Backpressure / rate limiting on dispatch.** Single-operator local-only. The tick dispatches as fast as it can — at v1 scale (≤10 in-flight, ≤100 total) the inner loop is a few hundred microseconds.
- **Doc-refactor guard as a special code path.** Parent D6 — the guard falls out of the conflict primitive's set-intersection when a `doc_refactor` task declares an exclusive write claim. No `if (task.type === "doc_refactor")` in the scheduler.
- **Resource-claim target validation against the doc tree.** A claim naming `node:99-fake` is opaque to the scheduler — it's just a key. The doc-tree side (`@ledger/parser`'s `DocGraph`) provides node-existence checking, but `02-scheduler` does not invoke it. Operator-injected nonsensical claims succeed; the scheduler doesn't care.
- **Metrics / observability beyond event log.** Parent §Out of scope.
- **Async fairness mitigations.** The scheduler always picks `ORDER BY priority DESC, created_at ASC` (Store's `listPendingEligible`). No priority inheritance, no aging, no preemption. A high-priority always-eligible task can starve lower-priority ones — acceptable at v1 scale (operator notices and adjusts priorities manually).

---

## Design

### Repository layout after this child

```
ledger/
├── docs/
│   └── 05-task-runner/
│       └── 02-scheduler.md                            # this spec
├── server/
│   ├── src/
│   │   ├── context.ts                                 # MODIFIED — adds runner: Runner field
│   │   └── runner/
│   │       ├── index.ts                               # MODIFIED — exports Runner, createRunnerForProject
│   │       ├── store.ts                               # unchanged
│   │       ├── ids.ts                                 # unchanged
│   │       ├── migrations/                            # unchanged
│   │       ├── scheduler.ts                           # NEW — Runner class + tick loop
│   │       ├── conflict.ts                            # NEW — pure set-intersection primitive
│   │       └── executors.ts                           # NEW — Executor interface + noop + registry helpers
│   └── test/
│       └── runner/
│           ├── conflict.test.ts                       # NEW
│           ├── scheduler.test.ts                      # NEW
│           ├── executors.test.ts                      # NEW
│           └── orphan-recovery.test.ts                # NEW
└── packages/parser/                                   # unchanged — no new types this sub-leaf
```

The Runner class is single-file (`scheduler.ts`) because its surface is small (~120 LOC) and splitting it across multiple files would scatter the tick logic. If `03-hitl-gate` grows it past comfort, that sub-leaf decomposes.

### Conflict primitive

```ts
// server/src/runner/conflict.ts
import type { ResourceClaim } from "@ledger/parser";

/**
 * Pure set-intersection conflict check on resource claims.
 *
 * Two claim sets conflict iff there exists a pair (one from each) with
 * the same (kind, target) and at least one side `write`. Two `read`
 * claims on the same target do not conflict.
 *
 * O(|a|·|b|) — at v1 scale (≤10 claims per task, ≤10 in-flight tasks)
 * this is hundreds of comparisons, microseconds.
 *
 * Symmetric: conflicts(a, b) === conflicts(b, a).
 */
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

`claimKey` is intentionally not exported — call sites should never need it; the comparison is encapsulated. The kind-prefix ensures `node:foo.md` (a NodeId that happens to look like a path) and `path:foo.md` are distinct claim spaces.

### Executor registry

```ts
// server/src/runner/executors.ts
import type { Task, TaskId, TaskType, LogEvent } from "@ledger/parser";

export interface RunnerHandle {
  /** Append a non-status_change event (executor reports an artifact, tool call, etc.). */
  emit(taskId: TaskId, event: Omit<LogEvent, "id" | "taskId" | "seq" | "at">): LogEvent;
  /** Transition RUNNING → COMPLETE; emits status_change; triggers re-tick. */
  complete(taskId: TaskId): Task;
  /** Transition RUNNING → FAILED with rationale; emits status_change; triggers re-tick. */
  fail(taskId: TaskId, reason: string): Task;
  // Note: awaitHumanReview is added by 03-hitl-gate, not this sub-leaf.
}

export interface Executor {
  /** Invoked by the scheduler when a task transitions PENDING/BLOCKED → RUNNING. */
  run(task: Task, handle: RunnerHandle): Promise<void> | void;
}

export const noopExecutor: Executor = {
  run(task, handle) {
    handle.complete(task.id);
  },
};

export type ExecutorRegistry = Map<TaskType, Executor>;

export function createDefaultRegistry(): ExecutorRegistry {
  const registry = new Map<TaskType, Executor>();
  registry.set("noop", noopExecutor);
  return registry;
}
```

The registry is plain `Map<TaskType, Executor>` — no class, no events. `Runner` owns one instance per construction (no module-level mutable state). `registerExecutor` on the Runner is `this.registry.set(type, exec)` with a `console.warn` when overwriting (defensive — v1 callers register once, but `03-hitl-gate`'s test setup may re-register across tests).

### Runner class + tick loop

```ts
// server/src/runner/scheduler.ts
import type { Task, TaskId, TaskInput, TaskStatus, LogEvent } from "@ledger/parser";
import type { Store } from "./store.js";
import type { Executor, ExecutorRegistry, RunnerHandle } from "./executors.js";
import { createDefaultRegistry } from "./executors.js";
import { conflicts } from "./conflict.js";

// Status-reason builders + constants (parent §Status reasons)
export const reasons = {
  blockedByDep: (depId: TaskId) => `blocked_by_dep:${depId}`,
  blockedByClaimConflict: (conflictingId: TaskId) =>
    `blocked_by_claim_conflict:${conflictingId}`,
  BLOCKED_NO_EXECUTOR: "blocked_no_executor",
  ORPHANED_ON_RESTART: "orphaned_on_restart",
} as const;

export interface Runner {
  readonly store: Store;
  createTask(input: TaskInput): Task;
  registerExecutor(type: Task["type"], exec: Executor): void;
  tick(): void;
  close(): void;
}

export function createRunner(store: Store, registry: ExecutorRegistry = createDefaultRegistry()): Runner {
  let ticking = false;
  let pending = false;

  // One handle per Runner — handle methods are taskId-keyed and stateless, so
  // a singleton avoids per-dispatch allocation. (Spec Review S6.)
  const handle: RunnerHandle = {
    emit(taskId, event) {
      return store.appendEvent(taskId, event);
    },
    complete(taskId) {
      const t = store.updateTaskStatus(taskId, { from: "RUNNING", to: "COMPLETE" });
      scheduleTick();
      return t;
    },
    fail(taskId, reason) {
      const t = store.updateTaskStatus(taskId, { from: "RUNNING", to: "FAILED", reason });
      scheduleTick();
      return t;
    },
  };

  function scheduleTick(): void {
    if (ticking) { pending = true; return; }
    ticking = true;
    try {
      do {
        pending = false;
        tickOnce();
      } while (pending);
    } finally {
      ticking = false;
    }
  }

  function tickOnce(): void {
    // 1. Load tasks that hold claims (RUNNING ∪ AWAITING_HUMAN_REVIEW).
    const inFlight: Task[] = store.listTasks({ status: ["RUNNING", "AWAITING_HUMAN_REVIEW"] });

    // 2. Load PENDING/BLOCKED rows in dispatch order.
    const candidates = store.listPendingEligible();
    if (candidates.length === 0) return;

    // 3. Evaluate each candidate; pick the first eligible row.
    for (const task of candidates) {
      const blockedReason = evaluate(task, inFlight);
      if (blockedReason === null) {
        // Eligible — check executor.
        const exec = registry.get(task.type);
        if (exec === undefined) {
          // Step 5: blocked_no_executor. Symmetric reason-equality guard with
          // step 6 below — re-evaluating a no-executor task on every tick must
          // not spam redundant status_change events. (Spec Review B1.)
          if (task.status !== "BLOCKED" || lastReason(task.id) !== reasons.BLOCKED_NO_EXECUTOR) {
            store.updateTaskStatus(
              task.id,
              { from: task.status as TaskStatus, to: "BLOCKED", reason: reasons.BLOCKED_NO_EXECUTOR },
            );
          }
          continue;
        }
        // Step 4: dispatch.
        const running = store.updateTaskStatus(task.id, {
          from: task.status as TaskStatus,
          to: "RUNNING",
        });
        dispatch(running, exec);
        // Step 7: loop back to step 1.
        return scheduleTick(); // sets pending; outer trampoline re-iterates
      }
      // Step 6: this row is blocked. Persist reason if not already.
      if (task.status !== "BLOCKED" || lastReason(task.id) !== blockedReason) {
        store.updateTaskStatus(
          task.id,
          { from: task.status as TaskStatus, to: "BLOCKED", reason: blockedReason },
        );
      }
    }
    // All candidates evaluated; none picked. Yield.
  }

  function evaluate(task: Task, inFlight: Task[]): string | null {
    // Dep-met check (first failing dep wins precedence over conflict).
    for (const depId of task.dependsOn) {
      const depStatus = store.getStatus(depId);
      if (depStatus !== "COMPLETE") return reasons.blockedByDep(depId);
    }
    // Conflict check against in-flight working set.
    for (const inflight of inFlight) {
      if (conflicts(task.resourceClaims, inflight.resourceClaims)) {
        return reasons.blockedByClaimConflict(inflight.id);
      }
    }
    return null;
  }

  function dispatch(task: Task, exec: Executor): void {
    try {
      const result = exec.run(task, handle);
      if (result instanceof Promise) {
        result.catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          // Re-check status — executor may have already completed/failed before throwing.
          if (store.getStatus(task.id) === "RUNNING") {
            store.updateTaskStatus(
              task.id,
              { from: "RUNNING", to: "FAILED", reason: `executor_error: ${msg}` },
            );
            scheduleTick();
          }
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (store.getStatus(task.id) === "RUNNING") {
        store.updateTaskStatus(
          task.id,
          { from: "RUNNING", to: "FAILED", reason: `executor_error: ${msg}` },
        );
        scheduleTick(); // Spec Review B2: symmetric with the async branch above —
                        // newly-eligible downstream tasks must be re-evaluated.
      }
    }
  }

  // Helper: the most recent status_change event's reason for a task.
  function lastReason(taskId: TaskId): string | undefined {
    const events = store.getEvents(taskId);
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i] as LogEvent;
      if (ev.kind === "status_change") return ev.reason;
    }
    return undefined;
  }

  return {
    store,
    createTask(input: TaskInput): Task {
      const task = store.createTask(input);
      scheduleTick();
      return task;
    },
    registerExecutor(type, exec) {
      if (registry.has(type)) {
        console.warn(`runner: overwriting executor for type ${type}`);
      }
      registry.set(type, exec);
    },
    tick: scheduleTick,
    close() {
      store.close();
    },
  };
}

export function recoverOrphans(store: Store): { recovered: number } {
  const orphans = store.listTasks({ status: ["RUNNING"] });
  for (const task of orphans) {
    store.updateTaskStatus(
      task.id,
      { from: "RUNNING", to: "FAILED", reason: reasons.ORPHANED_ON_RESTART },
    );
  }
  return { recovered: orphans.length };
}
```

The `lastReason` helper is a defensive guard against thrashing — without it, the tick would emit a fresh `status_change` event every iteration for a BLOCKED row whose reason hasn't changed (e.g., a long-running dep). With it, the BLOCKED row's event log records reason transitions only, not every tick. The cost is one `getEvents` call per BLOCKED candidate per tick — at v1 scale (≤10 BLOCKED rows × ~10 events each) this is a tens-of-microseconds add. A future optimization is to cache the latest reason on the `tasks` row itself; defer until the event-scan cost shows up in a profile.

### Factory + boot wiring

```ts
// server/src/runner/index.ts (revised)
import { join } from "node:path";
import Database from "better-sqlite3";
import { applyMigrations } from "./migrations/runner.js";
import { createStore } from "./store.js";
import { createRunner, recoverOrphans } from "./scheduler.js";

export { OptimisticLockError } from "./store.js";
export type { Store, ListTasksFilter } from "./store.js";
export type { Runner } from "./scheduler.js";
export type { Executor, RunnerHandle, ExecutorRegistry } from "./executors.js";
export { noopExecutor, createDefaultRegistry } from "./executors.js";
export { reasons, recoverOrphans } from "./scheduler.js";
export { conflicts } from "./conflict.js";

export function createRunnerForProject(project: { projectRoot: string }): Runner {
  const dbPath = join(project.projectRoot, ".ledger", "runner.db");
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

  const store = createStore(db);
  const { recovered } = recoverOrphans(store);
  if (recovered > 0) {
    console.log(`runner: recovered ${String(recovered)} orphaned task(s) (RUNNING → FAILED)`);
  }
  return createRunner(store);
}

// Backwards-compat shim — context.test.ts and project-context callers that
// already destructure `store` keep working. Tests can pick `runner.store` or
// the standalone `createStoreForProject` factory; both are exported.
export function createStoreForProject(project: { projectRoot: string }): ReturnType<typeof createStore> {
  return createRunnerForProject(project).store;
}
```

`createStoreForProject` is preserved as a one-line wrapper around `createRunnerForProject` so existing call sites (`server/src/context.ts:57`) and tests don't break. The semantics shift slightly (orphan recovery now runs on every store construction, not just runner construction) — this is desirable: any caller opening the DB benefits from the recovery pass.

### `context.ts` wiring

```ts
// server/src/context.ts (excerpts of changes)
import { createRunnerForProject } from "./runner/index.js";
import type { Store, Runner } from "./runner/index.js";

export interface ProjectContext {
  projectRoot: string;
  docsRoot: string;
  project: ProjectMetadata;
  port: number;
  startedAt: string;
  store: Store;       // unchanged — same reference as runner.store
  runner: Runner;     // NEW
}

// Inside loadProjectContext:
const runner = createRunnerForProject({ projectRoot });
return {
  projectRoot,
  docsRoot,
  project: result.metadata,
  port: opts.port,
  startedAt: new Date().toISOString(),
  store: runner.store,
  runner,
};
```

The existing `context.test.ts` assertions on `ctx.store` continue to pass — `runner.store` is the same Store instance.

### State machine + reason wire-up (recap from parent)

The scheduler implements **exactly** the state machine pinned in the parent's "Task state machine (v1)" table. This sub-leaf adds no new statuses or reasons beyond what the parent enumerates. Restating to anchor what tests assert:

| From → To | Trigger in this sub-leaf | Reason in `status_change` payload |
|---|---|---|
| `PENDING → RUNNING` | tick picks eligible task with executor | _(no reason field — dispatch is the default path)_ |
| `BLOCKED → RUNNING` | tick re-evaluates BLOCKED row, finds eligible | _(no reason field — same dispatch path)_ |
| `PENDING → BLOCKED` | tick evaluates row, finds ineligible (no exec / dep / claim) | one of `reasons.*` |
| `BLOCKED → BLOCKED` _(no transition; reason update only)_ | tick re-evaluates, reason changed (e.g., dep failure morphed to different missing dep) | one of `reasons.*` — emitted only if `lastReason !== newReason` |
| `RUNNING → COMPLETE` | `handle.complete(taskId)` | _(no reason field)_ |
| `RUNNING → FAILED` | `handle.fail(taskId, reason)` OR executor threw | `reason` arg OR `executor_error: <msg>` |
| `RUNNING → FAILED` _(boot)_ | `recoverOrphans` finds RUNNING on startup | `reasons.ORPHANED_ON_RESTART` |

The `(BLOCKED → BLOCKED, reason update only)` row is a refinement: the underlying `tasks.status` doesn't change, but a fresh `status_change` event records the new reason. The store's `updateTaskStatus` accepts `{ from: "BLOCKED", to: "BLOCKED" }` — at the SQL level this is a no-op UPDATE plus a non-no-op event insert. The implementer verifies this is allowed by `Store.updateTaskStatus` (a glance at `store.ts:312`-onwards confirms the function tolerates same-status transitions; if it doesn't, we relax the check in `01-store-schema`'s scope after a coordinated audit — flagged as Open Issue).

### Test plan

```
server/test/runner/
├── conflict.test.ts                  # 8 tests, pure
├── executors.test.ts                 # 4 tests, registry semantics + noop
├── scheduler.test.ts                 # 12+ tests, in-memory store
└── orphan-recovery.test.ts           # 3 tests, in-memory store
```

**`conflict.test.ts`:**
1. Two read claims on same node: no conflict.
2. Read + write on same node: conflict.
3. Two writes on same node: conflict.
4. Two reads on same path: no conflict.
5. Read + write on same path: conflict.
6. `{ kind: "node", nodeId: "foo" }` vs `{ kind: "path", path: "foo" }`: NO conflict (different claim spaces).
7. Empty arrays: no conflict (either side or both).
8. Symmetric: `conflicts(a, b)` ≡ `conflicts(b, a)` over 20 randomized cases.

**`executors.test.ts`:**
1. `createDefaultRegistry()` returns a registry with `noop` registered, no other types.
2. `noopExecutor.run(task, handle)` calls `handle.complete(task.id)` exactly once with the task's id.
3. `noopExecutor` does not call `handle.emit` or `handle.fail`.
4. The registry is a fresh `Map` per construction — two registries are independent.

**`scheduler.test.ts`** (against an in-memory `:memory:` DB constructed via `createStore(new Database(":memory:"))` after applying migrations directly):
1. Inject one `noop` task → `runner.tick()` transitions it `PENDING → RUNNING → COMPLETE`; events seq 0 (creation), 1 (RUNNING), 2 (COMPLETE).
2. Inject two unrelated `noop` tasks → both reach COMPLETE inside one outer `runner.tick()` call. (Each `tickOnce` invocation dispatches at most one task before yielding via `return scheduleTick()`; the outer trampoline iterates `tickOnce` twice. Spec Review S3.)
3. Inject task A then task B with `B.dependsOn = [A.id]` → `tick` dispatches A (B stays BLOCKED with `blocked_by_dep:<A.id>`); on A's completion, B becomes eligible and dispatches.
4. Inject task A with claim `{ kind: "node", nodeId: "x", mode: "write" }` then B with the same claim → A dispatches; B transitions to BLOCKED with `blocked_by_claim_conflict:<A.id>`; on A's completion, B dispatches.
5. Inject task A and B both with `{ kind: "node", nodeId: "x", mode: "read" }` → both dispatch concurrently (no conflict).
6. Inject task with `type: "implement"` (no executor registered) → transitions to BLOCKED with `blocked_no_executor`. Register an `implement` executor that completes → next tick dispatches.
7. Inject three `noop` tasks with priorities `0, 5, 1` → `tick` dispatches in order `priority=5, priority=1, priority=0` (priority DESC).
8. Inject two `noop` tasks with the same priority, created 10ms apart → tick dispatches in `created_at ASC` order.
9. Dep on a FAILED task: A fails via a custom executor → B with `dependsOn: [A]` stays BLOCKED indefinitely with `blocked_by_dep:<A.id>`. Re-running `tick` doesn't dispatch B.
10. Dep on a non-existent task: B with `dependsOn: ["missing-id"]` stays BLOCKED with `blocked_by_dep:missing-id`.
11. Reason precedence: B has both an unmet dep AND a conflicting in-flight claim — BLOCKED reason names the dep (dep check runs first).
12. `BLOCKED → BLOCKED` reason update: A `doc_refactor`-type write claim becomes blocked by `dep`; the dep completes but a new in-flight conflict appears → next tick records a new `status_change` event with the new reason; `tasks.status` stays BLOCKED.
13. Executor throws synchronously: registered `throw new Error("boom")` executor → task transitions `RUNNING → FAILED` with `reason: "executor_error: boom"`.
14. Executor returns a rejected promise: registered async executor that throws → task transitions to FAILED with the same reason format.
15. `runner.tick()` is idempotent: calling `tick()` ten times consecutively after one injection produces the same final state and event count as one call.

**`orphan-recovery.test.ts`:**
1. DB seeded with two `RUNNING` rows → `recoverOrphans(store)` transitions both to FAILED with `orphaned_on_restart`; returns `{ recovered: 2 }`.
2. DB seeded with one `AWAITING_HUMAN_REVIEW` row → `recoverOrphans` leaves it untouched; `recovered === 0`.
3. DB seeded with PENDING / BLOCKED / COMPLETE / FAILED rows → no transitions; `recovered === 0`.

### Acceptance check (manual)

1. `pnpm install` — unchanged from `01-store-schema` (no new deps).
2. `pnpm -C server typecheck`, `pnpm -C server lint`, `pnpm -C server build`, `pnpm -C server test` exit zero. Test count delta ≈ +27.
3. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero. No app source touched.
4. `pnpm -C packages/parser test` unchanged.
5. Boot the server: `pnpm -C server dev /Users/dennis/code/ledger`. Server log includes the existing `runner: applied migration(s) 1` or `runner: schema is current ...` line; if any RUNNING rows were left in the DB from prior boots (e.g., by a test fixture or manual SQL), boot also logs `runner: recovered N orphaned task(s) (RUNNING → FAILED)`.
6. `sqlite3 .ledger/runner.db "SELECT id, type, status FROM tasks;"` after boot: no row remains `RUNNING`. (For a fresh `.ledger/runner.db`, the table is empty — no orphans to recover.)
7. Manual injection (operator runs in a Node REPL inside the server's tsx env):

   ```js
   import { createRunnerForProject } from "./server/src/runner/index.js";
   const runner = createRunnerForProject({ projectRoot: "/Users/dennis/code/ledger" });
   const task = runner.createTask({ type: "noop", title: "smoke" });
   // task.status is 'PENDING' at the return point, but runner.tick() already ran
   // synchronously inside createTask, so by the next inspection:
   runner.store.loadTask(task.id); // → status: 'COMPLETE'
   runner.store.getEvents(task.id); // → 3 events: creation, RUNNING, COMPLETE
   runner.close();
   ```

   This is a CLI dogfood, not a UI step — `04-api-endpoints` lands the HTTP surface.
8. No regressions on `GET /api/_health`, `/api/project`, `/api/docs`, `/api/docs/:nodeId` — same shapes, same status codes (the scheduler is a passive substrate; existing endpoints don't touch it).
9. No regressions on the UI's transcript-derived task rendering (the type migration in `01-store-schema` already validated this; this child adds no UI code).

Operator note: items 1–4 + 6–9 are headless-verifiable; item 5 requires a live boot + log inspection; item 7 requires REPL access (or a follow-up CLI subcommand that this sub-leaf does not ship).

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Re-entrancy via two booleans (`ticking`, `pending`) + a do-while trampoline | The natural alternative — `setImmediate(scheduleTick)` to defer the recursive call — adds event-loop turns between dispatches and makes deterministic testing harder (every assertion would have to await a microtask). The boolean trampoline is fully synchronous, fits better-sqlite3's sync contract, and turns synchronous executor chains into one stack frame's worth of looping. Tests can call `runner.tick()` and assert the final state without `await`. |
| D2 | Conflict-set query is `status IN ('RUNNING', 'AWAITING_HUMAN_REVIEW')`, even though `02-scheduler` never produces the AWAITING state | Forward-compat. The claim-hold during human review (parent §HITL gate item 3) is enforced by the scheduler's working-set definition, not by `03-hitl-gate`'s code. Putting it here means `03-hitl-gate` doesn't reach back into the scheduler — it just registers its executor. The cost is one harmless `IN` clause member at v1. |
| D3 | `Runner` is a single class (factory closure) in `scheduler.ts`, not a hierarchy | The Runner has one job — drive the tick — and one consumer (the API server). A class hierarchy or composition pattern would add ceremony for no second consumer. Factory closure keeps mutable state (`ticking`, `pending`, `registry`) encapsulated without `this`-binding gotchas. |
| D4 | Executor invocation is fire-and-forget (no awaiting the returned Promise inside the tick) | Awaiting would serialize executor execution — two non-conflicting parallel-eligible tasks would run sequentially, defeating the conflict primitive's purpose. Fire-and-forget lets the tick dispatch the second task immediately and the second executor's `complete()` racing the first's is fine (DB writes are serialized by better-sqlite3). The `.catch()` on the returned Promise handles async failures the same way the sync `try/catch` handles sync ones. |
| D5 | Orphan recovery is a one-shot function called by `createRunnerForProject`, not a method on `Runner` | Recovery is bootstrapping, not a runtime concern. Exposing it as `runner.recoverOrphans()` would imply it's called periodically; making it a separate exported function (`recoverOrphans(store)`) keeps the API surface honest. The function lives in `scheduler.ts` because it produces the same kind of status transitions the tick does. |
| D6 | `RunnerHandle.emit` returns the inserted `LogEvent` | Symmetric with `Store.appendEvent`. Lets executors that emit and then act on the event's `seq` (e.g., for downstream chaining) avoid a round-trip query. Cost is zero — the Store already returns the event. |
| D7 | `RunnerHandle.complete` / `.fail` return the post-transition `Task` | Same symmetry argument. The Runner's tick already needs the post-transition task to feed `scheduleTick`'s next iteration; returning it costs nothing and is useful for executor introspection. |
| D8 | Reason strings live in a `reasons` object (string + builder functions), not a TS enum | TS enums force pinned values that don't compose with dynamic `:<id>` suffixes; the parent's reason format (`blocked_by_dep:<dep_task_id>`) is a prefix-and-payload pattern that builders fit naturally. Constant fields cover the no-payload cases (`BLOCKED_NO_EXECUTOR`, `ORPHANED_ON_RESTART`). UI consumers (`05-ui-hook-migration`) can parse the prefix to surface a tooltip. |
| D9 | `BLOCKED → BLOCKED` reason updates emit a new `status_change` event, gated on reason inequality | Without the gate, every tick on a long-running dep would spam events. With the gate, the event log records only meaningful changes — e.g., "deps satisfied, now blocked by conflict" is one event. The cost is one `getEvents` scan per BLOCKED candidate per tick; bounded at v1. |
| D10 | The `lastReason` helper reads from the event log, not from a denormalized column on `tasks` | Adding a `last_reason` column would be a migration in `01-store-schema` (already shipped) or a fresh migration here. Event-log read is O(n_events × n_blocked_tasks) per tick — at v1 (≤100 events × ≤10 blocked) this is microseconds. Defer the denormalization until a profile shows it matters. |
| D11 | `createStoreForProject` is preserved as a one-line wrapper around `createRunnerForProject` | Backwards compat with `01-store-schema`'s context wiring + tests. The factory's old contract ("returns a Store") is honored by returning `runner.store`. New callers should use `createRunnerForProject`; old callers don't have to migrate. |
| D12 | `ProjectContext.runner: Runner` is added by **this** sub-leaf, not deferred to `04-api-endpoints`; `ProjectContext.store` is kept as a same-reference alias | Two reasons: (a) orphan recovery needs to run at boot, which means the Runner must be constructed during `loadProjectContext` — there is no other sensible site; (b) keeping `ctx.store` as `runner.store` lets every `01-store-schema` test that destructures `ctx.store` keep working without a coordinated edit. The parent's Children manifest row for `04-api-endpoints` mentions "Runner instance wired onto ProjectContext" as that child's deliverable; this sub-leaf's deviation just front-loads the construction by one leaf. `04-api-endpoints` decides whether to drop `ctx.store` once its routes consume `ctx.runner` exclusively. (Spec Review N5 consolidates this rationale; previously split between §Requirements item 9 and a sparser D12.) |
| D13 | Executor errors are captured via `try/catch` (sync) AND `.catch()` on returned Promise (async); both paths transition to FAILED with `executor_error: <message>` prefix | Symmetric handling — operators can't tell from the event log whether the executor threw sync or async, and shouldn't need to. The `executor_error:` prefix distinguishes scheduler-captured failures from `handle.fail(taskId, reason)` calls (which use the operator-supplied `reason` verbatim). |
| D14 | The `recoverOrphans` function does NOT also recover `BLOCKED` rows (re-evaluate them at boot) | A boot-time forced re-evaluation is unnecessary — the first tick after boot (triggered by any task creation or an explicit `runner.tick()` call) re-evaluates all BLOCKED rows naturally. Adding a "boot tick" to `createRunnerForProject` would couple boot to tick semantics; the cleaner pattern is "boot recovers orphans; first task creation triggers first tick." |
| D15 | `RunnerHandle` is a Runner-scoped **singleton**, not allocated per-dispatch | The handle methods (`emit`, `complete`, `fail`) all take `taskId` as their first arg — the handle has no per-task closure state. A per-dispatch allocation would be a fresh object literal on every executor invocation. Hoisting the handle to once-per-Runner removes the allocation without changing semantics. (Spec Review S6.) When `03-hitl-gate` adds `awaitHumanReview(taskId)`, the same singleton pattern applies. |

---

## Open Issues

- **Tick fairness under starvation.** A perpetually-eligible high-priority task can starve lower-priority ones. v1 has no aging or quotas. At single-operator scale, the operator notices and rebalances priorities manually. Revisit if multi-stakeholder dispatch becomes a thing. *(Priority: LOW.)*
- **`Store.updateTaskStatus({ from: "BLOCKED", to: "BLOCKED" })` allowance — verified at spec-review time.** Spec Review S1 confirmed: `store.ts:312-369` performs no `from`-vs-stored-status validation, so same-status transitions pass through and `writeEventInTx` still writes the `status_change` event. If a future audit tightens the Store to reject same-status transitions, this sub-leaf's tick code needs a workaround (e.g., a dedicated `Store.updateBlockedReason(taskId, reason)` method). Logged here so the implementer of `01-store-schema`'s next audit pass knows. *(Priority: LOW — coordination note.)*
- **`createStoreForProject` backwards-compat shim issues a no-op orphan-recovery scan on every call.** The current `01-store-schema` tests (`context.test.ts`, `docs.test.ts`, `project.test.ts`) call `loadProjectContext` repeatedly against the same fixture; each call now constructs a fresh Runner, which runs `recoverOrphans` over rows that have already been recovered (or were never RUNNING). The scan is a single indexed `SELECT * FROM tasks WHERE status = 'RUNNING'` — sub-millisecond at fixture scale — but it accumulates as the fixture grows. (Spec Review S5.) *(Priority: TRIVIAL.)*
- **`lastReason` cost at scale.** O(n_events) scan per BLOCKED candidate per tick. At v1 scale negligible. At v1000-tasks scale, a denormalized `last_reason` column on `tasks` (added via migration 002) is the right answer. *(Priority: LOW — surfaces as a perf concern when the runner is loaded; defer.)*
- **No back-pressure on `runner.tick()` from external code.** A script that calls `runner.tick()` in a tight loop just no-ops via the `ticking` flag once nothing is eligible. Acceptable. Adding a "tick batching" facade would be premature. *(Priority: TRIVIAL.)*
- **Executor registry overwrite emits `console.warn`.** A future structured logger replaces this; until then, the warning is the right surfacing. Inherited from `01-store-schema` Open Issue "console.log in production path." *(Priority: LOW — inherited.)*
- **`recoverOrphans` does not record per-task provenance about which boot recovered them.** The `orphaned_on_restart` reason is the same for every orphan in every recovery cycle. An operator debugging "which restart killed this task" would need the timestamp on the `status_change` event — which is captured (`at` field). Acceptable for v1; revisit if multi-restart debugging becomes a workflow. *(Priority: TRIVIAL.)*
- **Async executor cancellation.** If an executor's returned Promise never resolves (e.g., a hung subprocess), the task stays `RUNNING` indefinitely. v1 has no watchdog. `06-agent-dispatcher` introduces process management; that's where a per-executor timeout belongs. *(Priority: LOW — surfaces with `06-agent-dispatcher`, not in this sub-leaf's scope.)*
- ~~**The scheduler does not validate `dependsOn` references on task creation.** `runner.createTask({ ..., dependsOn: ["does-not-exist"] })` succeeds; the dependent stays BLOCKED forever with `blocked_by_dep:does-not-exist`. Validation at creation time would be a `Store.taskExists(id)` round-trip per dep — cheap but not done here. The forever-BLOCKED outcome is visible in the UI (after `05-ui-hook-migration`), so the operator can spot the typo. *(Priority: LOW.)*~~ *(Closed: 05-task-runner/99-maintenance/02-round-2, 2026-06-12 — `store.createTask` now validates each dep ID via `stmtLoadTask` before writing; unknown dep throws with message `createTask: dependsOn references unknown task id "…"`; route handler surfaces as 400 `invalid_dependsOn`.)*
- ~~**No in-process pub/sub for events.** SSE consumers in `04-api-endpoints` will need either DB polling or a wrapper that intercepts `handle.emit` / status_change writes. Logged here so `04` knows where to add the bridge (likely a `runner/events.ts` module that wraps the Runner's transition points). *(Priority: MEDIUM — `04-api-endpoints`'s SSE story depends on a design decision here. Defer until `04` starts.)*~~ → Closed by `05-task-runner/04-api-endpoints` (v1, 2026-05-27). The `withPublishing(store, bus)` Store decorator approach was chosen over per-write-site `bus.publish` calls (D2 of `04-api-endpoints`) — keeps `scheduler.ts` untouched and means every Store write publishes structurally.

---

## Spec Review (2026-05-27)

Independent spec review was run against this DRAFT in a clean general-purpose Sonnet context. Verdict: NEEDS_MINOR_REVISIONS — 2 blocking, 6 should-fix, 6 nits. PRD coverage matrix returned Addressed across §5/§6.3/§6.5/§7.1/§10/§11; §8.4 was flagged Partial (OCC `expectedDbRowVersion` correctly unused by the scheduler itself — that surface is `03-hitl-gate`'s; breakpoints + priority override correctly deferred). All findings landed:

| # | Finding | Resolution |
|---|---------|------------|
| B1 | Stale BLOCKED-no-executor reason: the spec's pseudocode guarded the dep/conflict BLOCKED transitions on reason inequality (D9), but the no-executor branch only guarded `task.status !== "BLOCKED"`. Re-evaluating a no-executor task every tick would emit a redundant `status_change` event, contradicting D9. | Updated the pseudocode at §Runner class + tick loop: the no-executor branch now reads `if (task.status !== "BLOCKED" || lastReason(task.id) !== reasons.BLOCKED_NO_EXECUTOR)`. Symmetric with step 6. |
| B2 | Sync executor `try/catch` missing `scheduleTick()` after the `RUNNING → FAILED` transition. The async branch (`.catch()` on returned Promise) calls `scheduleTick()`; the sync branch did not. Asymmetric — a downstream task depending on the sync-failed task would stall until the next external trigger. | Added `scheduleTick()` to the sync catch path with an inline comment citing B2. |
| S1 | `Store.updateTaskStatus({ from: "BLOCKED", to: "BLOCKED" })` allowance was logged as an unverified assumption Open Issue. Reviewer verified against `store.ts:312-369`: the function performs no `from`-vs-stored-status validation; same-status transitions pass through cleanly and still write the `status_change` event. | Promoted the Open Issue text from "relies on" to "verified at spec-review time" with the file:line citation; kept the Open Issue as a coordination note for future audits of `01-store-schema`. |
| S2 | `lastReason` walking the events array backwards depends on `getEvents` returning ASCENDING order; spec needed an explicit confidence note. | Verified against `store.ts:204-206` (`ORDER BY seq ASC`). Recorded in §Confidence notes below. |
| S3 | Test plan item 2 said "both reach COMPLETE in a single tick() invocation (trampoline dispatches both)" — ambiguous between "single `tickOnce`" and "single outer `tick()`". The trampoline trace shows `tickOnce` actually dispatches one task per call and yields; the outer `do/while` re-iterates. | Reworded test item 2 to "inside one outer `runner.tick()` call. (Each `tickOnce` invocation dispatches at most one task before yielding via `return scheduleTick()`; the outer trampoline iterates `tickOnce` twice. Spec Review S3.)" |
| S4 | Duplicate of B2. | Covered by B2's fix. |
| S5 | `createStoreForProject` backwards-compat shim issues a no-op orphan-recovery scan on every call (used by `context.test.ts` + sibling tests against the same fixture). Not a correctness bug; not previously logged. | Added to Open Issues as TRIVIAL with a citation to Spec Review S5. The scan is a single indexed SELECT — sub-ms at fixture scale. |
| S6 | Per-dispatch `makeHandle()` allocation has no per-task state — handle methods are taskId-keyed. Stylistic / no-perf-test-catches-it; worth pinning. | Hoisted `handle` to a Runner-scoped singleton (initialized once in the factory). Added D15 to the Decisions table. |
| N1 | Decisions table format match. | No action — verified against `01-store-schema.md`. |
| N2 | Open Issues priority-tag consistency. | No action — verified. |
| N3 | Test count realism (~27 tests is lean for the integration surface). | Acknowledged. The implementer should add a test that explicitly counts `tickOnce` entries for the trampoline behavior (S3) and a test for `console.warn` on registry overwrite. Logged in §Confidence notes for stage-4 spot-check, not as a spec change. |
| N4 | Acceptance check item 7 (REPL example showing `COMPLETE` immediately after `createTask`) verified by the trampoline trace. | Recorded in §Confidence notes. |
| N5 | D12's "context.ts wiring" rationale was split between §Requirements item 9 prose and a sparser D12. | D12 rewritten to consolidate the rationale (two reasons: orphan-recovery boot constraint + zero-cost backwards compat alias). The §Requirements item 9 prose remains as the briefer surface description. |
| N6 | Spec Review placeholder present. | Resolved by this audit table replacing the placeholder. |

Reviewer's **decomposition assessment** was **Stay bundled** — the conflict primitive (~30 LOC), executor registry (~40 LOC), Runner class (~150 LOC), and orphan recovery (~15 LOC) are mutually-referential. Splitting would force a half-state intermediate commit. The natural split if the implementer wall-clocks out is `[conflict + registry + standalone tests]` first, `[Runner + factory + orphan recovery + context wiring]` second; not recommended preemptively.

Reviewer's **Confidence notes** (recorded for the stage-4 implementer):

- `Store.updateTaskStatus({from: "BLOCKED", to: "BLOCKED"})` works — verified `store.ts:312-369`.
- `store.getEvents` orders ASC by seq — verified `store.ts:204-206`; the `lastReason` backward-walk is correct.
- `Store.updateTaskStatus` requires `from: TaskStatus` (not optional) — verified `store.ts:136, 314`.
- `Store.listTasks({status: TaskStatus[]})` array-filter shape — verified `store.ts:400-405` builds dynamic `status IN (?, ...)` correctly.
- Seq-0 creation event omits `from` — verified by existing test `store.test.ts:66-73` (`expect("from" in evt).toBe(false)`).
- `listPendingEligible` returns `PENDING ∪ BLOCKED` ordered `priority DESC, created_at ASC` — verified `store.ts:199-202`.
- **Implementer spot-check at stage 4:** add a test that asserts `tickOnce` is invoked N times for N non-conflicting `noop` tasks (S3 trampoline verification — register a spy executor or instrument the lookupExecutor call site).
- **Implementer spot-check:** the spec's test #13 (sync executor throws) should be extended to assert a downstream task with `dependsOn: [throwerId]` transitions correctly after the throw (proves the B2 fix is wired).

Nothing punted. All B/S/N findings landed.

---

## Implementation Notes

### Dependencies added

None. This sub-leaf introduces no new npm dependencies. `better-sqlite3` was already added by `01-store-schema`.

### Deviations from spec

**Priority-ordering test design.** The spec's test items 7 and 8 say to inject tasks via `runner.createTask` and assert priority/FIFO ordering. Because `runner.createTask` fires a tick synchronously after each insert, the first-inserted task dispatches immediately before subsequent tasks are even in the queue. Tests 7 and 8 therefore use `store.createTask` (direct, no auto-tick) to stage all tasks, then call `runner.tick()` once — this correctly tests the `ORDER BY priority DESC, created_at ASC` guarantee. The spec pseudocode and D1 (synchronous trampoline) are correct; the test just needs to pre-queue the tasks before the first tick.

**`return scheduleTick()` in tickOnce replaced with `pending = true; return`.** The spec's pseudocode shows `return scheduleTick()` at step 7 (after dispatching a task). Calling `scheduleTick()` from inside `tickOnce()` is safe (it sets `pending = true` and returns immediately because `ticking` is already `true`), but the cleaner pattern is to just set `pending = true` directly and return, which is exactly what that call reduces to. No semantic difference — kept the direct form for clarity.

**`eslint-disable` comment on `do/while (pending)`.** TypeScript's control-flow analysis sees `pending = false` immediately before `while (pending)` and concludes the condition is always `false`. The `tickOnce()` call inside the loop mutates `pending` (a closed-over variable) at runtime, but the type checker doesn't track mutation through function calls. Added a single `// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition` comment. This is the minimal, honest fix — the condition is genuinely necessary.

**`Task["type"]` in `registerExecutor` signature.** The spec shows `type: Task["type"]` in the Runner interface. `Task["type"]` equals `TaskType` — the forms are equivalent. No deviation.

### Bundle delta

All new code is server-side (`server/src/runner/`). The app bundle is unchanged:

| Chunk | Baseline (gzip) | Post-impl (gzip) | Delta |
|---|---|---|---|
| `index-*.js` | 545.60 kB | 545.60 kB | 0 |
| `DagPanel-*.js` | 505.23 kB | 505.23 kB | 0 |
| `index-*.css` | 6.26 kB | 6.26 kB | 0 |
| `DagPanel-*.css` | 2.66 kB | 2.66 kB | 0 |

### Files changed inventory

**New files:**
- `server/src/runner/conflict.ts` — pure set-intersection conflict primitive
- `server/src/runner/executors.ts` — `Executor` + `RunnerHandle` interfaces, `noopExecutor`, `createDefaultRegistry()`
- `server/src/runner/scheduler.ts` — `Runner` interface, `createRunner()` factory, `recoverOrphans()`, `reasons` object, tick trampoline
- `server/test/runner/conflict.test.ts` — 10 tests (8 spec items + 2 empty-array edge cases)
- `server/test/runner/executors.test.ts` — 5 tests (4 spec items + 1 async-executor type test)
- `server/test/runner/scheduler.test.ts` — 18 tests (15 spec items + test 14b async-B2 added per Implementation Review N1 + 2 registerExecutor warn tests)
- `server/test/runner/orphan-recovery.test.ts` — 3 tests

**Modified files:**
- `server/src/runner/index.ts` — added `createRunnerForProject`, re-exports for all new modules; preserved `createStoreForProject` as backwards-compat shim
- `server/src/context.ts` — `ProjectContext.runner: Runner` field added; `loadProjectContext` now uses `createRunnerForProject` and assigns both `runner` and `store = runner.store`

**Unchanged files:**
- `server/src/runner/store.ts` — no changes
- `server/src/runner/ids.ts` — no changes
- `server/src/runner/migrations/` — no changes
- `packages/parser/` — no changes (all new types were already in `@ledger/parser/src/runner/types.ts` from `01-store-schema`)

### Gates verified headlessly

| Gate | Command | Exit code |
|---|---|---|
| server typecheck | `pnpm -C server typecheck` | 0 |
| server lint | `pnpm -C server lint` | 0 |
| server build | `pnpm -C server build` | 0 |
| server test | `pnpm -C server test` | 0 (110 tests pass — 73 baseline + 37 new = 110) |
| app typecheck | `pnpm -C app typecheck` | 0 |
| app lint | `pnpm -C app lint` | 0 |
| app build | `pnpm -C app build` | 0 |
| parser typecheck | `pnpm -C packages/parser typecheck` | 0 |
| parser lint | `pnpm -C packages/parser lint` | 0 |
| parser test | `pnpm -C packages/parser test` | 0 (91 tests pass) |

Test count delta: +37 server tests. Baseline (`main` at `ffcf0d7`) = 73 server tests; post-implementation = 110 (including the async-B2 test 14b added per Implementation Review N1). Implementation Review re-counted main as 73 — the initial commit-4c report's "+35 from 74 baseline" was off by one (Implementation Review item N3).

### Acceptance-check items NOT verifiable headlessly

**Item 5 — Live server boot:** `pnpm -C server dev /Users/dennis/code/ledger`. Verifier should confirm the boot log includes `runner: schema is current at user_version=1` (or `runner: applied migration(s) 1` on first boot) and, if any RUNNING rows exist in `.ledger/runner.db` from prior sessions, `runner: recovered N orphaned task(s) (RUNNING → FAILED)`.

**Item 7 — REPL injection:** In a Node REPL against the running server, import `createRunnerForProject`, create a `noop` task, and confirm `runner.store.loadTask(task.id)` returns `status: 'COMPLETE'` and `getEvents(task.id)` returns 3 events (seq 0/1/2). This proves the synchronous trampoline works end-to-end outside the test harness.

### Implementation Review (2026-05-27)

Independent implementation review was run against this worktree (`worktree-agent-a5283542bb7ef590e`, branched from main `ffcf0d7`, rebased — no-op since main had not advanced). Verdict: **READY_FOR_OPERATOR_VERIFICATION** — no blocking, no should-fix, three nits. All nine high-leverage Spec Review closures confirmed in code with file:line citations. All 10 gates re-verified at exit 0.

| # | Finding | Resolution |
|---|---------|------------|
| HL — B1 symmetric blocked_no_executor guard | Confirmed at `scheduler.ts:115–124`. Symmetric with step 6's guard at `scheduler.ts:143`. | No action — confirmed. |
| HL — B2 sync + async error paths both call scheduleTick | Confirmed: sync branch at `scheduler.ts:196–199`, async `.catch()` at `scheduler.ts:182–185`. | No action — confirmed. |
| HL — S3 trampoline invocation-count test | Confirmed at `scheduler.test.ts:98–120`. `dispatchCount === 2` proves the trampoline iterates `tickOnce` twice (since each `tickOnce` dispatches at most one task before `pending = true; return`). | No action — confirmed. |
| HL — S6/D15 singleton RunnerHandle | Confirmed at `scheduler.ts:61–75`. One handle per Runner factory closure; comment cites S6/D15. | No action — confirmed. |
| HL — D2 working set includes AWAITING_HUMAN_REVIEW | Confirmed at `scheduler.ts:97–99`. | No action — confirmed. |
| HL — D9 lastReason gating | Confirmed: `lastReason` at `scheduler.ts:205–215`; gating at lines 115–117 and 143. | No action — confirmed. |
| HL — D5 recoverOrphans standalone | Confirmed at `scheduler.ts:247–257`. Called from `index.ts:41`. | No action — confirmed. |
| HL — D11 createStoreForProject preserved | Confirmed at `index.ts:52–54`. | No action — confirmed. |
| HL — D12 ProjectContext.runner + .store both present | Confirmed at `context.ts:9–17` (interface) and `context.ts:58–68` (loadProjectContext). | No action — confirmed. |
| N1 — Test 13 B2 verification indirect | Reviewer flagged that test 13's downstream-task assertion (B created AFTER A fails) doesn't isolate the sync-catch's `scheduleTick()`. **Analysis on apply:** the sync-catch `scheduleTick()` is structurally redundant — the surrounding `pending = true; return;` in `tickOnce` (`scheduler.ts:138–139`) fires the trampoline regardless. The B2 fix is genuinely load-bearing only on the **async** path, where `.catch()` runs in a microtask after the outer `scheduleTick` has exited. Added **test 14b** (`scheduler.test.ts:484–530`) that exercises the async B2 path concretely: A holds a write claim, async-throws; sibling C (also claims the same target) initially BLOCKED; after A's async failure, C must dispatch — which only happens if the `.catch()` calls `scheduleTick()`. Without the B2 async fix, C would stay BLOCKED. Test passes. The sync sibling case stays as test 13 (also valuable for end-to-end verification, just not isolating the B2 sync-catch). |
| N2 — Status field already advanced | False alarm — Status header correctly shows `VERIFY`. | No action. |
| N3 — Implementation Notes test count off-by-one | Reviewer found main has 73 server tests, not 74 as Implementation Notes claimed. Branch was 109 (now 110 with the test 14b addition). The new delta is +37, not +35. | Fixed: §Gates verified headlessly + Bundle delta + Files changed inventory updated; new total = 110 (37 added). |

Bundle delta vs `ffcf0d7` baseline (reviewer-measured): app chunks byte-equivalent in content (Vite hash-suffix noise of ~1.5 kB gzip is non-deterministic rebuild variance; `git diff main..HEAD -- app/` confirmed empty). DagPanel chunk unchanged. CSS unchanged.

Test counts after the N1 audit fix (test 14b added):

| Workspace | Before (main `ffcf0d7`) | After (this worktree) | Delta |
|---|---|---|---|
| `server/` | 73 | 110 | +37 |
| `packages/parser/` | 91 | 91 | 0 |
| `app/` | (no test suite) | (no test suite) | 0 |

Reviewer's **confidence notes** (operator's stage-8 verification will exercise these):
- Live server boot — confirm the `runner: schema is current at user_version=1` log line on first boot since the migration, and `runner: recovered N orphaned task(s)` only if RUNNING rows exist in the DB.
- REPL injection — `createRunnerForProject({projectRoot}).createTask({type: "noop", title: "smoke"})` should immediately have status `COMPLETE` and 3 events on `getEvents(task.id)`.
- Optional: stage a write-claim conflict scenario in a REPL (sync), verify the second task BLOCKS with the right reason and completes after the first does.

**Implementer's judgment calls** (both accepted by reviewer):
1. `store.createTask` (direct, no auto-tick) for priority/FIFO tests: ACCEPT. Correctly isolates the `ORDER BY priority DESC, created_at ASC` guarantee.
2. ESLint disable for `do/while (pending)`: ACCEPT. Scoped to one line; necessary because TS control-flow can't track the closure mutation; the `for (;;)` alternative is semantically identical and less idiomatic.

Nothing punted. The one substantive finding (N1) was applied with a transparent note about why the suggested fix-shape was adjusted (sync B2 is structurally redundant; async B2 is load-bearing — added test for the async case).

---

## Verification

When this child moves to `VERIFY`, the verifier confirms:

1. The full Acceptance check list (1–9) passes.
2. `conflicts(a, b) === conflicts(b, a)` over a randomized fuzz of ≥20 cases. No case where one side is `write` and targets match returns `false`.
3. A `noop` task injected via `runner.createTask` transitions `PENDING → RUNNING → COMPLETE` inside the same synchronous `createTask` call. The event log has three rows: seq=0 creation (`status_change`, `to=PENDING`, `from` absent), seq=1 dispatch (`status_change`, `from=PENDING`, `to=RUNNING`), seq=2 completion (`status_change`, `from=RUNNING`, `to=COMPLETE`).
4. Two non-conflicting `noop` tasks injected before any tick both reach COMPLETE on the first `tick()` invocation.
5. A task with `type: "implement"` and no executor registered transitions to BLOCKED with `blocked_no_executor` in its latest `status_change` event. Registering an `implement` executor and calling `runner.tick()` dispatches it.
6. A task dependency chain (A → B → C with B and C depending on the prior) dispatches in order; each transitions BLOCKED on its initial tick (with `blocked_by_dep:<predecessor>`) and dispatches on the next tick after the predecessor completes.
7. A write-claim conflict between two pending tasks resolves correctly: the lower-priority/later-created task transitions BLOCKED with `blocked_by_claim_conflict:<other>` and dispatches after the first completes.
8. Reason precedence: a task with both an unmet dep AND a conflicting in-flight claim shows the dep reason (`blocked_by_dep:`), not the conflict reason.
9. A BLOCKED row whose reason changes between ticks (e.g., dep resolves but a new conflict arises) emits a fresh `status_change` event; a BLOCKED row whose reason stays the same across ticks does NOT emit redundant events.
10. Boot orphan recovery: a DB seeded with `status='RUNNING'` rows transitions them all to FAILED with `orphaned_on_restart`. AWAITING_HUMAN_REVIEW rows are left untouched. Server log includes the "recovered N orphaned task(s)" line.
11. Executor that throws synchronously transitions its task to FAILED with `executor_error: <message>`. Async-throwing executor (rejected Promise) does the same.
12. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` exit zero at the workspace root.
13. No regressions on `04-api-server`'s endpoints; no app-source files outside `app/src/lib/types.ts` (already migrated in `01-store-schema`) are touched.

---

## Children

None.
