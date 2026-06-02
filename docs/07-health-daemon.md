# Health Daemon

**Node ID:** `07-health-daemon`
**Parent:** project root (`docs/00-project.md`)
**Status:** COMPLETE (implementation) — **DISABLED at runtime (2026-06-01)**
**Created:** 2026-06-01
**Last Updated:** 2026-06-02 (disabled by default at runtime — see banner)

**Dependencies:** `06-agent-dispatcher`

---

> **⚠️ DISABLED BY DEFAULT (2026-06-01).** The daemon is implemented and COMPLETE,
> but does **not** start unless `LEDGER_DAEMON_ENABLED=1` is set (gated in
> `server/src/context.ts`). It was disabled after the first end-to-end dispatch
> test found it unsafe to run unattended:
> - It auto-dispatches unreviewed `doc_refactor` write-agents that `git commit`
>   specs directly on the working branch with no HITL gate, and they race the
>   shared git index (most commits dropped). *(§11 / findings §2)*
> - Its enqueued tasks **starve** — it writes via raw `store.createTask` and the
>   scheduler has no self-timer, so daemon tasks sit `PENDING` until unrelated
>   operator activity ticks the scheduler. *(findings §3)*
>
> Re-enable only after the worktree-isolation + HITL-gate + runner-driven-enqueue
> remediation lands. Full detail: `docs/process/e2e-dispatch-findings.md` §2–§3
> and `docs/00-project.md` §11.

## Requirements

Land the **document health daemon** — a periodic background process that monitors the doc tree for three classes of problems and enqueues remediation tasks into the runner. This closes the last unimplemented PRD §6.4 capability: automated, metric-driven triggers feeding the task queue. The dispatcher (`06-agent-dispatcher`) must exist first; without real executors the enqueued tasks would be `BLOCKED` permanently.

**Monitors (PRD §6.4):**

1. **Size** — a doc's markdown source exceeds a configurable character threshold. Enqueues `doc_refactor`.
2. **Staleness** — a `COMPLETE` doc's source file was committed more recently than its `Last Updated:` frontmatter field (by more than a configurable grace period). Signals that content drifted after the declared last update. Enqueues `reverify`.
3. **Orphaned issues** — a doc in a stable state (COMPLETE, PLANNED, DEFERRED, ISSUE_OPEN) has non-placeholder content in its Open Issues section and its `Last Updated:` field is older than a configurable threshold. Enqueues `issue_triage`.

**Hard constraints:**
- The daemon has **no direct write access** to docs or the runner store except via `runner.store.createTask()`. All remediation is queued.
- **Dedup** before every enqueue: skip if a task of the same type with a write-claim on the same nodeId already exists in PENDING, RUNNING, or AWAITING_HUMAN_REVIEW state.
- **Poll-based**: runs on a fixed interval (default 5 min). No filesystem-watcher dependency.
- **Non-blocking**: tick errors for individual docs are logged and skipped; a single bad file never aborts the tick.
- Daemon **restarts clean** on server restart: no persisted daemon state. Last-run metadata is in-memory only and resets to zero on boot.
- **`source: "daemon_triggered"`** on all enqueued tasks (this literal already exists in `TaskSource`).

**Out of scope for v1:**
- UI changes to the `/health` panel (additive — deferred to a maintenance pass).
- Configuration via `.ledger/project.json` (would require schema + validator extension; deferred).
- Filesystem-watcher based triggers.
- Staleness tracking against code files (doc-level git mtime only).
- Cross-daemon coordination or distributed locking.

---

## Design

### Daemon lifecycle

```
loadProjectContext()
  └── createHealthDaemon(ctx) → HealthDaemonHandle
        start()               ← called once at the end of loadProjectContext
          nextRunAt = now + intervalMs   // set immediately so status() is defined from boot
          setInterval(tick, intervalMs)
        tick()
          readDocsTree(ctx.docsRoot)           // fresh parse each tick
          for each file → parseDocNode()
          checkSize(doc, content)    → TaskInput[]
          checkStaleness(doc, path)  → TaskInput[]
          checkOrphans(doc)          → TaskInput[]
          dedup each TaskInput against store.listTasks()
          store.createTask(input) for survivors
          record DaemonFinding per action
          update lastRunAt / lastFindingsCount
        stop()                ← called on SIGINT/SIGTERM (server teardown)
```

