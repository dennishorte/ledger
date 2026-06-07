# Health Scanner

**Node ID:** `07-health-daemon`
**Parent:** project root (`docs/00-project.md`)
**Status:** COMPLETE (v2.1, 2026-06-07)
**Created:** 2026-06-01
**Last Updated:** 2026-06-07 (DRAFT → COMPLETE reconciliation: v2 code had shipped to main 2026-06-06 while the header still read DRAFT; this transition records the missing independent implementation review + live verification and lands the review-driven fixes. Same day, v2.1 replaced the noisy `orphan` monitor with a priority-aware `open_issue` monitor — see D12 + the v2.1 amendment.)

**Dependencies:** `06-agent-dispatcher`

---

> **v2 shipped and is COMPLETE (2026-06-07).** The on-demand scanner replaced the v1
> daemon model entirely; the `LEDGER_DAEMON_ENABLED=1` gate is removed and the v1 daemon
> files are deleted. v1 (poll-based daemon → enqueue write-agents) was completed 2026-06-01
> but immediately disabled after the first e2e test exposed two HIGH defects: uncontrolled
> write-agent dispatch racing the git index, and starved enqueues. The full redesign
> rationale is in the v1 history section at the bottom of this doc.

## Requirements

Replace the v1 poll-based daemon with an **on-demand health scanner** — a server-side service that, when triggered by an operator API call, reads the doc tree, runs three monitors, and appends the result to a durable scan log. No background process. No task enqueue. No agent dispatch. The scanner's only write authority is its own findings log.

**Monitors:**

1. **Size** — a doc's estimated token count exceeds a configurable threshold. Finding: `size`.
2. **Unresolved open issues** — a doc in a stable state (`COMPLETE`, `PLANNED`, `DEFERRED`, `ISSUE_OPEN`) carries at least one **unstruck** open issue tagged `(Priority: HIGH)` or `(Priority: MEDIUM)`. Finding: `open_issue`. No time component — the signal is "settled node still holding meaningful unfinished work", not "the doc went quiet". LOW/TRIVIAL/untagged and struck-through (resolved) items never trigger. *(v2.1, 2026-06-07 — replaced the v2 `orphan` monitor, which keyed on doc `lastUpdated` and fired on the healthiest nodes; see D12 and the v2.1 amendment in Implementation Notes.)*
3. **Schema-invalid** — `validateDocNode` returns `{ ok: false }` for the doc. Finding: `schema_invalid`. (v1 silently skipped these; v2 surfaces them explicitly.)

**Hard constraints:**

- The scanner **never calls `store.createTask`**, enqueues runner tasks, or dispatches any agent.
- The scanner's only persistent write is inserting a row into `health_scans`.
- Each scan is a **snapshot** — findings reflect the state of the doc tree at scan time; no dedup, lifecycle, or ack logic. Historical scans are retained verbatim.
- Monitor errors for individual docs are logged and skipped; a single bad file never aborts a scan.
- **Config lives in `.ledger/project.json`**, not env vars. Missing `health` key → defaults apply.

**Out of scope for v2:**

- Auto-triggering on git commit or filesystem change.
- Finding lifecycle (open/resolved/acked) — each scan is a self-contained snapshot.
- UI: token cost widget wiring (deferred; placeholder zeros remain).
- Cross-project coordination or distributed locking.

---

## Design

### Architecture

The v1 `HealthDaemonHandle` (with `start()`/`stop()`/`status()`) is replaced by a `HealthScannerHandle`:

```typescript
export interface HealthScannerHandle {
  runScan(): Promise<HealthScan>;
}
```

`runScan()` is called by the POST route handler. No lifecycle. No `ProjectContext.daemon`; replaced by `ProjectContext.healthScanner`.

### New types

```typescript
// server/src/scanner/types.ts — server-internal; promote to @ledger/parser when UI consumes them

export interface HealthFinding {
  monitor: "size" | "open_issue" | "schema_invalid";
  nodeId: string;
  detail: string;  // human-readable; e.g. "~14000 tokens (threshold: 12000)" or validation error text
}

export interface HealthScan {
  id: string;           // UUID v4
  scannedAt: string;   // ISO 8601
  findings: HealthFinding[];
}
```

