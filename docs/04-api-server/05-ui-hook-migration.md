# UI Hook Migration — `useDocGraph` → TanStack Query

**Node ID:** `04-api-server/05-ui-hook-migration`
**Parent:** `04-api-server` (`docs/04-api-server/00-api-server.md`)
**Status:** APPROVED
**Created:** 2026-05-26
**Last Updated:** 2026-05-26 (SPEC_REVIEW → APPROVED, audit applied)

**Dependencies:** `04-api-server/03-server-package`

---

## Requirements

Migrate the UI's `useDocGraph` hook from the build-time `loadDocNodes()` source to a runtime TanStack Query against `GET /api/docs`. This is the **first UI consumer** to flip per PRD §7.2's per-endpoint migration discipline — the explicit reason the parent insists on landing one migrated consumer in the same node as the API server, rather than shipping the server with no validated client. It is also the **closing child** of `04-api-server`: it carries the cross-cutting end-to-end gates (DAG re-renders on doc edit; UI degrades gracefully when the server is down; `03-project-metadata`'s "docs path validation" Open Issue closure; CLAUDE.md doc sync).

This child is the smallest in implementation size (one hook file, one test file, one Vite-config edit, one env-default) but carries the most end-to-end-verifiable behavior. The hook's existing JSDoc already telegraphs the swap ("Replace with a TanStack Query against the API once the backend exists. Kept as a hook so the swap is a one-line change in DagCanvas.") — this child cashes that comment in.

In scope for v1:

1. **Migrate `app/src/components/dag/useDocGraph.ts`** to a TanStack Query. Endpoint: `GET /api/docs`. `placeholderData: () => loadDocNodes()` for build-time fallback (parent §Spec Review N3 — `loadDocNodes()` is module-singleton-cached so re-runs are free). `staleTime: 30_000`. `API_BASE = "/api"` (no env var — proxy-only contract per parent §Spec Review S1).
2. **Add the Vite dev proxy** to `app/vite.config.ts`: `server.proxy: { "/api": { target: "http://127.0.0.1:4180", changeOrigin: false } }`. Same-origin from the browser's view (proxy-only contract); CORS is never exercised. No conditional proxy logic — if the proxy target is unreachable, the placeholder data covers the gap and the query retries per TanStack defaults.
3. **Add a mocked-fetch hook test** at `app/src/components/dag/useDocGraph.test.tsxx` (`.tsx` because the test wrapper uses JSX; Spec Review SF2). Uses `vi.spyOn(global, "fetch")` (or `vi.stubGlobal("fetch", ...)`) to return a canned `Response` with a known `{ nodes, validation }` shape; asserts the hook returns the parsed nodes; asserts a second mock with a server-error response falls back to the placeholder data (the real `loadDocNodes()` against the actual `docs/` tree).
4. **Close `03-project-metadata`'s "docs path validation" Open Issue.** That Open Issue explicitly handed off to `04-api-server`. The closure has been pending across all prior children; this child files it. Strike through the Open Issue entry with a closure note: `Closed by 04-api-server (specifically 03-server-package's pathSafety.ts + the assertContained call in loadProjectContext). See packages/parser → server runtime layer.`
5. **CLAUDE.md doc sync.** Update three lines:
   - "Running the app" section gains a `pnpm exec ledger <project-path>` invocation (the recommended end-to-end run) alongside the existing `pnpm -C app dev`.
   - "Hard constraints" / build-order line bumped: `04-api-server` from APPROVED (decomposed) to **COMPLETE** once this child merges (operator does this at merge time per leaf-workflow stage 10 — this child's spec just notes the requirement; the actual edit lands in the parent's stage-10 merge commit).
   - The round-2 / next-focus sentence shifts: `04-api-server` complete; `05-task-runner` next.
6. **End-to-end manual verification (Acceptance check)** that proves the contract:
   - Start the server (`pnpm exec ledger /Users/dennis/code/ledger --no-open`).
   - Start the UI (`pnpm -C app dev`).
   - Open `http://localhost:4179/dag`. DAG renders.
   - Edit a doc's `**Status:**` line on disk. Wait ≤30s (TanStack `staleTime`). The DAG status pill updates **without restarting the UI dev server**. (Today this requires a hard refresh of the build.)
   - Stop the API server. DAG keeps rendering against the placeholder data (no error spinner; the data is whatever was in the last successful response or — if the page is loaded fresh after the server is down — the build-time `loadDocNodes()` fallback).
   - Restart the API server. DAG resumes fetching live data on the next stale window.

