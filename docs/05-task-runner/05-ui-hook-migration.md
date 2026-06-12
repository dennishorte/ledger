# UI Hook Migration + Inspector UX for Runner Tasks

**Node ID:** `05-task-runner/05-ui-hook-migration`
**Parent:** `05-task-runner` (`docs/05-task-runner/00-task-runner.md`)
**Status:** COMPLETE (v1, 2026-05-28)
**Created:** 2026-05-28
**Last Updated:** 2026-05-28 (VERIFY → COMPLETE — operator re-verification of stage-8b Fix A green; flicker resolved; all Acceptance items pass)

**Dependencies:** `05-task-runner/03-hitl-gate` (approve/reject endpoints + `dbRowVersion` OCC contract), `05-task-runner/04-api-endpoints` (GET /api/tasks, /:id, /:id/stream, POST /api/tasks)

---

## Requirements

Close the `05-task-runner` parent. The runner's HTTP surface is live (read + injection + HITL approve/reject + SSE); the UI still consults only the transcript bootstrap and renders no Approve/Reject affordances. This child flips the three task-shaped hooks (`useTaskList`, `useTask`, `useLogStream`) to consume both data sources additively, and adds the inspector UX that the runner's HITL gate + BLOCKED-reason payload have been waiting for.

Three deliverables, **all UI-only** (no server changes):

1. **Additive dual-source hooks.** `useTaskList` fetches `/api/tasks` AND `/api/transcripts` in parallel and merges; `useTask(id)` picks the endpoint by ID format (`id.includes(":")` → transcript, else → runner; D2); `useLogStream(id)` picks the SSE URL the same way. Either source 404'ing or erroring degrades to the other (matches the existing transcript graceful-degradation contract). Source disambiguation downstream uses `transcriptPath` presence — transcript-derived tasks have it set, runner-emitted tasks don't (parent §Type coordination).
2. **Approve / Reject affordances in `TaskInspector`.** When the selected task is `runner-emitted ∧ status === "AWAITING_HUMAN_REVIEW"`, render two buttons. Approve fires `POST /api/tasks/:id/approve` with `{ dbRowVersion }` and an optional `note`; Reject opens an inline rationale textarea (required, non-empty) and fires `POST /api/tasks/:id/reject` with `{ dbRowVersion, reason }`. Both go through dedicated `useApproveTask` / `useRejectTask` mutation hooks (TanStack Query `useMutation`); on success they invalidate `["tasks"]` + `["task", id]` so the row + inspector reflect the new state within one render. 409 `version_conflict` or `wrong_status` surfaces an inline error banner; the operator hits a refresh-and-retry flow. Follow-up injection is **deferred** (operator can `POST /api/tasks` directly if they want one — see Out of scope D9 cite).
3. **BLOCKED-reason surfacing in `TaskInspector`.** The inspector consumes `useTask(id)` to obtain the event log (already returned by both `/api/tasks/:id` and `/api/transcripts/:id`), scans for the latest `kind === "status_change"` event, and renders its `reason` field as a "Status reason" row when non-empty. This closes the parent's struck-through Open Issue "UI affordance for `BLOCKED` reason inspection" — the surfacing is universal (works for `blocked_by_dep:<id>`, `blocked_by_claim_conflict:<id>`, `blocked_no_executor`, `orphaned_on_restart`, `approved`, `rejected:<truncated>`, …) rather than `BLOCKED`-only, because a single inspector field is the right grain for all the reasons the runner emits (parent §Status reasons).

After this child merges:

