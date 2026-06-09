# E2E Testing — Playwright browser-driven acceptance suite

**Node ID:** `10-e2e-testing`  
**Parent:** `00-project`  
**Status:** APPROVED  
**Created:** 2026-06-09  
**Last Updated:** 2026-06-09  
**Dependencies:** `04-api-server`, `01-ui`

---

## Requirements

### In scope

- R1: A Playwright workspace package (`e2e/`) wired into `pnpm test` fanout via an `e2e/package.json` `test` script (`playwright test`). Prereq: `pnpm -C packages/parser build` must run before booting the server (same requirement as all other workspace packages).
- R2: `webServer` config boots both the Vite dev server (`:4179`) and the Hono API server (`:4180`) before the suite runs; suite tears both down on exit.
- R3: Acceptance tests for every COMPLETE UI panel: DAG view, Docs viewer, Tasks panel, Logs panel, Health panel, Alerts banner, Workflow-progress (embedded in DAG NodeInspector). The `10-orchestration` data layer is covered implicitly by testing the Tasks and Logs panels it feeds; no dedicated spec file needed.
- R4: Tests for the primary interaction flows: dispatch a node, approve/reject a HITL task, trigger a health scan and verify findings render, verify the alert banner appears on `RUNNING→FAILED`.
- R5: Tests run headless by default; `--headed` flag available for local debugging.
- R6: A failing test exits non-zero and blocks `pnpm test`; a passing suite exits 0.
- R7: Test results (HTML report, traces on failure) written to `e2e/test-results/` (gitignored).

### Out of scope (v1)

- CI pipeline integration — no GitHub Actions workflow in v1; that is a separate concern.
- Visual / screenshot regression testing — pixel-diff tools are a distinct scope with their own maintenance burden.
- Performance / load testing.
- Mobile viewport coverage.
- Authenticated multi-user scenarios (framework has a single operator model in v1).

---

## Design

### Workspace layout

```
e2e/
  package.json            ← name: @ledger/e2e; devDeps: @playwright/test; scripts.test: "playwright test"
  playwright.config.ts    ← webServer[], testDir, reporter, projects
  tests/
    dag.spec.ts           ← DAG panel: renders nodes, inspector opens, dispatch button gated correctly; workflow-progress widget visible in inspector
    docs.spec.ts          ← Docs panel: node list, markdown body renders, doc link navigation
    tasks.spec.ts         ← Tasks panel: list renders; approve/reject a HITL task; cancel a RUNNING task
    logs.spec.ts          ← Logs panel: log stream renders events; reasoning body renders markdown
    health.spec.ts        ← Health panel: scan trigger, findings appear, badge counts correct
    alerts.spec.ts        ← Alert banner: appears on RUNNING→FAILED; dismisses; re-appears on next failure
  fixtures/
    index.ts              ← shared Page fixtures, test helpers (waitForTaskStatus, dispatchNode, seedTask)
  test-results/           ← gitignored; HTML report + traces land here
```

### `webServer` configuration

Playwright's `webServer` array accepts multiple entries. Each entry waits for its URL to return HTTP 200 before the suite starts.

```ts
import path from 'path'

const projectRoot = path.resolve(__dirname, '..')

webServer: [
  {
    command: `pnpm -C server dev ${projectRoot}`,
    url: 'http://127.0.0.1:4180/api/_health',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'pipe',
  },
  {
    command: 'pnpm -C app dev',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'pipe',
  },
]
```

`reuseExistingServer: !process.env.CI` means a locally running stack is reused (fast iteration); in CI both servers are always started fresh. `stdout: 'pipe'` suppresses server log noise from the test runner output. `timeout: 30_000` is explicit — the server can take 10–15 s on a cold TypeScript compile.

The project root is `path.resolve(__dirname, '..')` — `__dirname` is the `e2e/` directory, so `..` is the repo root. No hardcoded absolute paths.

### Test strategy

**Panel smoke tests (DAG, Docs, Logs, Health):** navigate to the route, assert the landmark heading/region is visible, assert at least one data item renders. These are fast, low-maintenance, and catch regressions where a panel crashes on mount.