**Out of scope for v1:**

- **Migration of `useHealthData`, `useDocSource`, `useTask`, `useTaskList`, `useLogStream`.** Each of those is a follow-up commit per PRD §7.2's per-endpoint discipline. `useHealthData` and `useDocSource` flip to `GET /api/docs/:nodeId` and `GET /api/docs` directly once the routes prove out here; the orchestration hooks wait for `05-task-runner` to define their wire shape. Listed as parent Open Issues; not this child's concern.
- **WebSocket / SSE for the docs endpoint.** Polling-via-staleTime is adequate; SSE lands with the log-stream endpoint in `05-task-runner`. The 30s `staleTime` is the v1 cadence; tunable later.
- **Optimistic mutations / cache invalidation around writes.** No write endpoints exist (parent §D7); no mutation hooks to invalidate. When writes arrive with `05-task-runner`, the query keys (`["docs"]`, `["docs", nodeId]`) will be the invalidation targets.
- **Error UI for `/api/docs` failures.** D6 — placeholder data covers the gap silently. A dedicated error-state banner in the DAG panel is a future polish item; today's behavior (silent fallback to build-time data + console error from TanStack's retry logic) is acceptable v1.
- **Background refetch on window focus.** TanStack Query's default `refetchOnWindowFocus: true` is left enabled. Whether this fires too aggressively (the operator alt-tabs constantly during dev) is a UX call to revisit if it becomes annoying.
- **Type-export shape changes.** `useDocGraph` continues to return `DocNode[]` — the same shape it returns today, the same shape `DagCanvas` consumes. No call-site changes outside the hook itself.
- **Env-var-based API base** (`VITE_LEDGER_API`). Parent §"UI consumer migration" rejected this in favor of the Vite proxy. The hook hardcodes `API_BASE = "/api"`. If a future story requires cross-origin (e.g. UI hosted on `claude.ai/code` against a remote ledger server), that's its own node with its own auth concerns.
- **TanStack Query devtools.** The `@tanstack/react-query-devtools` package would be a useful dev-time addition but it's a new dep and a UI surface change. Defer; mount in a future polish pass if needed.
- **`useDocGraph` Suspense integration.** TanStack Query v5 supports Suspense via the `suspense: true` option, but the existing consumers don't wrap in Suspense boundaries. Wiring Suspense correctly across the tree is a separate refactor. v1 sticks with the data-returned-or-empty-array pattern that the placeholder-data approach enables.
- **Migration of `docValidationErrorPaths` consumer (Topbar dev banner).** The Topbar reads `docValidationErrorPaths` from `parseDocs.ts` to count validation errors. The `GET /api/docs` response carries the same list in its `validation.errorPaths` field. Wiring the Topbar banner to the live API is a small parallel migration; deferred to keep this child's scope tight. Logged as Open Issue.

---

## Design

### File-level diff

```
app/src/components/dag/useDocGraph.ts          [modified — TanStack Query w/ placeholderData fallback]
app/src/components/dag/useDocGraph.test.tsx     [new — mocked-fetch hook test]
app/vite.config.ts                             [modified — server.proxy: "/api" → 127.0.0.1:4180]
docs/03-project-metadata.md                    [modified — close "docs path validation" Open Issue]
docs/04-api-server/05-ui-hook-migration.md     [this spec — status transitions]
docs/04-api-server/00-api-server.md                          [modified — §Children manifest row status]
CLAUDE.md                                      [modified at parent's stage-10 merge — see Acceptance]
```

No source under `packages/parser/` or `server/` is modified by this child.

### `useDocGraph.ts` — the migration

Today (`app/src/components/dag/useDocGraph.ts`, post-`02-parser-extraction`):