- The `/tasks` panel lists both runner-emitted and transcript-derived rows, indistinguishable to the operator except by the absence/presence of the (server-internal) `transcriptPath`.
- An operator can inject a `human_review` task via `curl -X POST /api/tasks`, click the row, see Approve/Reject buttons in the inspector, and complete the HITL loop end-to-end without leaving the UI.
- A task BLOCKED on a dep / claim conflict / missing executor shows the reason inline in the inspector instead of leaving the operator to grep the event log.
- The transcript bootstrap continues to work unchanged for the agent-session view (parent D10: full retirement is `06-agent-dispatcher`'s deliverable).

In scope for v1:

1. **`app/src/lib/useTaskList.ts`** — rewritten to query both `/api/tasks` and `/api/transcripts` via `Promise.allSettled` inside a single `queryFn`, merge through the deterministic helper below, sort by `createdAt DESC` (`localeCompare` on the ISO 8601 string). When both endpoints 404 the result is `[]`; when one 404s (the production-build no-middleware case for transcripts, OR the server-not-yet-running case for runner) the result is the other source's list. Errors other than 404 propagate (`isError` on the query); the consumer (`TaskConsolePanel`) already handles the error branch.
   ```ts
   function mergeTasks(runnerTasks: Task[], transcriptTasks: Task[]): Task[] {
     const byId = new Map<TaskId, Task>();
     for (const t of transcriptTasks) byId.set(t.id, t);
     for (const t of runnerTasks)    byId.set(t.id, t);
     return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
   }
   ```
   Runner tasks take precedence on ID collision — structurally impossible under the current ID schemes (transcript IDs always `session:<uuid>` or `agent:<id>`; runner IDs bare UUIDv4 with no colon) but the precedence rule is explicit so a future ID-format change doesn't silently break source ordering. Helper lives inline in `useTaskList.ts` (D8); exported only for the test file.
2. **`app/src/lib/useTask.ts`** — refactored to pick the endpoint by ID format. Single `queryFn` per call:
   - `id.includes(":")` → fetch `/api/transcripts/:id`, return shape `{ task, events }` or `null` on 404.
   - else → fetch `/api/tasks/:id`, same shape.
   No fallback when the chosen endpoint returns 404 — the ID-format heuristic is deterministic, and a 404 from the right endpoint means the task genuinely doesn't exist (D2). Both endpoints already return `{ task: Task, events: LogEvent[] }`; no shape adaptation needed. The `TaskDetail` export and `useTask(id)` signature stay byte-identical to the current consumers (`useLogStream`, `LogStreamPanel`).
3. **`app/src/lib/useLogStream.ts`** — the SSE URL is picked by the same `id.includes(":")` discriminant. `transcripts/:id/stream` for transcript IDs; `tasks/:id/stream` for runner IDs. Every other piece of the hook (seq tracking, `Last-Event-ID` resume via the browser's EventSource, reconnect-visible pill timing, `close` event handling) is unchanged. The hook stays consumer-agnostic — `LogStreamPanel` doesn't change.
4. **`app/src/lib/useApproveTask.ts`** (new) and **`app/src/lib/useRejectTask.ts`** (new) — TanStack `useMutation` hooks:
   - **`useApproveTask()`**
     ```ts
     interface ApproveVariables {
       taskId: TaskId;
       dbRowVersion: number;
       note?: string;
     }
     interface ApproveResponse {
       task: Task;
     }
     ```
     On success: `queryClient.invalidateQueries({ queryKey: ["tasks"] })` and `queryClient.invalidateQueries({ queryKey: ["task", taskId] })`. Error path surfaces the response body to the caller via `mutation.error` (typed as `{ status: number; body: unknown }`; the inspector renders `version_conflict` and `wrong_status` differently from generic failures — see D5).
   - **`useRejectTask()`** — analogous shape with `reason: string` (required, non-empty) and no `followUp` field (D9: deferred). Same invalidation pattern.
   - Both hooks live in `app/src/lib/` (sibling to `useTask.ts`) so consumers import from `@/lib/...` uniformly.
5. **`app/src/components/tasks/TaskInspector.tsx`** — modified:
   - Calls `useTask(task.id)` internally to obtain the live `{ task, events }`. The prop `task: Task` becomes the fallback for the closed-over snapshot; the inspector renders from the freshest `useTask` result when available (so a successful Approve mutation's invalidation refreshes the inspector without remount). When `useTask` is still pending the prop's value is used; when `useTask` resolves to `null` (id 404'd between row click and inspector open) the inspector shows a "task no longer found" message.
   - **BLOCKED-reason / status-reason row** added between "Resource claims" and "Timing": scans the events list for the latest `kind: "status_change"` entry, renders `event.reason` as a single line under the label `Status reason` when non-empty. Hidden when no status_change has a reason (e.g., a happy-path task that went `PENDING → RUNNING → COMPLETE` with no `reason` ever set). For approvals-with-note the 80-char truncated form (`approved: <note>`) is what shows here; for rejections the truncated 80-char rationale (`rejected: <…>`) shows here — both truncations are emitted by `03-hitl-gate`'s `reasons.approvedWithNote` / `reasons.rejected` builders (Spec Review S2). The full untruncated rejection rationale lives in the `kind: "error"` detail event and renders in the LogStream panel via existing `ErrorRow`. (See `03-hitl-gate` D4 for the dual-storage rationale; this inspector intentionally surfaces the truncated form because it's the row-level summary.)
   - **Approve / Reject buttons** rendered conditionally:
     - Condition: `task.transcriptPath === undefined && liveTask?.status === "AWAITING_HUMAN_REVIEW"`. The `liveTask` reference comes from `useTask`'s data — important because the prop snapshot may be stale (e.g., the row showed AWAITING two seconds ago; the operator's other tab just approved). `transcriptPath === undefined` is the runner-emitted discriminant (parent §Type coordination).
     - Layout: a two-button row above the "Open log stream" link. Approve is the primary action (cream accent background, same style as the existing "Open log stream" link); Reject is secondary (outline-only). Both occupy the same row when collapsed; clicking Reject expands an inline textarea + "Confirm reject" / "Cancel" pair (the textarea is `min-h-20`, `max-h-40`, autosizing). No keyboard shortcuts in v1 (D10).
     - Both mutations send `dbRowVersion: liveTask.dbRowVersion` — read from the freshest `useTask` snapshot, never from the closed-over prop (defensive against the two-tab race). Because `showHitlButtons` requires `liveTask?.status === "AWAITING_HUMAN_REVIEW"`, the buttons are only rendered when `live` has resolved — so the `task` reference passed to `HitlActions` IS the live task, not the prop fallback (Spec Review S3 — invariant pinned in the pseudocode comment below).
     - On 409 (`version_conflict` or `wrong_status`): inline error banner above the buttons; the banner text differentiates the two cases ("This task was updated elsewhere — please refresh." vs "Task is no longer awaiting review."). On non-409 errors: generic "Approve/reject failed — see browser console" with the response body logged. (D5.)
   - Plumbed dependency: the inspector now needs a `QueryClient` for the invalidation calls in the mutations. Already present at the root via `01-ui/01-shell`'s `<QueryClientProvider>`.
6. **`app/src/lib/useTaskList.ts` + `useTask.ts` + `useLogStream.ts` types** — no public type changes. `Task`, `LogEvent`, `TaskDetail`, `UseLogStreamResult` keep their current shapes. The dual-source migration is encapsulated in the hooks' implementations.
7. **Tests** (vitest, jsdom for component tests, node for pure helpers):
   - `app/src/lib/useTaskList.test.ts` — pure unit tests for `mergeTasks`:
     - Empty + empty → empty.
     - Runner-only → returns runner tasks sorted by `createdAt DESC`.
     - Transcript-only → returns transcript tasks sorted.
     - Mixed → both present, sorted, no duplicates.
     - Synthetic ID collision (constructed test fixture) → runner-precedence rule honored.
   - `app/src/lib/useTaskList.fetch.test.ts` — mocked-`fetch` integration:
     - Both 200 → merged list.
     - Runner 200 + transcript 404 → just runner.
     - Runner 404 + transcript 200 → just transcript.
     - Both 404 → `[]`.
     - Runner 500 → query is `isError`; consumer sees no data (matches D7 — non-404 errors propagate).
   - `app/src/lib/useTask.test.ts` — mocked-`fetch`:
     - `id` with `:` → fetches `/api/transcripts/:id`, returns `{task, events}`.
     - `id` without `:` → fetches `/api/tasks/:id`.
     - 404 on the chosen endpoint → returns `null` (no fallback).
     - 5xx on the chosen endpoint → query enters `isError` and the inspector shows its existing error branch rather than "task no longer found" (Spec Review B1 + S5).
     - Verifies no cross-endpoint requests (`fetch` called exactly once per resolve).
   - `app/src/lib/useApproveTask.test.ts` / `useRejectTask.test.ts`:
     - 200 → returns `{task}`; invalidates both `["tasks"]` and `["task", id]` query keys.
     - 409 `version_conflict` → mutation `error` carries `{status: 409, body: {error: "version_conflict", expected, actual}}`.
     - 409 `wrong_status` → same shape, different body.
     - 400 on empty `reason` (reject) — UI prevents this case (D11: button disabled until non-empty), so a unit test would have to bypass the UI. Spec test asserts the server's 400 path is handled gracefully by the mutation, but the UI test verifies the button-disabled invariant.
   - `app/src/components/tasks/TaskInspector.test.tsx`:
     - Runner-emitted ∧ AWAITING_HUMAN_REVIEW → both buttons visible.
     - Runner-emitted ∧ COMPLETE → no buttons.
     - Transcript-derived ∧ AWAITING_HUMAN_REVIEW (synthetic — Phase-1 transcript derivation does produce AWAITING in some cases per `04-tasks` D10) → no buttons. The discriminant is `transcriptPath !== undefined`, not `status`.
     - Approve flow: click Approve → fetch called with `{dbRowVersion, note: undefined}` → success → toast/banner cleared → invalidations triggered (verified via `queryClient.getQueryState` or a spy on the QueryClient).
     - Reject flow: click Reject → textarea appears → Confirm disabled until non-empty → on submit, fetch called with `{dbRowVersion, reason: "<text>"}`.
     - 409 path: error banner appears with the correct copy.
     - BLOCKED reason row visible when latest `status_change` has a `reason`; hidden when not.
   - **EventSource testing is NOT in scope** — `useLogStream` is not unit-tested today, and adding `EventSource`-mocking infra is disproportionate. Operator stage-8 covers the SSE switch via live curl + browser observation. (D6.)

**Out of scope for this child:**

- **Any server change.** All endpoints already exist (parent §Endpoints). This child is UI-only. A server bug discovered during operator stage 8 is filed as an Open Issue and addressed in `03-hitl-gate` or `04-api-endpoints`'s ISSUE_OPEN loop, not here.
- **Follow-up task injection in the Reject flow.** The `03-hitl-gate` reject endpoint supports an optional `followUp: TaskInput`; the UI does not surface it in v1. An operator who wants to enqueue a follow-up after rejecting calls `POST /api/tasks` directly (or waits for a future enhancement). Logged as a MEDIUM Open Issue with a UX sketch.
- **Optimistic UI updates.** Approve/Reject mutations do NOT `setQueryData` to anticipate the response. The success path invalidates + refetches. The 50–200ms refetch latency is acceptable at v1 single-operator scale; optimistic UX is logged as TRIVIAL.
- **Approve-without-confirmation.** Approve fires on click (no confirmation modal). Reject requires a non-empty rationale and a separate Confirm click (rationale itself is the confirmation gate). Pattern matches `03-hitl-gate`'s schema requiring `reason: non-empty string`.
- **Keyboard shortcuts** for Approve / Reject. Useful future polish; not v1.
- **Retiring the transcript bootstrap.** Parent §Out of scope, `06-agent-dispatcher`'s deliverable.
- **A separate "runner-emitted" badge on table rows.** The inspector is the discriminator surface; rows look identical. Adding a visual mark requires a column or a chip, both of which crowd the existing `04-tasks` layout. Deferred to a future polish pass.
- **`useTaskList` with filters.** Parent's `04-api-endpoints` accepts `?status=`, `?type=`, `?parent=` filters; the UI's `useTaskFilters` is client-side. v1 keeps the client-side filter because it operates over the merged list (server-side `status=` would only filter runner tasks, not transcript). Logged TRIVIAL.
- **SSE auto-close + retry on a runner stream.** The transcript stream's reconnect logic ports unchanged to the runner stream (same `Last-Event-ID` contract — parent §SSE contract). No new behavior.
- **Multi-tab approve coordination beyond OCC 409.** Two-tab race surfaces as 409 — operator gets a refresh-and-retry banner. No real-time tab-tab sync.
- **Rendering the `note` (approve) or full rationale (reject) in the row.** Both surface in the inspector + log stream; the row stays compact.
- **A new `TaskRow` "reason" column.** The reason lives in the inspector; row-level inspection adds visual noise (the column is empty for the common case). Open Issue closure language is "reason inspection," which the inspector satisfies.
- **Authorization on the mutations.** Inherits parent D13 + `04-api-server` D4 — `127.0.0.1`-bind, no tokens.
- **Type changes in `@ledger/parser` / `app/src/lib/types.ts`.** The contracts shipped by `01-store-schema` are sufficient; no new types here.

---

## Design

### Repository layout after this child

```
ledger/
├── docs/
│   └── 05-task-runner/
│       └── 05-ui-hook-migration.md                # this spec
└── app/
    └── src/
        ├── lib/
        │   ├── useTaskList.ts                     # MODIFIED — dual-source + mergeTasks
        │   ├── useTask.ts                         # MODIFIED — endpoint selection by id format
        │   ├── useLogStream.ts                    # MODIFIED — SSE URL selection by id format
        │   ├── useApproveTask.ts                  # NEW — useMutation wrapper
        │   ├── useRejectTask.ts                   # NEW — useMutation wrapper
        │   ├── useTaskList.test.ts                # NEW — mergeTasks unit tests
        │   ├── useTaskList.fetch.test.ts          # NEW — mocked-fetch integration
        │   ├── useTask.test.ts                    # NEW — endpoint selection tests
        │   ├── useApproveTask.test.ts             # NEW — mutation tests
        │   └── useRejectTask.test.ts              # NEW — mutation tests
        └── components/
            └── tasks/
                ├── TaskInspector.tsx              # MODIFIED — buttons + status-reason row
                └── TaskInspector.test.tsx        # NEW — gating + flow tests
```

No changes outside `app/src/lib/` and `app/src/components/tasks/`. No new types added to `@/lib/types`. No server changes. No new dependencies.

### `useTaskList` rewrite

```ts
// app/src/lib/useTaskList.ts
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { Task, TaskId } from "./types.js";

async function fetchOne(url: string): Promise<Task[]> {
  const res = await fetch(url);
  // 404 = "source not available" — degrade silently (D7). The 404 is
  // consumed here as fulfilled([]) so Promise.allSettled below sees
  // `fulfilled`, not `rejected`. Non-404 errors throw and surface as
  // `rejected` in the caller's allSettled result.
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`${url}: ${String(res.status)}`);
  const data = (await res.json()) as { tasks: Task[] };
  return data.tasks;
}

export function mergeTasks(runnerTasks: Task[], transcriptTasks: Task[]): Task[] {
  const byId = new Map<TaskId, Task>();
  for (const t of transcriptTasks) byId.set(t.id, t);
  for (const t of runnerTasks)    byId.set(t.id, t);
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function fetchTaskList(): Promise<Task[]> {
  const [runnerR, transcriptR] = await Promise.allSettled([
    fetchOne("/api/tasks"),
    fetchOne("/api/transcripts"),
  ]);
  const runner      = runnerR.status      === "fulfilled" ? runnerR.value      : [];
  const transcript  = transcriptR.status  === "fulfilled" ? transcriptR.value  : [];
  // If BOTH rejected (not 404 — actual errors), surface as a query error so
  // TaskConsolePanel's isError branch fires. (D7: non-404 errors propagate.)
  if (runnerR.status === "rejected" && transcriptR.status === "rejected") {
    throw new Error(
      `both task sources failed: runner=${String(runnerR.reason)}, ` +
      `transcript=${String(transcriptR.reason)}`,
    );
  }
  return mergeTasks(runner, transcript);
}

export function useTaskList(): UseQueryResult<Task[]> {
  return useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: fetchTaskList,
    staleTime: 5_000,
    retry: false,
  });
}
```

Key invariants:

- **404 ≠ error.** A 404 on either endpoint is a "this data source is not available" signal, not a failure. The query stays in `success` state and the consumer sees a (possibly empty) list. Matches the existing transcript-only contract (the hook today returns `[]` on 404).
- **Both-rejected → error.** If both endpoints throw (network failure, 500, etc.), the query enters `isError` and `TaskConsolePanel` renders its existing error branch.
- **5 s staleTime** preserved from today's behavior. After Approve/Reject mutations explicitly invalidate, the refetch fires immediately regardless.

### `useTask` rewrite

```ts
// app/src/lib/useTask.ts
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import type { LogEvent, Task, TaskId } from "./types.js";

export interface TaskDetail {
  task: Task;
  events: LogEvent[];
}

function pickEndpoint(id: TaskId): string {
  // Transcript IDs are namespaced (`session:<uuid>` or `agent:<id>`); runner
  // IDs are bare UUIDv4. The colon discriminant is sufficient — D2. If a
  // future ID-format change breaks this assumption, mergeTasks's
  // runner-precedence rule still preserves correctness on the list side;
  // useTask would need a fallback path then.
  return id.includes(":")
    ? `/api/transcripts/${encodeURIComponent(id)}`
    : `/api/tasks/${encodeURIComponent(id)}`;
}

async function fetchTask(id: TaskId): Promise<TaskDetail | null> {
  const res = await fetch(pickEndpoint(id));
  // Mirror useTaskList's 404-vs-5xx split (Spec Review B1): 404 → null
  // (task genuinely doesn't exist); other non-ok → throw so the query
  // enters `isError` instead of silently rendering "task no longer found"
  // during a server outage.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${pickEndpoint(id)}: ${String(res.status)}`);
  return res.json() as Promise<TaskDetail>;
}

