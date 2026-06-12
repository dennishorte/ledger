# Maintenance Round 1: HITL Rejection Rationale Display + Follow-up Injection

**Node ID:** `05-task-runner/99-maintenance/01-hitl-rejection-rationale-ui-display`
**Parent:** `05-task-runner/99-maintenance` (`docs/05-task-runner/99-maintenance/00-maintenance.md`)
**Status:** APPROVED
**Created:** 2026-06-12
**Last Updated:** 2026-06-12 (DRAFT → APPROVED, spec review applied)

**Dependencies:** `05-task-runner/03-hitl-gate` (reject endpoint `followUp` field), `05-task-runner/05-ui-hook-migration` (`TaskInspector`, `useRejectTask`)

---

## Requirements

Curated punch list — two items from two siblings in the `05-task-runner` subtree:

1. **Rejection-rationale display drift risk** (`05-task-runner/03-hitl-gate`, Open Issues, MEDIUM)
   - Source: "`reasons.rejected(rationale)` truncates at 80 chars; UI must render the full rationale from the detail event. Drift risk: if a future UI surface reads `event.reason` instead of the detail event's `stack`, the operator sees only 80 chars."
   - Priority: MEDIUM
   - Why this round: requires reading the live `TaskInspector.tsx` source to verify the current display path is correct, then either fixing it or closing the issue with a code comment + test. The verification work is mechanical and pairs naturally with item 2 (both touch the reject flow in `TaskInspector`).
   - **Finding after source read:** `TaskInspector` already correctly reads `latestStatusReason` from `status_change.reason` for the "Status reason" row (line 56–65, `TaskInspector.tsx`) — showing the 80-char truncated form — and the full untruncated rationale surfaces via the existing `ErrorRow` in the LogStream panel via the `kind: "error"` detail event. The current behavior is architecturally correct per `03-hitl-gate` D4/D6. The open issue's concern is that a *future* UI surface might mistakenly read the truncated form. This round's deliverable is: (a) **replace** the existing comment in `TaskInspector.tsx` at the `latestStatusReason` usage site with the explicit comment shown in the Design section below — the existing comment is insufficient because it does not contain the negative instruction ("Do NOT switch this to read the detail event stack"); a mere paraphrase or augmentation of the existing text is not acceptable, (b) add a targeted test assertion in `TaskInspector.test.tsx` confirming the full rationale does NOT appear in the Status reason row (only the truncated form does), and (c) close the open issue bullet in `03-hitl-gate.md` via strikethrough.

2. **Follow-up task injection on Reject** (`05-task-runner/05-ui-hook-migration`, Open Issues, MEDIUM)
   - Source: "Follow-up task injection on Reject (D9) — UI doesn't expose `followUp`."
   - Priority: MEDIUM
   - Why this round: the `POST /api/tasks/:id/reject` endpoint already accepts an optional `followUp: TaskInput` body field (shipped in `03-hitl-gate`). `useRejectTask` does not forward it; `HitlActions` does not expose it. This round adds a "Queue follow-up task" toggle to the Reject flow in `TaskInspector` — an inline collapsed panel that reveals `title` (required) and `type` (select from `TaskType` minus `human_review` / `noop` / `operator_session`; defaults to `agent_task`) fields. When the toggle is on, `useRejectTask` includes the `followUp` object in the request body. The response shape gains `followUpTask?: Task` (already in the server response — `03-hitl-gate` line 361). Pairs naturally with item 1 (same file, same component, same test file).

**Out of scope:**

The following items from the same subtree were considered and excluded:

- `03-hitl-gate`: **Approve/reject author attribution** (LOW) — requires backend `who` field on `status_change` events; that's a `02-scheduler` schema change, not a maintenance patch. Correctly routes to a future `06-agent-dispatcher`-adjacent leaf.
- `03-hitl-gate`: **Bus subscriber throw-isolation** (LOW) — inherited from `04-api-endpoints`; cross-cutting infrastructure concern spanning two COMPLETE siblings, not scoped to this subtree's UI layer.
- `03-hitl-gate`: **No auto-reject after time T** (LOW) — requires scheduler-side timer integration; outside `TaskInspector`'s concern.
- `03-hitl-gate`: **No cancellation of AWAITING_HUMAN_REVIEW** (LOW) — no server endpoint exists; a UI-only patch cannot close this.
- `05-ui-hook-migration`: **No EventSource test coverage for `useLogStream` runner-stream** (LOW) — adding `EventSource` mock infra is disproportionate for a maintenance pass; flagged as follow-up.
- `05-ui-hook-migration`: **`useTask`'s endpoint discriminant depends on ID-format invariants** (LOW) — structural concern, not a bug; no fix needed in v1.
- `05-ui-hook-migration`: **`MutationErrorBody` type is hook-local** (TRIVIAL) — cosmetic; promoting to shared types introduces migration churn across callers for zero functional gain in v1.
- All TRIVIAL items across both leaves — below the maintenance-round severity bar.