### Storage — migration 002

A new migration in `server/src/runner/store.ts` adds a `health_scans` table and bumps `user_version` to 2:

```sql
CREATE TABLE health_scans (
  id         TEXT    PRIMARY KEY,
  scanned_at TEXT    NOT NULL,   -- ISO 8601
  findings   TEXT    NOT NULL    -- JSON: HealthFinding[]
);
PRAGMA user_version = 2;
```

The existing migration runner applies this transactionally on first boot after the update; subsequent boots log `runner: schema is current at user_version=2`.

Two store methods are added to the existing `Store` interface:

```typescript
insertScan(scan: HealthScan): void;
listScans(): HealthScan[];   // newest-first (ORDER BY scanned_at DESC)
```

### Configuration — `project.json` extension

`docs/_schemas/project-metadata.schema.json` gains an optional `health` object (no `schemaVersion` bump — adding an optional field is backwards-compatible):

```json
"health": {
  "type": "object",
  "additionalProperties": false,
  "description": "Health scanner thresholds. All fields optional; defaults apply when omitted.",
  "properties": {
    "sizeThresholdTokens": {
      "type": "integer", "minimum": 1,
      "description": "Estimated token count above which a doc triggers a size finding. Default: 12000."
    }
  }
}
```

*(v2.1, 2026-06-07: `orphanThresholdDays` was removed — the v2.1 `open_issue` monitor has no time component, so the field is dead. `HealthConfig` is now `{ sizeThresholdTokens }` only.)*

The `parseProjectMetadata` function in `@ledger/parser` is updated to:
- Accept the optional `health` key
- Apply defaults when fields are absent
- Expose `health: { sizeThresholdTokens: number }` on the parsed metadata object

### Scanner implementation

```
server/src/scanner/
  index.ts      — createHealthScanner(ctx) → HealthScannerHandle; runScan() orchestrator
  monitors.ts   — checkSize, checkOrphans, checkSchemaInvalid (pure; take config + parsed doc)
  types.ts      — HealthFinding, HealthScan
```

`runScan()` flow:

```
read project metadata → extract health config (with defaults)
readDocsTree(ctx.docsRoot)         // fresh parse each scan
for each file:
  raw = readFileSync(path)
  result = validateDocNode(raw)
  if result.ok === false:
    → schema_invalid finding (detail = result.error message)
    continue                        // skip remaining monitors for invalid doc
  doc = result.node
  checkSize(doc, raw, config)      → HealthFinding | null
  checkOpenIssues(doc)             → HealthFinding | null   (v2.1; no config arg)
collect findings (filter nulls)
scan = { id: uuid(), scannedAt: new Date().toISOString(), findings }
ctx.store.insertScan(scan)
return scan
```

Per-doc errors (file read failure, unexpected parse exception) are caught, logged to stderr, and skipped.

### Monitor logic

**Size:**
```
estimatedTokens = Math.ceil(raw.length / 4)
if estimatedTokens > sizeThresholdTokens:
  detail = `~${estimatedTokens} tokens (threshold: ${sizeThresholdTokens})`
  → { monitor: "size", nodeId: doc.id, detail }
```

**Open issues** (v2.1 — only fires for stable states: COMPLETE, PLANNED, DEFERRED, ISSUE_OPEN):
```
STABLE_STATUSES = {COMPLETE, PLANNED, DEFERRED, ISSUE_OPEN}
if doc.status not in STABLE_STATUSES: return null

items = parseOpenIssueItems(doc.sections["Open Issues"])   // one per `- `/`* ` bullet
  // each item carries: text, struck (bullet leads with `~~`), priority
  // priority via /\(Priority:\s*(HIGH|MEDIUM|LOW|TRIVIAL)/i  (tolerant of "— …" / ", …" / ".)" tails)
live = items where !struck && priority in {HIGH, MEDIUM}
if live is empty: return null

detail = `${live.length} unresolved issue(s) (${n} HIGH, ${m} MEDIUM): ${highest-priority snippet}`
→ { monitor: "open_issue", nodeId: doc.nodeId, detail }
```
No time component, no config. Placeholder sections (`None.`, `*(none yet …)*`) yield no bullets → no finding. Resolved-but-retained issues are struck (`- ~~**Title**~~ — Closed …`) and excluded; the project's strike-through convention is therefore load-bearing for this monitor's signal quality.

