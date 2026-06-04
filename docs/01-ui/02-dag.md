# DAG Panel

**Node ID:** `01-ui/02-dag`
**Parent:** `01-ui`
**Status:** COMPLETE (v1.4, 2026-06-02 — collapsible subtrees + status-driven default expansion + edge aggregation + per-compound rectpacking overview)
**Created:** 2026-05-22
**Last Updated:** 2026-06-02

---

## Requirements

Replace the `DagPanel` empty state at `/dag` with a real graph rendering that gives the operator their first useful view onto the framework's state. This is the leading panel of the round-2 decomposition (PRD §8.1) and the first place a task DAG will eventually surface.

Phase-1 scope, narrower than PRD §8.1 because no task runner exists yet:

1. Render the project's **document tree** (the implementation nodes under `docs/`) as a directed graph: each `docs/*.md` is a node, parent → child edges from the manifests.
2. Render **planned** child nodes declared in a parent's manifest even when no doc file exists yet, distinguished visually from authored nodes.
3. Show each node's **lifecycle status** (PRD §6.2: DRAFT, SPEC_REVIEW, APPROVED, IN_PROGRESS, VERIFY, COMPLETE, ISSUE_OPEN, plus the terminal `DEFERRED` and the manifest-only `PLANNED` pseudo-state) as a colored chip on the node.
4. **Pan and zoom** via React Flow defaults. (Minimap removed in v1.1 — see D12.)
5. **Auto-layout** the graph (no hand-authored coordinates) so adding a new doc requires zero positioning work.
6. **Click a node → open the shell's right-hand inspector** with the node's metadata (id, parent, status, title, and a link to `/docs/:nodeId`).
7. The "Open inspector" debug button currently on `DagPanel` is removed — node clicks replace it.
8. `pnpm typecheck` and `pnpm lint` continue to pass at zero output.

**Out of scope for this node:**

