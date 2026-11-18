# Health scanner — current-state reference

**Scope:** `server/src/scanner/` plus `GET/POST /api/health/*`. On-demand,
report-only scan of the docs tree. The only write is one row in
`health_scans`.
**Last verified:** `350789833f56d18ec77f8d22b7062fafa91640b5` on `main`.
**Owning node:** [`07-health-daemon`](../07-health-daemon.md) (v2.1).
**Regenerate the module map:** `find server/src/scanner server/src/routes/scans.ts -name '*.ts' | sort | while read f; do printf '%5d  %s\n' "$(wc -l < "$f")" "$f"; done`

The v1 poll loop that enqueued tasks is gone. This folder does not import
the scheduler.

## 1. Module map

| File | Lines | Role |
|---|---:|---|
| `scanner/index.ts` | 61 | `createHealthScanner` → `{ runScan }` |
| `scanner/monitors.ts` | 114 | `checkSize`, `checkOpenIssues` |
| `scanner/types.ts` | 25 | `HealthFinding`, `HealthScan`, `ScannerContext` |
| `routes/scans.ts` | 41 | HTTP: run, list, issue rollup |

## 2. Entry points

| Call | Effect |
|---|---|
| `POST /api/health/scan` | `healthScanner.runScan()`. Reads the tree, appends one `health_scans` row, returns the scan as JSON with status 201 |
| `GET /api/health/scans` | The `listScans()` array itself, newest first. JSON field `scannedAt`; SQL `ORDER BY scanned_at DESC` (`store.ts`) |
| `GET /api/health/issues` | `{ issues }` from a fresh `buildDocGraph` plus `parseIssueItems(nodeId, markdown)`. Skips `authored === false`. Sort is HIGH, MEDIUM, LOW, TRIVIAL, then UNKNOWN. Separate from the scan log |

`createHealthScanner` is called from `loadProjectContext` with the project
root, docs root, store, and `metadata.health`.

## 3. Data contracts

**`HealthFinding`:** `{ monitor, nodeId, detail }`.

| `monitor` | Fires when |
|---|---|
| `size` | `ceil(chars / 4)` is above `health.sizeThresholdTokens`. Default 12000 when `.ledger/project.json` omits `health` (`HEALTH_DEFAULTS` in `@ledger/parser`) |
| `open_issue` | Status is `COMPLETE`, `PLANNED`, `DEFERRED`, or `ISSUE_OPEN`, and the Open Issues section has at least one unstruck `HIGH` or `MEDIUM` item |
| `schema_invalid` | `parseDocNode` returned a candidate and `validateDocNode` failed. `detail` joins `path: message` with `"; "`. The walk `continue`s, so that file gets no `size` or `open_issue` finding |

`checkOpenIssues` (`monitors.ts`) ignores `LOW`, `TRIVIAL`, untagged, and
struck (`~~`) items. Struck detection is a leading `~~` after the bullet
marker. Priority is the first `(Priority: HIGH|MEDIUM|LOW|TRIVIAL` match,
with or without a closing paren on that word. `detail` counts the live
HIGH and MEDIUM items and quotes the first HIGH item, otherwise the first
MEDIUM. The quote has the bullet marker, priority tag, `~~`, and `**`
stripped, then is cut at 100 characters.

**`HealthScan`:** `{ id: uuid, scannedAt: ISO string, findings: HealthFinding[] }`.
Stored as `health_scans.findings` JSON (`002-health-scans.sql`).

**What the walk skips.** `parseDocNode` returns `null` for underscore
directories, `00-project.md`, and parent `00-*.md` files. Those paths are
`continue`d and produce no finding (`scanner/index.ts`). A throw from parse,
validate, or a monitor on one file is logged and skipped. `readDocsTree`
runs before that per-file `try`, so one failed markdown read rejects the
whole scan and nothing is inserted.

`GET /api/health/issues` uses `parseIssueItems` from `@ledger/parser`, which
is a different splitter than `checkOpenIssues`. The priority pattern matches.
`checkOpenIssues` joins continuation lines onto the bullet; `parseIssueItems`
does not. The dashboard rollup and the scan finding can disagree on a bullet
the two parsers tag differently.

## 4. Runtime state surfaces

No in-memory scan state. History is the `health_scans` table. Config is the
`health` object frozen onto the scanner at boot (the same snapshot rules as
the rest of `ProjectContext`: editing `project.json` is visible after restart).

The scan itself re-reads `docs/` from disk, so file edits after boot do show
up in the next scan. That is the opposite of the dispatch graph snapshot
([`api-server.md`](api-server.md) §4).

## 5. Invariants

- `runScan` calls `store.insertScan` and nothing else on the store. No
  `createTask`, no executor, no git write. [`07-health-daemon`](../07-health-daemon.md).
- A parse, validate, or monitor error on one file does not abort the scan.
  A failed read inside `readDocsTree` does, and no scan row is written.
- Token estimate is character length divided by 4, rounded up. It is not a
  model tokenizer.
- Stable statuses are the set in `STABLE_STATUSES` (`monitors.ts`):
  `COMPLETE`, `PLANNED`, `DEFERRED`, `ISSUE_OPEN`. A `DRAFT` or `APPROVED`
  node with a HIGH issue does not produce `open_issue`.

## 6. Active migration

None in this folder. A future staleness monitor over `docs/_reference/`
stamps is an open issue on [`13-reference-layer`](../13-reference-layer.md),
not implemented here. The maintenance-round reading pass is the check that
exists today ([`workflow.md`](workflow.md)).