---

## Design

Both items are UI-only — no server changes required. The server already supports `followUp` in the reject body; item 1 is comment + test only; item 2 is a component UI addition + hook extension.

**Batching shape:** single implementation pass touching three files:
- `app/src/lib/useRejectTask.ts` — extend `RejectVariables` with optional `followUp: TaskInput` field; include it in the request body when present; extend the success response type to include `followUpTask?: Task`.
- `app/src/components/tasks/TaskInspector.tsx` — `HitlActions` gains a "Queue follow-up task" toggle; when active, renders `title` input (required, non-empty) and `type` select (TaskType options, default `agent_task`); passes `followUp` to `reject.mutate`. Add explicit inline comment at `latestStatusReason` usage documenting the intentional 80-char truncation.
- `app/src/components/tasks/TaskInspector.test.tsx` — two new test cases (item 1: status reason row shows truncated form; item 2: follow-up toggle, submit flow passes `followUp` in request body; response `followUpTask` displayed).

No new files. No server files touched. No shared types changed (the `TaskInput` type imported from `@/lib/types` is already present in `app/src/lib/types.ts` via the existing re-export from `@ledger/parser`).

### `useRejectTask.ts` changes

```ts
// Add to RejectVariables:
import type { TaskInput } from "./types.js";

export interface RejectVariables {
  taskId: TaskId;
  dbRowVersion: number;
  reason: string;
  followUp?: TaskInput;  // NEW — forwarded to POST /api/tasks/:id/reject
}

// postReject: include followUp in request body when present:
body: JSON.stringify(
  variables.followUp !== undefined
    ? { dbRowVersion, reason, followUp: variables.followUp }
    : { dbRowVersion, reason }
)

// Return type: server already returns { task, followUpTask? }
// Widen from { task: Task } to { task: Task; followUpTask?: Task }
```

### `HitlActions` component changes

Inside the `rejectOpen` branch, add below the existing `reason` textarea:

```tsx
// DispatchableTaskType is defined BEFORE the state declaration (not after) to
// avoid a TypeScript forward-reference error — the type alias must be in scope
// before the useState generic uses it.
// DispatchableTaskType = Exclude<TaskType, "noop" | "human_review" | "operator_session">
// Not exported (scoped to this UI concern only).
type DispatchableTaskType = Exclude<TaskType, "noop" | "human_review" | "operator_session">;

// "Queue follow-up task" toggle — collapsed by default.
// When expanded, reveals a title input (required) and type select.
// followUpData state: undefined (toggle off) | { title: string; type: DispatchableTaskType }
const [followUpData, setFollowUpData] = useState<
  { title: string; type: DispatchableTaskType } | undefined
>(undefined);
```

Toggle renders as a checkbox + label "Queue follow-up task" above the Confirm/Cancel row. When checked, reveals:
- `<input type="text">` for title (required — Confirm button additionally disabled when `followUpData.title.trim().length === 0` while toggle is on)
- `<select>` for type, options: `agent_task`, `implement`, `spec_review`, `spec_draft`, `doc_refactor`, `verify`, `reverify`

On submit, `reject.mutate` gains:
```ts
...(followUpData !== undefined && followUpData.title.trim().length > 0
  ? { followUp: { type: followUpData.type, title: followUpData.title.trim() } }
  : {})
```

The response's `followUpTask` is not displayed in the inspector directly — the mutation's success path invalidates `["tasks"]`, which refreshes the task list. The follow-up task appears in the list on the next render. No separate success banner for `followUpTask` in v1 (operator sees the new row appear; a future enhancement can add a "Follow-up task created: <id>" inline note).

### `latestStatusReason` comment (item 1)

At the usage site in `TaskInspector.tsx` (lines 214–220), add/strengthen the existing comment:

