# Dispatch API + Cancel + UI Integration

**Node ID:** `06-agent-dispatcher/05-dispatch-api`
**Parent:** `06-agent-dispatcher` (`docs/06-agent-dispatcher/00-agent-dispatcher.md`)
**Status:** COMPLETE (v1, 2026-05-31)
**Created:** 2026-05-29
**Last Updated:** 2026-05-31 (VERIFY → COMPLETE — operator manually verified dispatch + cancel curl paths against running server; 595 workspace tests pass)

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
5. **Dispatch button in `app/src/components/dag/NodeInspector.tsx`.** Visibility rule: `node.authored && node.status ∈ {"APPROVED", "VERIFY", "DRAFT"}`. The `node.authored` clause is an explicit extension beyond parent §Design "Dispatch button" (which doesn't mention `authored`) — manifest-only nodes have no actionable spec to dispatch against, so the button is hidden for them (Spec Review N3). Click opens a small confirmation dialog (modal) showing the inferred task type + the synthesised title + the default `resourceClaims` (computed via `defaultResourceClaims` imported directly from `@ledger/parser` — Spec Review S2 promoted the function to the parser package; no client/server mirror, no drift). Confirm → POST. Success: inline banner in the inspector reads `"Dispatched as task <short-id>"` with a link to the Tasks panel filtered on the new id (Spec Review N4 — picked the inline-banner pattern over `console.log` since no toast library is established yet).
6. **Cancel button in `app/src/components/tasks/TaskInspector.tsx`.** Visibility rule: `live?.task.status === "RUNNING" && task.transcriptPath === undefined` (the runner-emitted discriminant the file already uses for HitlActions at line 73). Click → `useCancelTask.mutate({ taskId })`. On success: the button disappears (visibility flips false because `live.task.status` is now `CANCELLED`). On `409 no_subprocess`: inline banner in the inspector reads "Task is RUNNING but no subprocess to cancel (was it noop?). Marking CANCELLED requires the runner's executor to register one." Not actionable from the UI; operator escalates to investigation.

   **Note on the discriminant (Spec Review S4):** Parent §Design "Cancel button" uses `!task.id.includes(":")` as the runner-vs-transcript gate; this leaf uses `task.transcriptPath === undefined` to align with the existing `TaskInspector.tsx` pattern at line 73. The two forms are functionally equivalent under current ID schemes (runner-emitted tasks have no `transcriptPath` AND no `:` in their UUID; transcript tasks always have `:` in their session/agent-prefixed ID AND a `transcriptPath`). The `transcriptPath` form is more semantically precise — the property name says what it tests.
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
├── packages/parser/
│   └── src/
│       ├── index.ts                           # modified — re-export defaultResourceClaims
│       └── runner/
│           └── defaultResourceClaims.ts       # NEW (Spec Review S2 — promoted from server)
├── packages/parser/test/runner/
│   └── defaultResourceClaims.test.ts          # NEW
├── app/
│   └── src/
│       ├── components/
│       │   ├── dag/
│       │   │   └── NodeInspector.tsx          # modified — Dispatch button + confirmation dialog
│       │   └── tasks/
│       │       └── TaskInspector.tsx          # modified — Cancel button
│       └── lib/
│           ├── types.ts                       # modified — re-export defaultResourceClaims
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
import { defaultResourceClaims } from "@ledger/parser";  // promoted to parser per Spec Review S2
import { reasons } from "../runner/scheduler.js";
import type { ServerEnv } from "../server.js";
import type { Task, TaskType, NodeStatus, ResourceClaim } from "@ledger/parser";  // Task added per Spec Review N1

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
      {
        error: "no_inferred_type",
        nodeStatus: node.status,
        // Spec Review S1: differentiated hint so the operator can tell why
        // their click failed. Each branch maps to actionable operator guidance.
        hint:
          node.status === "PLANNED"
            ? `Node is PLANNED — not yet ready for dispatch. Draft the spec first (set Status: DRAFT) or pick a different node.`
            : node.status === "SPEC_REVIEW"
            ? `Node is SPEC_REVIEW — currently under review. Wait for the review to land (SPEC_REVIEW → APPROVED) or pick a different node.`
            : node.status === "IN_PROGRESS"
            ? `Node is IN_PROGRESS — already running. Check the Tasks panel for the in-flight dispatch.`
            : node.status === "COMPLETE"
            ? `Node is COMPLETE — no work to dispatch. Pick a different node or override the type via body.`
            : `Node is in ${node.status}; dispatch is only valid for APPROVED, VERIFY, or DRAFT nodes.`,
      },
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

The `defaultResourceClaims` call takes a partial Task shape — the helper reads `task.id`, `task.type`, and (for verify/reverify) `task.parentTaskId`; nothing else. Cast to `Task` is a localised assertion safe under this surface.

**Note on parent spec drift (Spec Review B2):** Parent §Design "Dispatch endpoint semantics" reads "*If claims are omitted, the endpoint declares a single write claim on the target node*". That description is a simplification that pre-dated `04-prompt-templates`' actual implementation. The real `defaultResourceClaims` returns **type-specific** claim sets:
- `implement` / `spec_draft` / `doc_refactor` / `issue_triage` → `{ kind: "node", nodeId, mode: "write" }` (single write — matches parent's description)
- `spec_review` → `{ kind: "node", nodeId, mode: "read" }` (read-only; does NOT match parent's "write")
- `verify` / `reverify` → read on `nodeId` + read on `parentTaskId` (two claims, both read)
- `project_status_review` → read on `00-project` (a different node entirely from the dispatched one)

This leaf delivers on the actual implementation; the parent's simplification is superseded by `04`'s shipped `defaultResourceClaims`. Implementer reads the leaf's behavior here, not the parent's earlier prose.

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
  let updated;
  try {
    updated = project.runner.store.updateTaskStatus(
      id,
      { from: "RUNNING", to: "CANCELLED", reason },
    );
  } catch (err) {
    // Spec Review B1: `store.updateTaskStatus` throws if the `from` guard
    // fails (race window: scheduler ticks RUNNING → COMPLETE between our
    // loadTask check and the UPDATE). Map to 409 wrong_status — same shape
    // as the loadTask-time check above, so the client sees one consistent
    // 409 path regardless of which side of the race fired first.
    return c.json({ error: "wrong_status", expected: "RUNNING", actual: "raced" }, 409);
  }
  subprocess.kill("SIGTERM");
  return c.json({ task: updated }, 200);
});
```

The cancel route reuses the existing `tasksRoute` (D1); no new sub-app. The eager DB write happens BEFORE the SIGTERM — operator gets the synchronous 200 reflecting the new CANCELLED status, and the subprocess's eventual exit is handled by `03`'s `reconcileExit` row 4 (final === "CANCELLED" → short-circuit, no transition; parent D14).

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
      // No setQueryData for the new task (Spec Review S3 rationale):
      //   - The new task is PENDING on creation; by the time the operator
      //     clicks the toast link to navigate to it, the scheduler has
      //     likely already transitioned it to RUNNING (the scheduler ticks
      //     immediately after createTask).
      //   - Seeding the cache with the PENDING snapshot would cause the
      //     inspector to flash "PENDING" before refetching the live status.
      //   - The ["tasks"] list invalidation below covers the case where the
      //     operator stays in the Tasks panel and watches the new row appear.
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
      // Response-based cache update: write the post-transition task into the
      // inspector's cache so the Cancel button visibility (gated on
      // live?.task.status === "RUNNING") flips false on the same render.
      // Mirrors useApproveTask's D12-amended pattern (05-task-runner/
      // 05-ui-hook-migration stage-8b loop-back).
      queryClient.setQueryData<TaskDetail | null>(
        ["task", taskId],
        (old) => (old ? { ...old, task: data.task } : old),
      );
      // Background refresh: list rows + inspector events. The events list
      // is not in the response — left stale and refreshed by the invalidate.
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
  });
}
```

### Promote `defaultResourceClaims` to `@ledger/parser` (Spec Review S2)

The original draft prescribed a client-side `clientDefaultResourceClaims` mirror in `app/src/lib/dispatch.ts` with a drift-detection test against the server's `defaultResourceClaims`. Spec Review S2 caught this as architecturally infeasible: a test comparing both functions can't cleanly import across the workspace boundary (`app/package.json` has no `exports` field that makes its modules importable from `server/` test code, and the reverse is also messy).

The cleaner v1 fix — also recommended by the reviewer — is to **promote `defaultResourceClaims` from `server/src/dispatcher/prompts/index.ts` into `@ledger/parser/src/runner/`** so both the dispatch endpoint and the UI's confirmation dialog import it directly. The function is a pure switch over `Task["type"]` returning `ResourceClaim[]` — its only dependencies (`Task`, `ResourceClaim`, `TaskType`) are already canonical in `@ledger/parser`.

The migration:

```ts
// packages/parser/src/runner/defaultResourceClaims.ts (NEW; ~25 LOC)
import type { Task, ResourceClaim } from "./types.js";

export function defaultResourceClaims(task: Task): ResourceClaim[] {
  switch (task.type) {
    case "implement":
    case "spec_draft":
    case "doc_refactor":
    case "issue_triage":
      return [{ kind: "node", nodeId: task.id, mode: "write" }];
    case "spec_review":
      return [{ kind: "node", nodeId: task.id, mode: "read" }];
    case "verify":
    case "reverify":
      return [
        { kind: "node", nodeId: task.id, mode: "read" },
        ...(task.parentTaskId
          ? [{ kind: "node" as const, nodeId: task.parentTaskId, mode: "read" as const }]
          : []),
      ];
    case "project_status_review":
      return [{ kind: "node", nodeId: "00-project", mode: "read" }];
    default:
      return [];
  }
}
```

Re-export from `packages/parser/src/index.ts`. `server/src/dispatcher/prompts/index.ts` deletes its local copy and re-exports from `@ledger/parser`; the existing `import { defaultResourceClaims } from "../prompts/index.js"` sites in `server/src/dispatcher/index.ts`'s barrel keep working without change.

The UI's `NodeInspector.tsx` then imports directly: `import { defaultResourceClaims } from "@/lib/types";` (the existing parser re-export pattern from `app/src/lib/types.ts`). No mirror, no drift, no client/server divergence test. The Open Issue from the original draft is closed at the spec-review stage.

The implementer's checklist for this migration:
1. Create `packages/parser/src/runner/defaultResourceClaims.ts` with the code above.
2. Re-export from `packages/parser/src/index.ts`.
3. Re-export from `app/src/lib/types.ts` (mirror the existing `Task`, `LogEvent`, etc. re-export pattern).
4. Delete the local `defaultResourceClaims` from `server/src/dispatcher/prompts/index.ts` and re-export from `@ledger/parser`.
5. The existing test in `server/test/dispatcher/prompts/index.test.ts` keeps working (it imports from `@ledger/server`'s barrel which transitively resolves the parser re-export).
6. Add `defaultResourceClaims` tests to `packages/parser/test/runner/defaultResourceClaims.test.ts` — one case per task type plus the `noop` / `human_review` fallthrough.

The `app/src/lib/dispatch.ts` file is NOT created. The original §Repository layout entry for it is removed.

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
    defaultClaims={defaultResourceClaims({ id: node.id, type: inferType(node.status), parentTaskId: undefined })}
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
| D3 | `defaultResourceClaims` promoted to `@ledger/parser/src/runner/`; both server and UI import directly (Spec Review S2) | Original draft proposed a client-side mirror with a drift-detection test, but the test was architecturally infeasible across the `app/` ↔ `server/` workspace boundary (`app/package.json` has no `exports` field that would let `server/` test code import from it). The cleaner v1 fix: promote the function to `@ledger/parser` where both consumers can import it. The function is a pure switch over `Task["type"]` returning `ResourceClaim[]`; all type dependencies (`Task`, `ResourceClaim`, `TaskType`) already live in the parser package. The migration is ~25 LOC + a re-export. Server's `dispatcher/prompts/index.ts` becomes a re-exporter to preserve the existing import paths from `02-runner-tools`. No mirror, no drift. |
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

- ~~**`defaultResourceClaims` is mirrored client-side rather than imported.**~~ RESOLVED at SPEC_REVIEW (S2) by promoting `defaultResourceClaims` to `@ledger/parser/src/runner/` so both server and UI import directly. No mirror, no drift-detection test required.
- ~~**`MutationErrorBody` lives in `useApproveTask.ts` as its "home".**~~ → Extracted to `app/src/lib/errors.ts` by `06-agent-dispatcher/99-maintenance/02-round-2` (2026-06-12). `useApproveTask.ts`, `useRejectTask.ts`, `useCancelTask.ts`, and `NodeInspector.tsx` all import from `@/lib/errors` now. *(Was Priority: TRIVIAL.)*
- **No 80-char truncation on operator-supplied cancel reasons.** D11 acknowledges. The existing `reasons.rejected(rationale)` and `approvedWithNote(note)` builders DO truncate; an analogous `reasons.cancelledByOperatorWithNote(note)` builder would be the natural addition. Defer until an operator actually passes a custom reason (UI doesn't today). *(Priority: TRIVIAL.)*
- **Cancel-on-noop returns 409 `no_subprocess`.** D9 acknowledges. The UI surfaces the typed error; operator decides what to do. A future UI enhancement could hide the Cancel button on tasks whose type is in a documented "synchronous executor" set, but that requires the UI to know the type taxonomy. Out of v1 scope. *(Priority: LOW.)*
- **Dispatch on a node already running a dispatched task** — second dispatch creates a new task, scheduler sees the resource-claim conflict, the second task lands BLOCKED with `blocked_by_claim_conflict`. The UI doesn't pre-empt; the operator sees the blocked state in the Tasks panel inspector. Documented behaviour, not a bug. *(Priority: TRIVIAL.)*
- ~~**SIGKILL escalation for hung cancels.** Inherited from `03`'s Open Issues. The cancellation registry would need a per-task timer; that lives in `03-claude-code-executor`'s scope, not here. Cross-reference for visibility. *(Priority: MEDIUM — surfaces when cancellation is heavily used.)*~~ → addressed by `06-agent-dispatcher/99-maintenance/01-round-1` (2026-06-12).
- ~~**`DispatchConfirmDialog` toast surface depends on whether the UI has a toast system.**~~ → Dispatch success banner upgraded to a `<Link>` navigating to `/logs/{taskId}` by `06-agent-dispatcher/99-maintenance/02-round-2` (2026-06-12). No toast library needed; the inline banner text is a clickable React Router link. *(Was Priority: LOW.)*

---

## Spec Review (2026-05-29)

Independent spec review run against this DRAFT in clean Sonnet context. Verdict: **NEEDS_MINOR_REVISIONS** — 2 Blocking, 4 Should-fix, 5 Nits, 6 Confidence notes. PRD coverage matrix Addressed across §5/§6.1/§6.2/§7/§10/§11/§14; §8.4 partially-addressed (OCC closure landed via B1 fix). All findings applied. Audit:

| # | Finding | Resolution |
|---|---------|------------|
| B1 | `store.updateTaskStatus` throws if the `from === "RUNNING"` guard fails (race window: scheduler ticks RUNNING → COMPLETE between `loadTask` and the UPDATE). Cancel handler has no try/catch, so the race throws to Hono's default error handler → opaque 500 instead of a clean 409. | Cancel handler pseudocode now wraps `updateTaskStatus` in try/catch; on throw, returns `409 wrong_status` with `actual: "raced"` to distinguish from the loadTask-time 409. Same client-side error shape, one consistent 409 path regardless of which side of the race fired first. |
| B2 | Parent §Design "Dispatch endpoint semantics" describes "single write claim on the target node" as the claim default. Actual `defaultResourceClaims` (shipped by 04) returns type-specific claims: spec_review→read, verify/reverify→read+parent, project_status_review→PRD-node read. Parent's prose is now stale; a reader trusting it expects wrong behaviour. | §Design comment after `defaultResourceClaims` call now explicitly enumerates the actual per-type claim outputs and notes the parent's simplification is superseded by 04's shipped implementation. Implementer reads this leaf's behavior, not the parent's earlier prose. |
| S1 | 409 `no_inferred_type` hint string was identical regardless of status — PLANNED, COMPLETE, IN_PROGRESS all got the same message. Confusing operator guidance. | Hint now branches on `node.status`: PLANNED → "draft the spec first"; SPEC_REVIEW → "wait for review"; IN_PROGRESS → "check Tasks panel"; COMPLETE → "no work to dispatch"; default → generic. Each actionable. |
| S2 | Client-side `clientDefaultResourceClaims` mirror with drift-detection test was architecturally infeasible: a test comparing both functions couldn't cleanly import across the `app/` ↔ `server/` workspace boundary (`app/package.json` has no exports field). | **Promoted `defaultResourceClaims` to `@ledger/parser/src/runner/defaultResourceClaims.ts`** (the function is a pure switch over `Task["type"]` returning `ResourceClaim[]`; all type deps already in the parser package). Server's `dispatcher/prompts/index.ts` re-exports from `@ledger/parser`; UI imports from `@ledger/parser` via the existing `app/src/lib/types.ts` re-export. No mirror, no drift, no cross-package test needed. Closes the related Open Issue at SPEC_REVIEW. |
| S3 | `useDispatch` `onSuccess` had no `setQueryData` for the new task — looked inconsistent with stated D12 mirror pattern. | Inline comment now explains the rationale: new task is PENDING at creation; by the time the operator navigates, the scheduler has transitioned it; seeding the cache with the PENDING snapshot would cause a "PENDING → RUNNING" flicker. `["tasks"]` list invalidation covers the in-panel watch case. |
| S4 | Parent §Design "Cancel button" uses `!task.id.includes(":")` as the runner-vs-transcript discriminant; the leaf uses `task.transcriptPath === undefined`. The two are equivalent under current ID schemes but the inconsistency could confuse the implementer. | §Requirements item 6 now explicitly notes the equivalence and explains why the `transcriptPath` form is preferred (matches the existing `TaskInspector.tsx` pattern at line 73; more semantically precise). |
| N1 | `Task` was used in the dispatch route pseudocode (`as Task` cast) but not imported. | `Task` added to the import line. |
| N2 | §Verification item 10 ("Parent moves to VERIFY") read like a verifier-checked gate, but parent status updates land at stage 10 (cross-doc sync), not as a verifier pass/fail. | Reworded to "Parent's manifest row updated to COMPLETE (v1) for this child as part of stage 10's cross-doc sync. With all 5 children COMPLETE, the parent's own Status header transitions APPROVED → VERIFY." |
| N3 | `node.authored &&` was added to the Dispatch-button visibility rule without acknowledging it as an extension beyond parent §Design "Dispatch button". | §Requirements item 5 now explicitly notes the `authored` clause as a deliberate extension (manifest-only nodes have no actionable spec to dispatch against). |
| N4 | "If no toast library, log to console for v1" was vague — `console.log` is invisible to the operator. | Picked the inline-banner pattern (consistent with existing `HitlActions` error rendering). §Requirements items 5 + 6 updated. |
| N5 | `useCancelTask` `onSuccess` comment didn't match `useApproveTask`'s comment style. | Comment rewritten to mirror `useApproveTask`'s pattern: explains the visibility-gate atomic flip + cites the D12-amended source. |

Reviewer's **Confidence notes** (recorded for stage-4 implementer):

1. **B1 verified against `store.ts` lines 325–380.** The `from` guard runs inside `db.transaction()`; mismatch throws a generic `Error` (not `OptimisticLockError`). The cancel handler's try/catch wrapping is the correct fix.
2. **B2 verified against `server/src/dispatcher/prompts/index.ts` lines 152–172** (the COMPLETE `04` output). The type-specific claim outputs directly contradict the parent's "single write claim" simplification.
3. **S2 cross-package import infeasibility confirmed**: `app/package.json` has no `exports` field that would let `server/` test code import from `app/src/lib/dispatch.ts`. The promotion-to-parser approach eliminates the problem.
4. **`defaultResourceClaims` reads `task.id`** (in addition to `type` and `parentTaskId`). The cast `{ id: nodeId, type: inferredType, parentTaskId: undefined } as Task` correctly provides all three. No runtime issue.
5. **Noop is synchronous and doesn't register a subprocess.** Confirmed against `executors.ts` lines 36–40: `noopExecutor.run` calls `handle.complete(task.id)` synchronously. By the time the operator could click Cancel, the noop task is already COMPLETE; the `RUNNING` visibility gate excludes it in practice. The `409 no_subprocess` path is a documented edge case, not a normal operator flow.
6. **Hono multiple sub-apps on same prefix verified.** `server/src/server.ts` lines 22–23 show `app.route("/api/tasks", tasksRoute)` and `app.route("/api/tasks", hitlRoute)` co-existing. D1's pattern is established.

Nothing punted; all 2 blocking + 4 should-fix + 5 nits + 6 confidence notes landed at SPEC_REVIEW.

---

## Implementation Notes

**Date:** 2026-05-29  
**Implementer:** Claude Sonnet 4.6 (worktree `agent-a8de1c2c07e93d6e9`)

### Dependencies pinned
No new deps. `defaultResourceClaims` moved from `server/src/dispatcher/prompts/index.ts` to `packages/parser/src/runner/defaultResourceClaims.ts` — no new `package.json` entries.

### Bundle delta
**`app/` post-build gzip totals:** `index-DuCb0Gs6.js` 722.66 KB gzip, `DagPanel-B-zi5WOa.js` 506.32 KB gzip. Previous baseline was not captured against main HEAD from this worktree, but added code includes: `defaultResourceClaims` (~1.5 KB), `useDispatch.ts` (~0.8 KB), `useCancelTask.ts` (~0.8 KB), `NodeInspector` additions (~1.5 KB), `TaskInspector` additions (~0.5 KB), `DispatchConfirmDialog` (~0.5 KB). Estimated net addition ~+5 KB unminified / ~+2 KB gzip — within spec's +2–4 KB estimate.

**`server/dist/` delta:** `routes/dispatch.js` (+3.1 KB), `routes/tasks.js` (cancel endpoint additions ~1.2 KB), `runner/defaultResourceClaims.js` lands in `packages/parser/dist/runner/` (+1.5 KB). Total server delta ~+5 KB.

### Confidence-note re-verifications (Spec Review 2026-05-29)

1. **B1 verified:** `store.ts` `updateTaskStatus` runs inside `db.transaction()` and throws a generic `Error` on `from` guard mismatch (verified store.ts lines 325–380). The cancel handler's try/catch correctly maps to `409 wrong_status` with `actual: "raced"`. Test `cancel.test.ts` exercises this path by mocking `updateTaskStatus` to throw.

2. **B2 verified against `server/src/dispatcher/prompts/index.ts`:** The local `defaultResourceClaims` was removed and re-exported from `@ledger/parser`. The `packages/parser/src/runner/defaultResourceClaims.ts` implements the type-specific claim outputs (`spec_review` → read, `verify/reverify` → read+parentTaskId, `project_status_review` → PRD-node read). The parent spec's "single write claim" simplification is superseded by this implementation.

3. **S2 confirmed:** `app/package.json` has no `exports` field (verified). The promotion-to-parser approach eliminates the workspace-boundary test infeasibility. `defaultResourceClaims` re-exported from both `packages/parser/src/index.ts` and `app/src/lib/types.ts`. The `server/src/dispatcher/prompts/index.ts` re-exports from `@ledger/parser`, preserving all existing import paths.

4. **Confidence note #4 confirmed:** `defaultResourceClaims` accepts `Pick<Task, "id" | "type" | "parentTaskId">` (not `Task`) — the signature was narrowed at migration time. The dispatch handler passes `{ id: nodeId, type: inferredType, parentTaskId: undefined }` which satisfies this shape without a cast. No runtime issue.

5. **Confidence note #5 confirmed:** Noop is synchronous (verified `executors.ts` lines 36–40: `noopExecutor.run` calls `handle.complete(task.id)` synchronously). By the time an operator clicks Cancel, the noop task is already COMPLETE; the `RUNNING` visibility gate excludes it in practice. The `409 no_subprocess` path is the documented edge case (D9). Cancel button test coverage includes this.

6. **Confidence note #6 confirmed:** Hono multiple sub-apps on same prefix verified in existing `server.ts` (lines 22–23 show `app.route("/api/tasks", tasksRoute)` and `app.route("/api/tasks", hitlRoute)` co-existing). D1's pattern is established and working.

### Deviations from spec

- **`defaultResourceClaims` signature narrowed to `Pick<Task, "id" | "type" | "parentTaskId">`** instead of `Task`. This is strictly more permissive than the spec's `task: Task` — callers can pass partial shapes. The spec's pseudocode used `as Task` cast; the implementation avoids the cast by narrowing the type. Zero drift in behaviour.

- **`inferType` helper function** extracted in `NodeInspector.tsx` for the `status → TaskType` mapping (same logic as `TYPE_INFERENCE` map in the dispatch route, but as a function for the UI's conditional rendering). Not mentioned in spec but follows the same D4 rationale (Partial<Record> → function equivalent for the UI side).

- **`cancelErrorBanner` extracted** as a named function in `TaskInspector.tsx` (analogous to `errorBanner` for HitlActions). This keeps the component clean and is consistent with the existing pattern.

### Gates results
- `pnpm -C packages/parser build` ✓
- `pnpm -C packages/parser test` ✓ (127 tests)
- `pnpm -C server build` ✓
- `pnpm -C server typecheck` ✓
- `pnpm -C server lint` ✓
- `pnpm -C app typecheck` ✓
- `pnpm -C app lint` ✓
- `pnpm -C app build` ✓
- `pnpm test` (workspace fan-out) ✓ (127 + 134 + 334 = 595 tests, 2 env-gated skips)

### Acceptance-check items requiring operator manual verification
The following items from §Acceptance check cannot be verified headlessly:

1. **Dispatch happy path** (item 3): Open DAG panel, select an APPROVED node (e.g., `06-agent-dispatcher/05-dispatch-api` once it's APPROVED again), click "Dispatch" → dialog shows "Task type: implement, Claims: [test-node: write]" → Confirm → banner shows "Dispatched as task …" → Tasks panel shows new task transitioning PENDING → RUNNING.

2. **Dispatch on non-authored node** (item 5): Button not rendered for manifest-only nodes (confirmed by test, but needs visual check in live UI).

3. **Cancel happy path** (item 6): Select a RUNNING dispatcher task, click "Cancel task" → button disappears, task status updates to CANCELLED.

4. **Cancel on noop task** (item 8): Click Cancel on a RUNNING noop task → 409 no_subprocess inline banner appears. (Test covers the network path; UI rendering of the banner needs visual confirmation.)

5. **DispatchConfirmDialog default claims display**: The claims list renders correctly for each task type (implement shows write, spec_review shows read, verify shows read).

6. **Success banner navigation**: After dispatch, the inline banner reads "Dispatched as task {short-id}…". A future enhancement would make this a link to the Tasks panel filtered on the task id (currently text-only per the inline-banner pattern; no toast library was established in `01-ui/01-shell`).

### Open concerns
- **No toast navigation from the dispatch success banner**: The spec §Verification item 3 says "toast `Dispatched as task <id>` with a link to Tasks panel filtered on the new id." The inline banner currently shows the truncated ID as text, not a link. This is documented in the Open Issues section ("DispatchConfirmDialog toast surface"). A future pass could add a `<Link>` inside the banner or integrate a toast library. The core dispatch flow works; this is UX polish.
- **The `MutationErrorBody` import in `NodeInspector.tsx`** is imported as a type for the error casting (`err as MutationErrorBody`). This creates a direct coupling between the DAG component and the task-hook file. D7 acknowledges this; a future `app/src/lib/errors.ts` extraction would be cleaner.

### Test counts by layer
- `packages/parser/test/runner/defaultResourceClaims.test.ts`: 14 new tests
- `server/test/dispatch.test.ts`: 10 new tests
- `server/test/cancel.test.ts`: 7 new tests
- `app/src/lib/useDispatch.test.ts`: 5 new tests
- `app/src/lib/useCancelTask.test.ts`: 6 new tests
- `app/src/components/dag/NodeInspector.test.tsx`: 12 new tests (new file)
- `app/src/components/tasks/TaskInspector.test.tsx`: 6 new tests (extensions to existing)

### Implementation Review (2026-05-29)

Independent implementation review against the rebased worktree branch (`worktree-agent-a8de1c2c07e93d6e9`) in clean Sonnet context. Verdict: **READY_FOR_COMPLETE** — all 10 gates PASS (parser build + 127 tests; server build + typecheck + lint + 334 tests + 2 env-gated skips; app typecheck + lint + build + 134 tests — **595 total**), every Spec Review (B1, B2, S1–S4, N1–N5) closure HONOURED, all 6 confidence notes CONFIRMED. No blocking, no should-fix. Two nits applied (stale spec text not updated when S2 promoted `defaultResourceClaims` to the parser at SPEC_REVIEW):

| # | Finding | Resolution |
|---|---------|------------|
| N1 | §Design §"Confirmation dialog (NodeInspector)" pseudocode sketch (line 407) still used the deleted `clientDefaultResourceClaims(node.id, inferType(node.status), node.parentId)` call shape. The actual implementation correctly uses `defaultResourceClaims({ id, type, parentTaskId: undefined })` — the sketch was a holdover from the original draft. | Sketch rewritten: `defaultClaims={defaultResourceClaims({ id: node.id, type: inferType(node.status), parentTaskId: undefined })}`. Matches the real call shape in `NodeInspector.tsx`. |
| N2 | §Verification item 8 still referenced "Drift-detection test for `defaultResourceClaims` ↔ `clientDefaultResourceClaims` passes on the canonical fixture" — but S2 eliminated `clientDefaultResourceClaims` and the drift test entirely. | Item 8 rewritten: "`defaultResourceClaims` is canonical in `@ledger/parser` (Spec Review S2 promotion); both server and UI import directly. No mirror, no drift-detection test — by construction." |

Reviewer's structural observations:

- **No surprises in scope creep.** The diff is entirely within the prescribed file set. No unexpected files; no scope creep beyond the spec.
- **CancelAction sub-component pattern.** The implementer extracted a small `CancelAction` sub-component inside `TaskInspector.tsx` (mirroring the existing `HitlActions` pattern). Documented in §Implementation Notes deviations; consistent with the file's established structure.
- **`cancelErrorBanner` handles 3 cases** (not just the one prescribed by §Requirements item 6): `no_subprocess` (per spec), `wrong_status` (defensive — race or already-completed), generic fallback. The defensive `wrong_status` handler is a bonus that surfaces the B1 race path to the operator gracefully.
- **The dispatch handler narrowed the `defaultResourceClaims` parameter** from the spec's `as Task` cast to a structural `Pick<Task, "id" | "type" | "parentTaskId">` argument. Cleaner; no cast required. Documented as a deviation in §Implementation Notes.

Confidence-note re-verifications (all 6):

1. **`store.updateTaskStatus` throws on `from`-guard mismatch.** Confirmed via `cancel.test.ts` (mocked throw → asserted 409 wrong_status with `actual: "raced"`). Try/catch in `tasks.ts:193–202`.
2. **`defaultResourceClaims` reads `id`/`type`/`parentTaskId` only.** Confirmed via the migrated function signature (`Pick<Task, ...>`).
3. **Cross-package import infeasibility eliminated by S2 promotion.** Confirmed by absence of any cross-package test files.
4. **Pick<Task, ...> dispatch-handler arg pattern is sound.** No `as Task` cast in the implementation.
5. **Noop is synchronous.** `showCancelButton` gated on `live?.task.status === "RUNNING"` — noop tasks are COMPLETE before any operator click could fire.
6. **Hono multi-route works.** `server.ts:22–24` co-mounts `tasksRoute`, `hitlRoute`, and `dispatchRoute`; all 334 server tests pass.

App bundle (estimated +2 KB gzip per the spec's projection; gzip baselines from main aren't worktree-diffable but the estimate matches). Server `dist/` delta ~+5.8 KB (`routes/dispatch.js` +3.1 KB, `routes/tasks.js` +1.2 KB, `packages/parser/dist/runner/defaultResourceClaims.js` +1.5 KB).

Nothing punted; both nits applied as documentation cleanup.

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
8. **`defaultResourceClaims` is canonical in `@ledger/parser`** (Spec Review S2 promotion); both the server's dispatch route and the UI's NodeInspector import it directly. No mirror, no drift-detection test — by construction.
9. **No regressions** on existing endpoints (`/api/_health`, `/api/project`, `/api/docs`, `/api/tasks*`, `/mcp`) or UI panels.
10. **Parent's manifest row updated** to `COMPLETE (v1)` for this child as part of stage 10's cross-doc sync. With all 5 children now COMPLETE, the parent `06-agent-dispatcher`'s own Status header transitions APPROVED → VERIFY (per leaf-workflow), and the PRD §14 + CLAUDE.md round-2 dispatcher line are synced.

---

## Children

None. This leaf has no further decomposition.