export function useTask(id: TaskId): UseQueryResult<TaskDetail | null> {
  return useQuery<TaskDetail | null>({
    queryKey: ["task", id],
    queryFn: () => fetchTask(id),
    staleTime: 5_000,
    retry: false,
  });
}
```

Signature unchanged. Internal endpoint selection only.

### `useLogStream` rewrite

```ts
// app/src/lib/useLogStream.ts (excerpt of changes)

// ... existing imports and constants unchanged ...

function pickStreamUrl(id: TaskId): string {
  return id.includes(":")
    ? `/api/transcripts/${encodeURIComponent(id)}/stream`
    : `/api/tasks/${encodeURIComponent(id)}/stream`;
}

// In the open-SSE useEffect, replace:
//   const url = `/api/transcripts/${encodeURIComponent(taskId)}/stream`;
// with:
//   const url = pickStreamUrl(taskId);
// Everything else (es.onmessage, es.onerror, close handling, lastSeqRef,
// reconnect-visible timer) stays byte-identical. The runner's SSE contract
// is parent §SSE contract — same headers, same `id:` + `data:` framing, same
// auto-close behavior — so the consumer code needs no semantic change.
```

The `useLogStream` change is a one-line URL selection. The hook's contract (`UseLogStreamResult`, the `status` / `reconnectVisible` semantics) is unchanged. The `useEffect` dep array `[taskId, queryStatus, taskQuery.data]` is unchanged — the runner-stream SSE opens/closes on the same transitions as the transcript stream (Spec Review N2).

### `useApproveTask` + `useRejectTask`

```ts
// app/src/lib/useApproveTask.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Task, TaskId } from "./types.js";

export interface ApproveVariables {
  taskId: TaskId;
  dbRowVersion: number;
  note?: string;
}

export interface MutationErrorBody {
  status: number;
  body: unknown;
}

