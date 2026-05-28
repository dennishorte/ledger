# HITL Gate: `human_review` Executor + Approve/Reject Endpoints

**Node ID:** `05-task-runner/03-hitl-gate`
**Parent:** `05-task-runner` (`docs/05-task-runner/00-task-runner.md`)
**Status:** DRAFT
**Created:** 2026-05-27
**Last Updated:** 2026-05-27 (DRAFT — pre-review)

**Dependencies:** `05-task-runner/02-scheduler` (Runner + RunnerHandle + tick + claim-set query), `05-task-runner/04-api-endpoints` (`tasks.ts` routes + EventBus already wired)

---

## Requirements

Ship the **HITL gate end-to-end** — the third bullet of the parent's §HITL gate requirement. Three deliverables:

1. **`human_review` executor + suspension semantics.** Adds an `awaitHumanReview(taskId)` method to `RunnerHandle` (the v1 surface deliberately omitted it per `02-scheduler` Out of scope). Adds `humanReviewExecutor` to the executor registry. The executor calls `handle.awaitHumanReview(task.id)` which transitions `RUNNING → AWAITING_HUMAN_REVIEW` and emits a `status_change` event. The claim-set query in `tickOnce` already includes `AWAITING_HUMAN_REVIEW` (D2 of `02-scheduler`), so a suspended task's `resource_claims` continue to block conflicting tasks — the **point** of the suspension semantics.
2. **`POST /api/tasks/:id/approve` and `POST /api/tasks/:id/reject` endpoints.** New sub-router at `server/src/routes/hitl.ts`. Both endpoints require the task to be in `AWAITING_HUMAN_REVIEW`; both require the request body to carry the observed `dbRowVersion` for optimistic concurrency (PRD §8.4 explicit requirement). Approve transitions to `COMPLETE`; reject transitions to `FAILED` with the rejection rationale captured in the `status_change` event's `reason` field, optionally enqueueing a follow-up task carrying the rationale forward (parent §HITL gate item 4).
3. **Restart durability.** `AWAITING_HUMAN_REVIEW` rows survive process restart untouched — `recoverOrphans` (already shipped in `02-scheduler`) only transitions `RUNNING` rows to `FAILED`. The boot-time invariant means an operator who restarts the server mid-review picks up exactly where they left off (the task is still suspended; clicking Approve via the UI succeeds the same as before the restart). Covered by a regression test that seeds an `AWAITING_HUMAN_REVIEW` row, constructs a fresh Runner, and asserts the row is unchanged.

This sub-leaf **closes** the parent's HITL gate requirement (parent Requirements item 4) and lays the runner-side groundwork that `05-ui-hook-migration` consumes for the Approve/Reject UI buttons (parent Requirements item 6). After this child merges, the runner can:

- Accept a `human_review` task injected via the existing `POST /api/tasks` endpoint (shipped by `04-api-endpoints`).
- Suspend it at the right point in the lifecycle.
- Hold its claims so concurrent writes are blocked.
- Wait indefinitely for an external approve/reject.
- Transition correctly, re-tick on each external transition, and emit each transition into the event log so the SSE stream from `04-api-endpoints` delivers them to a UI consumer.

In scope for v1:

1. **`server/src/runner/executors.ts`** — extended:
   - `RunnerHandle` gains `awaitHumanReview(taskId): Task`. Transitions `RUNNING → AWAITING_HUMAN_REVIEW`, emits a `status_change` event with no `reason` (the absence-of-reason is the default; the parent's §Status reasons table doesn't enumerate `awaiting_review` as a reason because the transition is the operator-facing signal). Returns the post-transition Task. Does NOT call `scheduleTick()` — the task is now claim-holding-suspended; a tick would not re-dispatch it. (D1.)
   - `humanReviewExecutor` exported: `run(task, handle) { handle.awaitHumanReview(task.id); }`. Synchronous like `noop`. The handle's `awaitHumanReview` does the work; the executor's `run` just calls it and returns.
   - `createDefaultRegistry()` extended: registers `human_review` in addition to `noop`.
2. **`server/src/runner/scheduler.ts`** — extended:
   - `RunnerHandle` singleton (D15 of `02-scheduler`) gains `awaitHumanReview(taskId)`. Implementation: `store.updateTaskStatus(taskId, { from: "RUNNING", to: "AWAITING_HUMAN_REVIEW" })`. Returns the post-transition Task. Skips `scheduleTick()` — see D1.
   - No other changes to scheduler.ts. The conflict-set query in `tickOnce` already covers `AWAITING_HUMAN_REVIEW` (D2 of `02-scheduler`).
