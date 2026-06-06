# Doc-Graph Data Source & Model

**Node ID:** `01-ui/02-dag/01-data-source`
**Parent:** `01-ui/02-dag`
**Status:** PLANNED
**Created:** 2026-06-06
**Last Updated:** 2026-06-06

---

## Requirements

Provide the `DocNode[]` data model that the DAG panel renders, and the live + build-time machinery that produces it. This is the foundational data layer the other `02-dag` children consume; it owns "what data feeds the graph," nothing about geometry or pixels.

1. **Live primary source.** `useDocGraph.ts` fetches `GET /api/docs` via TanStack Query (`staleTime: 30_000`), same-origin through the Vite dev proxy (`/api/*` → `http://127.0.0.1:4180/api/*`). There is no SSE push; the poll is the "live" mechanism.
2. **Build-time fallback.** The query's `placeholderData` returns `loadDocNodes()` — the `import.meta.glob('/docs/**/*.md', { query: '?raw', import: 'default', eager: true })` parse — so the first paint is instant and the panel degrades gracefully to the build-time snapshot when the API server is unreachable.
3. **Parser (`parseDocs.ts`).** Extract per file: **Node ID** (`00-project.md → root`; `<dir>/00-<slug>.md → <dir>`; else `<rel without .md>`), **Parent** (project-root sentinel detected **before** backtick extraction), **Title** (first `# …`), **Status** (normalized to the `NodeStatus` enum; unknown → `DRAFT`), and the **children manifest** rows (`id`, `title`, `dependsOn` with `—` → none, `status`).
4. **Manifest-only synthesis.** Children declared in a parent's manifest but lacking an authored `.md` file surface as `DocNode { authored: false, status: PLANNED }` (or whatever the manifest declares).
5. **`dependsOn` edge model.** Dependency edges come from the manifest's `dependsOn` column and are resolved by id within the full node set; they are the only relation that downstream children draw as edges (parent-of is encoded in the node id).
6. **Domain types** `NodeId`, `NodeStatus`, `DocNode` exposed via `src/lib/types.ts`. Canonical home is `@ledger/parser/src/coreTypes.ts` (+ `docs/types.ts`) per `04-api-server/02-parser-extraction`; `src/lib/types.ts` re-exports them so existing `@/lib/types` import sites keep compiling.

**Out of scope:** raw-markdown body fetch (`useDocSource`) and the `idForPath` helper — both owned by `01-ui/03-docs`; layout/geometry (`02-layout`), node rendering and the canvas (`03-rendering`), and the inspector (`04-inspector`).

## Design

Data flow: `useDocGraph()` → TanStack Query(`["docs"]`) → `GET /api/docs`, with `placeholderData: loadDocNodes()`. The API-backed primary source was landed by `04-api-server/05-ui-hook-migration`; the fetch is inline in `useDocGraph.ts` (no separate `src/lib/api.ts`).

`parseDocs.ts` is a pure parser: raw markdown text → `DocNode[]`. The `DocNode` shape (`id`, `parentId`, `title`, `status`, `dependsOn`, `authored`, `docPath?`/`source`) is a projection of the validated `DocumentNode` from `02-schema`. Manifest rows whose id has no authored doc become manifest-only PLANNED nodes (dashed/muted when rendered).

The parent-field parser detects the `**Parent:** project root (\`docs/00-project.md\`)` sentinel before backtick extraction, otherwise the backtick captures the doc path rather than the node id `root` and the root node floats unparented.

## Decisions

None yet. Governed by parent `01-ui/02-dag` Decisions **D1** (build-time parse as the Phase-1 source), **D4** (`DocNode` types + canonical `@ledger/parser` home), **D6** (live API via TanStack Query, no SSE), and **D8** (project-root sentinel before backtick extraction).

## Open Issues

- **Cross-subtree dependency edges.** Manifests today only reference siblings under the same parent; PRD §6.1 allows cross-subtree deps. The parser resolves by id within the full node set, but no current manifest exercises cross-subtree, so this path is untested. *(Priority: LOW.)*

## Implementation Notes

None yet. (The data layer was originally implemented inside `02-dag` v1.0 and migrated to the live API by `04-api-server/05-ui-hook-migration`; this child re-scopes that responsibility as a standalone node. History is in the parent's Implementation Notes version table and in git.)

## Verification

How completion will be confirmed:

1. `useDocGraph()` returns the live `GET /api/docs` payload when the API is up and the build-time `loadDocNodes()` snapshot (via `placeholderData`) when it is down — verified by stopping the API server and confirming the graph still paints.
2. `parseDocs.ts` produces a `DocNode` for every authored `docs/**/*.md` node with correct id, parent (root sentinel resolved), title, normalized status, and `dependsOn`.
3. Manifest-only children with no authored file appear as `DocNode { authored: false, status: PLANNED }`.
4. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero.

## Children

None.