async function postApprove({
  taskId,
  dbRowVersion,
  note,
}: ApproveVariables): Promise<{ task: Task }> {
  const res = await fetch(
    `/api/tasks/${encodeURIComponent(taskId)}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        note !== undefined && note.length > 0
          ? { dbRowVersion, note }
          : { dbRowVersion },
      ),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    const err: MutationErrorBody = { status: res.status, body };
    throw err;
  }
  return res.json() as Promise<{ task: Task }>;
}

export function useApproveTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postApprove,
    onSuccess: (_data, { taskId }) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
  });
}
```

```ts
// app/src/lib/useRejectTask.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Task, TaskId } from "./types.js";
import type { MutationErrorBody } from "./useApproveTask.js";

export interface RejectVariables {
  taskId: TaskId;
  dbRowVersion: number;
  reason: string; // required, non-empty (UI enforces; server 400s on empty)
}

async function postReject({
  taskId,
  dbRowVersion,
  reason,
}: RejectVariables): Promise<{ task: Task }> {
  const res = await fetch(
    `/api/tasks/${encodeURIComponent(taskId)}/reject`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dbRowVersion, reason }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    const err: MutationErrorBody = { status: res.status, body };
    throw err;
  }
  return res.json() as Promise<{ task: Task }>;
}

export function useRejectTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postReject,
    onSuccess: (_data, { taskId }) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
  });
}
```

Both hooks throw a structured `MutationErrorBody` so the inspector can branch on `status === 409` and the body's `error` discriminant. `MutationErrorBody` is re-exported from `useApproveTask.ts` because both mutations share it; not promoted to `@/lib/types` (it's a hook-local concern; D5).

The hooks deliberately ship NO retry logic. v1 single-operator: any 409 needs operator visibility, not a silent retry. (Retry on 5xx is conceivable; logged TRIVIAL.)

### `TaskInspector` modifications

```tsx
// app/src/components/tasks/TaskInspector.tsx (excerpt of changes)

export function TaskInspector({
  task: taskProp,
  allTasks,
}: TaskInspectorProps): JSX.Element {
  // Live task + events from the GET /:id endpoint (runner OR transcript,
  // by id-format discrimination — see useTask). The prop is the fallback
  // until the query resolves.
  const taskQuery = useTask(taskProp.id);
  const live = taskQuery.data;
  const task = live?.task ?? taskProp;
  const events = live?.events ?? [];

  // Latest status_change event's `reason` field, if any. Parent §Status
  // reasons enumerates the canonical values (blocked_by_dep:<id>, …).
  const latestStatusReason = useMemo<string | undefined>(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (ev !== undefined && ev.kind === "status_change" && ev.reason !== undefined) {
        return ev.reason;
      }
    }
    return undefined;
  }, [events]);

  // Approve/Reject gating: runner-emitted ∧ AWAITING_HUMAN_REVIEW.
  // `transcriptPath === undefined` is the discriminant per parent §Type
  // coordination. Use the *live* task so a successful mutation's
  // invalidation removes the buttons on next render without a manual close.
  // Spec Review S3: gating on `live?.status` (not `taskProp.status`) ensures
  // the buttons only render when the query has resolved — so the `task`
  // reference inside <HitlActions> is always the live task with a fresh
  // dbRowVersion, never the closed-over prop. Invariant pinned here.
  const isRunnerEmitted = task.transcriptPath === undefined;
  const showHitlButtons =
    isRunnerEmitted && live?.task.status === "AWAITING_HUMAN_REVIEW";

  // ... existing render path (Header / Type / Source / Agent / Parent task /
  //     Depends on / Resource claims) unchanged ...

  return (
    <div className="flex flex-col gap-4">
      {/* ... existing fields ... */}

      {/* Status reason (NEW) — between Resource claims and Timing */}
      {latestStatusReason !== undefined && (
        <Field label="Status reason">
          <span className="text-xs text-[color:var(--color-fg)] break-all">
            {latestStatusReason}
          </span>
        </Field>
      )}

      {/* Timing — unchanged */}
      {/* ... */}

      {/* HITL buttons (NEW) — above the Open log stream link */}
      {showHitlButtons && (
        <HitlActions task={task} />
      )}

      {/* Open log stream — unchanged */}
      {/* ... */}
    </div>
  );
}
```

`HitlActions` is a sibling component in the same file (single inspector concern; no separate file). The sketch below uses `cn(...)` for class merging — at implementation time check the existing utility (`app/src/lib/cn.ts` per the file tree); a sibling component (`TaskTypeBadge`, `LogEventRow`) already imports it. Spec Review N4. Sketch:

```tsx
function HitlActions({ task }: { task: Task }): JSX.Element {
  const approve = useApproveTask();
  const reject = useRejectTask();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  // The most recent error from either mutation, for the 409 banner.
  const lastError = reject.error ?? approve.error;
  const banner = errorBanner(lastError);  // returns null | { tone, text }

  return (
    <div className="flex flex-col gap-2">
      {banner && (
        <div
          className={cn(
            "rounded border px-2 py-1 text-xs",
            banner.tone === "conflict"
              ? "border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)]"
              : "border-[color:var(--color-danger)] bg-[color:var(--color-danger-soft)]",
          )}
        >
          {banner.text}
        </div>
      )}

      {!rejectOpen ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={approve.isPending}
            onClick={() =>
              approve.mutate({
                taskId: task.id,
                dbRowVersion: task.dbRowVersion,
                ...(note.length > 0 ? { note } : {}),
              })
            }
            className="inline-flex items-center rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-accent-fg)] hover:opacity-90 disabled:opacity-50"
          >
            {approve.isPending ? "Approving…" : "Approve"}
          </button>
          <button
            type="button"
            disabled={reject.isPending}
            onClick={() => setRejectOpen(true)}
            className="inline-flex items-center rounded-md border border-[color:var(--color-border-strong)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-fg)] hover:bg-[color:var(--color-surface-sunken)] disabled:opacity-50"
          >
            Reject…
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Rejection rationale (required)"
            className="min-h-20 max-h-40 resize-y rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-xs text-[color:var(--color-fg)]"
            aria-label="Rejection rationale"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={reason.trim().length === 0 || reject.isPending}
              onClick={() =>
                reject.mutate({
                  taskId: task.id,
                  dbRowVersion: task.dbRowVersion,
                  reason: reason.trim(),
                })
              }
              className="inline-flex items-center rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-danger-soft)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-fg)] hover:opacity-90 disabled:opacity-50"
            >
              {reject.isPending ? "Rejecting…" : "Confirm reject"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejectOpen(false);
                setReason("");
              }}
              className="inline-flex items-center rounded-md border border-[color:var(--color-border-strong)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-fg)] hover:bg-[color:var(--color-surface-sunken)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Optional Approve "note" — collapsed by default, shown as a small
          link "Add note" that reveals an inline single-line input. v1 keeps
          the note discoverable but not in the way. (D11.) */}
      {!rejectOpen && (
        <NoteAffordance note={note} setNote={setNote} />
      )}
    </div>
  );
}

function errorBanner(err: unknown):
  | { tone: "conflict" | "generic"; text: string }
  | null {
  if (err === null || err === undefined) return null;
  const e = err as { status?: number; body?: { error?: string } };
  if (e.status === 409) {
    if (e.body?.error === "version_conflict") {
      return { tone: "conflict", text: "This task was updated elsewhere — please refresh." };
    }
    if (e.body?.error === "wrong_status") {
      return { tone: "conflict", text: "Task is no longer awaiting review." };
    }
  }
  return { tone: "generic", text: "Action failed — see browser console." };
}
```

`NoteAffordance` is a tiny inline component (link → input) — sketched but not pinned at the markup level; the implementer is free to substitute a tooltip-style affordance if it reads cleaner. (D11.)

### Acceptance check (end-to-end, manual)

After this child merges, a reviewer running the worktree must observe:

1. `pnpm install` unchanged.
2. `pnpm -C app typecheck`, `lint`, `build`, `test` exit zero. App test count delta ≈ +28 (5 `mergeTasks` unit + 5 `useTaskList` fetch integration + 5 `useTask` (incl. 5xx → isError per S5) + 6 approve/reject mutation + 7 inspector; pinned in §Tests above — Spec Review N3 + N5 reconciled the count).
3. `pnpm -C server test` and `pnpm -C packages/parser test` unchanged.
4. Boot the server (`pnpm -C server dev /Users/dennis/code/ledger`) and the UI (`pnpm -C app dev`) in two terminals.
5. **Dual-source list:** `curl -X POST /api/tasks -d '{"type":"noop","title":"runner smoke"}'` creates a runner task; the `/tasks` panel shows the new row alongside existing transcript-derived rows. The runner row's `task.transcriptPath === undefined`; the transcript rows' is set. Both surface visually identically.
6. **Runner task inspector:** clicking the runner row opens the inspector; the inspector shows the same fields as a transcript row PLUS the "Status reason" row when the task has a non-empty latest `status_change.reason` (e.g., a BLOCKED runner task will show `blocked_by_dep:<id>` or `blocked_no_executor`).
7. **Approve flow:** inject a `human_review` task (`curl -X POST /api/tasks -d '{"type":"human_review","title":"approve me","reviewPayload":{"summary":"x"}}'`); the row appears with status `AWAITING_HUMAN_REVIEW`; clicking opens the inspector with Approve / Reject buttons visible. Clicking Approve transitions the task to `COMPLETE` within ≤1 s (TanStack invalidate); buttons disappear; the LogStream panel for the same task shows the approval `status_change` event live (SSE delivery).
8. **Approve with note:** click "Add note" → enter "lgtm" → Approve. Inspector's Status reason updates to `approved: lgtm` after invalidation. (The `approved: lgtm` string is emitted by the runner's `reasons.approvedWithNote` and truncated at 80 chars per `03-hitl-gate` D4; the inspector renders it verbatim from `event.reason` — Spec Review S4.)
9. **Reject flow:** inject another `human_review` task; click Reject in the inspector; type a rationale; Confirm. Task transitions to `FAILED`; inspector's Status reason shows `rejected: <truncated>`; the LogStream panel shows BOTH the `kind: "error"` detail event (with full rationale in the expandable stack) AND the `status_change` event (with truncated reason).
10. **409 conflict path:** Open two browser tabs on the inspector for the same AWAITING task. Click Approve in tab 1 → success. Click Approve in tab 2 (still showing AWAITING) → the inline error banner appears: "Task is no longer awaiting review." (status was already moved to COMPLETE → `wrong_status`).
11. **409 version conflict (synthetic):** if the operator wants to exercise the `version_conflict` specifically, they can inject a `human_review`, observe `dbRowVersion`, then via curl approve with a stale `dbRowVersion-1`. The UI doesn't easily simulate this since the inspector always reads the live version; the test suite covers it via mocked-`fetch` (D5).
12. **Transcript path regression:** open a transcript-derived agent session at `/tasks` (existing data); the row still opens, the inspector renders identically to today, no Approve/Reject buttons appear (transcript-derived discriminant). The LogStream panel for the transcript row still streams via `/api/transcripts/:id/stream` (no URL change for transcript IDs).
13. **Both endpoints up:** task list contains the union; sorting is `createdAt DESC`. **Runner down:** kill the Hono process; `/tasks` panel still shows transcript rows (the runner fetch 404s/errors but transcript succeeds). **Transcript missing:** in a production build (`pnpm -C app build && pnpm -C app preview`), `/api/transcripts` 404s but `/api/tasks` 200s — `/tasks` panel shows runner rows only.