```ts
import { useMemo } from "react";
import { loadDocNodes } from "@/lib/parseDocs";
import type { DocNode } from "@ledger/parser";

/**
 * Phase-1 data source: the parsed `docs/**` tree, frozen at build time.
 * Replace with a TanStack Query against the API once the backend exists.
 * Kept as a hook so the swap is a one-line change in DagCanvas.
 */
export function useDocGraph(): DocNode[] {
  return useMemo(() => loadDocNodes(), []);
}
```

After:

```ts
import { useQuery } from "@tanstack/react-query";
import { loadDocNodes } from "@/lib/parseDocs";
import type { DocNode } from "@ledger/parser";

const API_BASE = "/api";

interface DocsApiResponse {
  nodes: DocNode[];
  validation: { errorPaths: string[] };
}

/**
 * Runtime data source: TanStack Query against GET /api/docs.
 * `placeholderData` returns the build-time `loadDocNodes()` so the
 * first paint is instant and the UI degrades to the build-time tree
 * if the server is unreachable. The Vite dev proxy (vite.config.ts)
 * makes `/api/*` same-origin during development; production builds
 * carry no baked-in API host.
 */
export function useDocGraph(): DocNode[] {
  const { data } = useQuery({
    queryKey: ["docs"],
    queryFn: async (): Promise<DocNode[]> => {
      const res = await fetch(`${API_BASE}/docs`);
      if (!res.ok) throw new Error(`/api/docs returned ${res.status}`);
      const body = (await res.json()) as DocsApiResponse;
      return body.nodes;
    },
    placeholderData: () => loadDocNodes(),
    staleTime: 30_000,
  });
  return data ?? [];
}
```

Notes on the migration:

- **`API_BASE = "/api"` hardcoded.** Vite's dev proxy in `vite.config.ts` (next section) catches `/api/*` requests and forwards them to `http://127.0.0.1:4180/api/*`. The browser sees same-origin requests; no env var needed.
- **`placeholderData` returns `loadDocNodes()` directly.** TanStack v5 calls `placeholderData` lazily on render. `loadDocNodes()` is module-singleton-cached (`parseDocs.ts:_built`), so the second-through-Nth call is a returning constant — no recomputation cost.
- **`data ?? []` final return.** `data` is `undefined` only before the first render's `placeholderData` resolves; the empty-array fallback prevents `data` from being `undefined` in any component path that reads it. `DagCanvas` and other consumers continue to receive `DocNode[]` with the same semantics as today (zero elements before data arrives, real data thereafter).
- **No `enabled` flag.** The hook fetches unconditionally. If the operator wants to disable the hook (e.g. on a non-DAG route), the consumer wraps in `<QueryClientProvider>` boundary or sets `enabled` at the consumer level. Today's `DagCanvas` always wants the data.
- **`retry` left at TanStack default (3 attempts with exponential backoff).** Adequate for transient network blips. If the server is genuinely down, the placeholder data covers the UI until the user reloads or the server comes back.

### `app/vite.config.ts` — the dev proxy

The existing `vite.config.ts` has `server.strictPort: true` and `server.port: 4179`. The change:

```diff
   server: {
     port: 4179,
     strictPort: true,
+    proxy: {
+      "/api": {
+        target: "http://127.0.0.1:4180",
+        changeOrigin: false,
+      },
+    },
   },
```

`changeOrigin: false` keeps the request's `Host` header as `localhost:4179` — irrelevant to the API server (which doesn't inspect host) but the explicit `false` documents intent.

Vite's proxy uses `http-proxy` under the hood. On the API server being unreachable, the proxy returns a 502 to the browser; TanStack Query's `queryFn` sees the failure, the placeholder data takes over.

**This change does not touch `server.fs.allow`, the `client`/`server` test project definitions, or the `tailwindcss` plugin** — those are settled by prior nodes. The single-property addition is the entire diff.

### `useDocGraph.test.tsx` — the mocked-fetch test

```ts
// app/src/components/dag/useDocGraph.test.tsx
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useDocGraph } from "./useDocGraph";
import { loadDocNodes } from "@/lib/parseDocs";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useDocGraph", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns nodes from /api/docs when the fetch succeeds", async () => {
    const mockNodes = [
      { id: "test-node", parentId: null, title: "Test", status: "DRAFT", dependsOn: [] },
    ];
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ nodes: mockNodes, validation: { errorPaths: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { result } = renderHook(() => useDocGraph(), { wrapper });
    await waitFor(() => {
      expect(result.current).toEqual(mockNodes);
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/docs");
  });

  it("falls back to placeholderData (loadDocNodes) on first render", () => {
    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useDocGraph(), { wrapper });
    expect(result.current).toEqual(loadDocNodes());
  });

  it("falls back to placeholderData when /api/docs returns 500", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response("server error", { status: 500 })
    );

    const { result } = renderHook(() => useDocGraph(), { wrapper });
    await waitFor(() => {
      // After the failed fetch, the placeholderData still backs the return value
      // (TanStack Query keeps the placeholder when the query errors and has no successful data).
      expect(result.current).toEqual(loadDocNodes());
    });
  });

  it("hits /api/docs exactly once within staleTime", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ nodes: [], validation: { errorPaths: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { rerender } = renderHook(() => useDocGraph(), { wrapper });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    // Re-render in the same wrapper (same QueryClient) — should not refetch within staleTime.
    rerender();
    rerender();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
```

Test file is `useDocGraph.test.tsx` (`.tsx` extension) because the wrapper uses JSX. The existing `vite.config.ts` Vitest `client` project includes `["src/**/*.test.{ts,tsx}"]` so `.tsx` is in scope; matches the `LogEventRow.test.tsx` precedent (Spec Review SF2 — operator pinned the filename rather than leaving it conditional).

