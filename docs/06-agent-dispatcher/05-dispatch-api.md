# Dispatch API + Cancel + UI Integration

**Node ID:** `06-agent-dispatcher/05-dispatch-api`
**Parent:** `06-agent-dispatcher` (`docs/06-agent-dispatcher/00-agent-dispatcher.md`)
**Status:** SPEC_REVIEW
**Created:** 2026-05-29
**Last Updated:** 2026-05-29 (DRAFT → SPEC_REVIEW; reviewer dispatched in clean context)

**Dependencies:** `06-agent-dispatcher/03-claude-code-executor` (the `ClaudeCodeExecutor` registered for the eight types + `ProjectContext.dispatchCancellation: CancellationRegistry`), `06-agent-dispatcher/04-prompt-templates` (`defaultResourceClaims(task): ResourceClaim[]` used by the dispatch endpoint to synthesise claims when the operator's body doesn't override them)

---

## Requirements

Land the **operator-facing surface** that closes the agent-dispatcher round: two HTTP endpoints + two React Query mutation hooks + two UI buttons. After this leaf, an operator clicks "Dispatch" on a `06-agent-dispatcher`-style doc node, the runner synthesises a typed `Task`, the `ClaudeCodeExecutor` from `03` spawns a `claude` subprocess, the agent's `runner.*` MCP tool calls land in the events table, and the operator can click "Cancel" to SIGTERM a wedged dispatch — all without `curl`.

This is the **fifth and final** sub-leaf of `06-agent-dispatcher`. The parent's Children manifest names it: `Dispatch + cancel endpoints + UI integration. POST /api/dispatch/:nodeId with lifecycle-driven task-type inference (APPROVED → implement, VERIFY → verify, DRAFT → spec_review); POST /api/tasks/:id/cancel with eager-CANCELLED transition + SIGTERM (D14) + cancelled_by_operator reason; useDispatch / useCancelTask mutation hooks; NodeInspector Dispatch button (visibility on APPROVED/VERIFY/DRAFT); TaskInspector Cancel button (visibility on RUNNING ∧ runner-emitted)`. Every clause is in scope.

With this leaf the parent moves to `VERIFY`: the end-to-end Acceptance check (parent §Acceptance check items 1–10) becomes operator-runnable through the UI. The dispatcher is finally a control surface, not a substrate waiting for a driver.

In scope for v1:

1. **`POST /api/dispatch/:nodeId`** at `server/src/routes/dispatch.ts`. Synthesises a `Task` for the doc node and submits it through the existing `runner.createTask` path. Behaviour:
   - Resolves the node id against the parser's `DocNode[]` (already on `ProjectContext.docs` per `04-prompt-templates`). 404 if not found.
   - Infers `type` from the node's lifecycle status if the request body doesn't specify one:
     - `APPROVED` → `implement`
     - `VERIFY` → `verify`
     - `DRAFT` → `spec_review`
     - `IN_PROGRESS` / `COMPLETE` / `ISSUE_OPEN` / `DEFERRED` / `SPEC_REVIEW` / `PLANNED` → `409 no_inferred_type` (operator must specify `type` explicitly OR pick a different node).
   - Synthesises a `TaskInput` with `agent: { model: "claude-code", persona: <type> }` (parent §Type coordination Spec Review S1), `title: \`Dispatch ${type} on ${nodeId}\``, and `resourceClaims` from `defaultResourceClaims(<synthesised task shape>)` (parent D11 — operator can override claims via body).
   - Calls `project.runner.createTask(input)` which validates + writes + triggers a scheduler tick.
   - Returns `201 { task: Task }` on success. The task is `PENDING`; the scheduler picks it up on the next tick.
2. **`POST /api/tasks/:id/cancel`** at `server/src/routes/cancel.ts` (NEW; or extend the existing `server/src/routes/tasks.ts` — D-?? below picks). Behaviour:
   - 404 if `id` does not resolve to a task.
   - 409 if `task.status !== "RUNNING"`.
   - 409 if `dispatchCancellation.lookup(id)` returns undefined (the task is RUNNING but no subprocess is registered — e.g., it ran under `noop` which is synchronous and has already returned, or it's a `human_review` task that doesn't spawn a subprocess). The error body distinguishes: `{ reason: "no_subprocess", taskType }` so the UI can decide whether to retry or escalate.
   - Eager DB write: `store.updateTaskStatus(id, { from: "RUNNING", to: "CANCELLED", reason: reasons.CANCELLED_BY_OPERATOR })` (parent D14 — landed before the subprocess actually exits).
   - SIGTERM: `subprocess.kill("SIGTERM")` on the looked-up subprocess.
   - Returns `200 { task: Task }` synchronously. The subprocess's eventual exit lands `reconcileExit`'s row 4 (final === "CANCELLED", short-circuit, no transition).