**Schema-invalid** (handled in runScan orchestrator, not a separate monitor function):
```
if validateDocNode(raw).ok === false:
  detail = validation error message
  → { monitor: "schema_invalid", nodeId: "<path-basename-or-unknown>", detail }
```
For schema-invalid docs, `nodeId` is derived from the file path (basename without extension) since the doc's declared `id` may not be parseable.

### API routes

`server/src/routes/health.ts` replaces `server/src/routes/daemon.ts`:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/health/scan` | Trigger a scan. Returns `HealthScan` (201). |
| `GET`  | `/api/health/scans` | Return all scans, newest-first. Returns `HealthScan[]` (200). |

`GET /api/daemon/status` is **removed** (no current UI consumer; the health panel is build-time data only in v1).

### `ProjectContext` changes

| v1 | v2 |
|----|-----|
| `ctx.daemon: HealthDaemonHandle` | `ctx.healthScanner: HealthScannerHandle` |
| `daemon.start()` called at boot | (nothing — no lifecycle) |
| `daemon.stop()` on SIGINT/SIGTERM | (nothing — no teardown needed) |

`createHealthScanner(ctx)` is called once during `loadProjectContext` and assigned to `ctx.healthScanner`. The `LEDGER_DAEMON_ENABLED=1` gate is removed.

### Files changed

| File | Change |
|------|--------|
| `server/src/scanner/index.ts` | New — `createHealthScanner`, `HealthScannerHandle`, `runScan()` |
| `server/src/scanner/monitors.ts` | New — `checkSize`, `checkOrphans` |
| `server/src/scanner/types.ts` | New — `HealthFinding`, `HealthScan` |
| `server/src/daemon/index.ts` | **Deleted** |
| `server/src/daemon/monitors.ts` | **Deleted** |
| `server/src/runner/store.ts` | Add migration 002 (`health_scans` table); add `insertScan` + `listScans` to `Store` interface and implementation |
| `server/src/routes/health.ts` | New — `POST /api/health/scan`, `GET /api/health/scans` |
| `server/src/routes/daemon.ts` | **Deleted** |
| `server/src/context.ts` | Replace `daemon: HealthDaemonHandle` with `healthScanner: HealthScannerHandle`; remove `LEDGER_DAEMON_ENABLED` gate |
| `server/src/server.ts` | Unmount `/api/daemon`; mount `/api/health` |
| `server/src/bin/ledger.ts` | Remove `ctx.daemon.stop()` from SIGINT/SIGTERM handler |
| `docs/_schemas/project-metadata.schema.json` | Add optional `health` object |
| `packages/parser/src/projectMetadata.ts` | Accept + apply defaults for `health` config |

### UI changes (`app/`)

`HealthDashboardPanel.tsx` gains:

- A **"Run Scan"** button that POSTs `/api/health/scan` via a `useRunScan()` TanStack mutation hook. Shows a spinner while in-flight; on success, invalidates the scans query.
- A **scan history list** below the existing widgets, populated by `useHealthScans()` (TanStack Query against `GET /api/health/scans`). Each row: scan timestamp, finding count. Expandable to show the findings table (`monitor | nodeId | detail`). Newest scan expanded by default.
- Empty state (no scans yet): "No scans yet. Run a scan to check doc health."

The existing four widgets (`IssueRollupWidget`, `StalenessWidget`, `TokenCostWidget`, `DepImpactWidget`) are unchanged.

### Acceptance check

1. `POST /api/health/scan` returns `201` with a valid `HealthScan` (`id`, `scannedAt`, `findings[]`).
2. `GET /api/health/scans` returns a `HealthScan[]` containing the scan from item 1.
3. A second `POST /api/health/scan` creates a second row; both appear in `GET /api/health/scans`, newest-first.
4. Server restart: `GET /api/health/scans` still returns both scans (durability).
5. A doc exceeding `sizeThresholdTokens * 4` chars (or a reduced threshold in `.ledger/project.json`) produces a finding with `monitor: "size"`.
6. A doc failing `validateDocNode` produces a finding with `monitor: "schema_invalid"` and a non-empty `detail`.
7. `GET /api/daemon/status` returns 404.
8. `/health` panel shows a "Run Scan" button and a scan history list. Clicking "Run Scan" adds a row to the list.
9. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm -C app build` all pass.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **On-demand trigger only — no `setInterval`** | Eliminates the ambient write-agent dispatch risk from v1. Operator controls when the scan runs. |
| D2 | **Scanner has no write authority except `store.insertScan`** | Dissolves findings #2 and #3 from the e2e test outright — no runner tasks, no git index contention, no starved PENDING queue. Remediation is an explicit operator decision. PRD §6.4's `doc_refactor` / `reverify` / `issue_triage` task types are not removed; a human may still dispatch them deliberately. |
| D3 | **Append log (all scans retained)** | Historical scans let operators see whether health is trending better or worse over time. No cleanup needed until the log grows large — deferred. |
| D4 | **Finding shape is flat — `{monitor, nodeId, detail}`; no severity field** | Each monitor type has an implicit severity (schema_invalid > size > orphan). A severity field adds a classification burden without meaningfully changing what the operator does with a finding. Detail string carries the quantitative signal (token count, day delta). |
| D5 | **Config in `.ledger/project.json`, not env vars** | Env vars were a pragmatic shortcut in v1 to avoid extending the schema. Now that we're touching the schema for health config, `project.json` is the correct home — it's version-controlled, per-project, and visible to the operator alongside other project settings. |
| D6 | **`schemaVersion` stays at 1 for the `health` key addition** | Adding an optional field with defaults is backwards-compatible. Old project.json files without `health` remain valid. `schemaVersion` bumps only on breaking changes. |
| D7 | **`schema_invalid` finding is caught in the orchestrator, not a monitor function** | An invalid doc can't be passed to the other monitors (no `DocumentNode` to inspect). The orchestrator short-circuits and emits the finding directly, then skips to the next file. |
| D8 | **`nodeId` for schema-invalid docs derived from file path** | The doc's declared `id` may be missing or unparseable — that might be why it's invalid. Using the file's basename-without-extension gives a recoverable identifier for display. |
| D9 | **`HealthScan` / `HealthFinding` types are server-internal for now** | The UI consumes them via the API (JSON) in v2, which doesn't require them to be in `@ledger/parser`. Promote when a non-server package needs them. |
| D10 | **`GET /api/daemon/status` is removed, not redirected** | No current UI consumer. The health panel uses build-time data only (v1 of `01-ui/06-health`). A redirect that returns stale data would be misleading. |
| D11 | **UI changes are additive** — existing four widgets untouched | The scan button + history list are new sections; the rest of the health dashboard is unchanged. This minimises regression surface. |
| D12 | **v2.1 (2026-06-07): the `orphan` monitor is replaced by `open_issue` — predicate is "stable state ∧ ≥1 unstruck HIGH/MEDIUM issue", with no time component.** | The v2 `orphan` monitor keyed on doc `lastUpdated` and "Open Issues section non-empty", which made it fire on *every* completed node carrying any caveat — i.e. on the healthiest part of the tree — while ignoring the `(Priority: …)` tag that distinguishes a real bug from a deliberate LOW deferral. A live scan flagged 6 docs of which 5 were pure noise (LOW/TRIVIAL/struck) and the 1 real HIGH was buried indistinguishably. `lastUpdated` is the wrong clock (refreshed by doc-sync/status commits unrelated to the issue). v2.1 measures the right thing: meaningful (HIGH/MEDIUM), still-open (unstruck) work on a settled node. `orphanThresholdDays` config is removed as dead. Residual signal quality now depends on doc-hygiene (striking resolved issues) rather than a time heuristic. Full rationale: the analysis preserved in the v2.1 amendment below. |