`@testing-library/react` is already a dev dep (`app/package.json` line 35). `@tanstack/react-query` is a runtime dep (line 16). No new deps for the tests.

### Closing `03-project-metadata`'s "docs path validation" Open Issue

In `docs/03-project-metadata.md`'s §Open Issues, the entry currently reads:

```markdown
- **`docs` path validation.** The schema validates that `docs` is a non-empty string with no leading/trailing slash; it does not validate (a) that the path actually exists on disk relative to the project root, nor (b) that the string is free of `..` traversal segments. Both checks belong at API-server load time (`04-api-server`), where the filesystem and a real runtime exist. ... *(Priority: LOW for this node — surfaces as a Vite import error if `docs` is misnamed in v1, which is acceptable; MEDIUM for `04-api-server` where real filesystem reads happen.)*
```

The closure edit prepends `~~` strikethrough and appends a closure note. The "mechanism vs verification" framing is the cleaner attribution (Spec Review N1):

```markdown
- ~~**`docs` path validation.** ...~~ **Closed 2026-05-26.** Mechanism implemented in `04-api-server/03-server-package` (`server/src/pathSafety.ts`'s `assertContained` rejects `..` segments and absolute non-descendants; `server/src/context.ts`'s `loadProjectContext` calls it on the resolved `docsRoot` at server start; `server/src/readDocs.ts` re-asserts defensively per file read). A `"docs": "../escape"` value fails server startup with a `PathContainmentError` and no port is bound. Closure verified end-to-end in `04-api-server/05-ui-hook-migration` once the live API path renders through the DAG.
```

The closure note lands in this child's commit so the parent's stage-10 merge sees `03-project-metadata.md`'s Open Issue already closed. (Alternative: land it in `03-server-package`'s commit when that child completes; chose to bundle here for two reasons: (a) keeps the cross-cutting administrative work in one place, (b) the Open Issue's resolution becomes "verifiable" only when the end-to-end DAG-renders-against-the-API path works, which is this child's gate.)

### CLAUDE.md doc sync

This child's commit does **not** edit CLAUDE.md. CLAUDE.md gets edited at the parent's stage-10 merge per leaf-workflow ("merge --no-ff bundles the cross-doc sync into the merge commit"). What this child's spec specifies is **what** the operator must change at that point:

- "Running the app" gains: `pnpm exec ledger /path/to/project --no-open` (the canonical server invocation alongside `pnpm -C app dev`).
- The build-order line: `04-api-server (APPROVED — decomposed into 5 sub-leaves...)` becomes `04-api-server COMPLETE (v1) → 05-task-runner (PLANNED — next)`.
- The round-2/next-focus sentence: shift from "API server in progress" to "API server complete; UI's first endpoint migration (useDocGraph) live; remaining UI consumers + 05-task-runner next."