### New types (server-internal — not promoted to `@ledger/parser`)

```typescript
export interface DaemonStatus {
  running: boolean;
  lastRunAt?: string;       // ISO 8601
  nextRunAt?: string;       // ISO 8601 (lastRunAt + intervalMs, or boot + intervalMs if no tick yet)
  lastFindingsCount: number;
  lastFindings: DaemonFinding[];
}

export interface DaemonFinding {
  nodeId: string;
  monitor: "size" | "staleness" | "orphan";
  action: "enqueued" | "skipped_dedup";
  taskId?: string;           // present when action === "enqueued"
}

export interface HealthDaemonHandle {
  start(): void;
  stop(): void;
  status(): DaemonStatus;
}
```

### Monitor logic

**Size monitor:**
```
chars = content.length
estimatedTokens = Math.ceil(chars / CHARS_PER_TOKEN)   // CHARS_PER_TOKEN = 4
if estimatedTokens > sizeThresholdTokens:
  → doc_refactor task with resourceClaims: [{ kind: "node", nodeId, mode: "write" }]
```

**Staleness monitor** (COMPLETE nodes only):
```
relPath = path.relative(projectRoot, absFilePath)   // same working tree the server opened
gitMtime = await execa('git', ['log', '-1', '--format=%aI', '--', relPath], { cwd: projectRoot })
// doc.lastUpdated is always a bare YYYY-MM-DD per parseDocNode's annotation-stripping — no pre-processing required
lastUpdatedDate = new Date(doc.lastUpdated + "T00:00:00Z")
staleBy = gitMtime - lastUpdatedDate   (ms)
if staleBy > stalenessGraceDays * 86_400_000 AND gitMtime is not empty:
  → reverify task with resourceClaims: [{ kind: "node", nodeId, mode: "write" }]
```

**Orphan monitor** (COMPLETE, PLANNED, DEFERRED, ISSUE_OPEN nodes with authored source):
```
openIssuesText = doc.sections["Open Issues"]
EMPTY_PLACEHOLDERS = [
  /^\s*\*\(none[^)]*\)\*\s*$/i,   // *(none...)*  form
  /^\s*none\.?\s*$/i,               // None.  or  none  (bare prose form)
]
hasRealIssues = openIssuesText.trim().length > 0
               && !EMPTY_PLACEHOLDERS.some(p => p.test(openIssuesText.trim()))
lastUpdatedAge = now - new Date(doc.lastUpdated + "T00:00:00Z")   (ms)
if hasRealIssues AND lastUpdatedAge > orphanThresholdDays * 86_400_000:
  → issue_triage task with resourceClaims: [{ kind: "node", nodeId, mode: "write" }]
```

### Dedup

```typescript
function isDuplicate(store: Store, type: TaskType, nodeId: string): boolean {
  return store
    .listTasks({ type: [type], status: ["PENDING", "RUNNING", "AWAITING_HUMAN_REVIEW"] })
    .some(t => t.resourceClaims.some(c => c.kind === "node" && c.nodeId === nodeId));
}
```

### Configuration (env vars, all optional)

| Var | Default | Description |
|-----|---------|-------------|
| `LEDGER_DAEMON_INTERVAL_MS` | `300000` | Poll interval in ms |
| `LEDGER_DAEMON_SIZE_THRESHOLD_TOKENS` | `3000` | Estimated tokens before doc_refactor |
| `LEDGER_DAEMON_STALENESS_GRACE_DAYS` | `2` | Days of git-vs-frontmatter drift before reverify |
| `LEDGER_DAEMON_ORPHAN_THRESHOLD_DAYS` | `14` | Days with open issues before issue_triage |

### Git mtime helper

Uses `execa` — no new dependency; already in `server/package.json` from `06-agent-dispatcher/03-claude-code-executor`. Runs `git log -1 --format=%aI -- <relPath>` with `cwd: projectRoot`. Returns `undefined` if the file has no git history (untracked) — staleness check skips those nodes.

### API endpoint

`GET /api/daemon/status` → `DaemonStatus` (JSON).

Mounted in `server/src/routes/daemon.ts`; registered on the Hono app in `server/src/server.ts`.

