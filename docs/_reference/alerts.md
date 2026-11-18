# Alerts — current-state reference

**Scope:** `server/src/alerts/` and `app/src` consumers of `GET /api/alerts`.
A process-local push when a task becomes `FAILED`.
**Last verified:** `350789833f56d18ec77f8d22b7062fafa91640b5` on `main`.
**Owning node:** [`08-alerts`](../08-alerts.md).
**Regenerate the module map:** `wc -l server/src/alerts/*.ts server/src/routes/alerts.ts app/src/lib/useAlertStream.ts app/src/components/layout/AlertBanner.tsx`

`Alert` is defined in `@ledger/parser` (`packages/parser/src/alerts/types.ts`)
and re-exported from `app/src/lib/types.ts`.

## 1. Module map

| File | Lines | Role |
|---|---:|---|
| `server/src/alerts/channel.ts` | 114 | `createAlertChannel`. Bus observer, ring, subscribers |
| `server/src/alerts/webhook.ts` | 42 | `postWebhook`. Fire-and-forget POST of the same `Alert` JSON |
| `server/src/routes/alerts.ts` | 88 | `GET /api/alerts`, `GET /api/alerts/stream` |
| `app/src/lib/useAlertStream.ts` | 66 | SSE hook. `Last-Event-ID` from the last seq |
| `app/src/components/layout/AlertBanner.tsx` | 59 | Banner mounted by the shell on every route |

## 2. Entry points

| Call | Effect |
|---|---|
| `createAlertChannel({ store, webhookUrl })` | `webhookUrl` is `process.env.LEDGER_ALERT_WEBHOOK`. Empty or unset skips the POST |
| `alerts.attach(runner.events)` | Subscribes via `subscribeAll`. Called in `loadProjectContext` after `recoverOrphans` |
| `alerts.evict(taskId)` | Drops the ring entry and the dedup key. `DELETE /api/tasks/:id` calls this |
| `GET /api/alerts` | `{ alerts }` — the whole ring. Resume is the stream's `Last-Event-ID`, not a query param |
| `GET /api/alerts/stream` | SSE. Replays the ring after `Last-Event-ID`, then live callbacks. Heartbeat every 15s |

The UI hook opens the stream once from the shell. The banner is the only
consumer.

## 3. Data contracts

Raised only when `loadTask` shows `status === "FAILED"` and that task id is
not already in the per-boot `alerted` set (`channel.ts`).

```ts
{
  seq: number,          // monotonic per process, also the SSE id
  taskId, taskTitle, taskType,
  kind: "task_failed",
  severity: "critical",
  reason: string,       // latest status_change→FAILED reason, or ""
  at: string            // ISO time the alert was raised, not the task's completedAt
}
```

`reason` is whatever the runner stored: `orphaned_on_restart` does not flow
through here, because attach happens after recovery. `subprocess_failed:…`,
`rejected: …`, `executor_error: …`, and the other `FAILED` reasons do.

Webhook body is that object as JSON. Failure to POST is logged and does not
affect the SSE path (`webhook.ts`).

## 4. Runtime state surfaces

| Surface | Bound | Restart |
|---|---|---|
| `seq` counter | Process | Resets to 0 |
| `alerted` set | Process. One alert per task id | Cleared. A still-`FAILED` row does not re-alert, because the observer only runs on bus events after attach |
| Ring buffer | Last 50 alerts | Cleared |
| SSE subscribers | Set of callbacks | Cleared |

Nothing is written to SQLite. Building an alert reads `loadTask` and
`getEvents` only.

## 5. Invariants

- The channel never calls `createTask`, `updateTaskStatus`, or `appendEvent`.
  [`08-alerts`](../08-alerts.md).
- A task raises at most one alert per process lifetime, until `evict`.
  Later events on the same id are ignored.
- `subscribeAll` fires on every store write the publishing wrapper emits.
  The handler returns immediately unless the row is `FAILED` and new.
- The webhook call is not awaited on the publish path.
- Ring eviction drops the oldest alert past 50. A client that reconnects
  with an older `Last-Event-ID` receives whatever is still in the ring, not
  the gap.

## 6. Active migration

`kind` and `severity` are single-value unions (`task_failed`, `critical`).
Scan findings are not alerts. Wiring external drift (dependency or CLI
changes) into this channel is the open System 4 item in
[`00-project`](../00-project.md) §11, not code in this folder.