---

## Open Issues

- **Scan log grows without bound.** All scans are retained. This is fine initially but will need a retention policy (e.g. keep last N scans) once the log becomes large. *(Priority: LOW)*
- **`app/src/lib/parseIssues.ts` priority regex under-tags the em-dash form.** Its `PRIORITY_RE` requires a closing `)` right after the priority word, so `(Priority: HIGH — …)` / `(Priority: MEDIUM, …)` get tagged `UNKNOWN` in `06-health`'s IssueRollupWidget. The scanner's `open_issue` monitor (v2.1) uses a tolerant regex and is unaffected; the real fix belongs in `06-health`. Filed here as the discovery site. *(Priority: LOW — owner: `01-ui/06-health`.)*
- **`open_issue` signal quality depends on strike-through hygiene.** The monitor excludes struck (`~~…~~`) issues, so resolved-but-not-struck items show up as findings. The 2026-06-07 live scan suggests several MEDIUM hits are this. Mitigation is process (strike issues on resolution); if the MEDIUM backlog stays noisy, tighten the monitor to HIGH-only (D12). *(Priority: LOW)*

---

## Implementation Notes

**v2 — 2026-06-03**

**Files created:**
- `server/src/scanner/index.ts` — `createHealthScanner`, `runScan()` orchestrator
- `server/src/scanner/monitors.ts` — `checkSize`, `checkOrphans`
- `server/src/scanner/types.ts` — `HealthFinding`, `HealthScan`, `HealthScannerHandle`, `ScannerContext`
- `server/src/routes/scans.ts` — `POST /api/health/scan`, `GET /api/health/scans`
- `server/src/runner/migrations/002-health-scans.sql` — `health_scans` table
- `app/src/lib/useHealthScans.ts` — TanStack Query hook for GET /api/health/scans
- `app/src/lib/useRunScan.ts` — TanStack mutation hook for POST /api/health/scan
- `app/src/components/health/ScanHistoryWidget.tsx` — Run Scan button + expandable scan history