**Interaction flows (Tasks, Alerts):** need a running server with a real SQLite DB. Tests use the operator-injection endpoint (`POST /api/tasks`) to seed tasks deterministically rather than dispatching real claude subprocesses — this keeps the suite self-contained and fast.

**HITL flow (tasks.spec.ts):** `POST /api/tasks` creates tasks at `PENDING`. Reaching `AWAITING_HUMAN_REVIEW` requires the scheduler to pick up a `human_review`-type task and call `awaitHumanReview()` on it. The test flow is:
1. `seedTask({ type: 'human_review', ... })` — POST to `/api/tasks`, returns `{ id }`.
2. `waitForTaskStatus(id, 'AWAITING_HUMAN_REVIEW')` — polls `GET /api/tasks/:id` in a loop until the status matches or the timeout (default 10 s) expires. The scheduler tick runs on a short interval (100 ms in dev); the task will advance within one tick cycle.
3. Click the Approve or Reject button in the TaskInspector and assert the resulting status.

This relies on the live scheduler running inside the server process, which is guaranteed by the `webServer` boot.

**Fixtures:** `waitForTaskStatus(page, taskId, status)` polls `GET /api/tasks/:id` until the status matches or times out. `dispatchNode(page, nodeId)` clicks the Dispatch button in the DAG inspector and confirms the dialog. `seedTask(input)` calls `POST /api/tasks` and returns the created task object.

### Data isolation

V1 accepts residual test tasks in the DB across runs — seeded tasks accumulate in `.ledger/runner.db` but do not break tests since each test uses a unique `payload.label` for identification. There is no `DELETE /api/tasks/:id` endpoint in v1; cleanup is deferred. A `--reset-db` flag or test-only DB path is a follow-up open issue.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Playwright, not Cypress | TypeScript-native; `webServer` config handles multi-process stack startup; `page.waitForSelector` and Locator API are cleaner for SSE-heavy panels (tasks/logs). Cypress's network-interception model is complex for streaming responses. |
| D2 | New workspace package `e2e/` | Keeps E2E deps isolated from `app/` and `server/`; follows the existing workspace pattern. Avoids polluting `app/package.json` with Playwright's binary downloads. |
| D3 | `reuseExistingServer` locally | Prevents double-booting the stack when the developer already has both processes running. The `.claude/scripts/wait-ready` script becomes redundant for this flow. |
| D4 | Seed via `POST /api/tasks` operator-injection, not real dispatch | Real dispatch requires a valid `ANTHROPIC_API_KEY` and spawns claude subprocesses — not appropriate for a self-contained test suite. The operator-injection endpoint is a first-class API surface (`05-task-runner/04-api-endpoints`). Tasks land at `PENDING` and advance via the live scheduler; `waitForTaskStatus` bridges the async gap for HITL flows. |
| D5 | Test results gitignored | HTML reports and traces are large and change every run. Only the test source is versioned. |
| D6 | `fixtures/index.ts` for shared helpers | Avoids copy-pasting `page.waitForSelector` patterns across spec files; keeps spec files at the interaction level, not the plumbing level. |

---

## Open Issues

- **LOW:** Data isolation across test runs is imperfect in v1 — seeded tasks accumulate in `.ledger/runner.db`. A test-only DB path or a `DELETE /api/tasks/test-*` housekeeping route would clean this up. Deferred until it causes a real problem.

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

Before promoting to COMPLETE, the verifier confirms:

1. `pnpm test` in the repo root fans out to `e2e/` and all tests pass.
2. Each spec file exercises the panel or flow named in R3/R4, including the workflow-progress widget in `dag.spec.ts`.
3. Killing the dev servers and re-running boots both processes automatically via `webServer`.
4. A deliberately broken assertion exits non-zero and shows a clear failure message.
5. `e2e/test-results/` is populated with the HTML report and a trace on failure.
6. `pnpm -C e2e typecheck` and `pnpm -C app typecheck` both pass (no type regressions from shared fixtures).

---

## Children

None. Single responsibility (E2E test infrastructure + initial panel/flow coverage), single implementer, bounded scope — leaf per §6.6.
