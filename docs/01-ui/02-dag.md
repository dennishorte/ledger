# DAG Panel

**Node ID:** `01-ui/02-dag`
**Parent:** `01-ui`
**Status:** COMPLETE (v1.4, 2026-06-02 — collapsible subtrees + status-driven default expansion + edge aggregation + per-compound rectpacking overview)
**Created:** 2026-05-22
**Last Updated:** 2026-06-06

---

## Requirements

Render the project's **document tree** at `/dag` as a directed graph — the operator's first useful view onto framework state, and the surface the task DAG will eventually pivot onto (PRD §8.1). The panel grew across four versions (v1.0 dagre → v1.4 ELK + collapsible subtrees) into a multi-subsystem surface; it is now a **parent coordination manifest** and the per-responsibility detail lives in its children (see `## Children`).

Panel-level requirements (the cohesive scope retained at the parent):

1. Render every authored `docs/**/*.md` node plus **manifest-only PLANNED** children, each with its **lifecycle status** chip (DRAFT, SPEC_REVIEW, APPROVED, IN_PROGRESS, VERIFY, COMPLETE, ISSUE_OPEN, terminal DEFERRED, and the manifest-only PLANNED pseudo-state).
2. **Auto-layout** (no hand-authored coordinates) so adding a doc needs zero positioning; **pan and zoom**; **collapsible subtrees** with a status-driven default so the canvas opens to live work and stays compact as the manifest grows.
3. **Click a node → open the shell inspector** with its metadata and a link to `/docs/:nodeId`.
4. `pnpm typecheck`, `pnpm lint`, `pnpm build` pass at zero output.

**Out of scope (panel-wide):** real *task* DAG rendering (no task-runner pivot yet — the data source is documents); editing / status-mutation affordances; in-flight animation, blocked-dependency highlight, and daemon-source distinction (PRD §8.1 items that depend on a runtime not wired into this view).

---

## Design

The panel decomposes into four cohesive subsystems, each its own child node. Data flows **source → visibility/geometry → presentation**, with the inspector as a parallel detail surface:

| Subsystem | Child | Responsibility |
|---|---|---|
| Data | `01-data-source` | `useDocGraph` (live `GET /api/docs` + build-time `parseDocs` fallback), the `DocNode`/`NodeId`/`NodeStatus` model, manifest-only PLANNED synthesis, `dependsOn` edges. |
| Layout & collapse | `02-layout` | `elkjs` compound-graph layout (`useDagLayout`), async hook + coordinate flattening, per-compound pack-vs-rank, transitive reduction, edge→LCA attachment; the collapsible-subtree expansion model (`dagExpansion` policy, persisted `dagView` store, edge aggregation, bulk-action logic). |
| Rendering | `03-rendering` | The three node forms (`DocDagNode`, `DocSubtreeNode`, `DocCollapsedSubtreeNode`), `DagCanvas`, `StatusChip` + `statusColors`, the status→token mapping, affordance separation. |
| Inspector | `04-inspector` | `NodeInspector` content (metadata, deps, children, doc link, Dispatch button), hosting `09-workflow-progress`'s section; the click→inspector model. |

**Data source.** `useDocGraph.ts` fetches `GET /api/docs` via TanStack Query (`staleTime: 30s`) through the Vite dev proxy; `placeholderData` is the build-time `loadDocNodes()` `import.meta.glob` parse, so first paint is instant and the panel degrades to the build-time snapshot if the API is down. Detail: `01-data-source`.

**Layout & visibility.** `elkjs` (`layered` for dependency-flow compounds, `rectpacking` for the top-level overview and edge-free clusters) lays out a compound graph; collapsed subtrees are pruned from ELK so layout cost tracks open-node count. Expansion is an override-over-default model: a status-driven default (root + ancestors of any active-frontier node) layered under a persisted operator override. Detail: `02-layout`.

**Presentation.** `DagCanvas` wraps React Flow; subtree parents render as a dashed container whose header strip **is** the parent (no floating parent tile); collapsed subtrees render as a stacked-card rollup with a status tally; the collapse chevron is a distinct affordance from the inspector-open click. Status colors flow through cream-theme tokens. Detail: `03-rendering`.

