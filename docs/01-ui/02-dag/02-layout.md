# Compound-Graph Layout & Collapse Engine

**Node ID:** `01-ui/02-dag/02-layout`
**Parent:** `01-ui/02-dag`
**Status:** COMPLETE (extracted from shipped 02-dag v1.4, 2026-06-06)
**Created:** 2026-06-06
**Last Updated:** 2026-06-06
**Dependencies:** `01-ui/02-dag/01-data-source`

---

## Requirements

Turn a `DocNode[]` into positioned React Flow nodes and edges with zero hand-authored coordinates, and decide **what is visible** via the collapsible-subtree model. This child owns geometry and visibility; it consumes the data model from `01-data-source` and hands flat, absolute-coordinate nodes/edges to `03-rendering`.

1. **ELK compound layout (`useDagLayout.ts`).** `elkjs` (`elkjs/lib/elk.bundled.js`) lays out the graph. Subtree parents (≥2 children) become ELK **compound** nodes with direct children nested in `children`; ELK computes parent dimensions natively. The hook walks the ELK result once to **flatten** parent-local coordinates into absolute `(x, y)` (React Flow's `parentId` mechanism is deliberately not used).
2. **Async hook.** `useDagLayout` is `useState` + `useEffect` + cancellation flag; initial render returns `{ nodes: [], edges: [] }` and ELK resolves in ~50–200 ms for ≤30 nodes. A stale-resolution guard protects against `docs` changing mid-layout.
3. **Per-compound pack-vs-rank.** Each expanded compound picks its algorithm by whether its children carry dependency flow: a compound that is the **LCA** of an aggregated edge uses `layered`/`DOWN`; an edge-free compound (and the top-level overview) uses `rectpacking`. Depth-0 root edges are dropped from the ELK graph so the overview packs; React Flow still draws those arrows from node coordinates. Each ELK edge is attached to its **LCA compound's** `edges` array (not the graph wrapper) so ELK's importer accepts edges descending into packed subtrees.
4. **Dependency edges.** The full `dependsOn` set is passed to ELK for layer assignment/crossing minimization; only the **transitive-reduced** subset is emitted for rendering, as dashed bezier arrows.
5. **Collapsible-subtree engine.**
   - **Default policy (`computeDefaultExpansion`, pure, `lib/dagExpansion.ts`):** root + any subtree parent transitively containing an active-frontier descendant (`{SPEC_REVIEW, APPROVED, IN_PROGRESS, VERIFY, ISSUE_OPEN}`).
   - **Effective expansion (`computeEffectiveExpansion`):** `override ?? defaultExpanded(node)`, root forced expanded.
   - **Persistence (`stores/dagView.ts`):** localStorage override map (`setOverride`/`setMany`/`reset`) backing **Expand all / Collapse all / Reset to active work**.
   - **Pruning:** a collapsed subtree parent emits a leaf-sized box (no `children` recursion) so ELK never lays out hidden descendants — layout cost tracks open-node count, the core scaling win.
6. **Edge aggregation.** Endpoints are remapped through `representative(id)` (walk root→node ancestor chain to the first collapsed parent, else the node itself), then deduped by `(source, target)` and self-edges (now-internal deps) dropped; transitive reduction runs on the aggregated set. No edge dangles into a pruned descendant.
7. `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` pass at zero output.

**Out of scope:** the visual node components and canvas chrome (`03-rendering`); inspector content (`04-inspector`); the data model and parsing (`01-data-source`). The expansion *controls UI* (`<Panel>`) and the collapse *chevron* render in `03-rendering`; this child owns the policy + store + action logic they invoke.

## Design

`useDagLayout(docs, expandedIds, onToggleExpand)` builds the ELK graph via `buildElkNode` (compound `children` for expanded subtree parents, leaf box for collapsed ones), buckets edges by LCA compound (`elkEdgesByContainer`), chooses `LAYERED_COMPOUND_OPTIONS` vs `RECTPACK_COMPOUND_OPTIONS` per compound, runs `elk.layout()`, then `walk`s the result emitting three React Flow node forms (`doc`, `subtree`, `collapsedSubtree` with a transitive `descendantTally`) at absolute coordinates. Layout options: `elk.algorithm` per compound, `elk.direction: DOWN`, `nodeNodeBetweenLayers: 80`, `nodeNode: 40`, `hierarchyHandling: INCLUDE_CHILDREN`, compound padding `[top=52,left=24,bottom=20,right=24]`. A module-scoped `ELK_GRAPH_ROOT_ID = "__elk_root__"` sentinel avoids colliding with the doc-tree `root` id. Core layout is also exported as `computeDagLayout` for headless geometry tests.

`lib/dagExpansion.ts` holds the pure policy (`ACTIVE_FRONTIER`, `buildSubtreeParentIds`, `computeDefaultExpansion`, `computeEffectiveExpansion`); `stores/dagView.ts` holds the persisted override map. The override-over-default model lets the status-driven default keep reacting to lifecycle changes (a newly-IN_PROGRESS subtree auto-opens) while honoring explicit operator intent.

## Decisions

None yet. Governed by parent `01-ui/02-dag` Decisions **D2** (dagre superseded), **D10** (bezier dep edges), **D14** (dagre→elkjs compound migration, async hook, route-level lazy-load), and **D15** (collapsible subtrees: override-over-default, ELK pruning, edge aggregation, per-compound pack-vs-rank, edges attached to LCA compound).

## Open Issues

- **Graph layout for very large trees.** ELK `layered` is far more capable than dagre, but at some node count the compound layout will slow or read poorly. Re-evaluate if doc count grows past ~100. *(Priority: LOW.)*
- **Vendor chunk de-duplication.** `elkjs` (~250 KB gzip) is isolated to the `DagPanel` lazy chunk, but React Flow + parser are duplicated across the `index` and `DagPanel` chunks; a `manualChunks` vendor split would reduce duplication. *(Priority: LOW.)*

## Implementation Notes

Layout was dagre in v1.0–v1.2, migrated to ELK in v1.3, and gained the collapse engine + pack-vs-rank in v1.4; that shipped history is summarized in the parent's Implementation Notes version table and preserved in git.

## Verification

Confirmed — this subsystem ships in 02-dag v1.4:

1. `useDagLayout` returns flat, absolute-coordinate React Flow nodes; outer subtree rects fully enclose nested inner rects.
2. Collapsed subtree parents are pruned from the ELK graph (no descendant layout cost); expanding restores them.
3. `rectpacking` grids independent children into ≥2 rows; the top-level overview packs while dependency arrows still render between tiles; a `layered` compound under a packing parent ranks its chain top-down. (Headless ELK geometry tests cover these.)
4. Edge aggregation: every rendered edge resolves to a visible node; no dangling endpoints; transitive reduction runs on the aggregated set.
5. `computeDefaultExpansion` returns root + the ancestor chain of every active-frontier node; overrides persist across reload and Reset reverts to the default.
6. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build`, `pnpm -C app test` exit zero.

## Children

None.