- Real *task* DAG rendering (no task runner exists). The data source is documents; the rendering layer is generic enough that swapping to tasks later is a data-shape change, not a component rewrite.
- Live updates (no API, no SSE). The graph is static per page load.
- Editing or status-mutation affordances.
- Resource-claim, in-flight animation, blocked-dependency highlight, daemon-source distinction (all PRD §8.1 items that depend on a runtime that doesn't exist yet).

### v1.4 addendum — collapsible subtrees (2026-06-02)

Actions the Open Issue at the former line 181 ("auto-collapse subtree when all children are terminal"), reframed and broadened: the real problem the operator hit is **horizontal sprawl from an always-expanded tree that mixes complex container nodes with simple leaves**, and it will worsen as the backend manifest grows past the current ~30 nodes. The fix is a collapse model, not just terminal-state auto-collapse.

v1.4 requirements:

1. Every subtree parent (≥2 children) is **collapsible** to a single leaf-sized rollup tile and **expandable** back to the dashed container. Collapsed and expanded are both first-class render states.
2. A collapsed subtree tile is **visually distinct from a leaf** (stacked-card depth cue) and carries a **status rollup** of its descendants (counts by lifecycle state) plus a descendant count.
3. **Default expansion is status-driven** ("focus follows work"): the root is always expanded; a subtree is expanded by default iff it transitively contains an *active-frontier* descendant (status ∈ {SPEC_REVIEW, APPROVED, IN_PROGRESS, VERIFY, ISSUE_OPEN}); otherwise it starts collapsed. This auto-opens the path to live work and collapses finished subsystems to rollups.
4. The operator can **override** any node's expansion; overrides persist across reloads (localStorage). Global controls: **Expand all**, **Collapse all**, **Reset to active work** (clears overrides → reverts to the §3 default).
5. **Edge aggregation:** when a subtree is collapsed, dependency edges touching a hidden descendant reroute to the nearest visible ancestor; resulting duplicate and self (now-internal) edges are dropped. No dangling edge endpoints.
6. Toggle affordance (chevron) is **distinct from** the inspector-open affordance — collapsing a node must not open the inspector and vice-versa.
7. `pnpm typecheck`, `pnpm lint`, `pnpm build` continue to pass at zero output.

8. **Top-tier rectpacking overview:** the top-level subsystem grid packs into a near-square via ELK `rectpacking` (rather than stretching along one `layered` rank), and any compound whose children carry no dependency flow packs the same way; compounds with real dependency flow keep `layered`/`DOWN`.

**Still out of scope:** changing the data source (still build-time `docs/**` parse), live updates.

---

## Design

### Data source: live API with build-time fallback

`useDocGraph.ts` fetches `GET /api/docs` via TanStack Query (`staleTime: 30_000`). The Vite dev proxy (`vite.config.ts`) forwards `/api/*` → `http://127.0.0.1:4180/api/*` so the browser call is same-origin. The query's `placeholderData` returns `loadDocNodes()` — the build-time `import.meta.glob` parse — so the first paint is instant and the panel degrades gracefully to the build-time snapshot when the API server is unreachable.

**Build-time parse (fallback path).** Vite `import.meta.glob('/docs/**/*.md', { query: '?raw', import: 'default', eager: true })` pulls every project doc into the bundle at build time. `parseDocs.ts` extracts per-file:

- **Node ID** — from the `**Node ID:** \`…\`` line, or `root` for `00-project.md`.
- **Parent** — from `**Parent:** …`, or `null` for the project root.
- **Title** — first `# …` heading.
- **Status** — from `**Status:** …`. Normalized to the `NodeStatus` enum; unknown values fall back to `DRAFT`.
- **Children manifest** — the rows of the markdown table immediately under a `## Children` heading (or under `### Current` / `### Planned` sub-headings if present). Each row supplies `id`, `title`, `dependsOn` (`—` parsed as none), and a `status` column.

Children rows whose `id` does not correspond to an authored doc are surfaced as **manifest-only** nodes with `status: PLANNED` (or whatever the manifest declares). They render with a dashed border and muted fill.

Edges and hierarchy (post-D11, revised in v1.2 per D13):

- **No parent → child lines are drawn.** Hierarchy is conveyed *spatially* via a translucent rounded-rect *subtree* node that **is** each parent node (rendered only when the parent has ≥2 children). The subtree container's header strip carries the parent's status chip, id, and title — the parent is no longer a separate floating doc tile.
- **Dependency** edges from the manifest's `dependsOn` column are the only edges drawn — dashed bezier arrows in `--color-accent`. All dep edges render, including sibling-on-sibling ones (e.g., `02-dag → 01-shell`).

Why build-time parse instead of a hand-authored TS fixture: the manifests in `00-project.md` §14 and `01-ui/00-ui.md` Children are already canonical. Duplicating them into TS guarantees drift. The parser is ~80 lines and the docs schema is already regular enough to make it tractable.

The API-backed primary source was landed in `04-api-server/05-ui-hook-migration`; the fetch is inline in `useDocGraph.ts` (no separate `src/lib/api.ts` was created).

### Domain types (`src/lib/types.ts`)

Per `01-shell` D5, `types.ts` is currently `export {}`. This node introduces the first domain types:

```ts
export type NodeId = string;

export type NodeStatus =
  | "DRAFT"
  | "SPEC_REVIEW"
  | "APPROVED"
  | "IN_PROGRESS"
  | "VERIFY"
  | "COMPLETE"
  | "ISSUE_OPEN"
  | "PLANNED" // manifest-only; no authored doc yet
  | "DEFERRED"; // terminal — node removed from active roadmap (PRD §6.2)

export interface DocNode {
  id: NodeId;
  parentId: NodeId | null;
  title: string;
  status: NodeStatus;
  /** Sibling node IDs this node depends on, per the parent's manifest. */
  dependsOn: NodeId[];
  /** True if an authored docs/**.md file backs this node. */
  authored: boolean;
  /** Path relative to repo root, when authored. */
  docPath?: string;
}
```

These types are intentionally co-located with the panel that introduces them per `01-ui` §Design — early panels establish, later panels refine.

### Layout

`elkjs` (loaded from `elkjs/lib/elk.bundled.js` — bundles the worker entry so the main thread stays clean) performs the layout via its `layered` algorithm inside an async-aware hook (`useDagLayout`). Top-down direction (`elk.direction: DOWN`); layer spacing 80px, node-node spacing 40px in same layer; node size 240 × 64 to match the custom node component. The hook returns React Flow `nodes` and `edges` arrays once ELK resolves; the initial render returns empty arrays so React Flow paints an empty canvas while ELK lays out (typical resolve time for ≤30 nodes is ~50–200ms).

**Compound graph model.** Subtree parents (any node with ≥2 children in the doc set) are emitted to ELK as compound nodes with their direct children nested in the `children` array. ELK lays out the inner children, computes parent dimensions automatically, and applies them recursively for nested subtrees (e.g., `root` containing `01-ui` and `04-api-server`). The hand-rolled bottom-up bounds computation from v1.0–v1.2 is removed — ELK does this natively, which is the primary reason for the migration per `00-ui.md` D10.

**Coordinate flattening.** ELK returns positions in each node's parent-local frame. Before handing nodes to React Flow, the hook walks the ELK tree once and accumulates `(x, y)` offsets through ancestors to produce flat absolute coordinates. React Flow's `parentId` mechanism is deliberately not used — keeping React Flow nodes flat preserves the v1.2 paint-order/click-capture behavior (depth-based `zIndex`, `pointer-events: none` on subtree wrappers, header `<button>` wins as the CSS leaf).

**Why ELK over dagre (recap of D10).** The v1.1/v1.2 workaround pile (bounds union, depth-based `zIndex`, wrapper `pointer-events`, paint-order ordering, crossed dep edges) is the symptom set of forcing a flat-graph engine to render a compound graph. ELK's compound primitives dissolve the workarounds; `layered` with port constraints also resolves the two known crossed dep edges flagged at line 173.

### Collapsible subtrees (v1.4)

**Expansion state — overrides, not absolutes.** A dedicated persisted store (`stores/dagView.ts`) holds `overrides: Record<NodeId, boolean>` — *only* the nodes the operator has explicitly toggled. The effective expanded state of a subtree parent is `override ?? defaultExpanded(node)`, with `root` always forced expanded. This makes the three global controls trivial and correct: **Collapse all** / **Expand all** write an override for every subtree parent; **Reset to active work** clears the map so the status-driven default takes over again. It also answers the old Open Issue's question ("does ISSUE_OPEN unwind a collapsed subtree?") cleanly: if the operator hasn't overridden it, the default policy re-expands a subtree the moment a descendant enters the active frontier; if they *have* manually collapsed it, their intent wins until they Reset.

**Default policy — `computeDefaultExpansion(docs)` (pure, in `lib/dagExpansion.ts`).** Returns the set of subtree-parent ids expanded by default: `root`, plus any subtree parent with a transitive descendant whose status is in the active-frontier set `{SPEC_REVIEW, APPROVED, IN_PROGRESS, VERIFY, ISSUE_OPEN}`. Because every ancestor of a frontier node transitively contains it, this expands exactly the *path* to live work and leaves finished/deferred siblings collapsed. In the current all-COMPLETE repo state it yields "root expanded, all subsystems collapsed" — a compact grid of rollup tiles, which is the right snapshot for a finished milestone.

**Hierarchical visibility.** A node renders only if every ancestor is expanded. The layout builder enforces this structurally: in `buildElkNode`, a collapsed subtree parent emits a leaf-sized box (no `children` recursion), so ELK never lays out its descendants. Layout cost and on-screen density therefore scale with what's *open*, not with total node count — the core scaling win.

**Three render forms** (was two): leaf `doc` tile; expanded `subtree` container (today's dashed rect, now with a collapse chevron in the header); and a new collapsed `collapsedSubtree` tile. The collapsed tile reuses the leaf footprint (240×64) but is styled as a stacked card (offset shadow + doubled top edge) so "opens into more" reads at a glance, and shows the parent's status chip + id + title + a descendant rollup (count + per-status tally).

**Edge aggregation.** Before edges go to ELK or render, each endpoint is remapped through `representative(id)`: walk the root→node ancestor chain and return the first collapsed subtree parent encountered, else the node itself. Edges are then deduped by `(source,target)` and self-edges (both endpoints map to the same visible node — a now-hidden internal dependency) are dropped. This keeps every rendered edge terminating on a visible node and prevents dangling endpoints into pruned descendants. Transitive reduction runs on the aggregated set, unchanged otherwise.

**Affordance separation (Req 6).** The collapse chevron is its own `<button>` with `stopPropagation`; the rest of the header keeps firing `onHeaderClick` → inspector. On the collapsed tile, the chevron expands and the body opens the inspector. Global controls render as a React Flow `<Panel>` top-left, cream-themed to match `Controls`.

**Per-compound layout: pack vs rank (Req 8).** Each expanded compound chooses its ELK algorithm by whether its children carry dependency flow. A compound is the *lowest common ancestor* of an aggregated edge when the edge's two endpoints diverge into different direct children of it; such a compound uses `layered`/`DOWN` so the dependency reads top-down (the v1.3 behavior). A compound that is the LCA of no edge uses `rectpacking` — its children are independent, so a near-square grid (`elk.aspectRatio` 1.6) beats a stretched single rank. The **top-level overview always packs**: edges whose LCA is the depth-0 root are dropped from the ELK graph entirely and the subsystem tiles pack into a grid; React Flow still draws those dependency arrows as curves between tile positions (it renders every edge from node coordinates — ELK edge geometry is never read back, which is what makes packing-with-edges-present safe). Net effect: the landing view is a compact subsystem grid; drilling into a subsystem shows its internal dependency rank.

**Edges attach to their LCA compound, not the graph wrapper.** v1.3 attached all ELK edges to the top-level graph wrapper, which `layered` + `INCLUDE_CHILDREN` tolerated. Once any ancestor is `rectpacking`, ELK's JSON importer rejects a wrapper-level edge that descends into the packed subtree (`Referenced shape does not exist`). So each ELK edge is placed in its LCA compound's `edges` array; only edges inside `layered` compounds reach ELK at all.

### Components

```
src/components/dag/
  DagCanvas.tsx              // React Flow wrapper, ReactFlowProvider, controls; computes effective expansion + bulk-toggle Panel (v1.4)
  DocDagNode.tsx             // custom node renderer (title, id, status chip)
  DocSubtreeNode.tsx         // expanded subtree container; header strip IS the parent (D13) + collapse chevron (v1.4); dashed interior click-inert
  DocCollapsedSubtreeNode.tsx// collapsed subtree rollup tile — stacked card + status tally + expand chevron (v1.4)
  NodeInspector.tsx          // inspector content: metadata, parent, dependsOn, children, doc link, Dispatch button (06-agent-dispatcher), WorkflowProgressSection (09-workflow-progress); props: { node: DocNode; allNodes: DocNode[] }
  useDagLayout.ts            // ELK-backed compound-graph layout (async); collapse-aware ELK build + edge aggregation (v1.4)
  useDocGraph.ts             // TanStack Query against GET /api/docs; loadDocNodes() as placeholderData
  WorkflowProgressSection.tsx// lifecycle-stage progress rows + children rollup; added by 09-workflow-progress
  WorkflowStageRow.tsx       // single stage row sub-component; added by 09-workflow-progress
src/components/ui/
  StatusChip.tsx             // small colored pill, one per NodeStatus (moved from src/components/dag/ post-v1.4)
  statusColors.ts            // STATUS_STYLES map shared by StatusChip + collapsed-tile dot tally (v1.4)
src/lib/
  parseDocs.ts               // pure parser: raw markdown text → DocNode[]
  dagExpansion.ts            // pure: subtree-parent set, computeDefaultExpansion, representative/edge-remap helpers (v1.4)
src/stores/
  dagView.ts                 // persisted expansion overrides + bulk actions (v1.4)
```

`DagPanel.tsx` becomes a thin shell: render `<DagCanvas />`, wire its `onNodeClick` to `openInspector(<NodeInspector node={…} allNodes={docs} />)`.

### Status color mapping

| Status | Color token |
|---|---|
| `DRAFT` | `--color-muted` |
| `SPEC_REVIEW` | `--color-warning` |
| `APPROVED` | `--color-accent` |
| `IN_PROGRESS` | `--color-accent` (with subtle animation deferred — no runtime yet) |
| `VERIFY` | `--color-warning` |
| `COMPLETE` | `--color-success` |
| `ISSUE_OPEN` | `--color-danger` |
| `PLANNED` | `--color-muted` (dashed border on the node) |
| `DEFERRED` | `--color-muted` (terminal; rendered like `PLANNED` but explicitly out-of-scope, not awaiting authorship) |

All colors flow through the existing CSS variables in `src/styles/globals.css`. No new tokens are introduced — if a token gap exists the gap is filled in `globals.css`, not in component CSS.

### Acceptance check (manual)

A reviewer running `pnpm dev` and visiting `/dag` must see:

1. A graph with **all current docs/ nodes**: `root` (00-project), `01-ui`, `01-ui/01-shell`, plus the six **planned** siblings under `01-ui` (`02-dag` … `07-replay`).
2. Hierarchy is shown spatially: a translucent dashed rounded-rect frames the seven `01-ui` children, labeled `01-ui` + title. No parent → child line edges are drawn (D11).
3. Each node's status chip matches the doc's `**Status:**` line (e.g., `01-ui/01-shell` shows `VERIFY` now, `COMPLETE` after promotion).
4. Planned-but-unauthored nodes (`03-docs`, `04-tasks`, `05-logs`, `06-health`, `07-replay`) render with a dashed border and `PLANNED` chip.
5. All `dependsOn` relations render as dashed bezier arrows. (The original "depends on" text label was removed in v1.1 — see D12.)
6. Clicking any doc tile opens the right-hand inspector with the node's details; clicking again or selecting a different node updates content. The inspector's existing `Esc`-to-close still works. Clicks on the subtree rect itself do nothing.
7. Pan and zoom work. (No minimap as of v1.1 — see D12.)
8. The graph layout looks reasonable without any manual coord tweaking — adding a new file under `docs/` and reloading repositions everything automatically.

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

- **Cross-subtree dependency edges.** The manifest's `dependsOn` column today only references siblings under the same parent (e.g., `02-dag` depends on `01-shell`). PRD §6.1 allows cross-subtree dependencies. Parser resolves by id within the full node set, but no current manifest exercises cross-subtree, so this is untested. *(Priority: LOW.)*
- **Graph layout for very large trees.** ELK `layered` is significantly more capable than dagre (which it replaced in v1.3), but at some node count the compound layout will slow or the rendering will become unreadable. Re-evaluate if the doc count grows past ~100. *(Priority: LOW.)*
- **Inspector content shape conflicts when multiple panels open it.** This node ships a `NodeInspector` specific to DAG node clicks. Later panels (Tasks, Docs) will each ship their own. The shell store holds `ReactNode`, so there's no contract conflict — but a future "inspector context registry" might be cleaner. Defer. *(Priority: LOW.)*
- ~~**Parent node renders floating above its own subtree container.** When a parent is decomposed (`01-ui` is the live example), the parent renders as one node and its children render inside a separate labelled container box. The two are not visually connected — the parent appears orphaned. Collapse the model: the container's title bar *is* the parent node (status chip, ID, name in the header; children inside; no separate floating element). Affects `DocSubtreeNode.tsx` and `useDagLayout.ts`. *(Priority: MEDIUM — confusing in the current screenshot; trivial fix.)*~~ → addressed in v1.2 (2026-05-27).
- ~~**Redundant transitive dependency edges drawn.** Today the layout draws every declared `dependsOn` edge. When `A → B` and `B → C` are both declared, the implied `A → C` is also drawn, producing visual clutter (live example: `01-shell → 03-docs` is implied by `01-shell → 08-markdown → 03-docs`). Compute the transitive reduction over the edge set before passing to dagre. Caveat: when task-DAG edges arrive (claims, deps), reduction must respect edge type — same-type only. *(Priority: MEDIUM — affects readability; fix in `useDagLayout.ts`.)*~~ → addressed by `99-maintenance/01-round-1` R1 (2026-05-26).
- ~~**Dagre rank-ordering causes crossed dep edges.** Surfaced during round-1 verification (2026-05-26): with the transitive reduction now in place, two real (non-redundant) dep edges still cross uselessly — `08-markdown → 03-docs` and `02-dag → 09-workflow-progress`. Dagre places `03-docs` and `09-workflow-progress` in an order that forces the crossing; ordering hints or post-layout swap would resolve it. Independent of the parent-floating issue. *(Priority: LOW — visual quirk only; revisit in a future round.)*~~ → expected to resolve under v1.3 ELK `layered` crossing minimization (D14); confirm at stage-8 operator verification.
- ~~**Outer subtree paints over inner subtree's header and intercepts clicks.** Surfaced during v1.2 operator verification (2026-05-27). `useDagLayout.ts` emits all subtree nodes with `zIndex: -1`; with nested subtrees (`root` enclosing `01-ui`, `04-api-server`), the bottom-up sort pushes the outer subtree into the nodes array *after* the inner one, so React Flow paints `root` on top of `01-ui`. Two consequences from the single paint-order bug: (a) `root`'s cream-wash background washes out `01-ui`'s header strip visually; (b) React Flow's node wrapper defaults to `pointer-events: all`, so `root`'s wrapper captures clicks anywhere inside its bounds — including `01-ui`'s header button. Fix: depth-based `zIndex` (outer = lower, doc tiles = 0) so paint order is correct regardless of array order, plus `pointerEvents: "none"` on the subtree wrapper (the inner `<button>` keeps `pointer-events-auto` and wins as a CSS leaf). *(Priority: HIGH — blocks v1.2 sign-off; fix in `useDagLayout.ts`.)*~~ → addressed in v1.2 paint-order patch (2026-05-27).
- ~~**v1.3 stage-8: `root` subtree rect not rendered.** Surfaced 2026-05-27 during operator verification of v1.3 (ELK migration). The two inner subtrees (`01-ui`, `04-api-server`) render correctly; the outer `root` rect that should enclose them is missing. **Root cause:** `useDagLayout.ts` `layout()` builds the ELK graph wrapper with `id: "root"` (an ELK convention for the top-level graph), but the PRD's doc root node also has `id: "root"`. The `walk()` function short-circuits on `elkNode.id === "root"`, treating *both* the ELK wrapper and the doc-root compound as the sentinel — so it recurses into children without emitting a `subtree-root` React Flow node. Fix: rename the ELK graph wrapper to a sentinel that cannot collide with a doc id (e.g. `__elk_root__`) and compare on that. The rest of the render path is unchanged. Affected lines: the `elkGraph` constructor and the `walk()` sentinel check. *(Priority: HIGH — blocks v1.3 sign-off; trivial fix in `useDagLayout.ts`.)*~~ → addressed in v1.3 root-id-collision patch (2026-05-27).
- ~~**Auto-collapse subtree when all children are terminal (COMPLETE / DEFERRED).** Filed during v1.2 sign-off (2026-05-27). Once every descendant of a subtree parent reaches a terminal lifecycle state, the children carry no actionable information — the subtree's header (status chip + id + title) is sufficient. Collapse the rect to a header-only tile so the canvas reserves space for whatever subtree is still in flight. Open questions: should the collapse be operator-toggleable (click-to-expand) or automatic on terminal-reach? Does ISSUE_OPEN unwind a previously-collapsed subtree back to expanded? Treat DEFERRED as terminal alongside COMPLETE per PRD §6.2. Likely changes: `useDagLayout.ts` (skip emitting child doc tiles + intra-subtree dep edges when all-terminal predicate is true) and `DocSubtreeNode.tsx` (header-only render path). *(Priority: LOW — visual/scaling improvement; not blocking.)*~~ → addressed by v1.4 (2026-06-02, D15), broadened from terminal-only auto-collapse to a general collapse model. Both open questions answered: collapse is **operator-toggleable** with a **status-driven default** (not pure auto-on-terminal); ISSUE_OPEN **does** re-expand via the default policy unless the operator has a standing manual override. DEFERRED treated as terminal (not active-frontier) alongside COMPLETE.
- ~~**Swap layout engine from `@dagrejs/dagre` to `elkjs`; keep React Flow.** Filed during v1.2 sign-off (2026-05-27) as open-ended substrate research; **decision recorded same day** in `00-ui.md` D10 after reconsidering with two forward-looking constraints surfaced by the operator: the `05-task-runner` task DAG will be **interactive** (drag, edge creation, manual claim reassignment), and the project will eventually grow a **C4-style architecture browser** with drill-down across abstraction levels. Both keep React Flow structurally cheaper than a full canvas swap; both push past dagre's flat-graph assumption (compound nodes, port-aware edge routing, per-view algorithm selection). The v1.1/v1.2 workaround pile (bounds union, depth-based `zIndex`, wrapper `pointer-events: none`, paint-order ordering, the still-open crossed dep edges `08-markdown → 03-docs` and `02-dag → 09-workflow-progress`) is the symptom set that should dissolve under ELK's `layered` algorithm with port constraints. Rejected alternatives (recorded in `00-ui.md` D10): Cytoscape.js, hand-rolled SVG, stay-with-dagre. **Migration is scoped to `useDagLayout.ts` + dependency swap + bundle-impact measurement under route-level lazy-load**; no changes to `DocDagNode`, `DocSubtreeNode`, `StatusChip`, `NodeInspector`, or the cream theme. **Trigger to execute:** next `02-dag` v1.X cycle via leaf-workflow §8b, scheduled before `05-task-runner` ships UI so the task panel is built against ELK natively (one consumer of the layout hook migrates more cleanly than two). *(Priority: MEDIUM-when-triggered — research closed; execution gated on operator opening the §8b cycle.)*~~ → §8b cycle opened 2026-05-27 (COMPLETE → ISSUE_OPEN). Execution tracked under D14 + v1.3 Implementation Notes.

---

## Spec Revision (2026-05-27 — v1.3 ELK migration)

Open Issue at line 181 was actioned via leaf-workflow §8b. Spec edited for the engine swap; SPEC_REVIEW stage skipped per §2 shortcut (decision pre-recorded and reviewed via `00-ui.md` D10's own commit on 2026-05-27; this spec edit is the local consequence, not a new architectural choice).

| Section | What changed |
|---------|--------------|
| §Design > Layout | Rewrote dagre paragraph as ELK `layered` (compound graph model, coordinate flattening, async hook). Recap of why ELK over dagre points to D10 + workaround-pile dissolution. |
| §Decisions | Added D14 (engine swap, compound graph, async hook, lazy-load). D13 annotated with "Bounds-computation half superseded 2026-05-27 by D14" — the visual model (header IS parent, dashed interior click-inert) is unchanged. |
| §Open Issues | Line 181 (engine swap) struck through with forward pointer "§8b cycle opened 2026-05-27." Line 178 (dagre crossed dep edges) struck through with "expected to resolve under v1.3 ELK; confirm at stage 8." |
| §Implementation Notes > Pinned versions | Will update post-install (drop `@dagrejs/dagre`, add `elkjs`). Pinned versions table is the canonical record of installed deps after the swap. |

The v1.0–v1.2 audit tables stay as durable provenance — they record decisions that were correct at the time and are now superseded only at the layout-engine layer.

---

## Implementation Notes

### Pinned versions (added to `app/package.json`)

| Library | Version |
|---|---|
| `@xyflow/react` | ^12.10.2 |
| `elkjs` | ^0.11.1 (v1.3 — replaces `@dagrejs/dagre` ^3.0.0) |

### Key choices

- **Vite glob path.** `import.meta.glob("../../../docs/**/*.md", { query: "?raw", import: "default", eager: true })` from `src/lib/parseDocs.ts` resolves to `<repo>/docs/**`. Required adding `server.fs.allow: [path.resolve(__dirname, "..")]` in `vite.config.ts` so the dev server is allowed to serve files outside the Vite project root (`app/`).
- **ELK typing.** `elkjs/lib/elk.bundled.js` re-exports the same `ELK`, `ElkNode`, `ElkExtendedEdge` types as `elkjs`. Types are imported separately from the runtime so the type-only imports don't pull the bundled worker into typecheck. Each `ElkNode` carries optional `x`, `y`, `width`, `height` (set by ELK during `layout`) plus a `children?` array that we populate for compound parents.
- **Parser scope.** The parser handles two doc-id patterns: `00-project.md → root`, and `<dir>/00-<slug>.md → <dir>`. All other paths map to `<dir>/<basename>`. The "## Children" manifest table is matched by a regex on rows of the form `` | `id` | title | deps | status | ``. `dependsOn` cell extraction also uses backtick capture, so plain `—` becomes an empty list.
- **Manifest-only children.** Children listed in a parent's manifest but lacking an authored `.md` file are surfaced as `DocNode { authored: false, status: PLANNED }`. They render with a dashed border in `DocDagNode`.
- **Dependency vs parent edges.** Dep edges are passed to ELK as `ElkExtendedEdge` records (full set, pre-reduction) so the `layered` algorithm uses them for layer assignment and crossing minimization. Only the transitive-reduced subset is rendered as visible arrows (dashed bezier in `--color-accent`). Parent relations are NOT passed as edges — under ELK compound graphs they're encoded via `children` nesting on the parent's `ElkNode`. Subtree rects render as `subtree`-typed React Flow nodes behind doc tiles via depth-based `zIndex` (`-100 + parentDepth`) and `pointerEvents: "none"` on the wrapper (the inner header `<button>` carries `pointer-events-auto` and wins as a CSS leaf).
- **No drag.** `nodesDraggable={false}` — this is a read-only view of authored doc state. The interactive task DAG (`05-task-runner`) will re-enable drag for its own affordances (claim reassignment, manual edge creation); the doc panel stays read-only.
- **Async layout + imperative fitView.** ELK is unconditionally async (`elk.layout()` returns a Promise). The hook returns `{ nodes: [], edges: [] }` until the first resolution. `DagCanvas` calls `useReactFlow().fitView(...)` in a `useEffect` keyed on `nodes.length` so the viewport fits once nodes appear — React Flow's `fitView` JSX prop only fires on initial mount with whatever nodes are present, which would be empty under async layout.

### Deviations from the spec

- The Design names `useDocGraph.ts` as living in `src/components/dag/`; I placed it there as planned but it's a thin re-export of the parser. The actual swap point for the API-backed source will be this file alone.
- React Flow's `Background` and `Controls` are styled inline via the `style` prop and Tailwind class overrides. There's a small amount of `!important`-prefixed Tailwind in `DagCanvas.tsx` to override React Flow's stock control styling so it matches the cream theme. This is the documented escape hatch in xyflow's CSS guidance.

### Verification status

Automated gates run on 2026-05-22 — all clean:

- `pnpm -C app typecheck`: zero output.
- `pnpm -C app lint`: zero output under `--max-warnings=0`.
- `pnpm -C app build`: 1,832 modules transformed; bundle 640.64 kB JS / 32.38 kB CSS (gzip 207.85 / 6.45). React Flow + dagre account for the JS growth from the shell's 354 kB.
- `pnpm -C app dev`: dev server serves HTTP 200 at `/dag`; the eager glob inlined four raw markdown imports (00-project, 01-ui/00-ui, 01-ui/01-shell, 01-ui/02-dag) at module-load time.

Status set to VERIFY pending manual browser walk-through of the §Verification list. Once a reviewer confirms the graph renders, the node may be promoted to COMPLETE.

### Round-1 verification feedback (2026-05-22)

A manual walk-through of `/dag` surfaced three items. Findings + planned response captured here before re-implementation:

| # | Finding | Severity | Planned response |
|---|---|---|---|
| F1 | `root` (LLM Project Framework) renders as a standalone box, not connected to `01-ui` | Bug | `parseDocs.ts` extracts the first backtick in `**Parent:** project root (\`docs/00-project.md\`)` and uses `docs/00-project.md` as the parent id. That id isn't in the node set, so `useDagLayout` drops the parent edge. Reorder the checks in `parseOne` to match "project root" text **before** the backtick. See D8. |
| F2 | `dependsOn` dashed edges from `01-shell` to each round-2 panel feel duplicative — every visible dep is sibling-on-sibling under the same parent, and the parent fan from `01-ui` already covers the same targets | Design | Suppress same-parent dep edges from rendering, but keep them in dagre's graph so rank assignment still places dependents below dependencies. Cross-subtree deps remain rendered (none exist today, so this is a no-op in the current view). See D9. |
| F3 | Orthogonal (`smoothstep`) routing produces overlapping right-angle runs that read as one line | Design | Switch both parent and dep edges to bezier (`type: "default"`). See D10. |

After the fixes land, the node returns to VERIFY for a re-walk; the §Verification checklist gains an explicit "root box connects via solid parent edge to `01-ui`" item.

Re-run gates on 2026-05-22 after the F1–F3 fixes — all clean:

- `pnpm -C app typecheck`: zero output.
- `pnpm -C app lint`: zero output under `--max-warnings=0`.
- `pnpm -C app build`: 1,832 modules transformed; bundle 647.77 kB JS / 32.40 kB CSS (gzip 210.27 / 6.46). +7 kB JS vs. the pre-fix build, attributable to React Flow's bezier edge component pulling in on top of `smoothstep`.

Awaiting manual re-walk against the updated §Verification list.

### Round-2 verification feedback (2026-05-22)

After the F1–F3 fixes shipped, a second walk-through raised a more fundamental question about edge semantics:

| # | Finding | Severity | Planned response |
|---|---|---|---|
| F4 | Round-1's D9 suppressed sibling-on-sibling dep edges as "duplicative of parent edges." That was wrong: parent edges and dep edges encode different facts. `02-dag → 01-shell` (dep) says "blocked until shell is done." `01-ui → 02-dag` (parent) says "lives under the UI subtree." They happen to share a target but mean different things. The right question is which fact is worth drawing. | Design — D9 is wrong | Reverse: dep edges always render. The redundant-feeling thing is actually the **parent** edges — hierarchy is already in the node id (`01-ui/02-dag` ⇒ parent is `01-ui`). Drop visible parent edges; encode hierarchy spatially via a translucent rounded rect behind each parent's children. See D11. |

This pivot also moves the panel closer to its long-term shape: the eventual *task* DAG view has no parents — only deps and grouping. Sticking with parent-as-edge now would be a habit to unlearn.

Implementation:

- `useDagLayout.ts` no longer pushes parent relations to the visible-edges array; they still go to `dagre.setEdge` so rank assignment is unchanged.
- All `dependsOn` edges render (the round-1 same-parent skip is removed).
- ~~A new "subtree" node type per parent with ≥2 children frames its kids with a dashed rounded rect; the parent's own doc tile sits separately above. Subtree nodes are non-interactive (`selectable: false`, `draggable: false`, click handler ignores them).~~ → superseded by v1.2 / D13: the subtree node now *is* the parent (interactive header strip with status chip + id + title); only the dashed interior is click-inert.
- Subtree nodes are emitted **first** in the `nodes` array so React Flow renders them behind the doc tiles, and they carry `style.zIndex: -1` as belt-and-suspenders.

Re-run gates on 2026-05-22 after the F4 pivot — all clean:

- `pnpm -C app typecheck`: zero output.
- `pnpm -C app lint`: zero output under `--max-warnings=0`.
- `pnpm -C app build`: 1,833 modules transformed; bundle 652.50 kB JS / 32.62 kB CSS (gzip 211.95 / 6.51). +5 kB JS vs. the round-1 build, attributable to the new `DocSubtreeNode` component.

Awaiting manual re-walk against the updated §Verification list.

### v1 sign-off (2026-05-22)

The operator signed off on the current rendering as **v1 ready**. Promoted VERIFY → COMPLETE.

Explicitly a v1: more iteration is expected. Known follow-ups remain in §Open Issues (cross-subtree dep edges, large-tree layout, inspector contract), plus the eventual data-source swap when the API server lands. Future revisions reopen the node via the COMPLETE → ISSUE_OPEN → IN_PROGRESS → VERIFY → COMPLETE loop per PRD §6.2 rather than blocking v1.

### v1.1 visual simplification (2026-05-23)

Three pieces of round-3 operator feedback handled together as a single in-place revision rather than a full COMPLETE → ISSUE_OPEN cycle — none changed behavior, all three were chrome removals:

| # | Finding | Severity | Response |
|---|---|---|---|
| F5 | The "depends on" label on every dep edge is noise — dep edges are the only edges drawn (per D11), so labeling each one with the edge type adds nothing. | Polish | Removed `label`, `labelStyle`, `labelBgStyle`, `labelBgPadding` from the dep-edge objects in `useDagLayout.ts`. See D12. |
| F6 | Each doc tile rendered small connection-handle dots at top and bottom edges (React Flow's default for `Handle` components). They advertise an interaction (drag-to-connect) the panel doesn't support — `nodesConnectable={false}` — so they read as broken or vestigial. | Polish | `DocDagNode.tsx` keeps the `Handle` elements (dagre-routed edges still need attachment anchors) but styles them as 1×1 transparent and sets `isConnectable={false}` for belt-and-suspenders. See D12. |
| F7 | The bottom-right minimap didn't reliably render the viewport-box overlay (likely a `maskColor` / OKLCH alpha interaction with the cream theme), and at ≤30 nodes a minimap isn't earning the space anyway. | Polish | Removed `<MiniMap>` and its `minimapStyle` memo from `DagCanvas.tsx`; dropped the `MiniMap` and `useMemo` imports. See D12. |

Gates re-run on 2026-05-23 — all clean:

- `pnpm -C app typecheck`: zero output.
- `pnpm -C app lint`: zero output under `--max-warnings=0`.

Status: COMPLETE (v1.1). No formal re-verification cycle — the changes are visible-on-load and the v1 acceptance items unaffected by the chrome removal still hold.

### v1.2 collapsed parent (2026-05-27)

**What changed:** Collapsed the floating parent doc tile into the subtree container's header strip (Open Issue → ISSUE_OPEN → IN_PROGRESS → VERIFY). Subtree parents are no longer emitted as `type: "doc"` React Flow nodes. Instead, `DocSubtreeData` carries the full parent `DocNode`; the `DocSubtreeNode` renders a solid header strip (cream-theme tokens only, no new tokens) with `StatusChip` + id + title. A `onHeaderClick` callback in the data fires `openInspector` for the parent when the user clicks the header. Bottom-up bounds computation (deepest subtrees first) ensures outer rects correctly enclose inner rects. `useDagLayout` signature gains a second param `onSubtreeHeaderClick: (node: DocNode) => void`; `DagCanvas` constructs this callback before passing it in.

**Files changed:**
- `app/src/components/dag/useDagLayout.ts` — `DocSubtreeData` shape updated; `buildSubtreeParentIds` extracted; `buildSubtreeNodes` rewritten with bottom-up bounds; `layout` skips subtree-parent nodes from `docNodes`; `useDagLayout` gains second param.
- `app/src/components/dag/DocSubtreeNode.tsx` — header strip with `StatusChip` + id + title; `pointer-events-auto` on the `<button>`; interior remains `pointer-events-none`.
- `app/src/components/dag/DagCanvas.tsx` — `onSubtreeHeaderClick` callback constructed and passed to `useDagLayout`; `DocNode` import added.

**Bundle delta vs worktree baseline (worktree includes all panels through 04-api-server):**
- Before: 1,751.29 kB JS / 44.17 kB CSS (gzip 550.96 / 8.62 kB)
- After: 1,752.20 kB JS / 44.24 kB CSS (gzip 551.31 / 8.63 kB)
- Delta: +0.91 kB JS / +0.07 kB CSS — negligible; the new `StatusChip` import in `DocSubtreeNode` is already tree-shaken since `DocDagNode` imports it too.

**Note on v1.1 baseline comparison:** The PRD-documented v1.1 baseline (652.50 kB JS / 32.62 kB CSS) pre-dates the 04-api-server panels; the worktree bundle is ~1,100 kB larger because it includes all COMPLETE panels. The delta above (worktree before/after) is the correct apples-to-apples comparison for this change.

**Deviations:** None. All design constraints 1–7 met as specified.

**Deprecated interface:** `DocSubtreeData.label` and `DocSubtreeData.title` replaced by `DocSubtreeData.parentNode` and `DocSubtreeData.onHeaderClick`. No other consumers of `DocSubtreeData` exist outside `DocSubtreeNode.tsx`.

### Implementation Review (2026-05-27)

Reviewer ran in clean context against `git diff main..HEAD`. Gates: `typecheck` exit 0 (zero output); `lint` exit 0 (zero output); `build` exit 0 (1,756.08 kB JS / 44.24 kB CSS gzip 552.70 / 8.63 kB). Verdict: NEEDS_MINOR_REVISIONS — doc-only fixes.

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| F1 | Should-fix | §Round-2 verification feedback "Implementation" bullet stated "the parent's own doc tile sits separately above" — directly contradicts D13. | Bullet struck through inline with forward pointer `→ superseded by v1.2 / D13: the subtree node now *is* the parent (…)`. Historical narrative preserved per the v1.1/round-2 audit-table convention. |
| F2 | Should-fix | §Design > Components: `DagCanvas.tsx // … minimap, controls` carried stale `minimap` reference (removed in v1.1 / D12). | Comment now reads `// React Flow wrapper, ReactFlowProvider, controls`. |
| F3 | Should-fix | §Design > Components: `DocSubtreeNode.tsx // non-interactive background rect framing a parent's children (D11)` — stale post-D13; the component is now the parent's visual representation with an interactive header strip. | Comment now reads `// subtree container whose header strip IS the parent node (D13); dashed interior is click-inert`. |
| F4 | Nit | §Implementation Notes > Deviations: "React Flow's `Background`, `MiniMap`, and `Controls` are styled inline" — `MiniMap` was removed in v1.1. | `MiniMap` removed from the sentence; `Background` + `Controls` retained. |
| F5 | Nit | `DocSubtreeNode.tsx`: `NodeProps<DocSubtreeData>` would eliminate the `data as DocSubtreeData` cast. | **Punted.** `DocDagNode.tsx` uses the same cast pattern (`data as DocNodeData`); changing one without the other introduces asymmetry. Filed as part of a future doc-DAG type-tightening pass if it surfaces. |

**Code discipline / spec conformance (no findings):** no `any`, no `eslint-disable`, no `console.log`, no dead code. Bottom-up sort (`depth(b) − depth(a)`) verified correct: inner subtree bounds compute before outer. `buildSubtreeParentIds` enforces ≥2-child threshold (so `99-maintenance` stays a tile). Subtree parents filtered from `docNodes` array. `pointer-events-auto` on header `<button>` with `pointer-events-none` on outer div verified — interior is click-inert. `onNodeClick` retains its `node.type !== "doc"` guard, so subtree clicks bypass React Flow's handler and only the header's own `onClick` fires.

### v1.2 paint-order patch (2026-05-27)

Operator verification surfaced a paint-order/click-capture bug that the reviewer missed because it only manifests in the browser. Reviewer's "pointer-events verified — interior is click-inert" stopped at the component's own DOM; it did not consider that React Flow wraps every node in `.react-flow__node` with `pointer-events: all` by default, which sits *above* the component's outer div. Combined with both subtrees sharing `zIndex: -1` and the outer subtree being emitted after the inner one (bottom-up sort + array-tiebreak), the outer subtree's wrapper covered the inner subtree's header strip — washing it out visually and capturing its clicks. Filing as HIGH-priority Open Issue and re-entering at stage 4 was the right call; future reviewers should treat React Flow's wrapper styles as in-scope when assessing pointer-events claims.

**What changed:**
- `useDagLayout.ts` line 282–292: each subtree node now carries a depth-based `zIndex` (`-100 + depth(parentId)`) so outer subtrees (lower depth) paint behind inner ones. Doc tiles keep default `zIndex: 0`, painting above all subtrees.
- `useDagLayout.ts` line 297: subtree wrapper now sets `pointerEvents: "none"` via the `style` prop (which React Flow applies to the `.react-flow__node` wrapper). The inner header `<button>` keeps `pointer-events-auto` and wins as a CSS leaf, so the header clicks correctly while empty interior areas fall through to React Flow's pan/zoom pane.

**Gates re-run (2026-05-27):**
- `pnpm -C app typecheck`: exit 0, zero output.
- `pnpm -C app lint`: exit 0, zero output.
- `pnpm -C app build`: exit 0, 2,354 modules; 1,759.81 kB JS / 44.24 kB CSS (gzip 554.14 / 8.63 kB). +3.73 kB JS vs. the v1.2 review-state build, attributable to the depth-computation reuse + the two style fields.

**Deviations:** None.

### v1.3 ELK migration (2026-05-27)

Executes D14 / `00-ui.md` D10. Engine swap `@dagrejs/dagre` → `elkjs`; subtree parents become ELK compound nodes; hand-rolled bottom-up bounds computation deleted; route-level lazy-load on `DagPanel`. Reviewer skipped per leaf-workflow §2 shortcut (decision pre-recorded in D10).

**Files changed:**
- `app/package.json` — removed `@dagrejs/dagre`, added `elkjs ^0.11.1`.
- `app/src/components/dag/useDagLayout.ts` — rewritten end-to-end. Engine swap, async hook (`useState` + `useEffect` + cancellation flag), ELK graph builder (compound `children` for subtree parents), recursive coordinate-flattening walk. `transitiveReduction`, `buildSubtreeParentIds`, depth-based subtree `zIndex`, `pointer-events: "none"` on subtree wrappers — all carried over verbatim. `buildSubtreeNodes` deleted; ELK returns compound dimensions natively. Layout options: `elk.algorithm: layered`, `elk.direction: DOWN`, `nodeNodeBetweenLayers: 80`, `nodeNode: 40`, `hierarchyHandling: INCLUDE_CHILDREN`. Compound padding = `[top=52,left=24,bottom=20,right=24]` to mirror v1.2's `GROUP_PAD_*` constants and reserve the header strip.
- `app/src/components/dag/DagCanvas.tsx` — adds `useReactFlow().fitView()` in a `useEffect` keyed on `nodes.length`. The `fitView` JSX prop is removed; with the async layout, React Flow mounts with empty arrays and the prop would fit on nothing. Imperative refit fires once nodes arrive (~50–200ms after mount for ≤30 nodes).
- `app/src/router.tsx` — `DagPanel` now `React.lazy(() => import(...))`, wrapped in `<Suspense fallback={…}>`. Small cream-themed "Loading…" placeholder. Other panel imports unchanged.

**Algorithm note:** `elk.bundled.js` is imported, not `elkjs/lib/main.js` — bundled entry inlines the worker so we don't need to manage `Worker` lifecycle or worker URL resolution. A single `new ELK()` instance is module-scoped and reused across hook calls.

**Coordinate flattening:** ELK returns child positions relative to their parent in the compound graph. The hook walks the ELK result tree once, accumulating `(x, y)` offsets through ancestors before emitting React Flow nodes with absolute coords. React Flow's `parentId` mechanism is intentionally NOT used — keeping all React Flow nodes flat preserves the v1.2 paint-order/click-capture semantics exactly (depth-based `zIndex`, `pointer-events: "none"` on the subtree wrapper, header `<button>` wins as CSS leaf).

**Async / cancellation:** `useEffect` with a `cancelled` flag protects against stale resolutions if `docs` changes mid-layout. Initial render returns `{ nodes: [], edges: [] }`; subsequent renders return ELK's result. For a ≤30-node graph the resolution typically completes within ~50–200ms and the operator sees no perceptible flash because React Flow's empty initial paint is already styled (cream background, dot pattern via `<Background />`).

**Bundle delta (vs pre-migration single-chunk build, captured 2026-05-27):**

| Build | JS raw | JS gzip | CSS raw | CSS gzip | Modules |
|---|---|---|---|---|---|
| Pre-migration (dagre, single chunk) | 1,772.34 kB | 558.40 kB | 44.24 kB | 8.63 kB | 2,354 |
| Post-migration `index` (non-DAG paths) | 1,537.50 kB | 481.36 kB | 28.39 kB | 6.25 kB | — |
| Post-migration `DagPanel` chunk (loaded only on `/dag`) | 1,646.36 kB | 505.15 kB | 15.85 kB | 2.66 kB | — |
| Post-migration combined (initial load on `/dag`) | 3,183.86 kB | 986.51 kB | 44.24 kB | 8.91 kB | 2,358 |

Two ways to read the delta:
- **Non-DAG paths (e.g. direct nav to `/docs` or `/tasks`):** −77.04 kB JS gzip (−14%) and −2.38 kB CSS gzip. The ELK weight is fully isolated from these routes.
- **DAG path:** +428.11 kB JS gzip (+77%). Of this, ~250 kB gzip is `elkjs` itself (D10's stated cost); the remainder is React Flow + transitive deps that were previously in the single chunk but Vite's chunk splitter could not de-duplicate across the static/dynamic boundary without a `manualChunks` config. That config is out of D14 scope (filed under Open follow-ups).

**Chunk-content verification:** confirmed via `grep -c` that doc raw-markdown content (the eager glob from `parseDocs.ts`) lives only in the `index` chunk (because non-DAG panels statically import `parseDocs`), and `elk-worker` runtime lives only in the `DagPanel` chunk. The lazy split is structurally correct; the gzip overhead is the inherent cost of ELK plus Vite's default chunk-splitting strategy.

**Deviations from D14 scope:**
- D14 says "no changes to `DocDagNode`, `DocSubtreeNode`, `StatusChip`, `NodeInspector`". Confirmed — those four files are untouched. The two additional touches (`DagCanvas.tsx`, `router.tsx`) are the minimum-surface accommodations for ELK's async API and the explicitly-scoped route-level lazy-load. Both fit within the broader D10 migration shape.
- The new `Suspense` fallback ("Loading…") is the only new visible UI string. Cream-theme tokens only.

**Gates (2026-05-27):**
- `pnpm -C app typecheck`: exit 0, zero output.
- `pnpm -C app lint`: exit 0, zero output under `--max-warnings=0`.
- `pnpm -C app build`: exit 0, 2,358 modules transformed.

Resolution of pre-existing Open Issue **"Dagre rank-ordering causes crossed dep edges"** (`08-markdown → 03-docs`, `02-dag → 09-workflow-progress`, line 178) is **expected** under ELK `layered`'s crossing minimization but unverified until operator browser walk-through (stage 8).

### v1.3 patch — root-id collision (2026-05-27)

Operator verification of the v1.3 build surfaced a missing `root` subtree rect: the two inner subtrees (`01-ui`, `04-api-server`) rendered correctly, but the outer rect that should enclose them was absent. Inner subtree rendering and dep edges (including the previously-crossed pair) were all fine — only the outer-most rect was missing.

**Root cause.** `layout()` built the ELK graph wrapper with `id: "root"` (the conventional placeholder for an ELK top-level node), and `walk()` short-circuited on `elkNode.id === "root"` to skip the sentinel. The PRD doc tree's top-level node also has `id: "root"` (`00-project.md` maps to that id per `parseDocs.ts`), so when the walker recursed into the doc-root compound, the same `id === "root"` check fired and the walker returned without emitting a `subtree-root` React Flow node. Inner subtrees were unaffected because their ids (`01-ui`, `04-api-server`) didn't collide.

This is the kind of bug `headless typecheck/lint/build` can't catch — it manifests only in the rendered output, which is exactly what operator stage-8 verification is for. The reviewer's pre-commit audit also wouldn't have caught it: the code reads as correct in isolation, and the collision only becomes visible when you trace the doc-root through the runtime.

**Fix.** Introduced a module-scoped `ELK_GRAPH_ROOT_ID = "__elk_root__"` sentinel — a string that cannot be produced by `parseDocs.ts`'s id-mapping (doc ids derive from filesystem paths, none of which produce `__elk_root__`). Both the `elkGraph` constructor and the `walk()` sentinel check use the constant. Three-line diff in `useDagLayout.ts`:
- New constant after the `elk` instance.
- `elkGraph.id: "root"` → `elkGraph.id: ELK_GRAPH_ROOT_ID`.
- `if (elkNode.id === "root")` → `if (elkNode.id === ELK_GRAPH_ROOT_ID)`.

**Gates re-run (2026-05-27):**
- `pnpm -C app typecheck`: exit 0, zero output.
- `pnpm -C app lint`: exit 0, zero output.
- `pnpm -C app build`: exit 0, 2,358 modules; index 1,545.35 kB / gzip 484.18 kB (drift from doc-text growth in the markdown glob — this very Implementation Notes section bumps it ~3 kB gzip), DagPanel 1,646.38 kB / gzip 505.18 kB (unchanged within noise).

**Deviations:** None. Three-line fix, no scope creep.

### v1.3 polish — depth-based subtree intensity (2026-05-27)

Operator stage-8 feedback after the root-id-collision patch: the outer `root` rect now renders correctly, but at low zoom the inner subtree boundaries (`01-ui`, `04-api-server`) blur into the outer rect — all three rects shared the same 60%-opacity wash and the same `--color-border` dashed border, so nesting was only legible via the (light) double-overlap of two semi-transparent layers. Filed in-place rather than as a new ISSUE_OPEN cycle since v1.3's status was already VERIFY and the change is chrome-only (no behavior change).

**What changed:**
- `useDagLayout.ts` — `DocSubtreeData` gains a `depth: number` field, populated from the existing `parentDepth = depthOf(docId)` computation already used for zIndex. No new traversal.
- `DocSubtreeNode.tsx` — reads `depth` from data; computes background opacity as `min(30 + depth * 40, 90)` (outer = 30%, depth-1 nested = 70%, capped at 90% so a hypothetical depth-2+ nesting doesn't go fully opaque); picks border between `--color-border` (depth 0) and `--color-border-strong` (depth ≥ 1). The header strip's bottom-divider border picks the same color so the header-to-interior transition stays coherent within a rect.

**Net visual effect:** outer `root` rect remains a faint wash with a soft dashed border; inner `01-ui` and `04-api-server` rects pop as clearly darker regions with a stronger dashed border. At full zoom the difference is subtle; at low zoom it's the dominant cue.

**Gates 2026-05-27:** `typecheck`, `lint` both exit 0. Build not re-run (no behavior change; the existing v1.3 patch build's chunk shape is unaffected by a token-only style edit).

**Deviations:** None. Stayed entirely within cream-theme tokens (no new color tokens introduced — `--color-border-strong` was already in `globals.css`).

**Follow-up tweak (same day, 2026-05-27).** Operator asked for darker borders after the first polish landed. Both depths bumped up one tier in the border-strength gradient:

- New token `--color-border-stronger: oklch(0.74 0.026 80)` added to `globals.css` (`:root` + `@theme inline`), extending the existing `border` (0.89) → `border-strong` (0.82) gradient by one step toward `--color-muted` (0.52). Token defined in `globals.css` per the CLAUDE.md rule that token gaps are filled there, not in component CSS.
- Outer rect (depth 0) border: `--color-border` → `--color-border-strong`.
- Inner rect (depth ≥ 1) border: `--color-border-strong` → `--color-border-stronger`.

Background washes (30 / 70 / 90% surface-sunken) unchanged. Gates re-run: typecheck + lint exit 0.

### v1.4 collapsible subtrees (2026-06-02)

Executes D15. Reopened COMPLETE v1.3 → ISSUE_OPEN → IN_PROGRESS to action the broadened "auto-collapse" Open Issue.

**New files:**
- `app/src/lib/dagExpansion.ts` — pure policy: `ACTIVE_FRONTIER` set, `buildSubtreeParentIds`, `computeDefaultExpansion` (root + ancestors of any active-frontier node), `computeEffectiveExpansion` (override-over-default, root forced expanded).
- `app/src/lib/dagExpansion.test.ts` — 10 unit tests over a 13-node fixture (path-to-deep-frontier, all-terminal collapse, override both directions, root force).
- `app/src/stores/dagView.ts` — persisted (`ledger.dagView`) override map + `setOverride`/`setMany`/`reset`.
- `app/src/components/dag/DocCollapsedSubtreeNode.tsx` — collapsed rollup tile: stacked-card cue, status chip + id + truncated title, descendant count + per-status colored-dot tally, expand chevron.
- `app/src/components/ui/statusColors.ts` — `STATUS_STYLES` extracted out of `StatusChip.tsx` so the chevron/dot consumers can share the map without tripping `react-refresh/only-export-components` (the component file must export components only).
- `app/src/components/dag/useDagLayout.layout.test.ts` — headless geometry tests (run the real `elk.bundled` in node): rectpacking grids independent children into ≥2 rows; the real-shape collapsed overview (build-order chain among subsystems) packs without error and keeps all edges resolving to rendered nodes; a layered compound under a packing parent ranks its chain top-down. These cover the parts that can't be unit-asserted any other way short of a browser.

**Changed files:**
- `useDagLayout.ts` — signature gains `expandedIds: Set<NodeId>` + `onToggleExpand`. `buildElkNode` emits a leaf box (no `children`) for collapsed subtree parents, so ELK never lays out hidden descendants (the scaling win). New `representative()` walks the root→node ancestor chain to the first collapsed parent; edges are remapped through it, deduped by `(source,target)`, self-edges dropped; `transitiveReduction` now runs on the aggregated set. `walk` emits a third node form (`collapsedSubtree`) with a transitive `descendantTally`. Local `buildSubtreeParentIds` removed in favor of the `dagExpansion` import. **Rectpacking (Req 8):** edges are bucketed by LCA compound (`elkEdgesByContainer`); `compoundOptions` returns `LAYERED_COMPOUND_OPTIONS` for any compound that is an edge's LCA and `RECTPACK_COMPOUND_OPTIONS` otherwise; depth-0 root edges are dropped so the overview packs. Core layout extracted as exported `computeDagLayout` for the headless tests. The graph wrapper's `edges` is now `[]` (edges live in their LCA container).
- `DocSubtreeNode.tsx` — header split into a chevron `<button>` (collapse) + a body `<button>` (inspector), sibling buttons (not nested) for valid markup; affordances kept distinct per Req 6.
- `DagCanvas.tsx` — registers `collapsedSubtree` node type; memoizes `computeEffectiveExpansion(docs, overrides)`; `onToggleExpand` writes the negated effective state as an override; top-left `<Panel>` with Expand all / Collapse all / Reset to active work; `fitView` changed from per-layout to **once-per-mount** (`didFitRef`) so toggles don't yank the viewport.

**Default behavior in the current repo state:** every node is COMPLETE, so `computeDefaultExpansion` returns root only → the canvas opens to a compact **rectpacked grid** of collapsed subsystem rollup tiles (root expanded + packing, all subsystems collapsed). The build-order chain among subsystems (02→04→05→06→07, etc.) is dropped from ELK placement and drawn by React Flow as curves between grid cells. This is the intended "finished-milestone snapshot." The moment any descendant enters the active frontier, its ancestor chain auto-expands on next load (absent a standing manual override), and the expanded subsystem lays its internals out `layered`/`DOWN`.

**Gates (2026-06-02):**
- `pnpm -C app typecheck`: exit 0, zero output.
- `pnpm -C app lint`: exit 0, zero output under `--max-warnings=0`.
- `pnpm -C app build`: exit 0, 2,392 modules; DagPanel chunk 1,657.54 kB / gzip 508.22 kB (+~3 kB gzip vs v1.3 — the new components + lucide chevron icons).
- `pnpm -C app test`: 147 passed (was 134; +10 `dagExpansion`, +3 `useDagLayout.layout` headless geometry).
- Dev server serves `/dag` HTTP 200, no transform/runtime errors in the dev log; the three headless ELK tests exercise the real-shape default + expanded scenarios in node without throwing.

**Deviations:** Title is now shown on the collapsed tile (the original Open Issue mused "header-only"); the rollup tally earns the extra line. Rectpacking trades spatial encoding of dependency direction at the *overview* level for compactness — top-level dep arrows still render but no longer all point downward.

**Awaiting operator browser walk-through** of the §Verification v1.4 items (collapse/expand toggles, default expansion, persistence across reload, edge rerouting, bulk controls) before VERIFY → COMPLETE. No browser automation is installed in this environment, so the visual sign-off is manual (consistent with every prior version of this node).

### Refactored 2026-06-03

Doc-code drift corrections; no behavior changes. Status field left COMPLETE.

| # | Section | What changed | Direction |
|---|---------|--------------|-----------|
| R1 | §Design > Data source | Removed "explicitly a Phase-1 placeholder" language and the aspirational `src/lib/api.ts` note. Replaced with a description of the actual implementation: `useDocGraph.ts` uses TanStack Query against `GET /api/docs` with `loadDocNodes()` as `placeholderData` fallback; the fetch is inline in `useDocGraph.ts`. The swap was done by `04-api-server/05-ui-hook-migration`. | Code → Spec |
| R2 | §Design > Components | `StatusChip.tsx` moved to `src/components/ui/` post-v1.4 (the spec still listed it under `src/components/dag/`). `statusColors.ts` entry added to `src/components/ui/` (was already noted in v1.4 Implementation Notes but omitted from the Components table). `WorkflowProgressSection.tsx` and `WorkflowStageRow.tsx` added — both live in `src/components/dag/` and were added by `09-workflow-progress`. `NodeInspector.tsx` comment updated to reflect its expanded role: now accepts `allNodes: DocNode[]` and renders Dispatch button (06-agent-dispatcher) + WorkflowProgressSection in addition to the original metadata fields. `useDocGraph.ts` comment updated to describe TanStack Query source. `DagPanel.tsx` shell call updated to show `allNodes={docs}`. | Code → Spec |
| R3 | §Decisions > D6 | Rationale said "No API exists." — API has existed since 04-api-server. Annotated with the actual post-swap behavior (TanStack Query, 30s stale time, no SSE). Original decision intent (no streaming push) remains valid. | Code → Spec |
| R4 | §Open Issues | "dagre struggles past ~500 nodes" — dagre was replaced by ELK in v1.3; the scaling statement now references ELK and raises the re-evaluation threshold to ~100 nodes. | Code → Spec |

### Open follow-ups

- React Flow ships a sizable CSS file (`@xyflow/react/dist/style.css`). Audit which classes are actually used and consider cherry-picking once styles stabilize.
- ~~The bundle warning ("chunks larger than 500 kB") will be addressed when 03-docs lands — code-splitting per panel becomes meaningful once there are multiple heavy panels.~~ Partially addressed by v1.3 lazy-load (DAG isolated to own chunk). Both remaining chunks are still >500 KB; further `manualChunks` vendor-splitting (React, React Flow, parser) would reduce duplication across `index` and `DagPanel` chunks. *(Priority: LOW — out of D14 scope; file as follow-up.)*
- The `?raw` query is the standard Vite pattern; double-check the `query: "?raw"` + `import: "default"` combination still parses correctly under future Vite versions.
- Lazy-load the remaining panels (`DocsPanel`, `TaskConsolePanel`, `LogStreamPanel`, `HealthDashboardPanel`, `ReplayPanel`, `DocViewerPanel`). v1.3 establishes the pattern (`React.lazy` + `Suspense`) for `DagPanel`; extending to siblings cuts the initial JS further for any non-DAG landing path. *(Priority: LOW — follow-up.)*

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. `/dag` renders all current docs nodes with correct status chips.
2. Parent edges are **not** drawn as lines (F4). No separate `root` or `01-ui` doc tile exists — the subtree container **is** the parent node.
3. Each subtree container (for `root` ≥2 children, for `01-ui` ≥2 children, for `04-api-server` ≥2 children) renders a dashed rounded rect with a **solid header strip** carrying the parent's status chip, id, and title. No subtree rect is drawn for `99-maintenance` (only one child `01-round-1`). Outer subtrees fully enclose inner subtrees — the `root` subtree rect wraps the `01-ui` and `04-api-server` inner rects entirely.
4. Clicking the **header strip** of a subtree rect opens the inspector for the parent node (same inspector content as if the parent were a doc tile). Clicking the interior (non-header) area of the subtree does nothing.
5. Every `dependsOn` edge is rendered as a dashed accent-colored bezier arrow. (As of v1.1 edges no longer carry a "depends on" text label — see D12.)
6. Edges are bezier curves, not orthogonal `smoothstep` routes (F3).
7. Clicking each doc tile (leaf or single-child parent) updates the inspector content; `Esc` still closes the inspector.
8. Removing a `.md` file under `docs/` and reloading drops the corresponding node; adding one (with a valid `**Node ID:**` and `**Parent:**`) adds it.
9. `pnpm typecheck`, `pnpm lint`, and `pnpm build` all exit zero.
10. No new network requests beyond Vite dev-server traffic.

**v1.4 (collapsible subtrees, D15):**

11. On a fresh load (cleared `ledger.dagView`), the canvas opens with root expanded and every all-terminal subsystem collapsed to a rollup tile. With a subtree containing an IN_PROGRESS/VERIFY/etc. descendant, that subtree (and its ancestor chain) opens automatically.
12. A collapsed subtree tile reads as a stacked card (distinct from a leaf), showing the parent chip + id + title, a descendant count, and per-status colored dots that sum to the count.
13. Clicking the chevron toggles collapse/expand without opening the inspector; clicking the tile body / header text opens the inspector without toggling.
14. Collapsing a subtree reroutes any dependency edge that crossed its boundary to the collapsed tile (no edge dangles into empty space); expanding restores the original endpoints.
15. Expand all / Collapse all affect every subtree parent; Reset to active work clears overrides and returns to the §11 default.
16. Expansion state survives a page reload (localStorage `ledger.dagView`).
17. On the default (all-collapsed) view, the top-level subsystem tiles read as a compact grid — multiple rows, not one wide horizontal rank — and the build-order dependency arrows still render between them.
18. Expanding a subsystem with internal dependencies lays its children out top-down (layered); expanding a parent whose children have no mutual deps packs them into a grid. No ELK import error in the browser console on any expand/collapse combination.

---

## Children

None.