**Status color mapping** (panel-wide contract, consumed by `03-rendering`):

| Status | Color token |
|---|---|
| `DRAFT` / `PLANNED` / `DEFERRED` | `--color-muted` (PLANNED/DEFERRED dashed border) |
| `SPEC_REVIEW` / `VERIFY` | `--color-warning` |
| `APPROVED` / `IN_PROGRESS` | `--color-accent` |
| `COMPLETE` | `--color-success` |
| `ISSUE_OPEN` | `--color-danger` |

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Build-time parse of `docs/**` as the data source for Phase 1 | Manifests in docs are canonical; a hand-authored TS fixture would drift. Parser is small and the schema is regular. Swap to API when the backend lands. |
| D2 | dagre over elkjs | ≤30 nodes for the foreseeable future; dagre is ~20× smaller and visually equivalent at this scale. **Superseded 2026-05-27 by `00-ui.md` D10** — the "≤30 nodes" + "visually equivalent" calculus inverts once the interactive task DAG, claim grouping, cross-subtree dep routing, and the planned C4-style architecture browser all want compound-graph primitives. Retained here as durable provenance for the v1.0–v1.2 cycles, during which dagre was the right call. Layout-engine swap scheduled for the next §8b cycle, pre-`05-task-runner` UI. |
| D3 | Manifest-only "PLANNED" nodes render with dashed border | Operator should see the full intended tree, not just what's been authored. Visual distinction prevents confusion with real nodes. |
| D4 | `DocNode` shape introduced in `src/lib/types.ts` (was empty) | First domain types arrive with the first panel that needs them, per `01-ui` §Design conventions. **Updated 2026-05-26 by `04-api-server/02-parser-extraction`:** the canonical home for `NodeId`, `NodeStatus`, and `DocNode` is now `@ledger/parser/src/coreTypes.ts` (and `@ledger/parser/src/docs/types.ts` for `DocNode`). `app/src/lib/types.ts` retains a re-export shell for those three types so existing `@/lib/types` import sites continue to work unchanged; all other types defined in `types.ts` (`Task`, `LogEvent`, etc.) stay there. |
| D5 | Click → inspector, not click → navigate | Inspector keeps the operator's spatial context (graph still visible). A "View document" link inside the inspector handles the navigate case. |
| D6 | No live updates / SSE in this node | No API exists. Static-per-load keeps the implementation honest about its data source; live updates land with the API. **Updated 2026-05-26 by `04-api-server/05-ui-hook-migration`:** `useDocGraph.ts` now polls `GET /api/docs` via TanStack Query (`staleTime: 30s`) with a build-time `placeholderData` fallback. There is no SSE push; the 30s poll is the "live" mechanism. D6's original statement ("no API exists") is superseded, but the design intent (no SSE, no streaming) still holds. |
| D7 | Dependency edges (`dependsOn`) drawn as dashed bezier arrows in `--color-accent` with a "depends on" label | Reuses React Flow's edge type system without custom edge components. (Originally stated "distinct from parent-child solid arrows" — but D11 removes parent edges entirely, so deps are now the only drawn edges.) |
| D8 | Parent-field parser: detect the "project root" sentinel text **before** backtick extraction | The PRD-mandated parent line for top-level subtrees reads `**Parent:** project root (\`docs/00-project.md\`)`. The backtick captures the doc path, not the node id `root`, so the original order silently produced an unresolvable parent. Project-root sentinel detection is the canonical case and must win. |
| D9 | ~~Suppress visible `dependsOn` edges when source and target share a parent.~~ **Superseded by D11.** | Round-2 feedback (F4 below) clarified that sibling deps carry real information — `02-dag` "depends on `01-shell`" is a meaningfully different statement from "is parented by `01-ui`." Suppressing them lost that information. Replaced with D11 which removes parent edges instead. |
| D10 | Bezier (`type: "default"`) for both parent and dep edges, replacing `smoothstep` orthogonal routing | At the current node density, orthogonal routing produces overlapping right-angle runs that read as a single line. Bezier curves separate visually even when they share rank-crossing geometry. After D11, parent edges no longer render; D10 now applies only to dep edges. Revisit if the graph grows past ~30 nodes and curves start to tangle. |
| D11 | Parent edges are not drawn at all. Hierarchy is conveyed by a translucent rounded-rect *subtree* node behind each parent's children (rendered only when the parent has ≥2 children). Parent relations are still passed to dagre for rank ordering | Parent-of is already encoded in the node id (`01-ui/02-dag` ⇒ parent is `01-ui`). Drawing it as an edge adds visual weight without adding information. The interesting edges in this view are **deps** — what blocks what. Spatial grouping is the standard idiom for "these nodes share a context" (cf. subway-map line shading) and degrades gracefully as the tree deepens. Long-term, when the panel renders the *task* DAG instead of the doc tree, there will be no parents to draw anyway — this pivot anticipates that. |
| D12 | v1.1 visual simplification: drop the "depends on" edge label, hide React Flow's connection-handle dots on doc tiles, and remove the minimap | Each removal pays its own keep. The "depends on" label is redundant — the only edges drawn are deps (per D11), so a label restating the edge type adds noise without information. Handle dots advertise an interaction (`nodesConnectable={true}`) that this panel intentionally disables (`nodesConnectable={false}`), so they were misleading affordances; handles remain in the DOM with `opacity:0` + `isConnectable={false}` so dagre-routed edges still attach correctly. The minimap added chrome without payoff — at ≤30 nodes a `fitView` initial layout plus pan/zoom is enough, and the minimap viewport box wasn't even rendering reliably for the operator (likely a CSS-token interaction with the cream theme's mask color, but rather than debug a low-value affordance, we removed it). |
| D13 | v1.2 collapsed-parent model: the subtree rect's header strip IS the parent node. Subtree parents are not emitted as separate `doc` tiles. The `DocSubtreeData` carries the full parent `DocNode`; the header renders its `StatusChip` + id + title with a solid background, distinguishable from the dashed interior. Bounds are computed **bottom-up** (deepest subtrees first): leaf-child tile positions first, then parent subtrees union over their already-computed inner bounds — this ensures outer rects fully enclose nested inner rects. D11 (subtree-rect-as-grouping) is **refined**, not superseded: the grouping idea stands; what changes is that the parent doc tile collapses into the rect's header. Header click → opens the inspector for the parent node; non-header area remains click-inert. **Bounds-computation half superseded 2026-05-27 by D14** — ELK's compound graph computes parent dimensions natively, so the bottom-up bounds machinery is removed in v1.3; the visual model (header IS parent, dashed interior click-inert) is unchanged. | The "orphaned parent" visual was confusing: the parent tile floated above its box with no visual connection. Collapsing them makes the parent's identity, status, and interactivity immediately legible as part of the container. Bottom-up bounds ensures correctness for nested subtrees (live case: `root` subtree contains `01-ui` and `04-api-server` subtrees). |
| D15 | v1.4 collapsible subtrees. Subtree parents render in three forms (leaf / expanded container / collapsed rollup tile). Expansion is stored as a **per-node override map** (`stores/dagView.ts`, persisted) layered over a **status-driven default** (`computeDefaultExpansion`: root + ancestors of any active-frontier node). Collapsed subtrees are pruned from the ELK graph; dep edges touching hidden descendants reroute to their nearest visible ancestor (`representative`) then dedup/self-drop. Collapse chevron is a distinct affordance from the inspector-open header click. | Resolves the long-standing sprawl / always-expanded Open Issue and pre-empts the scaling cliff as the backend manifest grows. **Override-over-default** beats storing absolute expansion because it lets the status-driven default keep reacting to lifecycle changes (a newly-IN_PROGRESS subtree auto-opens) while still honoring explicit operator intent, and makes Collapse/Expand/Reset-all one-liners. **Pruning collapsed subtrees from ELK** (not just hiding them in CSS) is what makes layout cost track open-node count rather than total — the actual scaling fix. **Edge aggregation** is mandatory once pruning exists: without remapping, `transitiveReduction` would operate on endpoints that no longer have a rendered node. Default policy reuses the project's own "focus follows work" heuristic from CLAUDE.md. **Per-compound pack-vs-rank** (`rectpacking` for the top-level overview and any edge-free child cluster, `layered` for compounds with dependency flow) attacks the original "very horizontal" complaint directly: collapse removes the wide *expanded boxes*, and packing removes the wide *single rank* of independent siblings. Safe because React Flow draws edges from node coordinates, not ELK geometry — so `rectpacking` (which ignores edges) loses nothing visually except spatial encoding of dependency *direction* at the overview level, an acceptable trade for an at-a-glance grid. Edges are attached to their LCA compound (not the wrapper) because ELK's importer rejects wrapper-level edges descending into a packed subtree. |
| D14 | v1.3 layout-engine swap: `@dagrejs/dagre` → `elkjs` (`elkjs/lib/elk.bundled.js`, `layered` algorithm). Subtree parents become ELK compound nodes (children nested in `children`); flat absolute coordinates accumulated for React Flow. `useDagLayout` becomes async: useState + useEffect + cancellation flag; initial render returns empty arrays, ELK resolves in ~50–200ms for ≤30 nodes. Route-level lazy-load on `DagPanel` via `React.lazy` + `Suspense` so the ~250 KB gzip elkjs chunk lands off the landing route. **No changes** to `DocDagNode`, `DocSubtreeNode`, `StatusChip`, `NodeInspector`, transitive-reduction of dep edges, depth-based subtree `zIndex`, `pointer-events: "none"` on subtree wrappers, or the cream theme. | Executes the parent's D10 decision. Two concrete wins beyond what D10 anticipated: (a) the v1.2 hand-rolled `buildSubtreeNodes` bottom-up bounds computation deletes entirely — ELK does this as a core feature, not a workaround; (b) the two known crossed dep edges (`08-markdown → 03-docs`, `02-dag → 09-workflow-progress`, line 173) should resolve under ELK `layered`'s crossing minimization. Async hook is the minimum-surface accommodation: ELK is unconditionally async, and a Promise wrapper around a sync engine would be worse than embracing async at the boundary. Route-level lazy-load is the bundle-cost mitigation from D10; landing it together with the migration produces a single coherent bundle delta in Implementation Notes. |

---

## Open Issues

Panel-level issues that span subsystems; per-child issues live in each child's Open Issues. Resolved issues from v1.1–v1.4 (floating parent, transitive/crossed dep edges, paint-order, root-id collision, auto-collapse, dagre→ELK engine swap) are preserved in git history.

- **Cross-subtree dependency edges** — owned by `01-data-source` / `02-layout`. Manifests reference only same-parent siblings today, so the cross-subtree resolve path is untested. *(Priority: LOW.)*
- **Graph layout for very large trees** — owned by `02-layout`. Re-evaluate the ELK compound layout past ~100 nodes. *(Priority: LOW.)*
- **Inspector content-shape conflicts across panels** — owned by `04-inspector`. The shell store holds `ReactNode`, so there is no contract conflict today; a future inspector context registry might be cleaner. *(Priority: LOW.)*

---

## Implementation Notes

This node was implemented across four versions before being decomposed into a parent coordination manifest. Per-version detail is preserved in git; the summary:

| Version | Date | Summary |
|---|---|---|
| v1.0 | 2026-05-22 | Initial render: build-time `docs/**` parse, dagre layout, status chips, click→inspector; F1–F4 round-1/2 fixes (root↔`01-ui` parent edge, dep-edge semantics, bezier routing, parent-edge removal). |
| v1.1 | 2026-05-23 | Visual simplification (D12): drop "depends on" edge label, hide connection handles, remove minimap. |
| v1.2 | 2026-05-27 | Collapsed the floating parent tile into the subtree header strip (D13) + paint-order/`zIndex` + wrapper `pointer-events` patch. |
| v1.3 | 2026-05-27 | dagre→`elkjs` compound-graph migration (D14): async layout hook, coordinate flattening, route-level lazy-load; root-id-collision fix; depth-based subtree-intensity polish. |
| v1.4 | 2026-06-02 | Collapsible subtrees (D15): status-driven default expansion, persisted overrides, edge aggregation, per-compound rectpacking overview, collapsed rollup tile. |

**Pinned versions (`app/package.json`):** `@xyflow/react ^12.10.2`, `elkjs ^0.11.1` (replaced `@dagrejs/dagre ^3.0.0` in v1.3).

### Decomposed 2026-06-06

The doc's estimated token count exceeded the project health threshold (~31k tokens / 565 lines), driven by four accumulated versions covering several distinct, separately-implementable subsystems. Reduced to this parent coordination manifest (concise Requirements, a Design summary, the full Decisions table, and the children manifest) and extracted four children, each a cohesive responsibility:

| Child | Extracted responsibility | Why a separate node |
|---|---|---|
| `01-data-source` | `useDocGraph` (live `GET /api/docs` + build-time `parseDocs` fallback), `DocNode`/`NodeId`/`NodeStatus` model, manifest-only PLANNED synthesis, `dependsOn` edges. | The "what data feeds the graph" layer has a clean output contract (`DocNode[]`) independent of geometry or pixels, and is consumed by every other child. |
| `02-layout` | `elkjs` compound layout (`useDagLayout`), async hook + coordinate flattening, per-compound pack-vs-rank, transitive reduction, edge→LCA attachment, and the collapsible-subtree expansion engine (`dagExpansion`, `dagView`, edge aggregation, bulk actions). | Geometry + visibility is one cohesive engine; it accreted the bulk of v1.3 (ELK) and v1.4 (collapse) and is the panel's scaling concern. |
| `03-rendering` | The three node forms (`DocDagNode`, `DocSubtreeNode`, `DocCollapsedSubtreeNode`), `DagCanvas`, `StatusChip` + `statusColors`, the status→token mapping, affordance separation. | Presentation (React Flow node components + canvas chrome) is separable from geometry; it is the cream-theme surface and owns the chevron-vs-inspector affordance split. |
| `04-inspector` | `NodeInspector` content (metadata, deps, children, doc link), hosting `09-workflow-progress`'s section and `06-agent-dispatcher`'s Dispatch button; the click→inspector model. | The inspector is a distinct detail surface that three sibling nodes interact with (`09-workflow-progress` embeds, `05-logs` adds a "View task logs" affordance, `06-agent-dispatcher` added Dispatch); a focused node gives those cross-references a stable target. |

No sibling scope was duplicated: `useDocSource`/`idForPath` remain with `01-ui/03-docs`, and the `WorkflowProgressSection` derivation remains with `01-ui/09-workflow-progress` (the inspector only hosts it). The target's filename, Node ID, and lifecycle status (`COMPLETE` v1.4) are unchanged. Because this decomposed an already-shipped node, the four children are `COMPLETE` — each documents a subsystem that ships in 02-dag v1.4, not new planned work (reconciled 2026-06-06; the decompose agent emitted them at `PLANNED`, which is wrong for a COMPLETE target — see the parent-spec follow-up).

---

## Verification

Panel-level verification (each child carries its own detailed checklist):

1. `/dag` renders every authored node + every manifest-only PLANNED node with correct status chips; parent edges are not drawn (hierarchy is conveyed by subtree containers); `dependsOn` edges render as dashed bezier arrows.
2. The canvas opens to the status-driven default expansion (root + active-frontier ancestors); collapse/expand toggles work; overrides persist across reload; the bulk controls (Expand all / Collapse all / Reset to active work) behave.
3. Clicking a node opens the inspector with its detail and a working `/docs/:nodeId` link; `Esc` closes it.
4. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero.
5. The reduced parent and all four children conform to `docs/_schemas/document-node.schema.json` (seven `## ` sections, valid front-matter, populated children manifest).

---

## Children

This node is decomposed; per `02-schema` it is validated as a parent and holds the children manifest below. Each child is a cohesive, separately-implementable subsystem of the DAG panel.

| Child | Title | Depends on | Status |
|---|---|---|---|
| `01-data-source` | Doc-Graph Data Source & Model | `—` | COMPLETE |
| `02-layout` | Compound-Graph Layout & Collapse Engine | `01-data-source` | COMPLETE |
| `03-rendering` | Node Rendering, Status Visualization & Canvas | `01-data-source`, `02-layout` | COMPLETE |
| `04-inspector` | DAG Node Inspector | `01-data-source` | COMPLETE |