The exact wording is the operator's call at stage 10. This spec records the required content.

### Acceptance check (manual)

A reviewer running the worktree must observe:

1. `useDocGraph.ts` exports a TanStack Query hook against `GET /api/docs` with `placeholderData: () => loadDocNodes()` and `staleTime: 30_000`. No env-var indirection; `API_BASE = "/api"` hardcoded.
2. `useDocGraph.test.tsx` exists; `pnpm -C app test` includes it in the run and reports passing tests.
3. `app/vite.config.ts` has the proxy block (`server.proxy: { "/api": ... }`) and nothing else changed in the file.
4. **End-to-end DAG-renders-against-the-live-API:**
   - Terminal A: `pnpm exec ledger /Users/dennis/code/ledger --no-open --port 4180` (server boots).
   - Terminal B: `pnpm -C app dev` (Vite on 4179).
   - Browser: `http://localhost:4179/dag` renders all current docs (matches the count `curl http://127.0.0.1:4180/api/docs | jq '.nodes | length'` reports).
   - DevTools Network tab shows a request to `/api/docs` (same-origin, 200, JSON body).
5. **Edit-on-disk re-render:**
   - With both servers running and the DAG visible, edit any doc's `**Status:**` header on disk to a different valid status (e.g. swap DRAFT ↔ APPROVED on a test doc — pick one and revert afterwards).
   - Wait up to 30s (TanStack `staleTime`).
   - The DAG node's status pill updates **without restarting Vite or refreshing the browser**.
   - Revert the doc edit and verify the pill reverts on the next stale window.
   - Note: window-focus refetch is disabled globally in `main.tsx:13` (`refetchOnWindowFocus: false`), so clicking/focusing the page does NOT trigger an immediate refetch — only `staleTime` does. This is by design (Spec Review SF1).
6. **Server-down placeholder fallback:**
   - With the UI still open, stop the API server (`Ctrl-C` in Terminal A).
   - The DAG keeps rendering (last-known data or the build-time placeholder).
   - DevTools Network shows the 502 from the Vite proxy on the next refetch attempt, but no UI error spinner / no white-screen.
   - Restart the server; on the next stale window the DAG resumes fetching live data.
7. **Hard-refresh placeholder fallback:**
   - With the API server stopped, hard-refresh the browser (Cmd-Shift-R).
   - The DAG renders the build-time `loadDocNodes()` tree (the placeholder is the only available data on a cold page load with no successful fetch).
   - No console error blocking render; TanStack's fetch error is logged but the placeholder data covers the UI.
