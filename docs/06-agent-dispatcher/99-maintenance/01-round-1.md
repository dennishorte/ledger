# Agent Dispatcher — Maintenance Round 1: SIGKILL Escalation

**Node ID:** `06-agent-dispatcher/99-maintenance/01-round-1`
**Parent:** `06-agent-dispatcher/99-maintenance` (`docs/06-agent-dispatcher/99-maintenance/00-maintenance.md`)
**Status:** DRAFT
**Created:** 2026-06-12
**Last Updated:** 2026-06-12

**Dependencies:** `06-agent-dispatcher/03-claude-code-executor` (owns `cancellation.ts` and the subprocess handle); `06-agent-dispatcher/05-dispatch-api` (cross-ref bullet to strike)

---

## Requirements

Curated punch list — one item is a real code fix; one is a doc-only cross-reference strike.

### Item 1 — SIGKILL escalation after SIGTERM (code fix)

- **Source:** `06-agent-dispatcher/03-claude-code-executor` Open Issues: *"No SIGKILL escalation after SIGTERM. … Mitigation (deferred): a per-task timer started in `cancellation.ts` when `kill("SIGTERM")` is called; on firing (5–10 s), send SIGKILL and emit a `subprocess_killed` log event. The timer would live in this leaf's cancellation registry (which owns the subprocess handle), not in the cancel route."*
- **Priority:** MEDIUM
- **Why this round:** The companion cross-ref on `05-dispatch-api` (item 2) explicitly traces back to this same deficiency. The two items are a natural batch — the code fix lands in one file (`cancellation.ts`) and item 2 becomes a pure doc-pointer once it lands. Addressing the MEDIUM issue while cross-linking lets both leaves stay accurate without waiting for a future larger work item.

### Item 2 — Strike cross-ref on `05-dispatch-api` (doc-only)

- **Source:** `06-agent-dispatcher/05-dispatch-api` Open Issues: *"SIGKILL escalation for hung cancels. Inherited from `03`'s Open Issues. The cancellation registry would need a per-task timer; that lives in `03-claude-code-executor`'s scope, not here. Cross-reference for visibility. (Priority: MEDIUM — surfaces when cancellation is heavily used.)"*
- **Priority:** MEDIUM (inherited from the `03` source)
- **Why this round:** Pure pointer into item 1. Once item 1 ships, this bullet is resolved by reference. Striking it with a forward pointer is the complete action. No code change required.

### Out of scope

The following open issues from the `06-agent-dispatcher` subtree were considered and excluded from this round:

- **`03`: No watchdog timeout on dispatched subprocess** (LOW) — a configurable timeout is additive scope, not a single-file mechanical fix. Warrants its own leaf or a future round with broader design discussion.
- **`03`: `smoke.test.ts` skipped by default** (LOW) — a CI infrastructure item, not a code fix; blocked on infra availability rather than code readiness.
- **`03`: MCP config JSON cleanup is best-effort** (TRIVIAL) — a startup sweep of stale temp files; unrelated to cancellation.
- **`03`: `Subprocess` type loose-typed at the cancellation registry boundary** (TRIVIAL) — while `cancellation.ts` is already open for item 1, this is a type-tightening refactor that changes the `CancellationRegistry` interface and all call sites. Mixed with the timer addition it would widen the diff and complicate review. Defer to a future round.
- **`03`: No structured stderr capture beyond the reason tail** (LOW) — a separate observability concern with its own design surface.
- **`05`: `MutationErrorBody` lives in `useApproveTask.ts`** (TRIVIAL) — unrelated to cancellation; belongs in a UI-focused round if it ever reaches round size.
- **`05`: No 80-char truncation on operator-supplied cancel reasons** (TRIVIAL) — unrelated.
- **`05`: Cancel-on-noop returns 409 `no_subprocess`** (LOW) — a UI visibility concern, not a subprocess-lifecycle bug.
- **`05`: `DispatchConfirmDialog` toast surface text-only** (LOW) — UI polish, unrelated.
- Parent-level open issues (MCP turn-0 startup race, prompt-template iteration ergonomics, no retry semantics, MCP tool-call rate limiting, subscription-auth path, cross-machine dispatch, OpenAPI typed client) — all LOW or deferred architecture items; none are mechanical fixes appropriate for a round of this scope.

The severity gate is clear: no HIGH-priority issues exist in the subtree. The two MEDIUM items in this round are batchable because they share a single originating deficiency (no SIGKILL escalation) and have non-overlapping code surfaces (item 1 touches `cancellation.ts` only; item 2 is a doc edit to `05-dispatch-api.md` only).