```tsx
{/* Status reason — intentionally shows the 80-char truncated form from
    status_change.reason (per 03-hitl-gate D4/reasons.rejected). The full
    untruncated rejection rationale is in the kind="error" detail event,
    which renders in the LogStream panel's ErrorRow. Do NOT switch this to
    read the detail event stack — the truncated form is the row-level summary;
    the full text belongs in the log stream view. */}
```

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | `DispatchableTaskType` is defined inline in `TaskInspector.tsx`, not exported to `@/lib/types` | It's a UI-layer filter on `TaskType` (excludes `noop`, `human_review`, `operator_session` from the follow-up type select). Scoped to the Reject flow — not a shared data contract. Promoting it would widen the surface for no downstream benefit. |
| D2 | Follow-up `title` and `type` are the only fields exposed in the toggle; no `reviewPayload`, `resourceClaims`, `agent`, or `priority` fields | Matches the spirit of the server's default-fill behavior (03-hitl-gate D9 / D13): `source`, `dependsOn`, `resourceClaims` all default correctly server-side. Exposing the full `TaskInput` surface in the UI would require a form builder; the common case (re-queue with a title) needs only title + type. Operator wanting full control uses `POST /api/tasks` directly. |
| D3 | The mutation response's `followUpTask` is not surfaced as an inline banner in the inspector | The task list refreshes via `["tasks"]` invalidation — the follow-up appears as a new row. An inline banner would require the inspector to track a transient "just-created" state across renders; not worth the complexity at v1 single-operator scale. |
| D4 | `useRejectTask` return type widens from `{ task: Task }` to `{ task: Task; followUpTask?: Task }` even when no follow-up is requested | Server always returns this shape (no follow-up → `followUpTask` absent). The hook's `postReject` function returns the parsed body directly; widening the type is honest and requires no conditional logic. |
| D5 | Confirm button is disabled when the follow-up toggle is on AND `followUpData.title.trim().length === 0` | The follow-up `title` field is required by `TaskInput` (server validates); submitting with an empty title produces a 400. Disabling is cheaper UX than an error recovery loop. Symmetric with the existing `reason.trim().length === 0` gate. |

---

## Open Issues

*(none — both items are contained and self-describing)*

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

Per-item acceptance checks (operator walks both after E2E suite passes):

**Item 1 — Rejection-rationale display**

| Check | Method |
|-------|--------|
| 1a | `pnpm -C app test` green; new test "Status reason row shows truncated 80-char form, not full rationale" passes. | headless |
| 1b | In `TaskInspector.tsx`, the `latestStatusReason` usage site carries the strengthened comment explaining the intentional 80-char truncation. | code review |
| 1c | `docs/05-task-runner/03-hitl-gate.md` Open Issues bullet struck through with pointer to this round. | doc review |
| 1d | Boot dev stack; inject `human_review` task; reject with a rationale longer than 80 characters. Inspector "Status reason" row shows the first ~90 chars (`"rejected: " + up to 80 chars = up to 90 chars total`, per `03-hitl-gate` `reasons.rejected`: `"rejected: " + rationale.slice(0, 80)`). LogStream panel renders the `ErrorRow` with the full untruncated rationale in the `stack` field. | operator gate |

**Item 2 — Follow-up task injection**

| Check | Method |
|-------|--------|
| 2a | `pnpm -C app test` green; new test "Reject with follow-up toggle: submits followUp in request body" passes; new test "Confirm disabled when follow-up toggle on and title empty" passes. | headless |
| 2b | `pnpm -C app typecheck` green; no `any`, no eslint-disable. | headless |
| 2c | Boot dev stack; open TaskInspector for an AWAITING_HUMAN_REVIEW task; click Reject; verify "Queue follow-up task" toggle is visible and unchecked by default. | operator gate |
| 2d | Check toggle; confirm title input + type select appear; leave title blank; confirm "Confirm reject" button is disabled. | operator gate |
| 2e | Fill in title "re-implement this"; select type `implement`; click "Confirm reject". Response 200. Rejected task transitions FAILED. A new `implement` task titled "re-implement this" appears in the task list. | operator gate |
| 2f | Reject WITHOUT checking the follow-up toggle; confirm no `followUp` field in the request body (browser DevTools Network); server returns `{ task }` with no `followUpTask` key. | operator gate |
| 2g | `docs/05-task-runner/05-ui-hook-migration.md` Open Issues bullet struck through with pointer to this round. | doc review |

**E2E suite:** `pnpm -C e2e test` — no new E2E tests required for this round. The Reject flow's HITL interaction requires a real `AWAITING_HUMAN_REVIEW` task and is currently covered only by operator gate in the existing E2E suite (`test.skip` with reason "requires live AWAITING_HUMAN_REVIEW task"). No regression to existing passing tests is expected (UI-only changes, backward-compatible hook extension).

---

## Children

None.
