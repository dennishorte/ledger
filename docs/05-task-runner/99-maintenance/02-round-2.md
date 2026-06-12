# Maintenance Round 2: Bus Isolation, Hook Cleanup, Status-Code Convention, dep Validation

**Node ID:** `05-task-runner/99-maintenance/02-round-2`
**Parent:** `05-task-runner/99-maintenance` (`docs/05-task-runner/99-maintenance/00-maintenance.md`)
**Status:** APPROVED
**Created:** 2026-06-12
**Last Updated:** 2026-06-12 (DRAFT → APPROVED; spec review applied)

**Dependencies:** `05-task-runner/04-api-endpoints` (EventBus, task routes), `05-task-runner/05-ui-hook-migration` (`useTask`, `useLogStream`), `05-task-runner/02-scheduler` (task creation path)

---

## Requirements

Curated punch list — five items from four siblings in the `05-task-runner` subtree:

1. **`bus.publish` throw-isolation** (`05-task-runner/04-api-endpoints`, Open Issues, LOW)
   - Source: "A throwing subscriber halts all other callbacks for the same event. Currently only the SSE `flush()` subscriber exists (can't throw), but `03-hitl-gate` and `06-agent-dispatcher` were explicitly warned this becomes load-bearing once they add subscribers."
   - Priority: LOW (cross-sibling, real risk)
   - Why this round: one-liner `try/catch` wrap in `bus.publish`. Headlessly testable. Must land before additional subscribers are registered by ongoing development — the window to fix this cheaply is narrowing.

2. **`useTask` ID-format discriminant fragility** (`05-task-runner/05-ui-hook-migration`, Open Issues, LOW)
   - Source: "`id.includes(':')` is the runner-vs-transcript heuristic. If runner IDs ever gain colons (or transcript IDs lose them), this breaks silently with 404s. A `task.transcriptPath === undefined` guard already exists in `TaskInspector`; consolidating to that form everywhere eliminates the hidden invariant."
   - Priority: LOW (mechanical cleanup, prevents silent future break)
   - Why this round: the corrective guard (`transcriptPath === undefined`) is already present in `TaskInspector` — this is a cross-call-site normalization, not new logic. Pairs naturally with item 3 (same hook file, same test file).

3. **No EventSource test coverage for `useLogStream` runner-stream variant** (`05-task-runner/05-ui-hook-migration`, Open Issues, LOW)
   - Source: "Operator stage-8 covers it manually, but a CI regression would be invisible until a broken `/logs/:id` page surfaces in production. Mechanically addable with the same fake-`EventSource` pattern used by the transcript variant."
   - Priority: LOW
   - Why this round: the fake-`EventSource` infra already exists in the test file; adding coverage for the runner-stream branch is a direct extension of existing test patterns. Pairs with item 2 (same file).

4. **422 vs 400 inconsistency between `docs.ts` and `tasks.ts`** (`05-task-runner/04-api-endpoints`, Open Issues, LOW)
   - Source: "`docs.ts` returns 422 on validation failure; `tasks.ts` returns 400. One-line fix to pick a convention. Cross-sibling surface visible in any client error-handling code."
   - Priority: LOW (mechanical, cross-sibling)
   - Why this round: the current state (`docs.ts` existing code already shown: returns 422 on `validateDocNode` failure) is the correct RFC 9110 convention for semantic validation errors. `tasks.ts` should align to 422. One-line change, verified by reading the route handler.

5. **`dependsOn` reference validation on task creation** (`05-task-runner/02-scheduler`, Open Issues, LOW)
   - Source: "Passing a non-existent dep ID silently creates a forever-BLOCKED task. A `store.taskExists(id)` check per dep at creation is cheap and eliminates a confusing operator debugging loop."
   - Priority: LOW (prevents silent bad state)
   - Why this round: self-contained validation at the creation call site in the scheduler or store layer; no schema migration, no new endpoint. The fix is a guard that returns an early error rather than writing a bad row.

**Out of scope:**

The following items from the same subtree were considered and excluded:

