# E2E Testing — Playwright browser-driven acceptance suite

**Node ID:** `10-e2e-testing`  
**Parent:** `00-project`  
**Status:** SPEC_REVIEW  
**Created:** 2026-06-09  
**Last Updated:** 2026-06-09  
**Dependencies:** `04-api-server`, `01-ui`

---

## Requirements

### In scope

- R1: A Playwright workspace package (`e2e/`) wired into `pnpm test` fanout.
- R2: `webServer` config boots both the Vite dev server (`:4179`) and the Hono API server (`:4180`) before the suite runs; suite tears both down on exit.
- R3: Acceptance tests for every COMPLETE UI panel: DAG view, Docs viewer, Tasks panel, Logs panel, Health panel, Alerts banner.
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
  package.json            ← name: @ledger/e2e; devDeps: @playwright/test
  playwright.config.ts    ← webServer[], testDir, reporter, projects
  tests/
    dag.spec.ts           ← DAG panel: renders nodes, inspector opens, dispatch button gated correctly
    docs.spec.ts          ← Docs panel: node list, markdown body renders, doc link navigation
    tasks.spec.ts         ← Tasks panel: list renders; approve/reject a HITL task; cancel a RUNNING task
    logs.spec.ts          ← Logs panel: log stream renders events; reasoning body renders markdown
    health.spec.ts        ← Health panel: scan trigger, findings appear, badge counts correct
    alerts.spec.ts        ← Alert banner: appears on RUNNING→FAILED; dismisses; re-appears on next failure
  fixtures/
    index.ts              ← shared Page fixtures, test helpers (e.g. waitForTaskStatus, dispatchNode)
  test-results/           ← gitignored; HTML report + traces land here
```

### `webServer` configuration

Playwright's `webServer` array accepts multiple entries. Each entry waits for its URL to return HTTP 200 before the suite starts.

```
webServer: [
  {
    command: 'pnpm -C server dev /path/to/ledger',
    url: 'http://127.0.0.1:4180/api/_health',
    reuseExistingServer: !process.env.CI,
  },
  {
    command: 'pnpm -C app dev',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: !process.env.CI,
  },
]
```

`reuseExistingServer: !process.env.CI` means a locally running stack is reused (fast iteration); in CI both servers are always started fresh.

The project path for the server is resolved at config-load time from `__dirname` — no hardcoded user paths.

### Test strategy

**Panel smoke tests (DAG, Docs, Logs, Health):** navigate to the route, assert the landmark heading/region is visible, assert at least one data item renders. These are fast, low-maintenance, and catch regressions where a panel crashes on mount.

**Interaction flows (Tasks, Alerts):** need a running server with a real SQLite DB. Tests use the operator-injection endpoint (`POST /api/tasks`) to seed tasks deterministically rather than dispatching real claude subprocesses — this keeps the suite self-contained and fast.

**Fixtures:** `waitForTaskStatus(page, taskId, status)` polls `GET /api/tasks/:id` until the status matches or times out. `dispatchNode(page, nodeId)` clicks the Dispatch button in the DAG inspector and confirms the dialog.

### Data isolation

Each test file that seeds tasks calls `POST /api/tasks` with a unique `payload.label` and cleans up with `DELETE /api/tasks/:id` in `afterEach` — or, if the runner gains a test-reset endpoint, uses that. V1 accepts residual test tasks in the DB across runs (they're visible in the UI but don't break tests); a `--reset-db` flag is a follow-up.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Playwright, not Cypress | TypeScript-native; `webServer` config handles multi-process stack startup; `page.waitForSelector` and Locator API are cleaner for SSE-heavy panels (tasks/logs). Cypress's network-interception model is complex for streaming responses. |
| D2 | New workspace package `e2e/` | Keeps E2E deps isolated from `app/` and `server/`; follows the existing workspace pattern. Avoids polluting `app/package.json` with Playwright's binary downloads. |
| D3 | `reuseExistingServer` on locally | Prevents double-booting the stack when the developer already has both processes running. The `.claude/scripts/wait-ready` script becomes redundant for this flow. |
| D4 | Seed via `POST /api/tasks` operator-injection, not real dispatch | Real dispatch requires a valid `ANTHROPIC_API_KEY` and spawns claude subprocesses — not appropriate for a self-contained test suite. The operator-injection endpoint is already a first-class API surface (`05-task-runner/04-api-endpoints`). |
| D5 | Test results gitignored | HTML reports and traces are large and change every run. Only the test source is versioned. |
| D6 | `fixtures/index.ts` for shared helpers | Avoids copy-pasting `page.waitForSelector` patterns across spec files; keeps spec files at the interaction level, not the plumbing level. |

---

## Open Issues

- **LOW:** Data isolation across test runs is imperfect in v1 — seeded tasks accumulate in `.ledger/runner.db`. A `DELETE /api/tasks/test-*` housekeeping route or a separate test DB path would clean this up. Deferred until it causes a real problem.
- **LOW:** `webServer` project path is resolved from `__dirname` at config time — if the repo is moved, it still resolves correctly, but the path computation needs a test. Acceptable for v1.

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

Before promoting to COMPLETE, the verifier confirms:

1. `pnpm test` in the repo root fans out to `e2e/` and all tests pass.
2. Each spec file exercises the panel or flow named in R3/R4.
3. Killing the dev servers and re-running boots both processes automatically via `webServer`.
4. A deliberately broken assertion exits non-zero and shows a clear failure message.
5. `e2e/test-results/` is populated with the HTML report and a trace on failure.
6. `pnpm -C app typecheck` still passes (no type regressions from shared fixtures).

---

## Children

None.
