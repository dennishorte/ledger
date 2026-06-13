# UI Hook Migration — Remaining Consumers (`useDocSource` + `useHealthData`)

**Node ID:** `04-api-server/99-maintenance/01-ui-hook-migration`
**Parent:** `04-api-server/99-maintenance` (`docs/04-api-server/99-maintenance/00-maintenance.md`)
**Status:** VERIFY
**Created:** 2026-06-12
**Last Updated:** 2026-06-12

**Dependencies:** `04-api-server/03-server-package` (COMPLETE — `GET /api/docs/:nodeId` endpoint live)

---

## Requirements

Two remaining UI hooks still read doc content from build-time Vite globs rather than the live API, left unfinished by `04-api-server/05-ui-hook-migration` per its stated out-of-scope items:

- **`useDocSource` (build-time glob → `GET /api/docs/:nodeId`):** the doc-viewer panel (`03-docs`) calls `useDocSource(id)` to get the raw markdown for a node. Today this hits a module-level `import.meta.glob("../../../../docs/**/*.md", { query: "?raw", eager: true })` map frozen at build time. The `GET /api/docs/:nodeId` endpoint shipped with `04-api-server/03-server-package` returns `{ node: DocumentNode }` — the validated shape — but the raw markdown is not in that response. A new `GET /api/docs/:nodeId/source` endpoint returning `{ id, raw }` is needed to back the migration.
  - Source: `04-api-server/05-ui-hook-migration` Open Issues bullet "Remaining UI consumers not migrated."
  - Originating priority: MEDIUM.
  - Why this round: `useDocSource` is the simplest remaining doc-hook migration — single-node fetch, typed response, narrow surface. Batching it here with item 2 (which touches the same `GET /api/docs` surface) keeps the endpoint work and the hook work in one diff.