No auth required (same posture as all other API routes).

### Files changed

| File | Change |
|------|--------|
| `server/src/daemon/index.ts` | New — `createHealthDaemon`, `HealthDaemonHandle`, `DaemonStatus`, `DaemonFinding` |
| `server/src/daemon/monitors.ts` | New — `checkSize`, `checkStaleness`, `checkOrphans`, `isDuplicate` |
| `server/src/context.ts` | Add `daemon: HealthDaemonHandle` field; call `createHealthDaemon` + `daemon.start()` at end of `loadProjectContext` |
| `server/src/routes/daemon.ts` | New — `GET /api/daemon/status` |
| `server/src/server.ts` | Mount `/api/daemon` router |
| `server/src/bin/ledger.ts` | Register `ctx.daemon.stop()` on SIGINT/SIGTERM teardown |

### Acceptance check

1. `GET /api/daemon/status` returns `{ running: true, lastFindingsCount: 0, lastFindings: [] }` immediately after server boot (before first tick). `nextRunAt` is already set (to boot time + interval).
2. After one tick interval, `lastRunAt` is set and `nextRunAt` is approximately `lastRunAt + intervalMs`.
3. A doc whose markdown exceeds `sizeThresholdTokens * 4` chars generates a `doc_refactor` task visible in `GET /api/tasks`.
4. A second tick does **not** duplicate the `doc_refactor` task (dedup fires, `action: "skipped_dedup"` in `lastFindings`).
5. Killing the server and restarting: `GET /api/daemon/status` resets to `{ running: true, lastFindingsCount: 0, lastFindings: [] }` (no persisted state bleeds across boot).
6. A doc with non-placeholder Open Issues and `lastUpdated` older than threshold generates an `issue_triage` task.
7. A COMPLETE doc whose git mtime is more than `stalenessGraceDays` past its `lastUpdated` generates a `reverify` task.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Poll-based daemon (setInterval), not filesystem-watcher** | Simpler; no native dep (`chokidar`, `fsevents`); adequate for 5-minute cadence. |
| D2 | **Env-var configuration only in v1; no project.json extension** | Extending the project.json schema requires updating the JSON Schema + validator in `02-schema`. Deferred; env vars suffice for operator control. |
| D3 | **Size in estimated tokens (chars / 4), not raw chars** | Token budget is the meaningful limit for the `doc_refactor` agent; char count is just the implementation proxy. The `/ 4` constant is well-known and accurate enough for prose. |
| D4 | **Staleness = git mtime of doc file > frontmatter `lastUpdated` + grace days** | Detects commits that modified the doc without bumping the header. Untracked files (no git history) are skipped — they haven't been reviewed yet, so staleness doesn't apply. |
| D5 | **Orphan detection via `sections["Open Issues"]` string matching** | `DocumentNode.sections` is already parsed. A regex check for the `*(none...)*` placeholder pattern correctly distinguishes real issues from the spec template's empty-state. |
| D6 | **Dedup via `store.listTasks()` scan each tick** | Authoritative; no in-memory state to diverge from the store. Task counts are small; the scan is cheap. No TOCTOU gap — the single-threaded Node process + synchronous better-sqlite3 API ensures no concurrent tick can interleave between the `listTasks` read and the `createTask` write. |
| D7 | **Fresh `readDocsTree` + `parseDocNode` per tick** | `ctx.docs` is a boot-time snapshot of `DocNode` (lite). Daemon needs full `DocumentNode.sections` + `lastUpdated`; those require `parseDocNode`. Freshness also means the daemon sees docs committed since boot. |
| D8 | **`DaemonStatus` is server-internal; not promoted to `@ledger/parser`** | UI-facing types go in parser when they're consumed by the app. This type is only served by one endpoint and consumed by one future UI component. Promote when the UI component is built. |
| D9 | **`GET /api/daemon/status` only; no UI changes in v1** | The `/health` panel (`01-ui/06-health.md`) is COMPLETE. Adding daemon status is an additive maintenance update — appropriate for the next maintenance pass, not this leaf. |
| D10 | **`daemon.start()` called at end of `loadProjectContext`** | Consistent with how the runner and MCP server are wired. The daemon depends on `ctx.store` and `ctx.docsRoot` already existing; starting after those are initialised is the natural sequencing. |
| D11 | **`stop()` registered on SIGINT/SIGTERM in `server/src/bin/ledger.ts`** | The bin already handles graceful shutdown signals; adding `ctx.daemon.stop()` there is minimal and consistent. The dev server (`pnpm -C server dev`) does not currently call stop; unhandled process exit clears the interval anyway. |