8. **No CORS errors anywhere.** DevTools Console is free of CORS-related messages because every API request is same-origin via the proxy.
9. **Workspace gates green:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` from the repo root all exit zero. `app/` test count incremented by the new `useDocGraph.test.tsx` (~4 tests).
10. **`03-project-metadata.md`'s "docs path validation" Open Issue is struck-through** with the closure note pointing at this child. `git diff main..HEAD -- docs/03-project-metadata.md` shows the strikethrough + appended note as the only change to that file.
11. **No other UI hook is touched.** `git diff main..HEAD --stat -- app/src/components/` shows `dag/useDocGraph.ts` modified, `dag/useDocGraph.test.tsx` new, and nothing else.
12. **`app/server/`, `app/tsconfig*.json`, `packages/parser/`, `server/`** are untouched. `git diff main..HEAD -- app/server/ app/tsconfig.app.json app/tsconfig.node.json app/tsconfig.json packages/parser/ server/` is empty.
13. **Bundle delta** reported in Implementation Notes: `app/` gzip JS increases by < 1 KB (the hook gains ~10 lines + one `@tanstack/react-query` import that's already in the bundle).
14. **CLAUDE.md content edits** are deferred to the parent's stage-10 merge per leaf-workflow; this child's spec documents the required content but does not commit it.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | TanStack Query for the migration, not a hand-rolled hook with `useEffect` + `useState` | TanStack Query is already a runtime dep (`@tanstack/react-query@5.62.7` from `01-ui`). It handles caching, refetching, retry/backoff, and SSR-friendly suspense out of the box. Hand-rolling would re-implement all of that worse. Inherited from `01-ui`'s D6 (server cache choice). |
| D2 | `placeholderData: () => loadDocNodes()` over `initialData` | `placeholderData` is the right semantic for "show this until the real fetch returns" — TanStack still fires the query and updates `data` on response. `initialData` would cache the placeholder as if it were a successful fetch result, and the query would not refetch within `staleTime`. We want the live fetch every staleTime window; `placeholderData` is the matching primitive. |
| D3 | `staleTime: 30_000` | Long enough that re-renders don't thrash the API server (~2 fetches per minute per open tab). Short enough that an operator edit-and-wait pattern feels live (the parent's Acceptance gate 5 explicitly tests within-30s re-render). Tunable later if either side becomes painful. |
| D4 | Vite dev proxy over env-var `VITE_LEDGER_API` | Inherited from parent §Spec Review S1. Proxy makes requests same-origin from the browser; no CORS, no baked-in hostname in production builds. Env var would require build-time configuration per environment, which the v1 deployment model (operator runs both processes locally) doesn't need. |
| D5 | `API_BASE = "/api"` hardcoded | Same reason as D4. There is no v1 case where the UI needs a different API base. If a future story (hosted UI against remote server) needs it, that story owns the env-var introduction; v1 stays simple. |
| D6 | Silent placeholder fallback on API failure (no error UI) | The placeholder data is meaningful (build-time tree, last-good snapshot). A loud error UI on transient server-down would be more disruptive than the silent fallback, especially during dev when restarting the API server is a routine `Ctrl-C`+arrow-up. A dedicated error banner is logged as a future polish item (parent Open Issues). |
| D7 | `useDocGraph` returns `data ?? []`, not `data!` or a Suspense throw | `placeholderData` ensures `data` is rarely undefined, but the type system still says it could be. The `?? []` keeps the contract identical to today's `useDocGraph(): DocNode[]` — every consumer gets an array. Suspense integration would require wrapping consumers in `<Suspense>` boundaries throughout the tree; that's a separate refactor. |
| D8 | Close `03-project-metadata`'s Open Issue in this child, not in `03-server-package` | The closure is verifiable end-to-end only when the live API path works through the UI. This child is where that path lights up. Bundling closure here keeps the cross-cutting administrative work in one place; `03-server-package` ships the mechanism (`assertContained`, `loadProjectContext`), this child cashes the verification. |
| D9 | CLAUDE.md edits deferred to parent's stage-10 merge | Per leaf-workflow stage 10 ("the `--no-commit` lets you inspect the merge tree and apply cross-doc summary updates before the merge commit lands"). CLAUDE.md is outside this child's scope and would be a merge-conflict surface if every child touched it; the merge commit is the right place. |
| D10 | Hook test uses mocked `global.fetch`, not MSW (Mock Service Worker) | MSW would be over-engineered for a single-endpoint test with three response shapes. The `vi.spyOn(global, "fetch")` pattern is direct, exercises the exact fetch path the hook uses, and matches the project's existing test conventions (e.g. `LogEventRow.test.tsx` mocks similarly). If a future test suite mocks ten endpoints across multiple hooks, revisit MSW. |
| D11 | Test wrapper instantiates a fresh `QueryClient` per `renderHook` call | A shared `QueryClient` across tests would leak cache state between them — a test that hits `/api/docs` and gets a 200 would prefill the cache for the next test expecting a 500. Fresh client per test costs ~1 ms and isolates state. The wrapper is a 5-line factory; no test-utility abstraction needed. |

---

## Open Issues

- **Remaining UI consumers not migrated** — `useDocSource`, `useHealthData`'s remaining surface, the orchestration hooks. Each is its own follow-up commit per PRD §7.2. The orchestration hooks specifically wait for `05-task-runner`. Inherited from parent. *(Priority: MEDIUM for the docs hooks, LOW for orchestration.)*
- **Topbar's `docValidationErrorPaths` consumer still reads build-time data.** The Topbar's dev-only banner reads from `parseDocs.ts`. The API's `/api/docs` response carries the same list in its `validation.errorPaths` envelope; wiring the Topbar to surface live errors is a small parallel migration that could land in this child but was scope-cut to keep the diff tight. Deferred. *(Priority: LOW — the dev banner is dev-only and rarely critical.)*
- **`refetchOnWindowFocus` posture inherited from `main.tsx` global.** Spec Review SF1 surfaced that `app/src/main.tsx:13` already sets `defaultOptions: { queries: { refetchOnWindowFocus: false } }` on the global `QueryClient` — overriding TanStack's default of `true`. After this migration, the DAG panel does **not** refetch on window focus; only the 30s `staleTime` triggers refetches. If per-hook focus-refetch is later desired (e.g. for a "freshly opened the tab → re-validate immediately" UX), override locally with `refetchOnWindowFocus: true` in the `useQuery` options. *(Priority: TRIVIAL — current behavior is correct; just clarifies the inheritance.)*
- **No DevTools integration.** `@tanstack/react-query-devtools` is the canonical inspector for query state. Adding it as a dev dep with a `<ReactQueryDevtools />` mount in `App.tsx` would help debugging across all future query hooks. Polish; defer. *(Priority: LOW.)*
- **Vite proxy hardcodes port 4180.** If the operator runs the API on a different port (e.g. `LEDGER_PORT=4200`), the proxy target must update too. Today this requires editing `vite.config.ts`. A future polish: read the port from an env var (`VITE_LEDGER_PROXY_PORT`) with 4180 as default. *(Priority: TRIVIAL.)*
- **Hook test doesn't exercise the `useQuery` retry path.** D7 leaves retry at default (3 attempts with backoff); the test mocks single-shot responses. If TanStack's retry behavior ever materially changes, the test wouldn't catch it. Add a retry-specific test when that risk becomes concrete. *(Priority: TRIVIAL.)*
- **`changeOrigin: false` in the proxy may break some servers** that inspect the `Host` header. Hono doesn't; `@hono/node-server` doesn't. If a future middleware does, flip to `true`. *(Priority: TRIVIAL.)*

---

## Spec Review (2026-05-26)

Independent spec review run in a clean Sonnet context against the DRAFT. Verdict: READY_FOR_APPROVAL, no blockers. Two should-fixes (a factual correction about `refetchOnWindowFocus` global, a test-filename clarity issue) and four nits (one closure-attribution cleanup, three no-action confirmations). Audit:

| # | Finding | Resolution |
|---|---------|------------|
| SF1 | Spec's Open Issue said "`refetchOnWindowFocus` may be too aggressive — TanStack default is `true`." Actually `app/src/main.tsx:13` already sets `refetchOnWindowFocus: false` globally on the `QueryClient`. The Acceptance gate's "click an empty area to trigger refetch on focus" path would not fire. | Operator verified `main.tsx:13` directly. Rewrote the Open Issue entry to reflect inheritance from the global (not "may be aggressive" but "is disabled globally, by design"). Removed the "OR click an empty area" path from Acceptance gate 5 and Verification gate 5; both now note the global is `false` and only `staleTime` triggers refetches. |
| SF2 | Spec hedged "rename to `.test.tsx` if needed" — the project's vitest config (`include: ["src/**/*.test.{ts,tsx}"]`) requires `.tsx` for JSX, no ambiguity. | Hardcoded `useDocGraph.test.tsx` in all references (file-level diff, test snippet comment, Verification item 2). Updated the prose paragraph to confirm `.tsx` is in scope per the existing vitest config and matches the `LogEventRow.test.tsx` precedent. |
| N1 | `03-project-metadata` Open Issue closure note had dual attribution ("Closed by `03-server-package`" + "Closure finalized in `05-ui-hook-migration`"). Future reader would wonder which to trust. | Rewrote the closure as "Mechanism implemented in `03-server-package` (`pathSafety.ts`, `assertContained`); closure verified end-to-end in `05-ui-hook-migration` once the live API path renders through the DAG." Single coherent attribution. |
| N2 | Parent spec's `useDocGraph` snippet imports `DocNode` from `@/lib/types`; this child's after-migration snippet imports from `@ledger/parser`. Parent's snippet is stale pre-decomposition. | No edit — this child's spec is authoritative for the migration code; the parent's snippet is reference-only and the broader stage-10 doc sync covers parent updates if needed. |
| N3 | `vi.spyOn(global, "fetch")` requires `fetch` to exist on `global` in jsdom. Node 18+ native fetch is available in Vitest with `globals: true`. The spec already mentions `vi.stubGlobal("fetch", vi.fn())` as fallback in parens. | No edit — fallback already documented. |
| N4 | `staleTime` test comment says "Re-render in the same wrapper (same QueryClient)" — the wrapper factory creates a new client per `renderHook` call, but only ONE call per test, so the same client is used across `rerender()` calls. Comment is slightly misleading. | No edit — the test is correct as written; rewording the comment is a polish call the implementer makes at code time. |

Nothing punted. SF1 was caught by reading the actual `main.tsx` global; the spec is now factually correct. SF2 is a mechanical filename pin. The remaining four findings are either confirmations or minor doc-attribution cleanup.

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. `app/src/components/dag/useDocGraph.ts` is a TanStack Query hook against `GET /api/docs` with `placeholderData: () => loadDocNodes()` and `staleTime: 30_000`. `API_BASE = "/api"` hardcoded; no env-var indirection.
2. `app/src/components/dag/useDocGraph.test.tsx` exists; `pnpm -C app test` includes it and reports ≥4 passing tests.
3. `app/vite.config.ts` has `server.proxy: { "/api": { target: "http://127.0.0.1:4180", changeOrigin: false } }`; no other field changes in that file.
4. **All workspace gates green:**
   - `pnpm -C app typecheck` → 0
   - `pnpm -C app lint --max-warnings=0` → 0
   - `pnpm -C app test` → 0 (test count incremented by new tests)
   - `pnpm -C app build` → 0
   - All `packages/parser/` and `server/` gates still green (unchanged from `04-cli-launcher`)
   - `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` from repo root → all 0
5. **End-to-end live-render gate** (the parent's Acceptance gate; verified manually by the operator at stage 8):
   - `pnpm exec ledger /Users/dennis/code/ledger --no-open --port 4180` (terminal A) + `pnpm -C app dev` (terminal B).
   - `http://localhost:4179/dag` renders the live data from the API.
   - DevTools shows the `/api/docs` request (same-origin via proxy, 200, JSON).
   - Editing a doc's `**Status:**` line on disk updates the DAG within 30s without restarting the UI. (Window-focus refetch is disabled globally per `main.tsx:13` — only `staleTime` triggers refetches.)
   - Stopping the API server keeps the UI rendering (placeholder data covers the gap).
   - Hard-refreshing with the API down renders the build-time tree.
   - Restarting the API server resumes live updates on the next stale window.