**Files modified:**
- `server/src/runner/store.ts` — `insertScan` + `listScans` added to `Store` interface and implementation
- `server/src/runner/events.ts` — `insertScan` + `listScans` added to `withPublishing` pass-through
- `server/src/context.ts` — `daemon: HealthDaemonHandle` → `healthScanner: HealthScannerHandle`; `LEDGER_DAEMON_ENABLED` gate removed
- `server/src/server.ts` — `/api/daemon` unmounted; `/api/health` mounted
- `server/src/bin/ledger.ts` — `ctx.daemon.stop()` removed from shutdown handler
- `packages/parser/src/project/types.ts` — `HealthConfig` + `HEALTH_DEFAULTS` added; `ProjectMetadata.health` always-present field
- `packages/parser/src/project/validateProjectMetadata.ts` — applies `HEALTH_DEFAULTS` after AJV validation
- `packages/parser/src/index.ts` — `HealthConfig`, `HEALTH_DEFAULTS` exported
- `docs/_schemas/project-metadata.schema.json` — optional `health` object added
- `app/src/components/health/HealthDashboard.tsx` — `ScanHistoryWidget` added as full-width card below 2×2 grid
- `server/test/runner/migrations.test.ts` — expectations updated for two-migration state

**Files deleted:**
- `server/src/daemon/index.ts`, `server/src/daemon/monitors.ts` — v1 daemon
- `server/src/routes/daemon.ts` — `GET /api/daemon/status`

**Deviations from spec:**
- Route file is `server/src/routes/scans.ts`, not `health.ts` (name was already taken by the `GET /api/_health` server-health route).
- Staleness monitor dropped post-implementation (2026-06-03): fired on doc-sync commits with no actionable signal. `HealthConfig`, schema, and type union updated accordingly. Spec Requirements and Design sections updated to reflect three monitors only.

**Gate results:**
- `pnpm typecheck` (parser + server + app): 0 errors
- `pnpm lint`: 0 errors, 0 warnings
- `pnpm -C packages/parser test`: 127 passed
- `pnpm -C server test`: 334 passed, 2 skipped
- `pnpm -C app build`: success

### Implementation Review (2026-06-07)