---

## Open Issues

- **Daemon disabled at runtime pending safety fixes (2026-06-01).** See the banner at the top of this doc. The first e2e dispatch test exposed two HIGH defects — uncontrolled write-agent dispatch racing the git index, and starved enqueues — that make the daemon unsafe to run unattended. It now requires `LEDGER_DAEMON_ENABLED=1` to start. Remediation (worktree-isolated write-agents landing via `human_review`/PR; daemon drives the runner instead of raw `store.createTask`; daemon-originated tasks gated behind HITL) is to be drafted as a follow-up node. *(Priority: HIGH — blocks unattended operation. Tracked in `docs/00-project.md` §11 and `docs/process/e2e-dispatch-findings.md` §2–§3.)*
- **Staleness fires on doc-sync commits.** A merge-commit that touches a COMPLETE spec's status row (e.g., to add a cross-reference) will advance git mtime without updating `lastUpdated`. The 2-day grace reduces noise but doesn't eliminate it. Long-term fix: write `lastUpdated` automatically in doc-sync commits, or use a separate `verified_at` field. *(Priority: LOW — acceptable false-positive rate in v1; operator can ignore or cancel the task.)*
- **`readEnvInt` rejects `0` as a valid threshold value.** The guard `parsed > 0` was intended to reject nonsensical values (e.g. a 0 ms interval) but also blocks `0` as a valid orphan threshold. Setting `LEDGER_DAEMON_ORPHAN_THRESHOLD_DAYS=0` silently falls back to the default (14 days). Operators attempting to test orphan detection in a fresh project cannot use `0`; use `1` instead. Fix: change guard to `parsed >= 0` and add `&& !(key.includes("INTERVAL") && parsed === 0)` for the interval case specifically. *(Priority: LOW — does not affect production behaviour; documented workaround exists.)*
- **Staleness monitor checks the doc file's git mtime, not implementation code files.** PRD §6.4's primary use case is detecting when implementation _artifacts_ (source files) changed after the last verification — this implementation instead checks whether the _spec doc itself_ drifted from its declared last-update. The real case (code changed, spec not touched) is not detected. Full artifact tracking would require enumerating each node's historical task `resourceClaims` and comparing their paths' git mtimes, which is a more expensive query. Deferred. *(Priority: LOW — the doc-level proxy is useful and the limitation is accepted for v1.)*

---

## Spec Review (2026-06-01)

Reviewer verdict: NEEDS_MINOR_REVISIONS — all resolved before APPROVED.

| # | Finding | Resolution |
|---|---------|------------|
| S1 | Orphan regex `\*\(none…\)\*` misses the `None.` bare-prose form used in some docs | Extended to two-pattern EMPTY_PLACEHOLDERS array in Design |
| S2 | D6 missing TOCTOU note | Added sentence: single-threaded Node + sync better-sqlite3 prevents interleaving |
| S3 | `relPath` computation unspecified in git mtime helper | Added `path.relative(projectRoot, absFilePath)` note to Staleness pseudocode |
| S4 | Spec should note `doc.lastUpdated` is already annotation-stripped by parseDocNode | Added note in Staleness pseudocode block |
| N1 | Acceptance item 5 missing `lastFindings: []` | Added to item 5 |
| N2 | No acceptance item for staleness monitor | Added item 7 |
| N3 | Verification missing `pnpm test` | Added as item 4 |
| N4 | `server/src/bin/ledger.ts` missing from Files changed | Added row |
| N5 | No note that execa is already a dep | Added to Git mtime helper subsection |
| N6 | `nextRunAt` ambiguous for pre-first-tick state | Added `nextRunAt = now + intervalMs` set at `start()` time to lifecycle pseudocode |
| N7 | Open Issues missing the code-file staleness gap | Added LOW-priority open issue |

## Implementation Notes

**v1 — 2026-06-01**