3. **`useDispatch` mutation hook** at `app/src/lib/useDispatch.ts`. `POST /api/dispatch/:nodeId` with optional body `{ type?, priority?, resourceClaims? }`. On success: invalidate `["tasks"]` (the new task appears in lists); return `{ task }` from the response so the UI can toast the new task id + link to it. Errors: typed `MutationErrorBody` (the same shape `useApproveTask` uses — reused via re-export rather than duplicated; or its own copy if cross-hook import is awkward, see Decisions). Distinguishes `409 no_inferred_type` from `404 node_not_found` so the UI can show a relevant message.
4. **`useCancelTask` mutation hook** at `app/src/lib/useCancelTask.ts`. `POST /api/tasks/:id/cancel`. On success: response-based `setQueryData(["task", id], { ...old, task: data.task })` (mirrors `useApproveTask`'s D12-amended pattern — flips the Cancel button visibility false atomically on the same render, no flicker). Background invalidate `["tasks"]` for the list. Errors: typed; distinguishes `409 no_subprocess` from generic 409.
5. **Dispatch button in `app/src/components/dag/NodeInspector.tsx`.** Visibility rule: `node.authored && node.status ∈ {"APPROVED", "VERIFY", "DRAFT"}`. Click opens a small confirmation dialog (modal) showing the inferred task type + the synthesised title + the default `resourceClaims` (read from `defaultResourceClaims` on the client side OR returned by a `GET /api/dispatch/:nodeId/preview` endpoint — D below picks the simpler path: client-side preview via the same `defaultResourceClaims` import, since `04-prompt-templates`' exports are accessible from the server runtime but not from the browser; we mirror the small `defaultResourceClaims` switch in `app/src/lib/dispatch.ts` as a client-side mirror so the preview doesn't need a network round-trip). Confirm → POST. Success toast: `"Dispatched as task <short-id>"` with a link to the Tasks panel filtered on the new id.
6. **Cancel button in `app/src/components/tasks/TaskInspector.tsx`.** Visibility rule: `live?.task.status === "RUNNING" && task.transcriptPath === undefined` (the runner-emitted discriminant the file already uses for HitlActions). Click → `useCancelTask.mutate({ taskId })`. On success: the button disappears (visibility flips false because `live.task.status` is now `CANCELLED`). On `409 no_subprocess`: toast `"Task is RUNNING but no subprocess to cancel (was it noop?). Marking CANCELLED requires the runner's executor to register one."` — not actionable from the UI; the operator escalates to investigation.
7. **Mounting** — `dispatchRoute` mounted at `/api/dispatch` in `server/src/server.ts` alongside the existing routes. The cancel route mounts inside the existing `app.route("/api/tasks", tasksRoute)` block, OR as a new `app.route("/api/tasks", cancelRoute)` (Hono allows multiple sub-apps on the same path prefix; the existing `hitlRoute` already does this for `/api/tasks`). D-?? below picks; the simpler path is to extend `tasksRoute` directly with the new endpoint to keep "all `POST /api/tasks/*` handlers in one file" for grep-ability.
8. **Tests** at three layers:
   - **`server/test/dispatch.test.ts`** — dispatch endpoint round-trip. Cover: 404 on unknown nodeId; 409 on non-dispatchable status (IN_PROGRESS, COMPLETE, etc.); successful inference for APPROVED→implement, VERIFY→verify, DRAFT→spec_review; explicit `type` override in body; explicit `resourceClaims` override in body; the synthesised task is created with the right `agent`, `title`, and `resourceClaims`.
   - **`server/test/cancel.test.ts`** — cancel endpoint round-trip. Cover: 404 on unknown id; 409 on non-RUNNING status; 409 `no_subprocess` when registry has no entry; successful happy path (eager DB write + SIGTERM delivered to a fake subprocess; verified by checking `subprocess.kill` was called and the task transitioned to CANCELLED). Uses a recording mock subprocess that captures `.kill(signal)` calls.
   - **`app/src/lib/useDispatch.test.ts`** — mutation hook test using the same pattern as `useApproveTask.test.ts`: pre-seed query data, exercise the mutation, assert invalidations.
   - **`app/src/lib/useCancelTask.test.ts`** — mirrors the `useApproveTask` test shape including the response-based `setQueryData` assertion.
   - **`app/src/components/dag/NodeInspector.test.tsx`** — extended with Dispatch button visibility cases (each of {APPROVED, VERIFY, DRAFT, IN_PROGRESS, COMPLETE}) and confirmation dialog click flow.
   - **`app/src/components/tasks/TaskInspector.test.tsx`** — extended with Cancel button visibility cases (RUNNING ∧ runner-emitted = show; RUNNING ∧ transcript = hide; non-RUNNING = hide).
9. **Build / typecheck / lint / test green** across the workspace. App bundle delta reported in Implementation Notes (the two new hooks + the mirrored `defaultResourceClaims` + button wiring; estimated +2–4 KB gzipped). Server `dist/` delta is the two new route files.

**Out of scope for this child:**

- **Dispatch CLI** (`ledger dispatch <node-id>`). Parent §Out-of-scope item. The UI button covers the v1 case; a CLI subcommand is a future polish item.
- **`POST /api/dispatch` for arbitrary task types** (without a doc node). Parent §Out-of-scope. Operator-injected ad-hoc dispatch is already covered by `POST /api/tasks` from `05-task-runner/04-api-endpoints`: inject the task with the right type, the dispatcher's executor picks it up. No second endpoint.
- **Streaming SSE on the cancel response.** Parent §Out-of-scope. The cancel route returns the updated `Task` synchronously after SIGTERM is delivered. The subsequent `status_change` event lands on the existing `/api/tasks/:id/stream` SSE channel as the task's `RUNNING → CANCELLED` transition.
- **SIGKILL escalation on hung cancel.** Inherited from `03-claude-code-executor`'s Open Issues. v1 ships SIGTERM-only; the SIGKILL fallback timer lives in the cancellation registry (which 03 owns) when it lands.
- **Cancellation reason customisation** beyond the default `cancelled_by_operator`. The cancel endpoint accepts a `body.reason?: string` but if omitted uses the canonical constant. No truncation, no policy: if the operator passes a 500-char reason, it lands verbatim on the `status_change` event (subject to existing `reasons.rejected`-style 80-char convention if we wrap it through a builder — D-?? below picks; for v1 the constant path is the only one used by the UI).
- **Multi-dispatch (dispatching the same node twice concurrently).** Parent §Out-of-scope. The runner's resource-claim conflict primitive (`05-task-runner/02-scheduler` D2) already serialises overlapping writes; two `implement` dispatches on the same node will see the second one BLOCKED with `blocked_by_claim_conflict`. The UI doesn't pre-empt the second dispatch; the operator sees the task created but blocked, and the inspector's status reason explains why.
- **Live re-prompting / mid-flight operator messages.** Parent §Out-of-scope. `AWAITING_HUMAN_REVIEW` + follow-up dispatch is the v1 substitute.
- **Per-dispatch model override** (e.g., dispatching with `claude-haiku` instead of the operator's default). Parent §Out-of-scope; the executor's `claude` invocation has no `--model` flag.
- **Retry-after-failure UI** — clicking "Retry" on a FAILED dispatcher task. The operator dispatches the node again, which creates a new task with a new id. The original FAILED task stays for provenance.
- **Dispatch from the Task panel** (vs the DAG node panel). The dispatch surface is "select a node, click Dispatch on that node's inspector". The Tasks panel reflects state after dispatch; it does not originate dispatches.

---

## Design

### Repository layout after this node

```
ledger/
├── server/
│   ├── src/
│   │   ├── server.ts                          # modified — app.route("/api/dispatch", dispatchRoute)
│   │   └── routes/
│   │       ├── tasks.ts                       # modified — POST /:id/cancel added inline
│   │       └── dispatch.ts                    # NEW — POST /:nodeId
│   └── test/
│       ├── dispatch.test.ts                   # NEW
│       └── cancel.test.ts                     # NEW (in server/test/, not tasks.test.ts;
│                                              #   keeps cancel-specific tests grep-able)
├── app/
│   └── src/
│       ├── components/
│       │   ├── dag/
│       │   │   └── NodeInspector.tsx          # modified — Dispatch button + confirmation dialog
│       │   └── tasks/
│       │       └── TaskInspector.tsx          # modified — Cancel button
│       └── lib/
│           ├── dispatch.ts                    # NEW — client-side defaultResourceClaims mirror
│           ├── useDispatch.ts                 # NEW
│           ├── useCancelTask.ts               # NEW
│           ├── useDispatch.test.ts            # NEW
│           └── useCancelTask.test.ts          # NEW
└── docs/
    └── 06-agent-dispatcher/
        ├── 00-agent-dispatcher.md             # modified — manifest row + parent moves to VERIFY
        └── 05-dispatch-api.md                 # this spec
```

### `POST /api/dispatch/:nodeId` — handler shape

```ts
// server/src/routes/dispatch.ts
import { Hono } from "hono";
import { defaultResourceClaims } from "../dispatcher/index.js";
import { reasons } from "../runner/scheduler.js";
import type { ServerEnv } from "../server.js";
import type { TaskType, NodeStatus, ResourceClaim } from "@ledger/parser";

// Lifecycle status → inferred task type. Status values not in this map
// produce 409 no_inferred_type unless the body overrides `type`.
const TYPE_INFERENCE: Partial<Record<NodeStatus, TaskType>> = {
  APPROVED: "implement",
  VERIFY: "verify",
  DRAFT: "spec_review",
} as const;

export const dispatchRoute = new Hono<ServerEnv>().post("/:nodeId", async (c) => {
  const project = c.get("project");
  const nodeId = c.req.param("nodeId");
  const node = project.docs.find((n) => n.id === nodeId);
  if (!node) return c.json({ error: "node_not_found", nodeId }, 404);

  const body = (await c.req.json().catch(() => ({}))) as {
    type?: TaskType;
    priority?: number;
    resourceClaims?: ResourceClaim[];
  };

  const inferredType = body.type ?? TYPE_INFERENCE[node.status];
  if (!inferredType) {
    return c.json(
      { error: "no_inferred_type", nodeStatus: node.status, hint: "Provide `type` in body or pick a node in APPROVED/VERIFY/DRAFT." },
      409,
    );
  }

  // Synthesise a Task-shaped object to pass to defaultResourceClaims;
  // the helper only reads `type` and `parentTaskId`, so the partial is sufficient.
  const claims = body.resourceClaims ?? defaultResourceClaims({
    id: nodeId,
    type: inferredType,
    parentTaskId: undefined,
  } as Task);

  const title = `Dispatch ${inferredType} on ${nodeId}`;
  const task = project.runner.createTask({
    type: inferredType,
    title,
    source: "operator_injected",
    agent: { model: "claude-code", persona: inferredType },
    resourceClaims: claims,
    priority: body.priority,
  });
  return c.json({ task }, 201);
});
```

The `defaultResourceClaims` call takes a partial Task shape (just `id` + `type` + `parentTaskId` for the cases that read it). Cast to `Task` is a localised assertion — the helper does not read any other field. Alternative: extend `defaultResourceClaims`'s signature to accept the narrower input shape; defer to Spec Review if the reviewer flags this.

### `POST /api/tasks/:id/cancel` — handler shape

```ts
// server/src/routes/tasks.ts (additive — inside the existing tasksRoute)
tasksRoute.post("/:id/cancel", async (c) => {
  const project = c.get("project");
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };

  const task = project.runner.store.loadTask(id);
  if (!task) return c.json({ error: "task_not_found", id }, 404);
  if (task.status !== "RUNNING") {
    return c.json({ error: "wrong_status", expected: "RUNNING", actual: task.status }, 409);
  }
  const subprocess = project.dispatchCancellation.lookup(id);
  if (!subprocess) {
    return c.json({ error: "no_subprocess", id, taskType: task.type }, 409);
  }

  const reason = body.reason ?? reasons.CANCELLED_BY_OPERATOR;
  const updated = project.runner.store.updateTaskStatus(
    id,
    { from: "RUNNING", to: "CANCELLED", reason },
  );
  subprocess.kill("SIGTERM");
  return c.json({ task: updated }, 200);
});
```

The cancel route reuses the existing `tasksRoute` (D-?? below); no new sub-app. The eager DB write happens BEFORE the SIGTERM — operator gets the synchronous 200 reflecting the new CANCELLED status, and the subprocess's eventual exit is handled by `03`'s `reconcileExit` row 4 (final === "CANCELLED" → short-circuit, no transition; parent D14).

### `useDispatch` mutation hook

```ts
// app/src/lib/useDispatch.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MutationErrorBody } from "./useApproveTask.js";  // shared error class
import type { Task, NodeId, TaskType, ResourceClaim } from "./types.js";

export interface DispatchVariables {
  nodeId: NodeId;
  type?: TaskType;
  priority?: number;
  resourceClaims?: ResourceClaim[];
}

async function postDispatch(vars: DispatchVariables): Promise<{ task: Task }> {
  const { nodeId, ...body } = vars;
  const res = await fetch(`/api/dispatch/${encodeURIComponent(nodeId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody: unknown = await res.json().catch(() => undefined);
    throw new MutationErrorBody(res.status, errBody);
  }
  return res.json() as Promise<{ task: Task }>;
}

export function useDispatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postDispatch,
    onSuccess: () => {
      // The new task is PENDING — no [task, id] cache to update yet.
      // Invalidate the list so the new task appears.
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
```

Reuses `MutationErrorBody` from `useApproveTask.ts` (export already public per `useRejectTask`'s consumption pattern). The error class lives where the first consumer landed it; future hooks share via re-export.

### `useCancelTask` mutation hook

```ts
// app/src/lib/useCancelTask.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MutationErrorBody } from "./useApproveTask.js";
import type { Task, TaskId } from "./types.js";
import type { TaskDetail } from "./useTask.js";

export interface CancelVariables {
  taskId: TaskId;
  reason?: string;
}

async function postCancel({ taskId, reason }: CancelVariables): Promise<{ task: Task }> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reason !== undefined ? { reason } : {}),
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => undefined);
    throw new MutationErrorBody(res.status, body);
  }
  return res.json() as Promise<{ task: Task }>;
}