The v2 code shipped to main on 2026-06-06 (`c27b050` + follow-ups) but the Status
header was never advanced past DRAFT and **no independent review was run** — the
self-audit mitigation (leaf-workflow stages 2/6, PRD §11) was skipped. This review
was run in clean context against the merged code as part of the DRAFT → COMPLETE
reconciliation. Hard-constraint check **PASS**: the scanner's only persistent write
is `store.insertScan`; no `createTask`, enqueue, or dispatch anywhere in `scanner/`
— the entire reason for the v2 redesign holds.

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| R1 | Should-fix | `scanner/index.ts` wrapped only `parseDocNode` in try/catch; `validateDocNode` + both monitor calls sat outside it, so a monitor throw on one doc aborted the whole scan — violating the "a single bad file never aborts a scan" hard constraint. | Fixed — the entire per-doc block (parse → validate → monitors) is now inside one try/catch that logs and continues. Locked by `server/test/scanner.isolation.test.ts` (mocks `checkSize` to throw; asserts the scan still resolves + persists + surfaces the schema_invalid finding). |
| R2 | Should-fix | `docs/_schemas/project-metadata.schema.json` described `sizeThresholdTokens` default as 3000; actual `HEALTH_DEFAULTS` default is 12000 (stale after the 2026-06-03 threshold raise). | Fixed — description corrected to 12000. |
| R3 | Nit | Empty `server/src/daemon/` directory lingered after the v1 file deletions. | Removed. |
| R4 | Gap (verification) | The node shipped with **zero scanner test coverage** — `health.test.ts` covers only `GET /api/_health`. The spec's Verification item 4 explicitly requires `insertScan`/`listScans` covered. | Closed — added `server/test/scanner.test.ts` (11 tests: `checkSize`/`checkOrphans` units, store round-trip + newest-first ordering, runScan over the `sample-project` fixture incl. schema_invalid + low-threshold size) and the isolation test from R1. Server suite 367 → 378. |
| R5 | Cross-cutting (found during verification) | `pnpm -C app build` was **already broken on main** (TS2366) — `doc_decompose` was added to `TaskType` (`3d2fda2`) without updating `TaskTypeBadge.badgeBg`'s exhaustive switch. Not a scanner defect, but it blocked the build gate. | Fixed — `doc_decompose` added to the accent-soft group. Switch kept exhaustive (no `default`) so the next new `TaskType` still fails the build until handled. |

### v2.1 amendment — `orphan` → `open_issue` monitor (2026-06-07)

**Why.** Operator review of the v2 `orphan` monitor's first real output found it near-useless: of 6 docs it flagged, 5 carried only LOW/TRIVIAL or already-struck issues, and the single genuine HIGH bug (`01-ui/10-orchestration` parent/child status rollup) was indistinguishable from the noise. Root causes — (1) **wrong clock**: it keyed on doc `lastUpdated`, which for a COMPLETE node going quiet is the *expected* healthy state and is refreshed by unrelated doc-sync/status commits; (2) **wrong predicate**: "Open Issues non-empty" is true for every mature node, because this schema retains issues (struck-through) as durable provenance and keeps deferred-by-design caveats forever; (3) it **ignored the `(Priority: …)` tag** already present in every issue. Net: a low-specificity S3\* audit signal that fires loudest where the system is healthiest — training the operator to ignore the channel.

**Change.** New `open_issue` monitor: fires iff a stable-state node holds ≥1 **unstruck** issue tagged HIGH or MEDIUM. No `lastUpdated`, no config threshold. `orphanThresholdDays` removed from `HealthConfig`/`HEALTH_DEFAULTS`/the JSON schema. Finding literal `orphan` → `open_issue` (UI `useHealthScans.ts` + `ScanHistoryWidget` label synced). Files: `server/src/scanner/monitors.ts` (`checkOrphans` → `checkOpenIssues` + a `parseOpenIssueItems` bullet/priority/struck parser), `scanner/index.ts`, `scanner/types.ts`, `packages/parser/src/project/{types,validateProjectMetadata}.ts`, `docs/_schemas/project-metadata.schema.json`, `app/src/lib/useHealthScans.ts`, `app/src/components/health/ScanHistoryWidget.tsx`. Tests: `scanner.test.ts` `checkOpenIssues` suite (7 cases) + isolation test updated; server suite 378 → 381. All gates green.

