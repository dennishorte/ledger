# Algedonic Alert Channel

**Node ID:** `08-alerts`
**Parent:** project root (`docs/00-project.md`)
**Status:** COMPLETE (v1, 2026-06-08)
**Created:** 2026-06-07
**Last Updated:** 2026-06-08 (operator browser sign-off — VERIFY → COMPLETE)

**Dependencies:** `05-task-runner`, `01-ui/01-shell`

---

Closes the PRD §11 **"Passive algedonic channel"** issue (MEDIUM; VSM diagnosis finding 3, `docs/_investigations/vsm-diagnosis.md`). Beer's algedonic channel exists to *interrupt* the operator (S5) when something is critically wrong, short-circuiting the normal pull-based reporting. Today every failure signal is pull — the operator must be looking. This node adds the push.

## Requirements

1. **Critical-event detection.** When any task transitions to `FAILED`, the server raises an `Alert` carrying the task id, title, type, and the failure reason. `FAILED` is the v1 critical signal — it is the canonical algedonic case (a silently-failed task that may already have shipped committed work; `e2e-dispatch-findings.md` §1).
2. **Two delivery paths, both fed from the one detector** (operator chose both):
   - **Webhook** — a fire-and-forget outbound `POST` of the `Alert` JSON to a configured URL. Reaches an operator who is away from the machine (Slack/Discord/phone relay).
   - **UI banner** — an always-mounted, dismissible banner in the app shell that surfaces the alert on every route, driven by a live SSE stream. Reaches an operator who has the app open but is on another panel.
3. **Webhook config is env-first** — `LEDGER_ALERT_WEBHOOK` (matches the existing `LEDGER_PORT` / `ANTHROPIC_API_KEY` env pattern). Absent ⇒ webhook path is a no-op; the UI banner still works. No `.ledger/project.json` schema change in v1 (see D5).
4. **SSE stream with resume** — `GET /api/alerts/stream` mirrors the task log stream: `Last-Event-ID` backfill from an in-memory ring buffer, heartbeat, clean per-connection teardown. `GET /api/alerts` returns the recent buffer for a cold fetch.
5. **Report-only, like the scanner.** The channel observes and notifies; it never writes to the store, never creates or mutates tasks, never dispatches. This is the same S3\*/S4 discipline the v2 health scanner holds (`07-health-daemon`) — an alarm bell, not a command.
6. **Boot-recovery failures do not flood.** Orphan recovery at boot (`recoverOrphans`, `RUNNING → FAILED`) runs *before* the channel attaches, so a restart does not replay a burst of historical-failure alerts.

### Out of scope (v1)

- **External-environment scanning** (dependency/CLI/SDK drift) — VSM finding 1's other half. The channel is the *push* primitive; wiring genuinely-external scan targets into it is a separate, larger node. Filed as the residual under the §11 S4 issue.
- **Scan-finding alerts.** The health scanner is operator-triggered, so a HIGH finding already implies the operator is looking — pushing it adds little. The `Alert` shape is left extensible (`kind`, `severity`) so a `scan_finding` kind can be added later without a breaking change.
- **`.ledger/project.json` webhook config**, alert acknowledgement persistence, ret ry/backoff on webhook failure, multiple webhook destinations, severity routing. All v2+.
- **`AWAITING_HUMAN_REVIEW` push.** Already surfaced by the HITL inbox + topbar count (PRD §8.4); not re-pushed here.

## Design

### Data contract — `Alert` (canonical in `@ledger/parser`)

Per CLAUDE.md ("domain types live where they're authoritative"; backend runtime types canonical in `@ledger/parser/src/<domain>/types.ts`, re-exported by `app/src/lib/types.ts`):

```ts
// packages/parser/src/alerts/types.ts
export interface Alert {
  seq: number;            // monotonic per server boot — SSE id + React key + Last-Event-ID resume
  taskId: string;
  taskTitle: string;
  taskType: TaskType;
  kind: "task_failed";    // extensible discriminant (v2: "scan_finding", …)
  severity: "critical";   // extensible
  reason: string;         // failure reason from the status_change event ("" if absent)
  at: string;             // ISO 8601
}
```

### Detector — global EventBus observer (no store writes)

The runner already publishes to its `EventBus` on every status change (`withPublishing`). The bus is per-`taskId`; this node adds a **global** subscription so the channel can observe tasks it has not seen before:

```ts
// packages/parser is unaffected; server/src/runner/events.ts (additive):
export interface EventBus {
  subscribe(taskId, cb): () => void;
  subscribeAll(cb: TaskChangedCallback): () => void;   // NEW
  publish(taskId): void;                                // now also notifies global subs
  close(): void;
}
```