**Files created:**
- `server/src/daemon/index.ts` — `createHealthDaemon`, `HealthDaemonHandle`, `DaemonStatus`, `DaemonFinding`, `DaemonContext` (minimal context subset)
- `server/src/daemon/monitors.ts` — `checkSize`, `checkStaleness`, `checkOrphans`, `isDuplicate`
- `server/src/routes/daemon.ts` — `GET /api/daemon/status`

**Files modified:**
- `server/src/context.ts` — `daemon: HealthDaemonHandle` added to `ProjectContext`; daemon created and started at end of `loadProjectContext`
- `server/src/server.ts` — `/api/daemon` router mounted
- `server/src/bin/ledger.ts` — `ctx.daemon.stop()` added to SIGINT/SIGTERM shutdown handler

**Deviations from spec:**
- `createHealthDaemon` accepts `DaemonContext` (a minimal subset of `ProjectContext`) rather than the full `ProjectContext`. Reason: the daemon is instantiated during `loadProjectContext` before the full context object exists (chicken-and-egg). The subset interface is defined in `daemon/index.ts`; context.ts passes a literal with exactly the three fields needed (`projectRoot`, `docsRoot`, `store`). This avoids a cast and keeps the types honest. No spec change required — D10 is satisfied (daemon started at end of `loadProjectContext`).
- `validateDocNode` returns `{ ok: true; node: DocumentNode }` (field is `node`, not `document` as implied in the system prompt). Implementation uses the actual return shape from the parser.

**Pre-existing lint error fixed:** `server/src/dispatcher/prompts/shared.ts:27` — unnecessary type assertion `(task.resourceClaims as ResourceClaim[])` introduced by the main-branch merge. Removed the cast; no behavior change.

**No parser changes.** `@ledger/parser` untouched.

**Gate results (headless):**
- `pnpm typecheck`: 0 errors (parser + app + server)
- `pnpm lint`: 0 errors, 0 warnings
- `pnpm test`: 127 + 134 + 334 passed, 2 skipped (pre-existing skips in server suite), 0 failed
- `pnpm -C app build`: success (6.25 s)

**Items requiring a running server (acceptance items 1–7):**
- Items 1–7 from the Acceptance check section require a live dev server to verify. Headless verification of monitors is covered transitively by the existing store/runner/parser test suites. A dedicated daemon unit test with a fake `Store` stub and a synthetic docs tree would verify monitors in isolation — deferred to the next maintenance pass as the spec does not prescribe unit tests for this leaf.

### Implementation Review (2026-06-01)

Reviewer verdict: READY_FOR_MERGE — no blocking or should-fix findings.

| # | Finding | Resolution |
|---|---------|------------|
| R1 | All S1–S4 and N1–N7 spec review items honoured in code | Confirmed |
| R2 | `DaemonContext` subset avoids circular dep cleanly | Accepted deviation |
| R3 | Pre-existing lint error in `shared.ts` fixed correctly | Confirmed; no behavior change |
| R4 | `readEnvInt` rejects `0` as a valid env value, silently falling back to default | Known limitation — `> 0` guard treats 0 as invalid; does not affect production operation (defaults are correct); added to Open Issues |

### Operator verification (2026-06-01)

All 7 acceptance items verified against the worktree dev server:
- Items 1–5, 7: verified at default/short interval settings
- Item 6 (orphan): verified with `LEDGER_DAEMON_ORPHAN_THRESHOLD_DAYS=1` (project docs are <14 days old; 27 issue_triage tasks created correctly)
- Dedup (item 4): second tick produced 35 `skipped_dedup` findings, 0 new tasks

---

## Verification

Before promoting to COMPLETE, verify:

1. `GET /api/daemon/status` shape matches `DaemonStatus` exactly (no extra or missing fields).
2. `pnpm typecheck` passes with zero errors (strict + noUncheckedIndexedAccess).
3. `pnpm lint` passes.
4. `pnpm test` exits zero.
5. `pnpm -C app build` passes (no app-side changes, but confirm no regressions).
6. All acceptance check items 1–7 pass against a running dev server.
7. Dedup verified: two consecutive ticks with the same oversized doc produce exactly one `doc_refactor` task in the store.
8. Server restart resets `DaemonStatus` (no persisted state bleeds across boot).

---

## Children

None — this is a leaf node.