- `02-scheduler`: **`lastReason` O(n) scan per BLOCKED candidate per tick** (LOW) — the documented fix is a `last_reason` denormalized column via a new migration. Schema migrations are outside the mechanical-fix bar for a maintenance round; routes to a future standalone leaf.
- `03-hitl-gate`: **Auto-reject after time T** (LOW) — requires scheduler-side timer integration; not a maintenance patch.
- `03-hitl-gate`: **No cancellation of `AWAITING_HUMAN_REVIEW`** (LOW) — no server endpoint; a pure-UI patch cannot close this.
- `03-hitl-gate`: **Approve/reject author attribution** (LOW) — requires a `who` field on `status_change` events, a schema change; correctly routes to a future leaf adjacent to `06-agent-dispatcher`.
- All TRIVIAL items — below the maintenance-round severity bar.

---

## Design

**Batching shape:** four independent fixes across three layers (server `EventBus`, server route handler, client hooks + tests). No new files required. No shared types changed.

### Item 1 — `bus.publish` try/catch wrap (`server/src/runner/events.ts`)

`EventBus.publish` currently iterates subscribers and calls each synchronously. Wrap each call in `try/catch`; log the error and continue to the next subscriber:

```ts
publish(event: LogEvent): void {
  for (const sub of this.subscribers) {
    try {
      sub(event);
    } catch (err) {
      console.error("[EventBus] subscriber threw; continuing", err);
    }
  }
}
```

Add a unit test: register two subscribers where the first throws; assert the second still receives the event and the error is swallowed.

### Item 2 — `useTask` discriminant consolidation (`app/src/lib/useTask.ts`)

Replace every `id.includes(":")` call that discriminates runner vs. transcript with a data-driven check. The authoritative shape is that runner tasks have `transcriptPath === undefined` and transcript entries have a non-null `transcriptPath`. Where the data is not yet fetched (the discriminant must fire before the fetch), use a narrower invariant: runner task IDs are UUIDs (no colon, 36 chars); transcript IDs contain a colon. Document this as an explicit invariant comment rather than leaving the logic implicit.

If refactoring to data-driven is infeasible in all call sites (e.g., the discriminant fires before data is available), at minimum: extract the predicate into a named helper `isRunnerTaskId(id: string): boolean` in `app/src/lib/types.ts` (or a small `taskId.ts` utility) so the invariant is defined once, has a doc-comment explaining the assumption, and all callers reference the single definition.

### Item 3 — `useLogStream` runner-stream test coverage (`app/src/lib/useLogStream.test.ts` or equivalent)

Using the existing `FakeEventSource` (or equivalent test double already present for the transcript variant), add test cases for the runner-stream branch:
- Happy path: `EventSource` connects to `/api/tasks/:id/stream`; incoming `data:` events append to the stream state.
- `Last-Event-ID` header is forwarded on reconnect (if the hook implements resume logic).
- Cleanup: `EventSource.close()` is called on unmount.

No new test infrastructure needed — extend the existing `EventSource` fake.

### Item 4 — 422 convention in `tasks.ts` (`server/src/routes/tasks.ts`)

Locate every `c.json({ error: ... }, 400)` that fires on a validation/semantic error (as opposed to a truly malformed request). Replace those with `422`. Pure string constant change; no logic change. The `docs.ts` file (already shown: uses 422 on `validateDocNode` failure) is the reference convention. Based on the originating Open Issue (D7 reference in `04-api-endpoints`), expect one affected site on the `validateTaskInput` failure path; verify with `grep -n '400' server/src/routes/tasks.ts` to confirm no additional semantic-validation 400s remain after the fix.

### Item 5 — `dependsOn` validation on task creation (`server/src/runner/store.ts` or `scheduler.ts`)

At the `createTask` call site, before writing the row, iterate `input.dependsOn ?? []` and call `store.taskExists(id)` (or equivalent read) for each. If any dep ID is not found, throw / return an error that surfaces as a `400` to the caller (operator injection via `POST /api/tasks`) or as an immediate thrown error for internal callers. Do not write the task row on validation failure.