Items 2–4 + the unit test suite are headlessly verifiable; items 5–13 are operator-stage-8 only.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Dual-source fetch via `Promise.allSettled` inside a single `useQuery`, NOT two separate `useQuery` calls + memo merge in the consumer | One query key (`["tasks"]`) → one staleness window, one invalidate target, one error branch in `TaskConsolePanel`. The Promise.allSettled gives 404/error resilience per source without splitting state. Splitting would force the consumer (and every mutation's invalidate) to know about two query keys. |
| D2 | Endpoint selection by ID-format discriminant (`id.includes(":")`), NOT by attempting one endpoint and falling back on 404 | Transcript IDs are deterministically `session:<uuid>` or `agent:<id>` (verified `app/server/deriveTask.ts:104-107`); runner IDs are bare UUIDv4 (verified `server/src/runner/ids.ts`). The colon test is sufficient and avoids 50% wasted requests for runner-only tasks. If a future ID-format change breaks this, `useTask` would need a fallback — `mergeTasks`'s runner-precedence rule on the list side still works either way. |
| D3 | `useLogStream` reuses the existing seq/reconnect machinery with only the SSE URL swapped | The runner's SSE contract is identical to the transcript's (parent §SSE contract: same `id:` + `data:` framing, same `Last-Event-ID` header semantics, same `event: close` auto-close). The hook is wire-agnostic above the URL. Touching anything else risks regressing the transcript stream. |
| D4 | `TaskInspector` calls `useTask(taskProp.id)` internally — does NOT receive `events` as a prop | The closed-over `task` prop is captured at row-click time and stale by definition (the operator's other tab may have mutated). The live `useTask` fetch (a) refreshes after Approve/Reject invalidations without remount, (b) supplies the events for the Status reason row, (c) supplies the live `dbRowVersion` for OCC. The prop is the fallback during the initial query pending state. Sibling pattern: `NodeInspector` in `02-dag` doesn't refetch because the DAG data is already in shell-store; here the data isn't in any global store. |
| D5 | Mutation errors throw a structured `{ status: number; body: unknown }` (typed `MutationErrorBody`), NOT a generic `Error` | The inspector needs to differentiate `409 version_conflict` vs `409 wrong_status` vs everything else. A typed shape with the response body intact is the cleanest plumbing. Re-export from `useApproveTask.ts` (not promoted to `@/lib/types`) because it's a hook-local concern that doesn't belong in the global types surface. |
| D6 | No EventSource tests for `useLogStream` in this child | The hook's only change is one URL string. Adding `EventSource`-mocking infra (the `@testing-library/react` ecosystem has no out-of-the-box helper) is disproportionate to the change footprint. Operator stage-8 covers the SSE switch via live curl + the LogStream panel in a browser. The transcript stream side is exercised by the existing UI on every dev session. |
| D7 | A 404 on either source is "no data available," not "fetch failed" | Mirrors the existing transcript-only contract (line 14 of today's `useTaskList.ts` returns `[]` on 404). Production-build no-middleware case for transcripts → 404; runner-not-running case → 404. In both cases the UI should degrade to the available source, not error. Non-404 errors (500, network failure) still propagate to `isError`. |
| D8 | `mergeTasks` is exported but lives inline in `useTaskList.ts`, not a separate `lib/mergeTasks.ts` | Only consumer is `useTaskList.ts`. One-function file would add a tax. The export exists solely so the unit test can import it without firing the query. Sibling pattern: `app/src/lib/parseDocs.ts` and `parseIssues.ts` co-locate the parser + types. |
| D9 | Follow-up task injection on Reject is **deferred** (Open Issue, MEDIUM) | The `03-hitl-gate` endpoint accepts `followUp: TaskInput` but exposing the full `TaskInput` shape in a UI form is large (type/title/source/dependsOn/resourceClaims/agent/reviewPayload/priority — most operators want a simpler "describe the redo work" textarea that constructs a sensible default). v1 covers the 80% path (reject with rationale; operator manually injects follow-up later via the existing inject UX if needed). MEDIUM because the parent's HITL gate explicitly mentions it but doesn't require a UI in v1. |
| D10 | No keyboard shortcuts (e.g., `A` to approve, `R` to reject) in v1 | Discoverability requires either a help tooltip or a status-line hint; both add scope. The buttons are clearly labeled and reachable. Future polish item if HITL becomes high-frequency. |
| D11 | Approve `note` is a collapsed affordance (small "Add note" link), not always visible | The common path is "operator clicks Approve without explanation." Always-visible textarea would imply "fill this in" and pad inspector height. The link discoveres the field for the small fraction of cases that want one. Symmetric with `03-hitl-gate`'s schema (optional `note`). Reject's rationale stays mandatory + foregrounded because the schema requires it. |
| D12 | TanStack mutations use **response-based** `setQueryData` for `["task", taskId]` (writing the server's authoritative response into the inspector's cache); list invalidation stays fire-and-forget; **speculative-optimistic** updates with rollback semantics are still avoided | **Amended 2026-05-28 (stage-8b loop-back).** Original D12 said "no `setQueryData`" on the basis that 50–200 ms invalidate-and-refetch latency would be invisible. Operator stage-8 caught a ~500–1000 ms button flicker — Vite proxy + React render scheduling stretches the gap past the perception threshold, and the inspector's `showHitlButtons` gate (`live?.task.status === "AWAITING_HUMAN_REVIEW"`, per S3) re-renders the buttons in enabled state for that window because the gate reads from the stale cache. Response-based `setQueryData` writes the post-transition task from the mutation response into `["task", taskId]` so the gate flips false atomically on the same render the mutation resolves — no flicker. This is NOT speculative-optimistic (the server has already authoritatively confirmed the new state; no rollback path exists or is needed). The original rejection of speculative-optimistic updates (rollback complexity for 409 paths) still stands. |

---

## Open Issues

- ~~**Approve/Reject buttons flicker for ~500–1000 ms after a successful mutation before unmounting.** Found in operator stage-8 (2026-05-28). Sequence: click Approve → button shows "Approving…" (~30–80 ms POST round-trip) → `approve.isPending` flips false → button re-renders in enabled "Approve" state because `live?.task.status` is still stale `AWAITING_HUMAN_REVIEW` (the `useTask` refetch from the fire-and-forget `invalidateQueries` hasn't completed) → refetch lands (~500–1000 ms later through Vite proxy + React scheduling) → `live.task.status` flips to `COMPLETE` → `showHitlButtons` flips false → buttons unmount. The window where the button is enabled-but-stale is the flicker. D12's "50–200 ms invisible at v1 scale" estimate was wrong — Vite proxy + React render scheduling stretches it past the perception threshold. **Fix:** apply Fix A (response-based `setQueryData` in `onSuccess` to write `data.task` into `["task", taskId]` cache immediately, atomically flipping `live?.task.status` on the same render the mutation resolves; list invalidation stays fire-and-forget; D12 amended to distinguish response-based from speculative-optimistic). *(Priority: HIGH — degrades the core HITL UX; resolved in this child's stage-8b loop-back.)*~~ → **RESOLVED** in stage-8b: response-based `setQueryData` applied in both mutation hooks; D12 amended; see Implementation Notes §Stage-8b loop-back.
- ~~**Follow-up task injection on Reject (D9).** `03-hitl-gate` accepts `followUp: TaskInput`; the UI does not expose it. Operator must POST a follow-up separately if they want one. Reasonable UX would be a "Reject and queue follow-up" toggle that reveals a minimal "title + reviewPayload.summary" pair and inherits the rejected task's resourceClaims by default (matching the server's default). *(Priority: MEDIUM — parent §HITL gate mentions but doesn't require.)*~~ → **RESOLVED** in `05-task-runner/99-maintenance/01-hitl-rejection-rationale-ui-display` (2026-06-12): "Queue follow-up task" toggle added to `HitlActions`; `useRejectTask` extended with optional `followUp: TaskInput`; title + type select exposed; Confirm disabled when toggle on and title empty.
- ~~**No optimistic mutation updates.** Invalidate-and-refetch only. Local-only scale makes this invisible. *(Priority: TRIVIAL — D12.)*~~ → Replaced by the HIGH flicker issue above. D12 amended in the stage-8b patch: response-based `setQueryData` is in use for the inspector's `["task", id]` cache; speculative-optimistic is still avoided.
- ~~**No EventSource test coverage for `useLogStream`'s runner-stream variant.** Operator stage-8 covers it. If a future regression slips, it would surface as a broken `/logs/:id` page on a runner-emitted task. *(Priority: LOW — D6.)*~~ *(Closed: 05-task-runner/99-maintenance/02-round-2, 2026-06-12 — FakeEventSource infra + 6 runner-stream test cases added to `useLogStream.test.ts`.)*
- **Server-side `?status=`, `?type=`, `?parent=` filters on `GET /api/tasks` are unused.** Client-side `useTaskFilters` runs over the merged list. Server-side filters can't reduce the transcript half. Could promote filtering to merged-result client side as today, or split into per-source filtering with composition — defer until the runner side dominates row count. *(Priority: TRIVIAL.)*
- **No row-level visual distinction between runner-emitted and transcript-derived tasks.** Inspector is the discriminator. A future polish pass could add a subtle chip or column when both sources are routinely live. *(Priority: TRIVIAL.)*
- **`MutationErrorBody` type is hook-local.** If a third mutation hook arrives, this should promote to a shared `@/lib/mutationError.ts` or into `@/lib/types`. Today's two-hook surface doesn't warrant it. *(Priority: TRIVIAL — D5.)*
- **Multi-tab approve coordination beyond OCC.** 409 banner is the only UX cue. Real-time tab-tab sync (e.g., via BroadcastChannel) would smooth the experience. Out of scope. *(Priority: TRIVIAL.)*
- **No retry on transient 5xx for the mutations.** A momentarily-down server returns 502; UI shows generic error. Operator clicks again. Acceptable for local-only. *(Priority: TRIVIAL.)*
- ~~**`useTask`'s endpoint discriminant depends on ID-format invariants.** If a future ID-format change introduces colons into runner IDs (or removes them from transcript IDs), the heuristic breaks silently. D2 documents the assumption; a future regression would surface as 404s on the affected tasks. *(Priority: LOW — depends on future architectural drift.)*~~ *(Closed: 05-task-runner/99-maintenance/02-round-2, 2026-06-12 — `isRunnerTaskId` helper extracted to `app/src/lib/types.ts`; all `id.includes(":")` call sites in `useTask.ts` and `useLogStream.ts` replaced with the named predicate.)*

---

## Spec Review (2026-05-28)

Independent spec review run against the DRAFT in a clean Sonnet context. Verdict: NEEDS_MINOR_REVISIONS — 1 blocking, 5 should-fix, 5 nits. PRD coverage matrix returned full Addressed across §5/§6.3/§7.1/§8.4/§11. All findings landed:

| # | Finding | Resolution |
|---|---------|------------|
| B1 | `useTask`'s `fetchTask` returned `null` on **any** non-ok status, swallowing 5xx as "task no longer found" — contradicting the Requirements text that pinned "404 → null" with non-404 errors propagating. Mirror `useTaskList`'s 404-vs-5xx split. | Pseudocode rewritten: `if (res.status === 404) return null; if (!res.ok) throw new Error(...)`. Test plan gains a 5xx → `isError` case for `useTask.test.ts`. Inline comment cites B1. |
| S1 | `useTaskList`'s `fetchOne` returned `[]` on 404 silently — a future implementer might "correct" this to `throw`, breaking the per-source degradation contract. Needed an explicit comment at the 404-consumption site, not just at the `fetchTaskList` level. | Inline comment added to `fetchOne` explaining `Promise.allSettled` sees `fulfilled([])` rather than `rejected`, and that the behavior is deliberate per D7. |
| S2 | The 80-char truncation contract (`reasons.approvedWithNote` / `reasons.rejected` in `03-hitl-gate` D4) was mentioned only once in the inspector section and was missing from the Verification list. Cross-leaf coupling gap with `03-hitl-gate`'s Open Issue about the same drift risk. | §Design's status-reason row paragraph now explicitly names both `approved: <note>` and `rejected: <…>` as the 80-char-truncated forms emitted by `03-hitl-gate`'s reason builders. Verification item 7 amended to call out the truncation contract + LogStream's `ErrorRow` as the full-text surface. |
| S3 | `HitlActions` received `task: Task` derived from `live?.task ?? taskProp`. If the query was still pending, `task` was the prop snapshot — the mutation would fire with stale `dbRowVersion`. The spec text said "never from the closed-over prop" but the pseudocode didn't enforce it. | §Design's gating block rewritten: `showHitlButtons` now gates on `live?.task.status === "AWAITING_HUMAN_REVIEW"` (not `task.status`). This makes the invariant explicit — the buttons only render once `live` has resolved, so `task` IS the live task whenever `<HitlActions>` is mounted. Inline pseudocode comment cites S3. |
| S4 | Acceptance check item 8 claimed the Status reason updates to `approved: lgtm` without citing that the string format is owned by `03-hitl-gate`'s `reasons.approvedWithNote`, not by this UI. Reads as if the inspector formats it. | Parenthetical added to item 8: "(the `approved: lgtm` string is emitted by the runner's `reasons.approvedWithNote` and truncated at 80 chars per `03-hitl-gate` D4; the inspector renders it verbatim from `event.reason`)." |
| S5 | The "fetch called exactly once" invariant for `useTask` was specified in the test plan but missing from the Verification list. | Verification item 4 amended to include both the 5xx → `isError` case (from B1) and the "fetch called exactly once per resolve" invariant. |
| N1 | D2's `app/server/deriveTask.ts:104-107` citation verified — no change needed. | No action — recorded for the stage-4 implementer's confidence notes. |
| N2 | `useLogStream`'s `useEffect` dep array `[taskId, queryStatus, taskQuery.data]` is unchanged — spec didn't note it. | One sentence added at the end of §Design's `useLogStream` paragraph. |
| N3 | Acceptance check item 2's test-count math: "5 + 5 + 4 + 6 + 8–10 + 5 helper = ≈ +35" — the "5 helper tests" line wasn't enumerated anywhere and the inspector range was inconsistent with the 7 cases the test plan listed. | Reconciled to `≈ +28` with the explicit breakdown 5 + 5 + 5 + 6 + 7. The phantom "helper tests" line dropped; useTask gains 5 cases (was 4) via the B1+S5 5xx test addition. |
| N4 | `HitlActions` sketch used `cn(...)` without importing it. | Sentence added pointing the implementer at `app/src/lib/cn.ts` (the file the file-tree already lists), noting sibling components already import it. |
| N5 | Acceptance check said "8–10 inspector" tests but the enumerated test plan listed 7. | Resolved as part of N3 — count is "7 inspector" everywhere. |

Reviewer's **decomposition assessment**: **Stay bundled.** Three hook rewrites + two new mutation hooks + inspector modifications are tightly coupled; mutations only meaningful in the dual-source + live-task context. ~200–250 LOC application + ~150–200 LOC tests, comparable to `03-hitl-gate` (~170 LOC route + ~39 test LOC). No natural split point.

Reviewer's **Confidence notes** (recorded so the stage-4 implementer spot-checks them):

- `Task.transcriptPath?: string` confirmed at `packages/parser/src/runner/types.ts:81` — discriminant `task.transcriptPath === undefined` valid.
- `Task.dbRowVersion: number` (non-optional, defaults 0 on insert) confirmed at `packages/parser/src/runner/types.ts:74`.
- Runner IDs are bare UUIDv4 (no colon) confirmed at `server/src/runner/ids.ts`; transcript IDs are `session:${uuid}` / `agent:${id}` confirmed at `app/server/deriveTask.ts:104-107`. The `id.includes(":")` discriminant is sufficient.
- Vite proxy at `app/vite.config.ts:21-24` forwards `/api/*` → `127.0.0.1:4180` in dev; in production build no transcript middleware exists, so `/api/transcripts*` 404s and `/api/tasks*` is the only live source. Dual-source degradation honors this.
- `LogEvent.status_change.reason?: string` confirmed at `packages/parser/src/runner/types.ts:144` — `latestStatusReason` scan handles the optional correctly.
- 409 body shapes from `03-hitl-gate` confirmed: `{ error: "version_conflict", expected, actual }` at `hitl.ts:282-284`; `{ error: "wrong_status", expected: "AWAITING_HUMAN_REVIEW", actual }` at `hitl.ts:254-257`. The inspector's `errorBanner` switches on these exact shapes.

Nothing punted. All B/S/N findings landed.

---

## Implementation Notes

Implementation landed in two commits: `05742e5` (APPROVED → IN_PROGRESS, doc-only) and `ac0982d` (4b: all source + tests).

**Deviations from spec pseudocode:**

- `fetchTaskList` in the spec pseudocode showed "if both rejected → throw; else return merged." The actual implementation also propagates a single-source rejection immediately rather than folding it into an empty `[]`. This matches the Requirements text ("errors other than 404 propagate") and is exercised by the `useTaskList.fetch.test.ts` "runner 500 → isError" case. The spec pseudocode was an approximation; the finer-grained propagation is the correct behavior.

- `MutationErrorBody` is implemented as a `class MutationErrorBody extends Error` (not the interface shown in the spec) to satisfy ESLint's `@typescript-eslint/only-throw-error` rule, which requires thrown values to extend `Error`. The shape (`status: number; body: unknown`) is identical. The class lives in `useApproveTask.ts`; `useRejectTask.ts` re-exports the class.

**Gate results (commit `ac0982d`):**

- `pnpm -C app typecheck` — exit 0
- `pnpm -C app lint --max-warnings=0` — exit 0
- `pnpm -C app build` — exit 0 (bundle: `index-*.js` 1,942 kB gzip 608 kB; `DagPanel-*.js` 1,646 kB gzip 505 kB — no meaningful delta from pre-implementation)
- `pnpm -C app test --run` — 102 tests pass across 11 test files (delta: +28 tests, +7 new test files)

**Test count breakdown (28 new):** 5 `mergeTasks` unit (`useTaskList.test.ts`) + 5 fetch integration (`useTaskList.fetch.test.ts`) + 5 endpoint selection (`useTask.test.ts`) + 3 approve mutation (`useApproveTask.test.ts`) + 3 reject mutation (`useRejectTask.test.ts`) + 7 inspector component (`TaskInspector.test.tsx`).

**Nits resolved during implementation not captured in spec:**

- All `onClick`/`onChange` arrow functions use block form (`() => { fn(); }`) rather than implicit-return shorthand to satisfy ESLint's `no-confusing-void-expression` rule.
- `res.json()` typed as `unknown` via explicit annotation (`const body: unknown = await res.json().catch(...)`) to avoid `@typescript-eslint/no-unsafe-assignment`.
- `useMemo` dep array uses `liveEvents` (potentially `undefined`) rather than `liveEvents ?? []` to avoid creating a new `[]` reference on every render and triggering exhaustive-deps warnings.
- Test error casts go through `unknown` first: `(result.current.error as unknown) as { status, body }` because TanStack Query types `mutation.error` as `Error | null`, and direct cast to `{ status, body }` fails tsc strict-mode overlap check.

**Items confirmed headlessly (operator-stage-8 items 5–13 are out of scope for this commit):**

Items 1–4 of the Acceptance check (install unchanged, four gates green, parser/server tests unaffected) confirmed.

### Implementation Review (2026-05-28)

Independent implementation review run against the rebased worktree (`worktree-agent-a2b63e8859a0f97f6`, branched from `d2d0db4`, rebased onto `4f3eab5`). Verdict: **READY_FOR_OPERATOR_VERIFICATION** — no blocking, no should-fix, three cosmetic nits. All 7 high-leverage Spec Review closures confirmed in code with file:line citations. All 6 gates re-verified at exit 0 (app typecheck/lint/build/test + server test untouched + parser test untouched). Both implementer deviations (single-source 500 propagation + `MutationErrorBody extends Error`) accepted with rationale.

| # | Finding | Resolution |
|---|---------|------------|
| HL — B1 (404-vs-5xx split in useTask) | Confirmed at `useTask.ts:36-37` — `if (res.status === 404) return null; if (!res.ok) throw new Error(...)` with B1 inline comment. | No action — confirmed. |
| HL — S1 (fetchOne 404 → [] with comment) | Confirmed at `useTaskList.ts:19-24` — explicit comment explaining `fulfilled([])` vs `rejected` for `Promise.allSettled`, cites S1. | No action — confirmed. |
| HL — S2 (truncated reason render) | Confirmed at `TaskInspector.tsx:196-209` — 80-char-truncated forms named, S2 cited, inspector renders verbatim from `event.reason`. | No action — confirmed. |
| HL — S3 (HitlActions gating on `live?.task.status`) | Confirmed at `TaskInspector.tsx:74-75` — `showHitlButtons = isRunnerEmitted && live?.task.status === "AWAITING_HUMAN_REVIEW"` with pinned invariant comment. | No action — confirmed. |
| HL — S4 (`approved: <note>` from runner not UI) | Confirmed: no string formatting in UI; `postApprove` sends `note` to server verbatim; inspector renders `event.reason` verbatim. No headless test exercises the formatted string (would require the real runner — correct scope). | No action — confirmed. |
| HL — D2 (`id.includes(":")` discriminant) | Confirmed at `useTask.ts:25-27` (`pickEndpoint`) + `useLogStream.ts:83-85`, both with D2 comments. | No action — confirmed. |
| HL — D5 (`MutationErrorBody` shape) | Confirmed at `useApproveTask.ts:27-35` — `class MutationErrorBody extends Error { status: number; body: unknown }`. `useRejectTask.ts:14-16` re-exports. `errorBanner` casts structurally via `{status?, body?}`; class instances satisfy the shape. | No action — confirmed. |
| Dev-1 — Single-source 500 propagation | ACCEPT. The Requirements text ("errors other than 404 propagate") is unambiguous and the actual behavior is more correct than the spec's "both-rejected → throw" pseudocode sketch. The `useTaskList.fetch.test.ts` "runner 500 → isError" case exercises this directly. | No action. |
| Dev-2 — `MutationErrorBody extends Error` (class, not interface) | ACCEPT. ESLint's `@typescript-eslint/only-throw-error` requires thrown values to extend `Error`. The `extends Error` adds only `super(\`HTTP ${status}\`)` to the message field; `status` + `body` shape unchanged. `errorBanner`'s structural cast works equally with the class instance. | No action. |
| N1 | `useRejectTask.test.ts` had a `wrong_status` 409 case but no `version_conflict` case (asymmetric with `useApproveTask.test.ts`). Both paths go through identical `MutationErrorBody` code, so low risk, but symmetry is cheap to fix. | APPLIED. Added "409 version_conflict → mutation.error carries {status: 409, body.error: 'version_conflict'}" test case to `useRejectTask.test.ts` (test count +1; total 104 tests, was 102). |
| N2 | `useTaskList.fetch.test.ts` covered "runner 500 + transcript 404 → isError" but not the mirror "transcript 500 + runner 404 → isError" case. Single-source propagation is symmetric — both paths through identical code — but mirror coverage is cheap. | APPLIED. Added "transcript 500 + runner 404 → query enters isError (Impl Review N2 — 5xx symmetry)" test case to `useTaskList.fetch.test.ts` (test count +1; total now 104). |
| N3 | `TaskInspector.test.tsx` uses `screen.queryByText("Approve")` / `queryByText("Reject…")` (exact string match) rather than `queryByRole("button", {name: ...})`. Fragile to label changes; not a correctness issue. | ACCEPTED AS-IS. `queryByText` exact match works correctly today; converting to `queryByRole` is genuine test-fragility polish, not mechanical text. Tests assert observable behavior either way. Logged as test-quality follow-up; no functional risk. |

Reviewer's bundle delta + test counts (after N1 + N2 applied):

| Workspace | Before (4f3eab5 main) | After (this worktree, post-N1/N2) | Delta |
|---|---|---|---|
| `app` | 73 tests, 4 files | 104 tests, 11 files | +31 tests, +7 files |
| `server` | 165 tests | 165 tests | 0 (no server changes) |
| `packages/parser` | 108 tests | 108 tests | 0 (no parser changes) |

Bundle delta: app source touched; chunk sizes negligibly larger (`index-*.js` 1,942 → 1,945 kB raw; gzip 608 kB unchanged). DagPanel chunk untouched.

Reviewer's **confidence notes** (operator's stage-8 verification will exercise these):

- `errorBanner` uses structural typing (`{status?, body?}`) rather than `instanceof MutationErrorBody`. Safe today (only `MutationErrorBody` instances reach `mutation.error`), but a hypothetical injected plain object with the right shape would also trigger the banner. Acceptable v1.
- The `useMemo` in `TaskInspector` uses `liveEvents` (potentially `undefined`) in the dep array with `const events = liveEvents ?? []` inside the callback. Correct — `undefined` vs populated array are distinct references.
- App test delta is +31 vs main (was +28 pre-N1/N2, +2 from this audit, +1 from the audit's reconciliation of the 102 vs 104 counts).
- All Acceptance check items 5–13 are operator-only and correctly scoped (item 11 — `version_conflict` via stale curl — is mechanically reachable but the unit-test coverage via mocked-fetch is honest about what it proves).

Nothing punted beyond N3 (test-fragility polish). The two applied audit fixes land in this commit alongside the audit table.

### Stage-8b loop-back (2026-05-28): Approve/Reject flicker fix

Operator stage-8 walkthrough caught a UX bug: clicking Approve made the buttons flicker for ~500–1000 ms before unmounting. Sequence captured in the matching HIGH-priority Open Issue. Root cause: fire-and-forget `invalidateQueries` left `live?.task.status` stale during the gap between mutation-resolved and refetch-completed; `approve.isPending` flipped false in that window so the buttons re-rendered in enabled "Approve" state. The original D12 estimate of "50–200 ms invisible at v1 scale" was wrong — Vite proxy + React render scheduling stretches the gap past the perception threshold.

**Fix applied** (`useApproveTask.ts` + `useRejectTask.ts`): `onSuccess` now writes the mutation response's `data.task` into `["task", taskId]` via `queryClient.setQueryData` BEFORE firing the background invalidations. The inspector's `showHitlButtons` gate (`live?.task.status === "AWAITING_HUMAN_REVIEW"`, per S3) flips false atomically on the same render the mutation resolves — buttons unmount cleanly. The events list (not in the mutation response) is preserved from the prior cache via the updater's `(old) => (old ? { ...old, task: data.task } : old)` guard, and the background `invalidateQueries({queryKey: ["task", taskId]})` refreshes events independently. List query `["tasks"]` invalidation stays fire-and-forget.

**Scope justification** (D12 amendment): the response-based pattern is NOT speculative-optimistic. The server has already authoritatively confirmed the new state at the time `onSuccess` fires; no rollback path exists or is needed. The original D12 rejection of speculative-optimistic updates (rollback complexity for 409 paths) still stands. The D12 row in §Decisions has been rewritten to make this distinction explicit.

**Tests updated:**
- `useApproveTask.test.ts`: "200 → ..." case now asserts both (a) `queryClient.getQueryData(["task", id])` returns the new task post-success, AND (b) events from the pre-seed are preserved in the cache. Added a defensive "setQueryData no-ops when cache empty" case (the `(old) => (old ? ... : old)` guard branch).
- `useRejectTask.test.ts`: matching update to the "200 → ..." case (asserts FAILED status + preserved events).

**Gate results post-fix:**

| Gate | Exit | Test count |
|---|---|---|
| `pnpm -C app typecheck` | 0 | — |
| `pnpm -C app lint --max-warnings=0` | 0 | — |
| `pnpm -C app build` | 0 | bundle: `index-*.js` 1,953 kB / gzip 611 kB (+8 kB raw / +3 kB gzip vs pre-fix baseline — the setQueryData additions + doc comments) |
| `pnpm -C app test --run` | 0 | 105 (was 104; +1 defensive empty-cache case) |
| `pnpm -C server test --run` | 0 | 165 (unchanged) |
| `pnpm -C packages/parser test --run` | 0 | 108 (unchanged) |

**Acceptance check delta:** items 7 + 9 (Approve / Reject flows) re-require operator visual confirmation that the flicker is gone. Items 1–4 + everything else unchanged. The HIGH Open Issue stays in the Open Issues list as `~~struck-through~~` with a pointer to this subsection.

---

## Verification

When this child moves to `VERIFY`, the verifier confirms:

1. The full Acceptance check list (1–13) passes.
2. `mergeTasks` is deterministic: runner-precedence on ID collision; `createdAt DESC` sort; empty/empty → empty; runner-only / transcript-only → that source unchanged.
3. `useTaskList`: both 200 → merged; runner 404 + transcript 200 → transcript only; runner 200 + transcript 404 → runner only; both 404 → `[]`; both 500 → `isError`.
4. `useTask`: colon-id → transcripts endpoint; no-colon-id → tasks endpoint; 404 → `null`; 5xx → query `isError` (per Spec Review B1 + S5); fetch called exactly once per resolve (no cross-endpoint fallback).
5. `useLogStream`: SSE URL is `/api/tasks/:id/stream` for runner IDs, `/api/transcripts/:id/stream` for transcript IDs. (Operator-verified.)
6. `useApproveTask` / `useRejectTask`: 200 → invalidates `["tasks"]` and `["task", id]`; 409 → `mutation.error` carries `{status: 409, body}`.
7. `TaskInspector`:
   - Approve/Reject buttons appear iff `transcriptPath === undefined ∧ status === "AWAITING_HUMAN_REVIEW"`.
   - Buttons disappear after a successful Approve/Reject (via invalidation refetch).
   - Reject textarea: Confirm disabled until rationale is non-empty (after trim).
   - 409 `version_conflict` → banner "This task was updated elsewhere — please refresh."
   - 409 `wrong_status` → banner "Task is no longer awaiting review."
   - Status reason row visible when latest `status_change.reason` is non-empty; hidden when not. Rejections render the 80-char-truncated form (`rejected: <…>`) — the full untruncated rationale is reachable via the LogStream panel's `ErrorRow` only (Spec Review S2; `03-hitl-gate` D4).
8. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` exit zero at the workspace root.
9. No regressions on `01-ui/04-tasks`'s table/row/filter behavior, `01-ui/05-logs`'s LogStream panel for transcript-derived tasks, `01-ui/02-dag`, `01-ui/03-docs`, or any other panel.
10. Parent `05-task-runner` flips to `COMPLETE` upon this merge (all five children COMPLETE). The parent's manifest row for this child reads `COMPLETE (v1, YYYY-MM-DD)`; the parent's Status header flips to `COMPLETE (v1, YYYY-MM-DD)`; CLAUDE.md round-2 line + PRD §14 reflect the closure.

---

## Children

None.