---

## Design

### Batching shape

Two items; no shared design surface at the code level.

**Item 1 (`cancellation.ts` — server code):**

Add a per-task escalation timer inside `CancellationRegistry`. When `kill("SIGTERM")` is called for a registered subprocess, start a `setTimeout` (default 8 s; configurable via an optional `escalationDelayMs` parameter on `createCancellationRegistry`). On the timer firing, call `subprocess.kill("SIGKILL")` and emit a `subprocess_killed` log event via the runner's event bus. Cancel the timer in `unbind` — if the subprocess exits cleanly after SIGTERM (the normal case), `unbind` is called by the executor's `finally` block before the timer fires, so no SIGKILL is delivered.

The timer state lives entirely inside `createCancellationRegistry`. No changes to the `CancellationRegistry` interface — the timer setup is an internal detail of the `kill("SIGTERM")` call, triggered via a thin `killWithEscalation(taskId, signal)` method added to the registry interface. The cancel route in `05-dispatch-api` calls `killWithEscalation` instead of `subprocess.kill("SIGTERM")` directly.

The `subprocess_killed` log event requires access to the runner's store or event bus to write. The registry is constructed in `loadProjectContext` where the runner is available; pass the runner handle (or a `emitEvent(taskId, event)` callback) as a dependency to `createCancellationRegistry`.

Files touched by item 1:
- `server/src/dispatcher/executor/cancellation.ts` — timer logic, `killWithEscalation` method
- `server/src/routes/tasks.ts` — call site switches from `subprocess.kill("SIGTERM")` to `dispatchCancellation.killWithEscalation(id, "SIGTERM")`
- `server/src/context.ts` — pass the runner emit callback when constructing the registry
- `server/test/dispatcher/executor/cancellation.test.ts` — tests for the timer path

**Item 2 (`05-dispatch-api.md` — doc edit):**

Strike the SIGKILL cross-ref bullet in `docs/06-agent-dispatcher/05-dispatch-api.md`:

```markdown
- ~~**SIGKILL escalation for hung cancels.** Inherited from `03`'s Open Issues. The cancellation registry would need a per-task timer; that lives in `03-claude-code-executor`'s scope, not here. Cross-reference for visibility. *(Priority: MEDIUM — surfaces when cancellation is heavily used.)*~~ → addressed by `06-agent-dispatcher/99-maintenance/01-round-1` (2026-06-12).
```

Also strike the originating bullet in `docs/06-agent-dispatcher/03-claude-code-executor.md`:

```markdown
- ~~**No SIGKILL escalation after SIGTERM.** … *(Priority: MEDIUM — surfaces when cancellation is heavily used; safer to address after `05-dispatch-api` lands the cancel route.)*~~ → addressed by `06-agent-dispatcher/99-maintenance/01-round-1` (2026-06-12).
```

No code change. The parent `00-agent-dispatcher.md` Open Issues section carries the same zombie-subprocess item; it also gets a strikethrough pointer.

### Interface change

```ts
// server/src/dispatcher/executor/cancellation.ts
export interface CancellationRegistry {
  bind(taskId: TaskId, subprocess: Subprocess): void;
  unbind(taskId: TaskId): void;
  lookup(taskId: TaskId): Subprocess | undefined;
  /** Send signal; if signal is "SIGTERM", start the SIGKILL escalation timer. */
  killWithEscalation(taskId: TaskId, signal: "SIGTERM" | "SIGKILL"): boolean;
  size(): number;
}

export function createCancellationRegistry(opts?: {
  escalationDelayMs?: number;                                      // default 8000
  emitEvent?: (taskId: TaskId, event: SubprocessKilledEvent) => void;
}): CancellationRegistry
```

