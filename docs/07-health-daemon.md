# Health Scanner

**Node ID:** `07-health-daemon`
**Parent:** project root (`docs/00-project.md`)
**Status:** DRAFT (v2 redesign)
**Created:** 2026-06-01
**Last Updated:** 2026-06-03 (v2 redesign — on-demand scanner, append log, report-only)

**Dependencies:** `06-agent-dispatcher`

---

> **v1 is DISABLED.** The v1 implementation (poll-based daemon → enqueue write-agents) was
> completed on 2026-06-01 but immediately disabled after the first e2e test exposed two HIGH
> defects: uncontrolled write-agent dispatch racing the git index, and starved enqueues.
> The full redesign rationale is in the v1 history section at the bottom of this doc.
> v2 replaces the daemon model entirely. The `LEDGER_DAEMON_ENABLED=1` gate in
> `server/src/context.ts` is removed as part of this work.

## Requirements

Replace the v1 poll-based daemon with an **on-demand health scanner** — a server-side service that, when triggered by an operator API call, reads the doc tree, runs four monitors, and appends the result to a durable scan log. No background process. No task enqueue. No agent dispatch. The scanner's only write authority is its own findings log.

**Monitors:**

1. **Size** — a doc's estimated token count exceeds a configurable threshold. Finding: `size`.
2. **Orphaned issues** — a doc in a stable state (`COMPLETE`, `PLANNED`, `DEFERRED`, `ISSUE_OPEN`) has non-placeholder content in its Open Issues section and its `lastUpdated` is older than a configurable threshold. Finding: `orphan`.
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
  monitor: "size" | "orphan" | "schema_invalid";
  nodeId: string;
  detail: string;  // human-readable; e.g. "~4200 tokens (threshold: 3000)" or validation error text
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
      "description": "Estimated token count above which a doc triggers a size finding. Default: 3000."
    },
      "type": "integer", "minimum": 0,
    },
    "orphanThresholdDays": {
      "type": "integer", "minimum": 0,
      "description": "Days with non-empty Open Issues before an orphan finding. Default: 14."
    }
  }
}
```

The `parseProjectMetadata` function in `@ledger/parser` is updated to:
- Accept the optional `health` key
- Apply defaults when fields are absent
- Expose `health: { sizeThresholdTokens: number; orphanThresholdDays: number }` on the parsed metadata object

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
  checkOrphans(doc, config)        → HealthFinding | null
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

**Orphan** (COMPLETE, PLANNED, DEFERRED, ISSUE_OPEN with authored source):
```
EMPTY_PLACEHOLDERS = [
  /^\s*\*\(none[^)]*\)\*\s*$/i,
  /^\s*none\.?\s*$/i,
]
openIssues = doc.sections["Open Issues"] ?? ""
hasRealIssues = openIssues.trim().length > 0
               && !EMPTY_PLACEHOLDERS.some(p => p.test(openIssues.trim()))
lastUpdatedAge = now - new Date(doc.lastUpdated + "T00:00:00Z")   (ms)
if hasRealIssues && lastUpdatedAge > orphanThresholdDays * 86_400_000:
  detail = `open issues present; lastUpdated ${doc.lastUpdated} is ${Math.floor(lastUpdatedAge/86_400_000)}d ago`
  → { monitor: "orphan", nodeId: doc.id, detail }
```

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

---

## Open Issues

- **Scan log grows without bound.** All scans are retained. This is fine initially but will need a retention policy (e.g. keep last N scans) once the log becomes large. *(Priority: LOW)*

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

---

## Children

None — this is a leaf node.

---

## v1 History (archived 2026-06-03)

v1 was implemented 2026-06-01 as a poll-based daemon (5-minute `setInterval`) that detected oversized, stale, and orphaned docs and called `store.createTask()` to enqueue `doc_refactor` / `reverify` / `issue_triage` runner tasks. All 7 acceptance items passed operator verification.

The first e2e dispatch test (same day) immediately disabled it via `LEDGER_DAEMON_ENABLED=1` gate after two HIGH defects:

- **Finding #2** — The daemon auto-dispatched unreviewed `doc_refactor` write-agents that `git commit`-ted specs on the working branch with no HITL gate. ~24 agents fired concurrently in one working tree; git's index lock is repo-global, so ~18 lost the commit race.
- **Finding #3** — Daemon-enqueued tasks starved: it used raw `store.createTask` bypassing the runner, so tasks sat PENDING until unrelated operator activity ticked the scheduler.

Full detail: `docs/process/e2e-dispatch-findings.md` §2–§3.

The v1 implementation files (`server/src/daemon/index.ts`, `monitors.ts`; `server/src/routes/daemon.ts`) are deleted as part of the v2 implementation.