`createAlertChannel({ store, webhookUrl })` (`server/src/alerts/channel.ts`):
- `attach(bus)` calls `bus.subscribeAll(onTaskChanged)`.
- `onTaskChanged(taskId)`: `store.loadTask(taskId)`; if `status !== "FAILED"` or already alerted (dedup `Set<TaskId>`), return. Otherwise mark alerted, read the latest `status_change`→`FAILED` reason from `store.getEvents`, build the `Alert` (monotonic `seq`), push to a bounded ring buffer (cap 50), notify SSE subscribers, and fire the webhook if configured. **No store write occurs on this path.**
- `subscribe(cb)` / `getRecent(afterSeq)` serve the SSE route.

`postWebhook(url, alert)` (`server/src/alerts/webhook.ts`): `fetch` `POST` with `AbortController` 5 s timeout; any failure is `console.warn`-logged, never thrown — webhook delivery must not perturb the scheduler.

### Wiring (`server/src/context.ts`)

`ProjectContext.alerts: AlertChannel`. Created *after* `createRunnerForProject` (so orphan-recovery FAILEDs predate the attach, satisfying Req 6) and attached to `runner.events`. `webhookUrl = process.env.LEDGER_ALERT_WEBHOOK`.

### Routes (`server/src/routes/alerts.ts`, mounted `/api/alerts`)

- `GET /api/alerts` → `{ alerts: getRecent() }`.
- `GET /api/alerts/stream` → SSE: parse `Last-Event-ID`, backfill `getRecent(afterSeq)`, subscribe live, 15 s heartbeat, teardown on abort. No auto-close (the alert stream is app-lifetime, unlike per-task streams).

### UI

- `app/src/lib/useAlertStream.ts` — `EventSource('/api/alerts/stream')`; maintains an alert list (seq-deduped) + a dismissed-seq `Set`; exposes `{ active, dismiss }`.
- `app/src/components/layout/AlertBanner.tsx` — fixed banner stack rendered for each non-dismissed alert, `--color-danger-soft` background, task title + reason + a link to the task, a dismiss control. Mounted in `AppShell` so it shows on every route.

### Manual acceptance check

1. Boot server + UI. Inject a task that fails (or cancel a running dispatch to force FAILED via a fake executor); confirm the banner appears on whatever route is open, with the reason.
2. Dismiss it; confirm it stays dismissed and does not reappear on navigation.
3. Set `LEDGER_ALERT_WEBHOOK` to a request-bin URL; fail a task; confirm the POST arrives with the `Alert` JSON.
4. With no webhook configured, confirm a failure still banners and logs no webhook error.
5. Reload the page mid-session; confirm recent alerts backfill from `GET /api/alerts`.
6. Restart the server with a FAILED task already in the store; confirm no alert fires for the pre-existing failure (Req 6).

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Detector is a **global EventBus observer**, not a store decorator | The bus is the runner's designed pub/sub point and already fires on every status change. `subscribeAll` is a small additive primitive; a `withAlerting` store decorator would mean threading the channel into `createRunnerForProject` before config is known. Observer keeps the runner construction untouched and the channel created late (with config + store). |
| D2 | `FAILED`-only trigger in v1 | The canonical algedonic case. `kind`/`severity` keep the shape extensible for `scan_finding` / other criticals without a breaking change. |
| D3 | **Report-only** — no store writes, no task creation | Holds the same line the v2 scanner holds (`07-health-daemon`, VSM finding 2): the audit/alarm channel observes; it never commands. The v1 health daemon's fatal mistake was an observer with write authority. |
| D4 | Webhook is **fire-and-forget with timeout**, failures swallowed | Delivery must never block or fail the scheduler tick. An undelivered alert is logged; the UI banner remains the reliable in-session path. |
| D5 | Webhook config is **env-var only** in v1 | Avoids a `.ledger/project.json` schema-version bump (`03-project-metadata` validates strictly). Matches `LEDGER_PORT`. project.json config is a documented v2 follow-up. |
| D6 | `Alert` canonical in `@ledger/parser`, re-exported by app | Same rule Task/LogEvent follow (CLAUDE.md). The SSE payload crosses to the UI; one source of truth. |
| D7 | Dedup via in-memory `Set<TaskId>` + bounded ring buffer (cap 50) | A task fires exactly one alert no matter how many subsequent events it emits. Both structures are per-boot and unbounded-set growth is a noted LOW follow-up (taskIds only; thousands are trivial). |

## Open Issues

- **Webhook has no retry/backoff or delivery confirmation.** A transient network failure drops the alert silently (logged only). v2: bounded retry + a delivery-status surface. *(Priority: LOW)*
- **Dedup `Set<TaskId>` grows unbounded over a long server run.** Only taskId strings; negligible at v1 scale. Bound it (LRU) when alert volume justifies. *(Priority: LOW)*
- **No `.ledger/project.json` webhook config.** Env-var-only is a v1 simplification (D5). *(Priority: LOW)*
- **Ring eviction silently drops resume backfill beyond 50 alerts.** A `Last-Event-ID` resume after >50 alerts since the referenced seq returns only what survives in the ring (review N2). Matches the bounded-ring design (D7); acceptable for v1. *(Priority: TRIVIAL)*

## Implementation Notes