**Live result (2026-06-07).** A scan over the real tree now flags 13 stable nodes (1 HIGH — `10-orchestration`; 12 MEDIUM) and is silent on the 4 pure-noise UI panels the old monitor caught (`01-shell`, `03-docs`, `06-health`, `09-workflow-progress`). The HIGH stands out via the per-finding `(n HIGH, m MEDIUM)` detail. Residual: some MEDIUM hits are likely resolved-but-not-struck (e.g. `08-markdown` anchor-offset) — the monitor is now bounded by doc-hygiene (strike resolved issues), not a time heuristic. Tightening to HIGH-only is a one-line change if the MEDIUM backlog proves too broad.

---

## Verification

Before promoting to COMPLETE, verify:

1. Acceptance check items 1–9 pass.
2. `pnpm typecheck` passes with zero errors (strict + `noUncheckedIndexedAccess`).
3. `pnpm lint` passes.
4. `pnpm test` exits zero with all existing tests passing and new `insertScan`/`listScans` store methods covered.
5. `pnpm -C app build` passes.
6. Confirm v1 daemon code (`server/src/daemon/`) is fully deleted and no remaining imports reference it.
7. Confirm `LEDGER_DAEMON_ENABLED` env var check is removed from `server/src/context.ts`.

### Verified 2026-06-07

Live against the API server booted on the real `ledger` project + the new test suite:

| Acceptance item | Result |
|---|---|
| 1 — `POST /api/health/scan` → 201 + valid `HealthScan` | ✅ live (`id` UUID, ISO `scannedAt`, `findings[]`) |
| 2 — `GET /api/health/scans` returns the scan | ✅ live |
| 3 — 2nd POST → 2 rows, newest-first | ✅ live (4 scans returned, ordered by `scannedAt DESC`) |
| 4 — restart durability | ✅ live (two scans from a prior 2026-06-03 session persisted across restarts) |
| 5 — size finding for oversized doc | ✅ live (11 real size findings, e.g. `05-task-runner/05-ui-hook-migration` ~17232 tokens) + `scanner.test.ts` |
| 6 — schema_invalid finding | ✅ `scanner.test.ts` over `02-broken` fixture (non-empty detail, path-derived nodeId) |
| 7 — `GET /api/daemon/status` → 404 | ✅ live |
| 8 — `/health` panel Run-Scan + history | ⚠️ code present + `pnpm -C app build` passes; not browser-walked this pass |
| 9 — gates | ✅ parser 127, app 147, server 378, app build success, lint clean |

Gates 2–5, 6 (daemon deleted), 7 (`LEDGER_DAEMON_ENABLED` gone) all confirmed. The
live scan also surfaced real doc-health debt (6 orphan + 11 oversized nodes) — see PRD
§11 follow-up. Item 8 is the only acceptance item not visually verified; the widget
renders in a passing build and the reviewer confirmed it statically.

---

## Children

None — this is a leaf node.

---

## v1 History (archived 2026-06-03)

v1 was implemented 2026-06-01 as a poll-based daemon (5-minute `setInterval`) that detected oversized, stale, and orphaned docs and called `store.createTask()` to enqueue `doc_refactor` / `reverify` / `issue_triage` runner tasks. All 7 acceptance items passed operator verification.

The first e2e dispatch test (same day) immediately disabled it via `LEDGER_DAEMON_ENABLED=1` gate after two HIGH defects:

- **Finding #2** — The daemon auto-dispatched unreviewed `doc_refactor` write-agents that `git commit`-ted specs on the working branch with no HITL gate. ~24 agents fired concurrently in one working tree; git's index lock is repo-global, so ~18 lost the commit race.
- **Finding #3** — Daemon-enqueued tasks starved: it used raw `store.createTask` bypassing the runner, so tasks sat PENDING until unrelated operator activity ticked the scheduler.

Full detail: `docs/_investigations/e2e-dispatch-findings.md` §2–§3.

The v1 implementation files (`server/src/daemon/index.ts`, `monitors.ts`; `server/src/routes/daemon.ts`) are deleted as part of the v2 implementation.