- **`useHealthData` (build-time glob → live API, bounded approach):** `useHealthData` builds its own module-level `import.meta.glob` map to read raw markdown for ALL nodes so it can call `parseIssueItems(nodeId, raw)` across the tree. This is the most expensive remaining build-time coupling — it bakes the entire docs corpus into the app bundle as raw strings. The correct migration is to move open-issue parsing to the server and expose findings via the existing `/api/health/scans` (scanner results) or a new bulk-source endpoint. After analysing the three options:
  - **(a) `GET /api/docs/sources` bulk endpoint** — returns `Record<nodeId, raw>` for all nodes. Migrates the hook faithfully but sends the entire docs corpus over the wire on every health-panel mount. The payload is a few hundred KB uncompressed; acceptable for local use but architecturally backwards (client re-implementing the parser's open-issue logic).
  - **(b) Keep build-time glob for health panel (defer)** — closes nothing; the Open Issue stays open.
  - **(c) Migrate open-issue parsing to the server; expose findings via `GET /api/health/issues`** — the server already runs `07-health-daemon`'s scanner which calls `parseIssueItems` internally. A new lightweight endpoint surfaces the parsed `IssueItem[]` directly, letting the client drop the raw-glob dependency entirely. This is the correct architectural direction: server owns parsing, client owns rendering.
  - **Chosen: option (c).** Add `GET /api/health/issues` returning `IssueItem[]` sorted HIGH→TRIVIAL; migrate `useHealthData` to a TanStack Query against it; drop the `import.meta.glob` from `useHealthData.ts`.
  - Source: `04-api-server/05-ui-hook-migration` Open Issues bullet "Remaining UI consumers not migrated" (MEDIUM); `04-api-server/00-api-server.md` Open Issues bullet "Server-validator vs UI-validator duplication" (TRIVIAL — partially self-resolves as consumers migrate).
  - Originating priority: MEDIUM (hook migration) + TRIVIAL (duplication).
  - Why this round: architecturally paired with item 1 — both are doc-hook migrations that touch the live-API surface. Landing them together completes the `04-api-server` hook-migration story.

### In scope for v1

0. **Promote `IssueItem` and `parseIssueItems` to `@ledger/parser`** as a prerequisite before implementing item 3. `IssueItem` currently lives in `app/src/lib/types.ts`; `parseIssueItems` lives in `app/src/lib/parseIssues.ts`. Neither is exported from `@ledger/parser`. The server-side scanner uses a private `parseOpenIssueItems` in `server/src/scanner/monitors.ts` (different return type: `OpenIssueItem`). Per the "domain types live where they're authoritative" rule, the canonical home for doc-issue types is the parser. Required steps: (a) create `packages/parser/src/docs/issues.ts` containing `IssueItem` (type) and `parseIssueItems` (function); (b) export both from `packages/parser/src/index.ts`; (c) update `app/src/lib/types.ts` and `app/src/lib/parseIssues.ts` to re-export from `@ledger/parser` (preserving existing import sites); (d) evaluate whether `parseOpenIssueItems` in `server/src/scanner/monitors.ts` can be consolidated with the promoted `parseIssueItems` (defer if non-trivial, but note the duplication). Item 3 depends on this step completing first.

1. **New `GET /api/docs/:nodeId/source` endpoint** in `server/src/routes/docs.ts`. Response: `{ id: string; raw: string }`. 404 if `nodeId` does not resolve to a tracked file. No schema validation on the raw body — raw is raw. Uses `readDocsTree` + `findRawDocForNodeId` (already present in the handler for `/:nodeId{.+}`).
2. **Migrate `useDocSource`** (`app/src/components/docs/useDocSource.ts`) from the module-level `import.meta.glob` map to a TanStack Query against `GET /api/docs/:nodeId/source`. Query key: `["docs", id, "source"]`. `staleTime: 30_000`. `placeholderData`: the existing `sourceMap.get(id)` fallback from the current module-level map (keep the map as a placeholder-only fallback, not the primary path). Returns `DocSource | undefined`; returns `undefined` during loading (callers already handle `undefined`).
3. **New `GET /api/health/issues` endpoint** in `server/src/routes/health.ts`. Reads the docs tree, calls `parseIssueItems` for each authored node, sorts HIGH→TRIVIAL, returns `IssueItem[]`. No SSE — plain JSON. Reuses `readDocsTree` + `buildDocGraph` from the existing `/api/docs` handler pattern.
4. **Migrate `useHealthData`** (`app/src/components/health/useHealthData.ts`) to a TanStack Query against `GET /api/health/issues`. Drop the `import.meta.glob` block and the `buildRawMap()` helper entirely. The `issues` field of `HealthData` is populated from the API response. `staleness` computation (`deriveStaleness`) still requires the full `DocNode[]` graph from `useDocGraph()` — that hook is already live-API-backed; no change there.
5. **Tests** — new endpoint tests in `server/test/health.test.ts` (issue-list shape, sort order, empty-tree case) and `server/test/docs.test.ts` (source endpoint 200 + 404). Updated hook tests in `app/src/components/docs/useDocSource.test.tsx` and `app/src/components/health/useHealthData.test.tsx` (mock the new endpoints; assert placeholder fallback on 500).
6. **Strike through the originating Open Issues** in `04-api-server/05-ui-hook-migration.md` and `04-api-server/00-api-server.md` with forward pointers to this round at merge time (stage 10 cross-doc sync).

### Out of scope

The following Open Issues from `04-api-server` and its children were **considered and rejected** for this round:

- **`useDocValidationErrors` / Topbar banner migration** (`05-ui-hook-migration` Open Issue "Topbar's `docValidationErrorPaths` consumer still reads build-time data" — LOW). The Topbar banner is dev-only and low-value; batching it here adds scope without architectural benefit. Defer to a follow-up round.
- **Document caching / mtime-keyed in-memory cache** (`00-api-server` Open Issue "Document cache invalidation" — LOW). A performance optimization, not a correctness issue. Not related to the hook-migration theme of this round.
- **Unified `pnpm dev` workspace root script** (`00-api-server` Open Issue — TRIVIAL). DX polish; unrelated to hook migration.
- **Vite proxy port hardcodes 4180** (`05-ui-hook-migration` Open Issue — TRIVIAL). Cosmetic; not a correctness issue at v1 scale.
- **No DevTools integration / `@tanstack/react-query-devtools`** (`05-ui-hook-migration` Open Issue — LOW). Dev-only polish dep; out of scope for a maintenance round focused on correctness migrations.
- **`app/server/` naming collision** (`00-api-server` Open Issue — LOW). Deferred until `06-agent-dispatcher` retires the transcript bootstrap; not hook-migration scope.
- **Server-validator vs UI-validator duplication** (`00-api-server` Open Issue — TRIVIAL). Partially self-resolves as consumers migrate (this round advances that; full resolution waits for `useDocSource` to stop needing client-side AJV). Tracked as a TRIVIAL follow-up; no explicit action needed in this round.
- **`refetchOnWindowFocus` posture** (`05-ui-hook-migration` Open Issue — TRIVIAL). Current behavior is correct per SF1 audit; no change needed.

---

## Design

### Architecture overview

Two new server endpoints; two hook rewrites; no new npm packages. Requires one prerequisite parser change: `IssueItem` (type) and `parseIssueItems` (function) promoted from `app/src/lib/` to `packages/parser/src/docs/issues.ts` and exported from `@ledger/parser` (see item 0 in Requirements). After promotion, `app/src/lib/types.ts` and `app/src/lib/parseIssues.ts` re-export from the parser; no existing import sites break.

```
packages/parser/src/docs/issues.ts             [new — IssueItem type + parseIssueItems function]
packages/parser/src/index.ts                   [modified — export IssueItem + parseIssueItems]
app/src/lib/types.ts                           [modified — re-export IssueItem from @ledger/parser]
app/src/lib/parseIssues.ts                     [modified — re-export parseIssueItems from @ledger/parser]
server/src/routes/docs.ts       [modified — add /:nodeId/source route]
server/src/routes/health.ts     [modified — add GET /api/health/issues route]
server/test/docs.test.ts        [modified — source endpoint tests]
server/test/health.test.ts      [modified — issues endpoint tests]
app/src/components/docs/useDocSource.ts         [rewritten — TanStack Query]
app/src/components/docs/useDocSource.test.tsx   [new — mocked-fetch tests]
app/src/components/health/useHealthData.ts      [modified — drop glob, add TanStack Query]
app/src/components/health/useHealthData.test.tsx [new — mocked-fetch tests]
docs/04-api-server/99-maintenance/01-ui-hook-migration.md  [this spec]
docs/04-api-server/99-maintenance/00-maintenance.md        [children manifest row]
```

No new npm packages. No new workspace packages. `app/src/lib/types.ts` and `app/src/lib/parseIssues.ts` change from source-of-truth to re-export shims (additive — no existing import sites break).

### Item 1 — `GET /api/docs/:nodeId/source`

Add a sub-route to the existing `docsRoute` chain:

```ts
.get("/:nodeId{.+}/source", async (c) => {
  const project = c.get("project");
  const nodeId = c.req.param("nodeId");
  const rawDocs = await readDocsTree(project.docsRoot);
  const entry = findRawDocForNodeId(rawDocs, nodeId);
  if (!entry) return c.json({ error: "node not found" }, 404);
  return c.json({ id: nodeId, raw: entry.content });
})
```

Route ordering matters in Hono: the `/source` sub-route must be declared **before** `/:nodeId{.+}` in the chain so the more-specific path wins. The current `docsRoute` already ends with `/:nodeId{.+}` — append the `/source` variant before it.

Response shape: `{ id: string; raw: string }`. The `raw` field is the verbatim markdown string — no transformation, no sanitization (same trust level as the existing `readDocsTree` reads). Content-Type is `application/json`.

### Item 2 — `useDocSource` rewrite

`useDocSource` currently returns `DocSource | undefined` synchronously. After migration it returns the same type but the value is populated from a TanStack Query instead of the module-level map.

Key design constraints:
- `useDocSource` is called **in a component render loop** (single call per render, not in `.map()`). TanStack Query is safe here.
- `placeholderData`: keep the existing `sourceMap` (module-level glob map) as a build-time fallback. On first render the placeholder fires immediately; the query updates to the live response. When the server is down the placeholder persists (same UX as `useDocGraph`'s fallback posture).
- Return type stays `DocSource | undefined`. The `undefined` case covers both "node not found" and "query pending with no placeholder" — callers (DocViewerPanel, WorkflowProgressSection) already guard on `undefined`.

```ts
export function useDocSource(id: NodeId): DocSource | undefined {
  const { data } = useQuery({
    queryKey: ["docs", id, "source"] as const,
    queryFn: async (): Promise<DocSource> => {
      const res = await fetch(`/api/docs/${encodeURIComponent(id)}/source`);
      if (res.status === 404) throw new Error(`source not found: ${id}`);
      if (!res.ok) throw new Error(`/api/docs/${id}/source returned ${res.status.toString()}`);
      return (await res.json()) as DocSource;
    },
    placeholderData: (): DocSource | undefined => {
      const raw = sourceMap.get(id);
      return raw !== undefined ? { id, raw } : undefined;
    },
    staleTime: 30_000,
    enabled: id !== "",
  });
  return data;
}
```

The `sourceMap` module-level glob stays in the file solely as the `placeholderData` source. Its removal is out of scope — the build-time fallback is load-bearing for the server-down degradation story.

`encodeURIComponent(id)` encodes the `/` in nested node ids (e.g. `01-ui/02-dag` → `01-ui%2F02-dag`). The server's `/:nodeId{.+}` matcher receives the decoded value via Hono's param extraction (matching the behaviour established in `04-api-server/03-server-package` N1 audit).

### Item 3 — `GET /api/health/issues`

Add to `server/src/routes/health.ts` alongside the existing scan routes:

```ts
.get("/issues", async (c) => {
  const project = c.get("project");
  const rawDocs = await readDocsTree(project.docsRoot);
  const { nodes } = buildDocGraph(rawDocs);
  const issues: IssueItem[] = [];
  for (const node of nodes) {
    if (!node.authored) continue;
    const entry = findRawDocForNodeId(rawDocs, node.id);
    if (!entry) continue;
    issues.push(...parseIssueItems(node.id, entry.content));
  }
  issues.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4));
  return c.json({ issues });
})
```

`PRIORITY_ORDER` is a local constant (`{ HIGH: 0, MEDIUM: 1, LOW: 2, TRIVIAL: 3, UNKNOWN: 4 }`) — same as the client-side copy in `useHealthData.ts`, which is deleted by item 4. `IssueItem` and `parseIssueItems` are imported from `@ledger/parser` after the prerequisite item-0 promotion. Required imports for `health.ts`: `IssueItem`, `parseIssueItems` from `@ledger/parser`; `buildDocGraph`, `readDocsTree` (pattern-matching the existing `/api/docs` handler); `findRawDocForNodeId` from `docs.ts` or a shared helper. `DocSource` is `{ id: NodeId; raw: string }` — matches the item-1 endpoint shape exactly, so the `as DocSource` cast in item 2's `queryFn` is safe. `findRawDocForNodeId` is already in `docs.ts`; extract to a shared `readDocs.ts` helper or duplicate locally — implementer's call, but no new public API needed.

Response shape: `{ issues: IssueItem[] }`.

Reads docs on every call (consistent with the v1 no-cache posture). At ~15–40 docs and a non-hot code path (health panel is not auto-polled), this is acceptable.

### Item 4 — `useHealthData` rewrite

`useHealthData` currently uses `useMemo` over `useDocGraph()` nodes + the module-level raw map. After migration:

- `issues: IssueItem[]` comes from `GET /api/health/issues` via TanStack Query. Query key: `["health", "issues"]`. `staleTime: 60_000` (health panel does not need 30s cadence — 1 minute is fine). `placeholderData: () => []` (empty list on first render; no build-time fallback for issues since the glob map is removed).
- `staleness: StalenessSignal[]` — `deriveStaleness(nodes, issuesByNode)` requires both the `DocNode[]` graph and a `Map<NodeId, IssueItem[]>`. After the migration the `issuesByNode` map is rebuilt client-side from the `IssueItem[]` API response (group by `nodeId`). `deriveStaleness` signature is unchanged.
- The `import.meta.glob` block and `buildRawMap()` helper are deleted entirely.
- `rawByNodeId` module-level constant is deleted.

The `PRIORITY_ORDER` constant also moves to the server (item 3); its client-side copy in `useHealthData.ts` is deleted.

- `subtreeCosts: SubtreeCost[]` in the `HealthData` return value is **unchanged** — `PLACEHOLDER_COSTS` constant is preserved as-is. `subtreeCosts` migration is out of scope for this round.
- The issues query uses `staleTime: 60_000` (1 minute — per D5; health panel does not need 30s cadence).

`subtreeCosts` and `nodes` fields of `HealthData` are unchanged.

### Acceptance check (manual)

1. `GET /api/docs/01-ui%2F02-dag/source` (with server running against the ledger repo) returns `{ id: "01-ui/02-dag", raw: "<verbatim markdown>" }` with status 200.
2. `GET /api/docs/nonexistent-node/source` returns 404.
3. `GET /api/health/issues` returns `{ issues: [...] }` with `priority` values drawn from `{ HIGH, MEDIUM, LOW, TRIVIAL, UNKNOWN }`, sorted HIGH-first.
4. The Docs panel (`/docs/01-ui/02-dag`) renders the document body — confirms `useDocSource` is receiving live data via the API.
5. The Health panel (`/health`) renders open issues — confirms `useHealthData` is receiving live data via the API.
6. With the API server stopped, the Docs panel still renders (placeholder fallback from `sourceMap`); the Health panel renders with an empty issues list (placeholder `[]`).
7. All workspace gates green: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` from repo root all exit zero.
8. `pnpm -C e2e test` passes with no new failures (the e2e suite's docs and health smoke tests pass against the migrated hooks).

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Add `GET /api/docs/:nodeId/source` rather than expanding the existing `/:nodeId{.+}` response to include `raw` | Adding `raw` to the existing endpoint changes its contract (consumers that only need `DocumentNode` pay the serialization cost of the raw string). A sub-route keeps concerns separate and is additive — no existing callers break. |
| D2 | `GET /api/health/issues` rather than a bulk `GET /api/docs/sources` endpoint for `useHealthData` | Option (a)'s bulk-source approach sends the full docs corpus over the wire and delegates parsing to the client — backwards flow. Option (c) keeps parsing server-side (where `parseIssueItems` already runs in the scanner) and returns a small typed list. The bandwidth and architectural advantages are clear; the only cost is one extra endpoint. |
| D3 | `useDocSource` keeps the module-level `sourceMap` as `placeholderData` source | The build-time glob is the only available fallback for "server down on a cold page load." Removing it would leave the Docs panel blank when the server is unreachable on first render. The glob stays but its role is reduced to fallback-only; the primary path is the API. |
| D4 | `useHealthData` drops the module-level glob entirely; `placeholderData: () => []` for issues | The health panel does not need a build-time fallback for issues — an empty list is a safe degraded state (no false positives). The glob for all docs is expensive in bundle size and conceptually wrong (client re-implementing server-side logic). Clean break is correct here. |
| D5 | `staleTime: 60_000` for `useHealthData`'s issues query vs `30_000` for `useDocSource` | The health panel is not a real-time dashboard; a 1-minute polling cadence is adequate. `useDocSource` is used in the doc viewer where a user might edit a doc and switch to the viewer expecting fresh content within a normal interaction window (30s). |
| D6 | `encodeURIComponent(id)` in `useDocSource`'s query URL | Node IDs containing `/` (e.g. `01-ui/02-dag`) must be percent-encoded so the browser and Vite proxy do not treat the `/` as a path separator. The server's `/:nodeId{.+}` matcher decodes it correctly via Hono's param extraction. |
| D7 | `findRawDocForNodeId` stays in `docs.ts` (or is extracted to a shared helper) — no new parser export | The function is a server-internal utility (maps docs-relative paths to NodeIds). Promoting it to `@ledger/parser` would create a public API for what is a server routing concern. Shared helper in `server/src/` if both `docs.ts` and `health.ts` need it. |

---

## Open Issues

- **`useDocValidationErrors` Topbar banner still reads build-time data.** Intentionally deferred (see Out of scope). Next round trigger. *(Priority: LOW.)*
- **`useDocSource` placeholder fallback removes the glob only as primary path, not entirely.** Once the API is stable and the server-down-on-cold-load UX is accepted as "empty panel," the `sourceMap` glob can be deleted and the bundle shrinks. Not worth a round on its own. *(Priority: TRIVIAL.)*

---

## Implementation Notes

**Spec review — 2026-06-12 — APPROVED_WITH_CHANGES → APPROVED**

Reviewer confirmed APPROVED_WITH_CHANGES; fixes applied before promoting to APPROVED.

- **S1 (Blocking, fixed):** The original spec incorrectly stated that `IssueItem` and `parseIssueItems` were "already exported from `@ledger/parser`." They were not — both lived client-side (`app/src/lib/types.ts` and `app/src/lib/parseIssues.ts`). The server scanner has a private `parseOpenIssueItems` with a different return type (`OpenIssueItem`). Fix: added item 0 as an explicit prerequisite promotion step; corrected the Architecture overview and Item 3 prose. Item 3 now depends on item 0.
- **S2 (Should-fix, fixed):** `server/src/routes/health.ts` is a 14-line stub (`GET /` only). Item 3 prose now lists the required imports explicitly rather than implying they're already present.
- **S3 (Should-fix, fixed):** `DocSource` type compatibility with the item-1 endpoint shape (`{ id: NodeId; raw: string }`) is now confirmed inline in Item 3 prose — the `as DocSource` cast is safe.
- **N1 (Nit, fixed):** `subtreeCosts: PLACEHOLDER_COSTS` unchanged status now explicitly noted in Item 4.
- **N2 (Nit, fixed):** `staleTime: 60_000` for the issues query now noted inline in Item 4 (was only in D5).

---

**Implementation review — 2026-06-12 — NEEDS_REVISIONS → fixes applied**

Reviewer confirmed three blocking findings; all resolved:

- **B1 (Blocking, fixed):** `server/test/docs.test.ts` had no coverage for `GET /api/docs/:nodeId/source` (200 or 404). `server/test/health.test.ts` had no coverage for `GET /api/health/issues` (list shape, sort order, empty-node case). Both required by Requirements §5. Added 3 source tests + 4 issues tests; server suite goes 413 → 420 passing.
- **B2 (Blocking, fixed):** `app/src/components/docs/useDocSource.test.tsx` and `app/src/components/health/useHealthData.test.tsx` did not exist. Added both with 4 tests each covering 200, 404/5xx, empty, and disabled-query paths.
- **B3 (Blocking, fixed):** `useHealthData.ts:72` declared `const issues: IssueItem[] = issuesData ?? []` outside `useMemo` but referenced it in the dependency array — `??` produces a new array reference on every render when `issuesData` is undefined, causing `useMemo` to thrash during loading. Fix: moved `const issues` inside `useMemo`, dependency changed from `[nodes, issues]` to `[nodes, issuesData]`.

Incidental fixes during B1:
- `GET /api/docs/:nodeId/source` route pattern fixed from `/:nodeId{.+}/source` to `/:nodeId{.+[^/]}/source` — the `.+` regex was greedy and consumed the `/source` suffix as part of the nodeId, causing every `/source` request to fall through to the `/:nodeId{.+}` catch-all (404). Verified via Hono routing test.
- `GET /api/health/issues` was mistakenly placed in `healthRoute` (mounted at `/api/_health`) rather than `scansRoute` (mounted at `/api/health`). Moved to `scansRoute`.
- Added `server/__fixtures__/sample-project/docs/04-issues.md` fixture with HIGH/MEDIUM/LOW issues for endpoint test coverage; updated `server/test/scanner.test.ts` size-findings assertion to include `04-issues`.

---

## Verification

Per-item acceptance check that the verifier confirms before promoting to COMPLETE:

| # | Item | Verification |
|---|------|-------------|
| V1 | `GET /api/docs/:nodeId/source` endpoint exists and returns `{ id, raw }` on a valid nodeId | `curl -s http://127.0.0.1:4180/api/docs/01-ui%2F02-dag/source \| jq .id` returns `"01-ui/02-dag"`; status 200. |
| V2 | `GET /api/docs/:nodeId/source` returns 404 on unknown nodeId | `curl -o /dev/null -w "%{http_code}" http://127.0.0.1:4180/api/docs/nonexistent/source` prints `404`. |
| V3 | `GET /api/health/issues` returns sorted `IssueItem[]` | `curl -s http://127.0.0.1:4180/api/health/issues \| jq '[.issues[].priority] \| unique'` contains only known priority values; first element is `HIGH` if any HIGH issues exist. |
| V4 | `useDocSource` is a TanStack Query hook; `import.meta.glob` remains only as `placeholderData` source | `grep -n "import.meta.glob" app/src/components/docs/useDocSource.ts` shows the glob is still present; `grep -n "useQuery" app/src/components/docs/useDocSource.ts` shows the query call. |
| V5 | `useHealthData` has no `import.meta.glob` | `grep "import.meta.glob" app/src/components/health/useHealthData.ts` exits non-zero (no match). |
| V6 | Docs panel renders live document body (manual) | `/docs/01-ui%2F02-dag` in browser renders the document; DevTools Network shows `GET /api/docs/01-ui%2F02-dag/source` (200). |
| V7 | Health panel renders live issues (manual) | `/health` in browser shows open issues; DevTools Network shows `GET /api/health/issues` (200). |
| V8 | Server-down graceful degradation (manual) | With API stopped: Docs panel renders via placeholder; Health panel renders with empty issues list. No error spinner. |
| V9 | All workspace gates green | `pnpm typecheck && pnpm lint && pnpm test && pnpm build` from repo root all exit 0; test count reflects new server + hook tests. |
| V10 | `pnpm -C e2e test` passes | Suite exit 0; no new failures; docs and health smoke tests pass. |
| V11 | Originating Open Issues struck through | `04-api-server/05-ui-hook-migration.md` and `04-api-server/00-api-server.md` both carry strikethrough + forward pointer on the "Remaining UI consumers not migrated" bullets (verified at merge time per stage 10). |

---

## Children

None.