No migration. No new table. Check whether `store.getTask(id)` already exists before adding `store.taskExists` — if a `getTask` is already present, use it rather than adding a redundant method. If neither exists, `store.taskExists` is a minimal `SELECT 1 FROM tasks WHERE id = ? LIMIT 1` one-liner on the `Store` interface.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | `bus.publish` swallows subscriber errors with `console.error` rather than re-throwing or collecting them | The EventBus is a fire-and-forget fan-out. The caller of `publish` (the scheduler tick, the store decorator) cannot act on individual subscriber failures; it only cares that publication completed. Collecting errors for a return value would require changing every `publish` call site. `console.error` is sufficient observability at single-operator scale; a future `emit_error` event could be added if subscribers need error propagation. |
| D2 | `isRunnerTaskId` predicate is extracted to a named helper rather than inlined at each call site | The colon-based invariant is a fragile convention. Centralising it makes the single point of failure visible and makes future changes (e.g., switching to a type discriminant on `TaskId`) mechanical rather than a grep hunt. |
| D3 | 422 is the convention for semantic validation failures; 400 is reserved for structurally malformed requests (unparseable body, missing required field at the JSON level) | RFC 9110: 422 = "well-formed but semantically incorrect"; 400 = "malformed syntax." `docs.ts`'s existing usage of 422 on `validateDocNode` failure already reflects this convention; `tasks.ts` aligns to it. |
| D4 | `dependsOn` validation fires at `createTask` time, not at `tick` time | `tick` is hot-path; adding a lookup per BLOCKED candidate per tick is the O(n) problem item 6 in the pool (excluded). Validating at creation is a one-time cost and catches the error at the earliest possible moment. |
| D5 | `store.taskExists` (if new) is a minimal read — `SELECT 1 FROM tasks WHERE id = ? LIMIT 1` — not a full `getTask` | Keeps the validation path cheap. The full task object is not needed; existence is sufficient. |

---

## Open Issues

*(none — all items are contained and self-describing)*

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

Per-item acceptance checks:

**Item 1 — `bus.publish` throw-isolation**

| # | Check | Method |
|---|-------|--------|
| 1a | Unit test: two subscribers, first throws, second receives the event; `publish` does not rethrow. | headless — `pnpm test` |
| 1b | Existing EventBus tests still green; no regression to SSE flush path. | headless — `pnpm test` |
| 1c | `server/src/runner/events.ts` `publish` method wraps each subscriber call in `try/catch`. | code review |

**Item 2 — `useTask` discriminant consolidation**

| # | Check | Method |
|---|-------|--------|
| 2a | `isRunnerTaskId` (or equivalent named predicate) exists in `app/src/lib/` with a doc-comment explaining the UUID/colon invariant. | code review |
| 2b | No bare `id.includes(":")` call remains in `useTask.ts` (or wherever the discriminant lived); all callers use the named predicate. | headless — `grep -r 'id.includes.*":"' app/src/lib/` returns no hits |
| 2c | `pnpm -C app typecheck` green; `pnpm -C app lint` green. | headless |

**Item 3 — `useLogStream` runner-stream test coverage**

| # | Check | Method |
|---|-------|--------|
| 3a | New test cases for runner-stream branch present in the hook's test file. | code review |
| 3b | Tests pass: `pnpm -C app test` green; pass count increases by at least 2 vs. pre-round baseline. | headless |
| 3c | `EventSource.close()` called on unmount assertion present. | code review |

**Item 4 — 422 convention in `tasks.ts`**

| # | Check | Method |
|---|-------|--------|
| 4a | `server/src/routes/tasks.ts` returns 422 (not 400) on semantic validation failures; 400 reserved for structurally malformed input. | code review |
| 4b | `grep -n '400' server/src/routes/tasks.ts` — any remaining 400s are on missing/malformed body fields, not semantic validation. | headless |
| 4c | `pnpm -C server typecheck` green; `pnpm test` green. | headless |

**Item 5 — `dependsOn` validation on task creation**

| # | Check | Method |
|---|-------|--------|
| 5a | `store.taskExists` (or equivalent) exists and is called for each dep ID in `createTask`. | code review |
| 5b | Unit test: `createTask` with a non-existent dep ID throws / returns an error; no task row written. | headless — `pnpm test` |
| 5c | Unit test: `createTask` with a valid dep ID succeeds as before. | headless — `pnpm test` |
| 5d | `pnpm -C server typecheck` green; `pnpm test` green. | headless |

**E2E suite:** `pnpm -C e2e test` — no new E2E tests required. All changes are server-internal or hook-level; no new UI surface is introduced. Existing passing tests must not regress.

---

## Children

None.