**Shipped 2026-06-07.** Files: `packages/parser/src/alerts/types.ts` (`Alert`, exported via `index.ts`); `server/src/runner/events.ts` (additive `subscribeAll` on the COMPLETE-node EventBus — per-task `subscribe` unchanged); `server/src/alerts/channel.ts` (global observer, dedup `Set`, ring cap 50, report-only — store typed `Pick<Store, "loadTask" | "getEvents">` so writes are structurally impossible); `server/src/alerts/webhook.ts` (fire-and-forget `fetch` POST, 5 s `AbortController`, failures swallowed); `server/src/routes/alerts.ts` (`GET /api/alerts` + `/stream` SSE with idempotent re-entrant flush) mounted in `server.ts`; `context.ts` wires `ctx.alerts`, created + attached **after** `createRunnerForProject` (Req 6). UI: `app/src/lib/useAlertStream.ts`, `app/src/components/layout/AlertBanner.tsx` mounted in `AppShell`, `Alert` re-exported from `app/src/lib/types.ts`.

Tests: `server/test/alerts/channel.test.ts` (10 — detection, dedup, reason extraction, `getRecent` resume, monotonic seq, Req-6 no-boot-flood, webhook delivery/skip/failure-swallow), `server/test/alerts/routes.test.ts` (6 — recent fetch, SSE content-type, backfill, `Last-Event-ID` skip, live delivery), `server/test/runner/events.test.ts` (+5 `subscribeAll`). Gates green: parser build, server build/typecheck/lint, app typecheck/lint/build, full `pnpm test` (parser 127, app 168, server 401/2-skip). App bundle: banner adds a small component to the always-loaded `index` chunk; DAG chunk unaffected.

### Implementation Review (2026-06-07)

Independent clean-context reviewer (per `docs/_process/verification-signoff.md`). **Verdict: READY_WITH_FOLLOWUPS.** Sign-off matrix: all Requirements R1–R6 PASS and all Decisions D1–D7 PASS, each evidence-cited; acceptance A1/A2/A5 are operator-gated (N/A headless), A3/A6 PARTIAL (unit-covered, live walk pending). No Blocking findings — the reviewer traced the SSE flush re-entrancy and confirmed no drop/duplicate/strand. Findings applied this pass:

| # | Finding | Resolution |
|---|---------|------------|
| F1 | `/api/alerts/stream` had no route-level test | Added `server/test/alerts/routes.test.ts` (backfill, Last-Event-ID, live delivery). |
| F2 | Req 6 (no boot-flood) rested on wiring order with no regression test | Added the "publish predates attach → no alert" case to `channel.test.ts`. |
| F3 | §11 issue not struck; §14 manifest missing `08-alerts`; stale Implementation Notes | Closed in this commit (§11 strike, §14 row, these notes). |
| N3 | `import "./../runner/types.js"` odd styling | Fixed to `"../runner/types.js"`. |
| N2 | Ring eviction drops resume beyond 50 | Recorded as a TRIVIAL Open Issue (above). |
| N1 | Banner `fixed top-2 z-50` may overlap topbar HITL count | Deferred to the operator browser walk (A1). |
| N4 | No UI test for `useAlertStream` | Deferred — consistent with the repo's light UI-hook coverage. |

Remaining for COMPLETE: operator walks acceptance checks 1–6 in the browser (the banner path needs human eyes), then VERIFY → COMPLETE.

### Live verification + operator sign-off (2026-06-08)

VERIFY → COMPLETE. A controlled live run reproduced the canonical algedonic case end-to-end: a bogus-`ANTHROPIC_API_KEY` API server (dist binary, no `.env` load — guarantees auth failure, no real agent run) plus the operator's running UI. Injecting a `verify` task drove `RUNNING → FAILED` (`subprocess_failed:` carrying claude's auth-init error) in ~1 s; the report-only observer raised the `Alert` (`GET /api/alerts` seq 0), and it surfaced both directly and through the Vite proxy (`4179 → 4180`). **Operator confirmed the banner renders correctly on-route** (acceptance check 1). Checks 2–3 (View-log link, dismiss-persistence) are present UI affordances; 5 (backfill) confirmed via the proxy fetch; 4 (no-webhook-error) and 6 (no boot-flood) are covered by the channel unit tests + the Req-6 regression test. The webhook delivery path (acceptance 3 proper, with `LEDGER_ALERT_WEBHOOK` set) remains exercised at the unit level only — deferred to first real use.

## Verification

Before COMPLETE the verifier confirms: the `Alert` type is canonical in `@ledger/parser` and re-exported; `subscribeAll` is additive and the existing per-task EventBus tests still pass; the channel performs **no** store writes (grep the module — only reads); webhook failures are caught; orphan-recovery failures do not alert (Req 6); all workspace gates green (parser build, server build/typecheck/lint, app typecheck/lint/build, `pnpm test`); and the operator walks the six acceptance checks in the browser (the banner path needs human eyes).

## Children

None.