export function useCancelTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postCancel,
    onSuccess: (data, { taskId }) => {
      // Mirror useApproveTask's D12-amended pattern: response-based
      // setQueryData flips the Cancel button visibility false atomically.
      queryClient.setQueryData<TaskDetail | null>(
        ["task", taskId],
        (old) => (old ? { ...old, task: data.task } : old),
      );
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
  });
}
```

### Client-side `defaultResourceClaims` mirror

```ts
// app/src/lib/dispatch.ts
import type { ResourceClaim, NodeId, TaskType } from "./types.js";

/**
 * Client-side mirror of server/src/dispatcher/prompts/index.ts's
 * defaultResourceClaims. The two MUST stay in sync; a test in
 * dispatch.test.ts (server) and dispatch.test.ts (app) snapshot both
 * outputs against a fixture input and diffs them.
 *
 * Rationale (Spec D): we mirror rather than fetching from the server because
 * the preview dialog is opened immediately on button click; a network round-trip
 * would block the dialog render.
 */
export function clientDefaultResourceClaims(
  nodeId: NodeId,
  type: TaskType,
  parentTaskId?: NodeId,
): ResourceClaim[] {
  switch (type) {
    case "implement":
    case "spec_draft":
    case "doc_refactor":
    case "issue_triage":
      return [{ kind: "node", nodeId, mode: "write" }];
    case "spec_review":
      return [{ kind: "node", nodeId, mode: "read" }];
    case "verify":
    case "reverify":
      return [
        { kind: "node", nodeId, mode: "read" },
        ...(parentTaskId ? [{ kind: "node" as const, nodeId: parentTaskId, mode: "read" as const }] : []),
      ];
    case "project_status_review":
      return [{ kind: "node", nodeId: "00-project", mode: "read" }];
    default:
      return [];
  }
}
```

Mirrors the server's `defaultResourceClaims` byte-for-byte (same cases, same returns). The drift-detection test compares fixture outputs of both functions and fails the build on mismatch. The reviewer should flag if there's a cleaner solution (e.g., extracting the helper to `@ledger/parser` so both consumers import it directly) — D-?? below picks the mirror approach for v1.

### Confirmation dialog (NodeInspector)

```tsx
// app/src/components/dag/NodeInspector.tsx (additive sketch)
{node.authored && DISPATCHABLE_STATUSES.has(node.status) && (
  <button
    type="button"
    onClick={() => setShowDispatchDialog(true)}
    className="dispatch-button"
  >
    Dispatch
  </button>
)}
{showDispatchDialog && (
  <DispatchConfirmDialog
    node={node}
    inferredType={inferType(node.status)}
    defaultClaims={clientDefaultResourceClaims(node.id, inferType(node.status), node.parentId)}
    onCancel={() => setShowDispatchDialog(false)}
    onConfirm={() => dispatch.mutate({ nodeId: node.id })}
  />
)}
```

`DispatchConfirmDialog` is a small modal component (~50 lines) rendered inline in `NodeInspector.tsx` or extracted to `DispatchConfirmDialog.tsx` (D-?? below). It shows: the node id + title, the inferred task type, the claim summary, a Confirm + Cancel pair. On Confirm: `dispatch.mutate(...)` + close. On success: a toast (using whatever toast library `01-ui/01-shell` ships — check at implementation time; if none, log to console for v1 and document as a TODO).

### Acceptance check (manual, end-to-end)

1. `pnpm -C server dev /Users/dennis/code/ledger` boots.
2. Existing endpoints all respond (smoke).
3. **Dispatch happy path.** Operator opens the UI's DAG panel, selects an APPROVED node (e.g., `06-agent-dispatcher/05-dispatch-api` once this leaf is itself APPROVED), clicks "Dispatch" → confirmation dialog shows "Task type: implement, Claims: [node 05-dispatch-api: write]" → Confirm → toast "Dispatched as task <uuid>" → Tasks panel shows the new task transitioning PENDING → RUNNING and (assuming a real `claude` install) eventually COMPLETE.
4. **Dispatch with no inferred type.** Operator clicks "Dispatch" on a COMPLETE node → confirmation dialog NOT shown; instead, a tooltip or disabled state explains "Dispatch is only available for APPROVED, VERIFY, or DRAFT nodes." (UI-level gate via visibility rule.)
5. **Dispatch on a non-authored node** (synthesised by the parser, e.g., `01-ui/07-replay`) → button not rendered.
6. **Cancel happy path.** Operator opens the Tasks panel, selects a RUNNING task from a dispatcher run, clicks "Cancel" → button disappears, task status updates to CANCELLED, the subprocess's eventual exit is silent (executor's row 4 short-circuits).
7. **Cancel on non-RUNNING.** Button not visible. Visible-only-on-RUNNING gate.
8. **Cancel on a noop task.** Button not visible (`task.transcriptPath === undefined` is true for noop too — IT IS A RUNNER TASK — so the gate would actually SHOW the button on a noop task. Test what happens: click "Cancel" → 409 `no_subprocess` because noop has no registered subprocess. Toast the typed error.) Note for the implementer: the visibility rule may need to expand to exclude noop tasks specifically, OR the 409 error path is acceptable. D-?? below picks: accept the 409, treat it as a documented edge case; the noop is a v1 test affordance, not a normal operator path.
9. **Curl-level smoke** for the cancel endpoint: `curl -X POST /api/tasks/<noop-task-id>/cancel` against a task in COMPLETE → 409 `wrong_status`. `curl -X POST /api/tasks/<noop-task-id>/cancel` against a task in RUNNING but with no subprocess → 409 `no_subprocess`. `curl -X POST /api/tasks/<bogus-id>/cancel` → 404.
10. `pnpm typecheck`, `pnpm lint`, `pnpm test` exit zero across the workspace.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Cancel endpoint extends the existing `tasksRoute` (not a new sub-app) | The endpoint shape is `POST /api/tasks/:id/cancel` — already under `/api/tasks`. Adding a third sub-app on the same prefix is feasible (Hono allows it; `hitlRoute` does this for approve/reject) but extending `tasksRoute` keeps all `POST /api/tasks/*` handlers grep-able from a single file. Trade-off: tasksRoute grows by ~15 lines; acceptable. |
| D2 | Dispatch route IS a new sub-app at `/api/dispatch` | The endpoint shape is `POST /api/dispatch/:nodeId` — distinct prefix, distinct file. No reason to bury it inside `tasksRoute`. |
| D3 | Client-side `clientDefaultResourceClaims` mirrors the server's `defaultResourceClaims` (no fetch on dialog open) | Network round-trip to fetch claims would block the dialog render; an immediate render with the wrong claims would mislead the operator. Mirroring is the cleanest v1: a single drift-detection test (fixture-input compared across both functions) prevents silent divergence. The alternative — extracting the helper to `@ledger/parser` for cross-consumption — is the right v2 cleanup; the mirror works for v1 because the function is small (~15 LOC) and the dispatcher's task types are stable. Logged as Open Issue. |
| D4 | Type inference uses a `Partial<Record<NodeStatus, TaskType>>` constant rather than a switch | Three entries today, possibly more in the future (e.g., `ISSUE_OPEN → reverify`). A Record is straightforward and TypeScript catches a missing entry if the value type is narrowed (here we use `Partial`, so missing entries are explicit — they fall into the 409 `no_inferred_type` branch). |
| D5 | The dispatch endpoint accepts overrides for `type`, `priority`, and `resourceClaims` only — NOT for `dependsOn`, `parent_task_id`, etc. | Dispatched tasks are standalone (no parent task); `dependsOn` would let the operator manufacture arbitrary DAGs which is `POST /api/tasks`'s job (parent §Out-of-scope item). Keeping the dispatch surface narrow keeps the UI's confirmation dialog simple. |
| D6 | Cancel response is synchronous (200 after SIGTERM delivered; subprocess exit is async) — inherits parent D14 | Operator gets immediate feedback; downstream waiting tasks become eligible immediately. Subprocess's continued tool-call attempts fail with `task_not_bound` (the cancellation registry doesn't unbind on the cancel, but the eager DB write means `runner.complete_task` etc. would 409 on `from === RUNNING` check). Worst case: a zombie subprocess (inherited parent Open Issue). |
| D7 | `MutationErrorBody` shared with `useApproveTask`/`useRejectTask` via re-export | The class is already public on `useApproveTask.ts`. New hooks import and use. Promoting to `app/src/lib/errors.ts` would be cleaner long-term but is out-of-scope churn for this leaf; the `useApproveTask`-as-home convention is stable across the existing hooks. |
| D8 | `DispatchConfirmDialog` inlined in `NodeInspector.tsx`, not extracted | Small (~50 LOC) and used only in one place. Extracting adds a file for no DRY win. If a second dispatch-confirmation site lands (e.g., a future "Dispatch all APPROVED" bulk button), extract then. |
| D9 | Visibility rule for Cancel button does NOT distinguish noop tasks; the 409 `no_subprocess` path is the documented edge case | Filtering noop at the UI layer would require the UI to know which task types have subprocess-spawning executors — a piece of `03-claude-code-executor`'s domain that leaking into the UI couples the two. Better: the API returns the typed 409, the UI surfaces a clear error toast. Noop tasks are a test affordance; the operator does not normally click "Cancel" on them. |
| D10 | The dispatch endpoint synthesises `agent: { model: "claude-code", persona: <type> }` per parent Spec Review S1 | Parent already prescribed this in `06-agent-dispatcher/00-agent-dispatcher.md`'s §Type coordination — no decision here, just a re-affirmation that this leaf delivers on it. |
| D11 | Cancel endpoint accepts an optional `body.reason` but defaults to `reasons.CANCELLED_BY_OPERATOR` | Future operator-facing reason customisation (e.g., "Cancelled because the agent went off track") rides through the body. v1 UI sends only the default. The reason field is stored verbatim on the `status_change` event — same as the existing `reasons.rejected`/`approvedWithNote` convention except without the 80-char truncation builder (D-?? could add one; defer). |
| D12 | No `Last-Event-ID` resume on the cancel response — it's a one-shot POST | The follow-up `status_change` event arrives via the existing SSE channel from `04-api-endpoints`. The cancel response is not a stream. |
| D13 | Dispatch endpoint emits no log events of its own — `runner.createTask` writes the seq-0 status_change event for free | The existing path is sufficient; adding a `kind=reasoning` "Operator dispatched at <time>" event would duplicate the existing `created_at` + status_change. The UI can derive "dispatched by operator" from `source === "operator_injected"` if it wants a label. |
| D14 | Test fixture for cancel.test.ts uses a recording mock subprocess (not a real spawned process) | The real-subprocess path is covered by `03-claude-code-executor`'s fake-claude integration. The cancel endpoint's job is to (a) check status, (b) eagerly transition, (c) call `.kill("SIGTERM")` on the registry entry. A mock that records the kill call is sufficient — and avoids spawning a real subprocess in `cancel.test.ts`. |

---

## Open Issues

- **`defaultResourceClaims` is mirrored client-side rather than imported.** D3 acknowledges. If a future task type lands without updating both copies, the drift-detection test catches it. The cleaner v2 fix: extract `defaultResourceClaims` to `@ledger/parser` (it depends on `ResourceClaim` + `TaskType`, both already there) and have both consumers import it. *(Priority: LOW — drift-test mitigates.)*
- **`MutationErrorBody` lives in `useApproveTask.ts` as its "home".** The convention works but couples hook files. A future `app/src/lib/errors.ts` extraction would centralise. *(Priority: TRIVIAL — current convention is stable.)*
- **No 80-char truncation on operator-supplied cancel reasons.** D11 acknowledges. The existing `reasons.rejected(rationale)` and `approvedWithNote(note)` builders DO truncate; an analogous `reasons.cancelledByOperatorWithNote(note)` builder would be the natural addition. Defer until an operator actually passes a custom reason (UI doesn't today). *(Priority: TRIVIAL.)*
- **Cancel-on-noop returns 409 `no_subprocess`.** D9 acknowledges. The UI surfaces the typed error; operator decides what to do. A future UI enhancement could hide the Cancel button on tasks whose type is in a documented "synchronous executor" set, but that requires the UI to know the type taxonomy. Out of v1 scope. *(Priority: LOW.)*
- **Dispatch on a node already running a dispatched task** — second dispatch creates a new task, scheduler sees the resource-claim conflict, the second task lands BLOCKED with `blocked_by_claim_conflict`. The UI doesn't pre-empt; the operator sees the blocked state in the Tasks panel inspector. Documented behaviour, not a bug. *(Priority: TRIVIAL.)*
- **SIGKILL escalation for hung cancels.** Inherited from `03`'s Open Issues. The cancellation registry would need a per-task timer; that lives in `03-claude-code-executor`'s scope, not here. Cross-reference for visibility. *(Priority: MEDIUM — surfaces when cancellation is heavily used.)*
- **`DispatchConfirmDialog` toast surface depends on whether the UI has a toast system.** v1's `01-ui` shell may or may not ship one; the spec leaves it to the implementer to discover and document. If no toast lib exists, the dispatch button's success path could navigate to the new task's detail view directly (which makes the "task created" event tangible without a toast). *(Priority: LOW — implementation-time concern.)*

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this leaf moves from `VERIFY` to `COMPLETE`, the verifier confirms:

1. **Build / typecheck / lint / test.** `pnpm install`, `pnpm -C packages/parser build`, `pnpm -C server build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` all exit zero. Bundle delta on `app/` reported (estimated +2–4 KB gzipped). Server `dist/` delta reported.
2. **Dispatch endpoint round-trip.** `POST /api/dispatch/:nodeId` for each of {APPROVED, VERIFY, DRAFT} nodes returns 201 with the right inferred type; non-dispatchable statuses return 409 `no_inferred_type`; unknown nodeId returns 404.
3. **Cancel endpoint round-trip.** `POST /api/tasks/:id/cancel` returns 200 with updated task on RUNNING ∧ subprocess-registered tasks; 409 `wrong_status` on non-RUNNING; 409 `no_subprocess` on RUNNING-but-no-subprocess; 404 on unknown id.
4. **`useDispatch` test passes** the same query-invalidation pattern as `useApproveTask`.
5. **`useCancelTask` test passes** the response-based `setQueryData` pattern.
6. **`NodeInspector` Dispatch button** visibility matrix: APPROVED/VERIFY/DRAFT show; IN_PROGRESS/COMPLETE/PLANNED hide; non-authored nodes hide.
7. **`TaskInspector` Cancel button** visibility matrix: RUNNING + runner-emitted show; non-RUNNING hide; transcript-derived hide.
8. **Drift-detection test** for `defaultResourceClaims` ↔ `clientDefaultResourceClaims` passes on the canonical fixture.
9. **No regressions** on existing endpoints (`/api/_health`, `/api/project`, `/api/docs`, `/api/tasks*`, `/mcp`) or UI panels.
10. **Parent moves to VERIFY.** With this leaf COMPLETE, `06-agent-dispatcher` has 5/5 children COMPLETE; the parent's manifest row in PRD §14 transitions APPROVED → VERIFY; CLAUDE.md round-2 dispatcher line synced.

---

## Children

None. This leaf has no further decomposition.