`killWithEscalation` returns `true` if the subprocess was found and signalled, `false` if the `taskId` was not registered (mirrors the intent of the old `subprocess.kill()` call — callers can check). The `emitEvent` callback is optional; if absent, the SIGKILL fires but no log event is emitted (safe degradation for contexts that don't have the runner wired — tests, for example).

### `subprocess_killed` log event

A new `LogEvent` kind: `{ kind: "subprocess_killed", signal: "SIGKILL", taskId: string }`. This extends the existing `LogEvent` union in `@ledger/parser/src/runner/types.ts`. The existing AJV-validated `log-event.schema.json` in `docs/_schemas/` needs an additive entry for the new kind.

**Decision on schema update scope:** Adding a new `LogEvent` kind is additive (a new `"if": { "properties": { "kind": { "const": "subprocess_killed" } } }` branch in the AJV schema). No existing event kinds change shape. The parser's `types.ts` union gains one member.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | `killWithEscalation` replaces the direct `subprocess.kill("SIGTERM")` call site in the cancel route | The parent's Spec Review S2 (on `00-agent-dispatcher.md`) already prescribed that the timer lives in the executor/registry, not the cancel route. This reinforces that design: the cancel route's job is the eager DB write + signal delivery; the escalation is the registry's concern. Exposing `killWithEscalation` on the interface lets the cancel route remain unaware of the timer. |
| D2 | Default escalation delay is 8 s | 5 s may be too short for a subprocess executing a long Bash tool call (which can itself block on a subprocess). 10 s may leave a zombie observable for too long. 8 s is the midpoint of the parent's "5–10 s" guidance. Configurable via `escalationDelayMs` for future tuning without a code change. |
| D3 | `emitEvent` callback is optional; absence silently skips the log event | Tests want to exercise the SIGKILL escalation path without constructing a full runner. Making the callback optional keeps test setup simple and avoids a hard dep on the runner inside the registry (which is constructed before the runner in `loadProjectContext`'s init order). |
| D4 | New `subprocess_killed` LogEvent kind added to `@ledger/parser/src/runner/types.ts` and `docs/_schemas/log-event.schema.json` | The existing convention: new event kinds are additive to the `LogEvent` union (see `05-task-runner/01-store-schema`'s event taxonomy). The schema file needs an additive branch to keep AJV validation in `runner.emit_event`'s handler from rejecting the new kind. |
| D5 | `Subprocess` type at the registry boundary left as-is | The TRIVIAL type-tightening item (`Subprocess` → `KillableProcess`) was explicitly excluded from this round's scope (see Out of scope). The `killWithEscalation` addition is compatible with the current loose type. |

---

## Open Issues

*(none — pre-implementation)*

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

Per-item acceptance checks the operator walks in stage 8:

**Item 1 — SIGKILL escalation:**

1. `pnpm -C packages/parser build`, `pnpm -C server build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` all exit zero across the workspace. `server/test/dispatcher/executor/cancellation.test.ts` passes including the new timer-path tests.
2. **SIGTERM-exits-clean path (no escalation):** Dispatch a `noop`-pattern integration test task; verify the timer is cancelled by `unbind` before it fires. Check that no SIGKILL call was made (via mock recording in the test).
3. **SIGKILL escalation fires:** In a test, configure `escalationDelayMs: 50` (short for test speed), bind a mock subprocess that ignores SIGTERM (does not exit), call `killWithEscalation(taskId, "SIGTERM")`, advance the timer, assert `subprocess.kill("SIGKILL")` was called exactly once, assert the `emitEvent` callback was called with a `subprocess_killed` event for the correct taskId.
4. **`unbind` before escalation (race prevention):** Bind, call `killWithEscalation`, immediately `unbind`, advance the timer. Assert SIGKILL was NOT called (the timer was cancelled by `unbind`).
5. **`killWithEscalation("SIGKILL")` directly (no timer):** Passing `"SIGKILL"` directly sends SIGKILL immediately without setting a timer. Assert no timer leak.
6. **`killWithEscalation` on unknown taskId returns `false`** — no panic, no throw.
7. **Cancel route integration:** `POST /api/tasks/:id/cancel` calls `dispatchCancellation.killWithEscalation(id, "SIGTERM")` (grep `tasks.ts`). The direct `subprocess.kill("SIGTERM")` call is gone.
8. **`subprocess_killed` event kind accepted by AJV:** The `log-event.schema.json` validator accepts `{ kind: "subprocess_killed", signal: "SIGKILL", taskId: "<uuid>" }` without error.

**Item 2 — Doc strike:**

9. `docs/06-agent-dispatcher/03-claude-code-executor.md` Open Issues: the "No SIGKILL escalation after SIGTERM" bullet is struck with a forward pointer to this round.
10. `docs/06-agent-dispatcher/05-dispatch-api.md` Open Issues: the "SIGKILL escalation for hung cancels" cross-ref bullet is struck with a forward pointer to this round.
11. `docs/06-agent-dispatcher/00-agent-dispatcher.md` Open Issues: the "Zombie subprocesses after eager cancel" bullet is struck with a forward pointer to this round.

---

## Children

None. This is a leaf node.