6. **`03-project-metadata.md` Open Issue closed:** the "docs path validation" entry is struck-through with a closure note pointing at this child. Verified by `git diff main..HEAD -- docs/03-project-metadata.md`.
7. **No other UI hook is modified.** `git diff main..HEAD -- app/src/components/` shows only `dag/useDocGraph.ts` modified and `dag/useDocGraph.test.tsx` new.
8. **`app/server/`, `app/tsconfig*.json`, `packages/parser/`, `server/`** are all untouched. `git diff main..HEAD -- app/server/ app/tsconfig.app.json app/tsconfig.node.json app/tsconfig.json packages/parser/ server/` is empty.
9. **Bundle delta** reported in Implementation Notes; `app/` gzip JS increases by < 1 KB.
10. **No CORS errors** in the browser console at any point during the manual gates.
11. **CLAUDE.md edits** are deferred to the parent's stage-10 merge — the spec documents what content the operator updates (Running-the-app `pnpm exec ledger` line, build-order COMPLETE bump, round-2/next-focus shift), but this child's commit does **not** modify CLAUDE.md. Verified by `git diff main..HEAD -- CLAUDE.md` being empty in this child's worktree.
12. `04-api-server/00-api-server.md` §Children manifest row for `05-ui-hook-migration` reads the current status; final promotion to COMPLETE bumps both the spec's Status header and the parent's row in the same commit.
13. **Parent `04-api-server` is ready to promote APPROVED (decomposed) → COMPLETE** after this child merges, since all five children are then COMPLETE. The parent's stage-10 merge commit bundles the CLAUDE.md sync.

---

## Children

None.