3. **`server/src/routes/hitl.ts`** — new Hono sub-router exporting `hitlRoute`, mounted at `/api/tasks` by `server.ts` alongside the existing `tasksRoute` from `04-api-endpoints`. Two route handlers:
   - `POST /:id/approve`
     - Body: `{ dbRowVersion: number, note?: string }`. The `note` field is optional, captured in the `status_change` event's payload via the `reason` builder if provided (`reasons.approvedWithNote(note)` produces `"approved: <note>"`; bare `reasons.APPROVED` produces just `"approved"`).
     - Returns 200 `{ task: Task }` on success.
     - 404 if id does not resolve.
     - 409 if task status is not `AWAITING_HUMAN_REVIEW`.
     - 409 if `dbRowVersion` does not match the stored value (`OptimisticLockError` from the Store surfaces as 409 with the stored value in the response body for client-side retry: `{ error: "version_conflict", expected: <number>, actual: <number> }`).
     - 400 if body is missing required `dbRowVersion` or fails schema validation.
   - `POST /:id/reject`
     - Body: `{ dbRowVersion: number, reason: string, followUp?: TaskInput }`. The `reason` field is **required** (rejection without a rationale is a misuse — the operator's "why" is the entire point of HITL). Empty-string reason is rejected with 400.
     - The `reason` is recorded both in the `status_change` event's `reason` field (the short form: `"rejected: <first 80 chars of reason>"`) AND in a dedicated `payload.details` slot on the event (the full untruncated rationale). The dedicated payload field is the source of truth for UI rendering; the `reason` field is for log scanning. (D4.)
     - Optionally enqueues a follow-up task per parent §HITL gate. If `followUp` is provided, it's created via `runner.createTask({...followUp, resourceClaims: followUp.resourceClaims ?? <inherited from rejected task>, dependsOn: []})`. The rejected task is terminal (FAILED); the follow-up has no waiting predecessor in the runner's view. Returns 200 `{ task: Task, followUpTask?: Task }`.
     - 404 if id missing; 409 if status not `AWAITING_HUMAN_REVIEW` or `dbRowVersion` mismatched; 400 on schema failure.
4. **JSON Schemas** for the two request bodies, validated via new ajv-backed functions in `@ledger/parser`:
   - `docs/_schemas/hitl-approve.schema.json` — `{ dbRowVersion: integer, note?: string }`.
   - `docs/_schemas/hitl-reject.schema.json` — `{ dbRowVersion: integer, reason: non-empty string, followUp?: <TaskInput shape> }`.
   - `packages/parser/src/runner/validateHitlApprove.ts` and `validateHitlReject.ts` — ajv2020 validators matching the convention of `validateTaskInput.ts`. Re-export via `@ledger/parser`.
5. **`server/src/server.ts`** — one new line: `app.route("/api/tasks", hitlRoute);` mounted after `tasksRoute`. Hono composes both routers' paths under `/api/tasks` cleanly per the verification baked into `04-api-endpoints` Spec Review (`hono-base.js:111-124`).
6. **Status-reason builders** in `scheduler.ts`'s `reasons` object — extended:
   - `reasons.APPROVED` = `"approved"` (constant).
   - `reasons.approvedWithNote(note)` = `` `approved: ${note}` `` (function — when the operator's `note` is non-empty).
   - `reasons.rejected(rationale)` = `` `rejected: ${rationale.slice(0, 80)}` `` (truncates to 80 chars for the `reason` field; full rationale lives in the event payload).
7. **Tests** at every layer:
   - `server/test/runner/hitl.test.ts` — unit tests for the executor + `awaitHumanReview` handle method:
     - `humanReviewExecutor.run(task, handle)` calls `handle.awaitHumanReview(task.id)` exactly once.
     - `handle.awaitHumanReview` transitions `RUNNING → AWAITING_HUMAN_REVIEW`, emits a `status_change` event with `from: "RUNNING"`, `to: "AWAITING_HUMAN_REVIEW"`, no `reason` set, returns the post-transition Task.
     - `handle.awaitHumanReview` does NOT call `scheduleTick()` (assertion via a counting wrapper around the registry's `get` or a spy on `tick`).
     - Full lifecycle: inject a `human_review` task via `runner.createTask({type: "human_review", title: "..."})`. Assert: status flows `PENDING → RUNNING → AWAITING_HUMAN_REVIEW`. Claims are held (a second task with conflicting write claim transitions to BLOCKED with `blocked_by_claim_conflict:<the-review-task-id>`).
     - Restart durability: seed an `AWAITING_HUMAN_REVIEW` row directly via `store.createTask` + `store.updateTaskStatus` chain, construct a fresh Runner via `createRunner(store)`, run `recoverOrphans(store)`, assert the row is still `AWAITING_HUMAN_REVIEW`.
   - `server/test/hitl.test.ts` — endpoint tests via `app.request()`:
     - POST /:id/approve on a non-existent task → 404.
     - POST /:id/approve on a PENDING task → 409 (`{ error: "wrong_status", expected: "AWAITING_HUMAN_REVIEW", actual: "PENDING" }`).
     - POST /:id/approve on an AWAITING_HUMAN_REVIEW task with correct `dbRowVersion` → 200, task transitions COMPLETE, event log records `reasons.APPROVED`.
     - POST /:id/approve with stale `dbRowVersion` → 409 (`{ error: "version_conflict", expected, actual }`).
     - POST /:id/approve with body missing `dbRowVersion` → 400 (schema failure).
     - POST /:id/approve with optional `note` → event log records `approved: <note>`.
     - POST /:id/reject with empty `reason` string → 400.
     - POST /:id/reject with correct version + reason → 200, task transitions FAILED, event log records `rejected: <first 80 chars>`, payload's `details` field holds the full untruncated rationale.
     - POST /:id/reject with `followUp` → 200 with both `task` and `followUpTask` in the response; followUp task exists in `store.listTasks()`; followUp's `resourceClaims` defaults to the rejected task's claims.
     - POST /:id/reject with `followUp.resourceClaims: []` explicit → followUp's claims are empty (operator-overridden), not inherited.
     - POST /:id/reject without `followUp` → 200 with `task` only; no follow-up created.
     - End-to-end: inject `human_review` task → confirm AWAITING_HUMAN_REVIEW → POST approve → confirm COMPLETE → SSE stream from `04-api-endpoints` (use `app.request()` against `/api/tasks/:id/stream` with `Last-Event-ID: -1`) emits all expected events including the approval transition.
   - `packages/parser/test/runner/validateHitlApprove.test.ts`, `validateHitlReject.test.ts` — golden-test pairs for the two new validators: accepts valid bodies, rejects bodies missing required fields, rejects bodies with wrong types, rejects empty `reason` strings, applies optional-field defaults correctly.
8. **`02-scheduler.md` Open Issue closure** — the parent doc's §Open Issues line about `awaitHumanReview` is closed by this child (strike-through with pointer at stage 10 merge). The relevant Open Issue text is in `02-scheduler.md`'s Requirements §Out of scope bullet "The `human_review` executor..." — that's a scope statement, not an Open Issue, so no strike-through needed there. The actual cross-leaf coupling closure is implicit in the manifest row flipping to COMPLETE.

**Out of scope for this child:**

- **Cancellation of an in-flight `human_review` task by anyone other than the reviewing operator.** Cancellation as a general primitive is parent §Out of scope. The closest v1 affordance is reject — which is itself the operator's "I won't approve this" signal.
- **Bulk approve/reject.** One task per request. Operator's UI loops if they want a batch.
- **Authentication on approve/reject.** Inherits parent D13 (and `04-api-server` D4): `127.0.0.1`-bind, no tokens. A reverse-proxy with auth would land alongside `--host 0.0.0.0` someday.
- **Approve/reject by anyone other than "the operator who clicked the button."** No author attribution. The `status_change` event's `who` field (logged as a `02-scheduler` Open Issue) isn't filled in this child either; that lands with `06-agent-dispatcher` when agent-driven transitions need attribution.
- **Pre-approval validation of the `reviewPayload` content.** The runner trusts whatever the upstream `implement` / `spec_review` / `verify` task set as the `reviewPayload`. The UI renders it raw (per `04-tasks` panel design); the operator vets the content visually. Approve/reject endpoints do not re-validate the payload.
- **`PATCH /api/tasks/:id` to mutate `reviewPayload` mid-review.** Out of scope as part of the parent's deferred PATCH endpoint.
- **Time-limited reviews / auto-reject on timeout.** A `human_review` task stays AWAITING_HUMAN_REVIEW indefinitely — that's by design (parent §HITL gate item 3: "Executor returns; scheduler does **not** release the task's claims"). If the operator wants a timeout, they manually reject.
- **Email / Slack / push notifications when a task hits AWAITING_HUMAN_REVIEW.** v1 surface is the UI's task list / inspector. PRD §11's notification story is far-future.
- **Multi-reviewer / consensus approval.** One operator, one decision.
- **Follow-up task with `dependsOn` on the rejected task.** Parent §HITL gate item 4 explicitly says `followUp.dependsOn = []` because the rejected task is terminal. If the operator wants a "depends on X being properly redone" semantic, they can manually inject a new task with a fresh dependency chain via `POST /api/tasks` — that's not this endpoint's job.
- **Approve-with-edits.** No "approve but change the diff first" path. Operator either accepts the artifact as-is or rejects with a follow-up explaining what to change. Parent §Out of scope for the same reason as `PATCH`.
- **Cross-project review** — PRD §7.1 same as always.
- **Replay-mode interaction.** Replay UI is DEFERRED. Replaying the event log of a `human_review` task is just a `SELECT` over events; nothing this child changes affects it.
- **UI changes.** `05-ui-hook-migration` flips the UI to consult both runner endpoints AND transcript endpoints, then adds Approve/Reject buttons to `01-ui/04-tasks`'s `TaskInspector` for `runner-emitted ∧ AWAITING_HUMAN_REVIEW` tasks. With this child merged, the runner-side handles work; UI changes come in `05`.
- **Schema changes.** No migrations. The existing `tasks` schema's `db_row_version` column (shipped in `01-store-schema`) is consumed by the OCC check; no new columns.
- **Real executors.** Stays `06-agent-dispatcher`'s job.

---

## Design

### Repository layout after this child

```
ledger/
├── docs/
│   ├── 05-task-runner/
│   │   └── 03-hitl-gate.md                         # this spec
│   └── _schemas/
│       ├── hitl-approve.schema.json                # NEW
│       └── hitl-reject.schema.json                 # NEW
├── server/
│   ├── src/
│   │   ├── server.ts                               # MODIFIED — one new app.route line
│   │   ├── routes/
│   │   │   ├── tasks.ts                            # unchanged (04-api-endpoints)
│   │   │   └── hitl.ts                             # NEW — POST /:id/approve + /:id/reject
│   │   └── runner/
│   │       ├── executors.ts                        # MODIFIED — RunnerHandle gains awaitHumanReview;
│   │       │                                       #            humanReviewExecutor exported;
│   │       │                                       #            createDefaultRegistry registers human_review
│   │       ├── scheduler.ts                        # MODIFIED — handle singleton gains awaitHumanReview;
│   │       │                                       #            reasons object gains APPROVED / approvedWithNote / rejected
│   │       └── (rest unchanged)
│   └── test/
│       ├── hitl.test.ts                            # NEW — endpoint tests via app.request()
│       └── runner/
│           └── hitl.test.ts                        # NEW — executor + handle + restart durability
├── packages/parser/
│   ├── src/
│   │   ├── index.ts                                # MODIFIED — re-export validateHitlApprove + validateHitlReject
│   │   └── runner/
│   │       ├── validateHitlApprove.ts              # NEW
│   │       └── validateHitlReject.ts               # NEW
│   └── test/
│       └── runner/
│           ├── validateHitlApprove.test.ts         # NEW
│           └── validateHitlReject.test.ts          # NEW
└── (app/, .ledger/)                                # unchanged
```

### `awaitHumanReview` on RunnerHandle

```ts
// server/src/runner/executors.ts (excerpt of changes)
export interface RunnerHandle {
  emit(taskId: TaskId, event: Omit<LogEvent, "id" | "taskId" | "seq" | "at">): LogEvent;
  complete(taskId: TaskId): Task;
  fail(taskId: TaskId, reason: string): Task;
  /**
   * Suspend a RUNNING task: transition to AWAITING_HUMAN_REVIEW, emit a
   * status_change event with no `reason` (the absence is the default;
   * the suspension is the signal). Claims continue to be held by the
   * scheduler's working-set query (D2 of 02-scheduler).
   *
   * Does NOT call scheduleTick — the task is now suspended; a tick
   * would not re-dispatch it. (D1.)
   *
   * Only the `human_review` executor calls this v1 (06-agent-dispatcher's
   * future executors may call it too).
   */
  awaitHumanReview(taskId: TaskId): Task;
}

export const humanReviewExecutor: Executor = {
  run(task, handle) {
    handle.awaitHumanReview(task.id);
  },
};

export function createDefaultRegistry(): ExecutorRegistry {
  const registry = new Map<TaskType, Executor>();
  registry.set("noop", noopExecutor);
  registry.set("human_review", humanReviewExecutor);    // NEW
  return registry;
}
```

```ts
// server/src/runner/scheduler.ts (excerpt of the handle singleton)
const handle: RunnerHandle = {
  emit(taskId, event) { /* unchanged */ },
  complete(taskId) { /* unchanged */ },
  fail(taskId, reason) { /* unchanged */ },
  awaitHumanReview(taskId) {
    return store.updateTaskStatus(taskId, {
      from: "RUNNING",
      to: "AWAITING_HUMAN_REVIEW",
    });
    // Deliberately NO scheduleTick() — see D1.
  },
};
```

`store.updateTaskStatus` is the Store API shipped by `01-store-schema`. Its signature is `(id, transition: {from, to, reason?}, expectedDbRowVersion?)`. The handle uses the no-OCC form (`expectedDbRowVersion` undefined) because the only caller is the executor itself, which is single-threaded inside the scheduler's tick. The OCC check is only meaningful for cross-actor races — see the approve/reject endpoints below.

### Status-reason builders

```ts
// server/src/runner/scheduler.ts (excerpt of reasons object)
export const reasons = {
  blockedByDep: (depId: TaskId) => `blocked_by_dep:${depId}`,
  blockedByClaimConflict: (conflictingId: TaskId) =>
    `blocked_by_claim_conflict:${conflictingId}`,
  BLOCKED_NO_EXECUTOR: "blocked_no_executor",
  ORPHANED_ON_RESTART: "orphaned_on_restart",
  // NEW — HITL gate.
  APPROVED: "approved",
  approvedWithNote: (note: string) => `approved: ${note}`,
  rejected: (rationale: string) => `rejected: ${rationale.slice(0, 80)}`,
} as const;
```

The `reasons.rejected` builder truncates to 80 characters for the `status_change` event's `reason` field (which is meant for log-scanning, not full content). The full rationale lives in the event's payload via a new `details` field — see D4.

### `hitl.ts` route

```ts
// server/src/routes/hitl.ts
import { Hono } from "hono";
import {
  validateHitlApprove,
  validateHitlReject,
  validateTaskInput,
} from "@ledger/parser";
import type { TaskInput, TaskStatus } from "@ledger/parser";
import { OptimisticLockError } from "../runner/store.js";
import { reasons } from "../runner/scheduler.js";
import type { ServerEnv } from "../server.js";

export const hitlRoute = new Hono<ServerEnv>()
  .post("/:id/approve", async (c) => {
    const project = c.get("project");
    const id = c.req.param("id");

    const task = project.runner.store.loadTask(id);
    if (task === undefined) return c.json({ error: "task_not_found" }, 404);
    if (task.status !== "AWAITING_HUMAN_REVIEW") {
      return c.json(
        { error: "wrong_status", expected: "AWAITING_HUMAN_REVIEW", actual: task.status },
        409,
      );
    }

    let raw: unknown;
    try { raw = await c.req.json(); }
    catch { return c.json({ error: "invalid_json" }, 400); }

    const result = validateHitlApprove(raw);
    if (!result.ok) return c.json({ errors: result.errors }, 400);
    const { dbRowVersion, note } = result.input;

    const reason = note !== undefined && note.length > 0
      ? reasons.approvedWithNote(note)
      : reasons.APPROVED;

    try {
      const updated = project.runner.store.updateTaskStatus(
        id,
        { from: "AWAITING_HUMAN_REVIEW", to: "COMPLETE", reason },
        dbRowVersion,
      );
      project.runner.tick();
      return c.json({ task: updated }, 200);
    } catch (err) {
      if (err instanceof OptimisticLockError) {
        return c.json(
          { error: "version_conflict", expected: dbRowVersion, actual: err.actual },
          409,
        );
      }
      throw err;
    }
  })
  .post("/:id/reject", async (c) => {
    const project = c.get("project");
    const id = c.req.param("id");

    const task = project.runner.store.loadTask(id);
    if (task === undefined) return c.json({ error: "task_not_found" }, 404);
    if (task.status !== "AWAITING_HUMAN_REVIEW") {
      return c.json(
        { error: "wrong_status", expected: "AWAITING_HUMAN_REVIEW", actual: task.status },
        409,
      );
    }

    let raw: unknown;
    try { raw = await c.req.json(); }
    catch { return c.json({ error: "invalid_json" }, 400); }

    const result = validateHitlReject(raw);
    if (!result.ok) return c.json({ errors: result.errors }, 400);
    const { dbRowVersion, reason: rejectionReason, followUp } = result.input;

    try {
      // Append the detail-bearing event FIRST so the rejection rationale is
      // never lost even if the status transition races with another writer.
      // (D5: detail-event-first ordering.)
      // The status_change event is emitted by updateTaskStatus; this extra
      // event is a structured "rejection_detail" kind appended via emit.
      project.runner.store.appendEvent(id, {
        kind: "error",
        message: "rejected_with_details",
        stack: rejectionReason,  // D6: full rationale in stack field (LogEvent shape)
      });

      const updated = project.runner.store.updateTaskStatus(
        id,
        {
          from: "AWAITING_HUMAN_REVIEW",
          to: "FAILED",
          reason: reasons.rejected(rejectionReason),
        },
        dbRowVersion,
      );

      let followUpTask: ReturnType<typeof project.runner.createTask> | undefined;
      if (followUp !== undefined) {
        const followUpInput: TaskInput = {
          ...followUp,
          dependsOn: [],
          resourceClaims:
            followUp.resourceClaims !== undefined
              ? followUp.resourceClaims
              : task.resourceClaims,
        };
        // Re-validate via validateTaskInput so we apply defaults consistently
        // (e.g. source defaults to "operator_injected" if not in followUp).
        const fuResult = validateTaskInput(followUpInput);
        if (!fuResult.ok) {
          // The reject succeeded but the follow-up is malformed — return 200
          // with the rejected task and a warning. This is honest: the operator
          // can re-submit the follow-up separately via POST /api/tasks.
          // (D7: do not roll back a successful rejection because of a malformed
          // optional follow-up.)
          return c.json(
            { task: updated, followUpErrors: fuResult.errors },
            200,
          );
        }
        followUpTask = project.runner.createTask(fuResult.input);
      }

      project.runner.tick();
      return c.json(
        followUpTask !== undefined ? { task: updated, followUpTask } : { task: updated },
        200,
      );
    } catch (err) {
      if (err instanceof OptimisticLockError) {
        return c.json(
          { error: "version_conflict", expected: dbRowVersion, actual: err.actual },
          409,
        );
      }
      throw err;
    }
  });
```

Both handlers go through the Store's `updateTaskStatus` with the `expectedDbRowVersion` argument — the Store throws `OptimisticLockError` (shipped in `01-store-schema`) on mismatch; the handler catches and renders 409 with the stored version in the body so the client can refresh and retry.

The follow-up enqueue path uses `runner.createTask` (not `store.createTask`) so the scheduler tick fires after the follow-up is inserted. The follow-up's `dependsOn` is forced to `[]` per parent §HITL gate item 4 (the rejected task is terminal; the follow-up has no waiting predecessor).

### `server.ts` mount

```ts
// server/src/server.ts (line added)
import { hitlRoute } from "./routes/hitl.js";
// ... existing imports unchanged ...

export function createServer(project: ProjectContext): Hono<ServerEnv> {
  const app = new Hono<ServerEnv>();
  app.use("*", logger());
  app.use("*", async (c, next) => { c.set("project", project); await next(); });
  app.route("/api/_health", healthRoute);
  app.route("/api/project", projectRoute);
  app.route("/api/docs", docsRoute);
  app.route("/api/tasks", tasksRoute);
  app.route("/api/tasks", hitlRoute);                   // NEW
  return app;
}
```

Multiple `app.route("/api/tasks", ...)` mounts compose cleanly per Hono's `hono-base.js:111-124` (verified in `04-api-endpoints` Spec Review). The handler order does not matter — Hono matches by URL pattern, and `tasksRoute` claims `/`, `/:id`, `/:id/stream`; `hitlRoute` claims `/:id/approve`, `/:id/reject`.

### JSON Schemas

```json
// docs/_schemas/hitl-approve.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ledger.dev/schemas/hitl-approve.schema.json",
  "title": "HITL Approve Request Body",
  "type": "object",
  "required": ["dbRowVersion"],
  "additionalProperties": false,
  "properties": {
    "dbRowVersion": { "type": "integer", "minimum": 0 },
    "note": { "type": "string", "maxLength": 4096 }
  }
}

// docs/_schemas/hitl-reject.schema.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ledger.dev/schemas/hitl-reject.schema.json",
  "title": "HITL Reject Request Body",
  "type": "object",
  "required": ["dbRowVersion", "reason"],
  "additionalProperties": false,
  "properties": {
    "dbRowVersion": { "type": "integer", "minimum": 0 },
    "reason": { "type": "string", "minLength": 1, "maxLength": 4096 },
    "followUp": { "$ref": "task-input.schema.json" }
  }
}
```

Both schemas pin `additionalProperties: false` — the request body has a tightly bounded shape and silent passthrough of unknown fields would be a forward-compat trap.

### Acceptance check (manual)

A reviewer running the worktree must observe:

1. `pnpm install` unchanged.
2. All 10 gates exit zero. Server test count delta ≈ +20 (≥4 executor/handle + ≥12 endpoint + ≥4 schema validation tests). Parser test count delta ≈ +10 (≥5 per new validator).
3. Boot the server: `pnpm -C server dev /Users/dennis/code/ledger`. Inject a `human_review` task:
   ```
   curl -X POST http://127.0.0.1:4180/api/tasks \
        -H 'Content-Type: application/json' \
        -d '{"type":"human_review","title":"approve me","reviewPayload":{"summary":"test diff"}}'
   ```
   Returns 201 with `task.status === "AWAITING_HUMAN_REVIEW"` (the executor suspends synchronously inside the tick that fires from `runner.createTask`).
4. `GET /api/tasks/<id>` returns the task with status AWAITING_HUMAN_REVIEW; event log has seq 0 (creation), seq 1 (RUNNING), seq 2 (AWAITING_HUMAN_REVIEW). Note: `dbRowVersion === 2` (two transitions).
5. Approve:
   ```
   curl -X POST http://127.0.0.1:4180/api/tasks/<id>/approve \
        -H 'Content-Type: application/json' \
        -d '{"dbRowVersion": 2, "note": "lgtm"}'
   ```
   Returns 200 with `task.status === "COMPLETE"`. Event log adds seq 3 (`status_change`, from=AWAITING_HUMAN_REVIEW, to=COMPLETE, reason=`"approved: lgtm"`).
6. Inject a second `human_review` task and reject:
   ```
   curl -X POST http://127.0.0.1:4180/api/tasks/<id>/reject \
        -H 'Content-Type: application/json' \
        -d '{"dbRowVersion": 2, "reason": "needs another pass: <80-char-rationale>", "followUp": {"type":"noop","title":"rejected; please re-do"}}'
   ```
   Returns 200 with `task.status === "FAILED"` AND a `followUpTask` whose `status === "COMPLETE"` (noop executes synchronously). Event log on the rejected task has seq 3 (the `error` kind event carrying the full rationale) + seq 4 (`status_change` with `reason: "rejected: <truncated>"`).
7. OCC: stale dbRowVersion → 409. Inject `human_review`, observe AWAITING_HUMAN_REVIEW, capture `dbRowVersion`, then send approve TWICE with the same version. First → 200; second → 409 with `{error: "version_conflict", expected, actual}`.
8. Restart durability: inject `human_review`, observe AWAITING_HUMAN_REVIEW, kill the server, re-boot. Task is still AWAITING_HUMAN_REVIEW (boot log: `runner: schema is current ...`; no orphan-recovery log line). Approve via curl post-restart succeeds.
9. SSE: open `curl -N http://127.0.0.1:4180/api/tasks/<id>/stream` on an AWAITING_HUMAN_REVIEW task; approve from a second terminal; the stream emits the `status_change` event live (verifying the publish path via the EventBus from `04-api-endpoints`).
10. Conflict-set behavior: inject task A with `resource_claims: [{kind: "node", nodeId: "x", mode: "write"}]` as a `human_review` task; before approving, inject task B with the same write claim as a `noop`. B transitions to BLOCKED with `blocked_by_claim_conflict:<A.id>`. Approve A → A completes → B dispatches → B completes.

Items 1–2 + the schema-validation tests are headless-verifiable; items 3–10 require a live server + curl. The SSE-live-delivery scenario (item 9) is also covered headlessly via `app.request()` in `hitl.test.ts`'s end-to-end test.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | `handle.awaitHumanReview` does NOT call `scheduleTick()` after the transition | The task is now suspended in a claim-holding state. Calling `scheduleTick` would do nothing useful — the task itself is no longer eligible for dispatch, and other tasks competing for its claims are still blocked. Skipping the call is a small honesty win: every other `handle.*` method (`complete`, `fail`) DOES tick because their transitions unblock dependents. `awaitHumanReview` does not. |
| D2 | `human_review` executor is just `handle.awaitHumanReview(task.id)` — no business logic in the executor itself | Symmetric with `noop`. Keeps the executor surface trivially testable and pinch-the-belly correct. The "real" logic — transitioning + holding claims — is in the handle method, which is where the scheduler-coupled state lives. |
| D3 | `dbRowVersion` is required in both approve and reject request bodies (no fallback to "current version") | PRD §8.4 explicitly requires optimistic locking against the task's current status. A missing-`dbRowVersion` fallback would make the OCC opt-in instead of mandatory, defeating its purpose (two-tab race protection). 400 on missing `dbRowVersion` is the right surface. |
| D4 | Rejection rationale lives in TWO places: a truncated 80-char `reason` field on the `status_change` event, AND the full rationale in a dedicated `error`-kind event's `stack` field | Two consumers: the SSE log stream (which truncates anyway via UI), and the "what exactly did the operator say" detail view that needs the full text. Keeping both means the `reason` field is grep-friendly (e.g., `grep "rejected:" runner.db`) AND the audit trail is complete. The `LogEvent.error` kind has the natural `stack` field for unstructured detail; piggybacking on it avoids inventing a new event kind. |
| D5 | The `error`-kind detail event is appended **before** the `status_change` event transitioning the row to FAILED | Ordering matters for two reasons: (a) if the `updateTaskStatus` call races with another writer and surfaces an `OptimisticLockError`, the detail event was already written — operators get to see the rationale even on the conflict-loser branch (the detail event is "rejected_with_details" labeled in `message`; the absence of a matching `status_change` is the signal that the reject didn't land). (b) The seq monotonicity guarantee means the detail event always precedes the status transition in the event log when read in seq order, which matches the human reading order ("here's what they said, here's what happened"). |
| D6 | The detail event uses the existing `LogEvent.error` kind with `message: "rejected_with_details"` and the full rationale in `stack` | Avoids introducing a new event kind (`"rejection_detail"`) which would require schema + validator updates in `@ledger/parser`. The `error` kind already has the right shape (`message: string`, `stack?: string`) and the semantics aren't wrong — a rejection is operator error feedback toward the originating task. UI consumers that filter on `kind: "error"` already render the `stack` field. If a dedicated kind becomes useful later (e.g., to filter rejection-detail events without picking up actual errors), it's a non-breaking schema extension. |
| D7 | A malformed optional `followUp` does NOT roll back a successful rejection | The rejection is the primary action; the follow-up is a convenience. If `followUp` fails validation, the response includes the rejected task PLUS a `followUpErrors` field — the operator can manually inject the follow-up via `POST /api/tasks`. Rolling back the rejection would force the operator to redo it, which is worse UX. The downside is a partial-success response shape, but the field name (`followUpErrors`) is explicit. |
| D8 | The follow-up's `dependsOn` is forced to `[]` (not honored from the request body even if provided) | Parent §HITL gate item 4: "the rejected task is terminal; the follow-up has no waiting predecessor in the runner's view." The conceptual "depends on the rejection" is captured in the `reviewPayload.summary` of the follow-up, not in the DAG. Honoring an explicit `dependsOn` from the request body would let the operator construct an inconsistent task graph (e.g., depending on the rejected-task which is now terminal — blocking the follow-up forever per `02-scheduler` D11). Defensive over-write is the right call. |
| D9 | The follow-up's `resourceClaims` defaults to the rejected task's claims; operator can override by passing an explicit (possibly empty) array | The default is the natural one — if the operator is rejecting because the artifact isn't right, the follow-up regenerating it should hold the same write claims to block downstream consumers until it lands. An empty-array override is honored to support "reject and queue an unrelated task as a follow-up." The detection is `followUp.resourceClaims !== undefined` (presence-vs-absence) — present-and-empty is honored as "no claims." |
| D10 | `humanReviewExecutor` registered in `createDefaultRegistry()` (joins `noop`) | Symmetric with how `02-scheduler` registers `noop`. After this child, the default registry has both built-ins. Tests that pass an explicit empty registry stay isolated. Tests that pass `createDefaultRegistry()` (the common path) get both. |
| D11 | Both POST endpoints call `project.runner.tick()` after a successful transition | The approve transition unblocks dependents (per `02-scheduler` state machine: COMPLETE unblocks dependents on next tick). The reject transition also matters: the rejected task is FAILED so its claims are released, freeing up conflicting tasks to proceed (per `02-scheduler` D11, FAILED dependents stay BLOCKED but FAILED predecessors release claims). Explicitly ticking is the right re-evaluation trigger. The `EventBus` from `04-api-endpoints` then publishes, and SSE subscribers see the cascade. |
| D12 | The rejection-detail event is appended via `store.appendEvent` (NOT `runner.events`-aware) | Both are equivalent in effect since the publishing-Store wrapper publishes after every write. Using `store.appendEvent` directly (via `project.runner.store`) is consistent with how `04-api-endpoints` writes events; the wrapper handles the publish. No special `runner.emit(...)` call needed at the endpoint level. |

---

## Open Issues

- **Approve/reject author attribution.** The `status_change` event has no `who` field today. v1 trusts the request source (localhost). When agents start emitting status changes (`06-agent-dispatcher`), attribution becomes load-bearing — the `02-scheduler` Open Issue about `who` field is the right place; this child inherits it without re-opening. *(Priority: LOW — inherited from `02-scheduler`.)*
- **No body-size limit on follow-up.** The follow-up can carry a large `reviewPayload.summary` (4096-char limit from the schema covers the rejection reason but not nested follow-up content). Hono's default body parser is unbounded. Single-operator local-only, so DoS is not the threat model. *(Priority: TRIVIAL — same as `04-api-endpoints`'s "no body-size limit on POST".)*
- **No "reject without follow-up but with operator continuing" affordance.** The current shape — reject either with or without a follow-up — covers the two main cases. The third case (reject, then operator picks back up later via an unrelated injection) is just "reject without followUp; manually POST a new task later." Not really an open issue, just an observation. *(Priority: TRIVIAL.)*
- **`reasons.rejected(rationale)` truncates at 80 chars; UI must render the full rationale from the detail event.** Drift risk: if a future UI surface reads `event.reason` instead of the detail event's `stack`, the operator sees only 80 chars. The `05-ui-hook-migration` spec should explicitly call out the detail-event read path. Logged here so the `05` author sees it. *(Priority: MEDIUM — cross-leaf coupling.)*
- **Bus subscriber throw-isolation (inherited from `04-api-endpoints`).** This child's POST endpoints don't add bus subscribers; the existing v1 surface stays callback-light. The Open Issue stays at LOW. *(Priority: LOW — inherited; not promoted by this child.)*
- **OCC version-bump on the detail event.** `store.appendEvent` (per `01-store-schema`) does NOT bump `db_row_version` — only `updateTaskStatus` does. So the order in D5 (detail event first, then status_change) means the dbRowVersion in the request body matches the row before EITHER write. The OCC check on `updateTaskStatus` happens with the version from before the detail event, which is correct. If a future Store change makes `appendEvent` bump the version, the request body's version becomes stale by the time `updateTaskStatus` runs and the user gets a spurious 409. Confirmed against `01-store-schema`: `appendEvent` does not bump (verified `store.ts:371-388`). *(Priority: TRIVIAL — coordination note for future `01-store-schema` audits.)*
- **No "auto-reject after time T" affordance.** Out of scope, but the parent's PRD §11 list mentions long-running review hold-up as a concern. Operator must remember to act. The eventual fix is a `health-daemon`-enqueued reminder task. *(Priority: LOW — surfaces in operator workflow once `07` lands.)*
- **`humanReviewExecutor` runs synchronously and returns immediately.** The scheduler's `tickOnce` does `pending = true; return;` after `dispatch(running, exec)`. So the trampoline iterates and finds no eligible task (the human_review task is now AWAITING_HUMAN_REVIEW, holding claims, conflicting with downstream). This is correct behavior but worth noting that the scheduler's "wait for executor to async-resolve" code path is NOT exercised by human_review — the suspension is the resolution. If a future executor needs both a sync `awaitHumanReview` AND an async finalization, that's new ground. *(Priority: TRIVIAL.)*
- **No cancellation of the suspending task.** A `human_review` task in AWAITING_HUMAN_REVIEW can only transition via approve or reject. If the operator wants to "just cancel this," they reject with a vague reason. Parent §Out of scope. *(Priority: LOW.)*

---

## Spec Review (2026-05-27)

*(none yet — pre-review)*

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this child moves to `VERIFY`, the verifier confirms:

1. The full Acceptance check list (1–10) passes.
2. `humanReviewExecutor.run` transitions a RUNNING task to AWAITING_HUMAN_REVIEW exactly once; calling it on a non-RUNNING task surfaces a Store error (the executor isn't defensive — the scheduler guarantees the state when calling it).
3. `handle.awaitHumanReview` does NOT call `scheduleTick`. Verified by a counting spy on the registry's `get` (or on `runner.tick`).
4. `human_review` task lifecycle end-to-end: PENDING → RUNNING → AWAITING_HUMAN_REVIEW. Claims held — a conflicting task transitions BLOCKED.
5. Approve transitions AWAITING_HUMAN_REVIEW → COMPLETE; event log records `reasons.APPROVED` (or `approved: <note>`); `dbRowVersion` bumped.
6. Reject transitions AWAITING_HUMAN_REVIEW → FAILED; event log records the detail event (kind `error`, message `rejected_with_details`, stack = full rationale) BEFORE the `status_change` event (kind `status_change`, reason `rejected: <truncated>`).
7. Reject with `followUp` enqueues a follow-up task with `dependsOn: []`, `resourceClaims` defaulted from the rejected task or overridden if provided.
8. OCC: approve/reject with stale `dbRowVersion` returns 409 with `expected` and `actual` in the body.
9. Restart durability: an AWAITING_HUMAN_REVIEW row survives `recoverOrphans(store)`. After a fresh Runner is constructed, the row is still AWAITING_HUMAN_REVIEW and approve works.
10. Three JSON Schemas validate against the 2020-12 meta-schema; validator tests cover happy + sad paths.
11. SSE: an open stream on an AWAITING_HUMAN_REVIEW task emits the approval `status_change` event live (via the EventBus from `04-api-endpoints`).
12. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` exit zero at the workspace root.
13. No regressions on `04-api-server`'s endpoints; no regressions on `04-api-endpoints`'s GET/POST/SSE.

---

## Children

None.
