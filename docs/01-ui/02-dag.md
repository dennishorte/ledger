# DAG Panel

**Node ID:** `01-ui/02-dag`
**Parent:** `01-ui`
**Status:** COMPLETE (v1.1)
**Created:** 2026-05-22
**Last Updated:** 2026-05-23

---

## Requirements

Replace the `DagPanel` empty state at `/dag` with a real graph rendering that gives the operator their first useful view onto the framework's state. This is the leading panel of the round-2 decomposition (PRD §8.1) and the first place a task DAG will eventually surface.

Phase-1 scope, narrower than PRD §8.1 because no task runner exists yet:

1. Render the project's **document tree** (the implementation nodes under `docs/`) as a directed graph: each `docs/*.md` is a node, parent → child edges from the manifests.
2. Render **planned** child nodes declared in a parent's manifest even when no doc file exists yet, distinguished visually from authored nodes.
3. Show each node's **lifecycle status** (PRD §6.2: DRAFT, SPEC_REVIEW, APPROVED, IN_PROGRESS, VERIFY, COMPLETE, ISSUE_OPEN, plus the manifest-only `PLANNED` pseudo-state) as a colored chip on the node.
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

---

## Design

### Data source: build-time parse of `docs/**`

Vite `import.meta.glob('/docs/**/*.md', { query: '?raw', import: 'default', eager: true })` pulls every project doc into the bundle at build time. A small parser extracts per-file:

- **Node ID** — from the `**Node ID:** \`…\`` line, or `root` for `00-project.md`.
- **Parent** — from `**Parent:** …`, or `null` for the project root.
- **Title** — first `# …` heading.
- **Status** — from `**Status:** …`. Normalized to the `NodeStatus` enum; unknown values fall back to `DRAFT`.
- **Children manifest** — the rows of the markdown table immediately under a `## Children` heading (or under `### Current` / `### Planned` sub-headings if present). Each row supplies `id`, `title`, `dependsOn` (`—` parsed as none), and a `status` column.

Children rows whose `id` does not correspond to an authored doc are surfaced as **manifest-only** nodes with `status: PLANNED` (or whatever the manifest declares). They render with a dashed border and muted fill.

Edges and hierarchy (post-D11):

- **No parent → child lines are drawn.** Parent relations still feed dagre's rank assignment, but the hierarchy is conveyed *spatially* via a translucent rounded-rect *subtree* node behind each parent's children (rendered only when the parent has ≥2 children). The parent's own doc tile sits separately above its subtree rect.
- **Dependency** edges from the manifest's `dependsOn` column are the only edges drawn — dashed bezier arrows in `--color-accent` with a "depends on" label. All dep edges render, including sibling-on-sibling ones (e.g., `02-dag → 01-shell`).

Why build-time parse instead of a hand-authored TS fixture: the manifests in `00-project.md` §14 and `01-ui/00-ui.md` Children are already canonical. Duplicating them into TS guarantees drift. The parser is ~80 lines and the docs schema is already regular enough to make it tractable.

This data source is **explicitly a Phase-1 placeholder**. When the API server lands, `src/lib/api.ts` exposes the same `DocNode[]` shape from a backend endpoint and the panel switches sources behind a TanStack Query.

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
  | "PLANNED"; // manifest-only; no authored doc yet

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

`@dagrejs/dagre` performs the layout in a one-shot computation inside a memoized hook (`useDagLayout`). Top-down rank direction (`TB`); rank-sep 80px, node-sep 40px; node size 220 × 56 to match the custom node component. The hook returns React Flow `nodes` and `edges` arrays.

dagre is chosen over `elkjs` because the graph is small (≤ 30 nodes for the foreseeable future), dagre's bundle is ~30 KB vs elkjs's ~700 KB, and the layout quality difference is invisible at this scale.

### Components

```
src/components/dag/
  DagCanvas.tsx          // React Flow wrapper, ReactFlowProvider, minimap, controls
  DocDagNode.tsx         // custom node renderer (title, id, status chip)
  DocSubtreeNode.tsx     // non-interactive background rect framing a parent's children (D11)
  StatusChip.tsx         // small colored pill, one per NodeStatus
  NodeInspector.tsx      // content shown in the shell inspector on click
  useDagLayout.ts        // dagre layout hook + subtree-rect emission
  useDocGraph.ts         // returns DocNode[] from the build-time parse
src/lib/
  parseDocs.ts           // pure parser: raw markdown text → DocNode[]
```

`DagPanel.tsx` becomes a thin shell: render `<DagCanvas />`, wire its `onNodeClick` to `openInspector(<NodeInspector node={…} />)`.

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
| D2 | dagre over elkjs | ≤30 nodes for the foreseeable future; dagre is ~20× smaller and visually equivalent at this scale. |
| D3 | Manifest-only "PLANNED" nodes render with dashed border | Operator should see the full intended tree, not just what's been authored. Visual distinction prevents confusion with real nodes. |
| D4 | `DocNode` shape introduced in `src/lib/types.ts` (was empty) | First domain types arrive with the first panel that needs them, per `01-ui` §Design conventions. **Updated 2026-05-26 by `04-api-server/02-parser-extraction`:** the canonical home for `NodeId`, `NodeStatus`, and `DocNode` is now `@ledger/parser/src/coreTypes.ts` (and `@ledger/parser/src/docs/types.ts` for `DocNode`). `app/src/lib/types.ts` retains a re-export shell for those three types so existing `@/lib/types` import sites continue to work unchanged; all other types defined in `types.ts` (`Task`, `LogEvent`, etc.) stay there. |
| D5 | Click → inspector, not click → navigate | Inspector keeps the operator's spatial context (graph still visible). A "View document" link inside the inspector handles the navigate case. |
| D6 | No live updates / SSE in this node | No API exists. Static-per-load keeps the implementation honest about its data source; live updates land with the API. |
| D7 | Dependency edges (`dependsOn`) drawn as dashed bezier arrows in `--color-accent` with a "depends on" label | Reuses React Flow's edge type system without custom edge components. (Originally stated "distinct from parent-child solid arrows" — but D11 removes parent edges entirely, so deps are now the only drawn edges.) |
| D8 | Parent-field parser: detect the "project root" sentinel text **before** backtick extraction | The PRD-mandated parent line for top-level subtrees reads `**Parent:** project root (\`docs/00-project.md\`)`. The backtick captures the doc path, not the node id `root`, so the original order silently produced an unresolvable parent. Project-root sentinel detection is the canonical case and must win. |
| D9 | ~~Suppress visible `dependsOn` edges when source and target share a parent.~~ **Superseded by D11.** | Round-2 feedback (F4 below) clarified that sibling deps carry real information — `02-dag` "depends on `01-shell`" is a meaningfully different statement from "is parented by `01-ui`." Suppressing them lost that information. Replaced with D11 which removes parent edges instead. |
| D10 | Bezier (`type: "default"`) for both parent and dep edges, replacing `smoothstep` orthogonal routing | At the current node density, orthogonal routing produces overlapping right-angle runs that read as a single line. Bezier curves separate visually even when they share rank-crossing geometry. After D11, parent edges no longer render; D10 now applies only to dep edges. Revisit if the graph grows past ~30 nodes and curves start to tangle. |
| D11 | Parent edges are not drawn at all. Hierarchy is conveyed by a translucent rounded-rect *subtree* node behind each parent's children (rendered only when the parent has ≥2 children). Parent relations are still passed to dagre for rank ordering | Parent-of is already encoded in the node id (`01-ui/02-dag` ⇒ parent is `01-ui`). Drawing it as an edge adds visual weight without adding information. The interesting edges in this view are **deps** — what blocks what. Spatial grouping is the standard idiom for "these nodes share a context" (cf. subway-map line shading) and degrades gracefully as the tree deepens. Long-term, when the panel renders the *task* DAG instead of the doc tree, there will be no parents to draw anyway — this pivot anticipates that. |
| D12 | v1.1 visual simplification: drop the "depends on" edge label, hide React Flow's connection-handle dots on doc tiles, and remove the minimap | Each removal pays its own keep. The "depends on" label is redundant — the only edges drawn are deps (per D11), so a label restating the edge type adds noise without information. Handle dots advertise an interaction (`nodesConnectable={true}`) that this panel intentionally disables (`nodesConnectable={false}`), so they were misleading affordances; handles remain in the DOM with `opacity:0` + `isConnectable={false}` so dagre-routed edges still attach correctly. The minimap added chrome without payoff — at ≤30 nodes a `fitView` initial layout plus pan/zoom is enough, and the minimap viewport box wasn't even rendering reliably for the operator (likely a CSS-token interaction with the cream theme's mask color, but rather than debug a low-value affordance, we removed it). |

---

## Open Issues

- **Cross-subtree dependency edges.** The manifest's `dependsOn` column today only references siblings under the same parent (e.g., `02-dag` depends on `01-shell`). PRD §6.1 allows cross-subtree dependencies. Parser resolves by id within the full node set, but no current manifest exercises cross-subtree, so this is untested. *(Priority: LOW.)*
- **Graph layout for very large trees.** dagre struggles past ~500 nodes. Re-evaluate when the doc count grows past ~50. *(Priority: LOW.)*
- **Inspector content shape conflicts when multiple panels open it.** This node ships a `NodeInspector` specific to DAG node clicks. Later panels (Tasks, Docs) will each ship their own. The shell store holds `ReactNode`, so there's no contract conflict — but a future "inspector context registry" might be cleaner. Defer. *(Priority: LOW.)*
- **Parent node renders floating above its own subtree container.** When a parent is decomposed (`01-ui` is the live example), the parent renders as one node and its children render inside a separate labelled container box. The two are not visually connected — the parent appears orphaned. Collapse the model: the container's title bar *is* the parent node (status chip, ID, name in the header; children inside; no separate floating element). Affects `DocSubtreeNode.tsx` and `useDagLayout.ts`. *(Priority: MEDIUM — confusing in the current screenshot; trivial fix.)*
- **Redundant transitive dependency edges drawn.** Today the layout draws every declared `dependsOn` edge. When `A → B` and `B → C` are both declared, the implied `A → C` is also drawn, producing visual clutter (live example: `01-shell → 03-docs` is implied by `01-shell → 08-markdown → 03-docs`). Compute the transitive reduction over the edge set before passing to dagre. Caveat: when task-DAG edges arrive (claims, deps), reduction must respect edge type — same-type only. *(Priority: MEDIUM — affects readability; fix in `useDagLayout.ts`.)*

---

## Implementation Notes

### Pinned versions (added to `app/package.json`)

| Library | Version |
|---|---|
| `@xyflow/react` | ^12.10.2 |
| `@dagrejs/dagre` | ^3.0.0 |

### Key choices

- **Vite glob path.** `import.meta.glob("../../../docs/**/*.md", { query: "?raw", import: "default", eager: true })` from `src/lib/parseDocs.ts` resolves to `<repo>/docs/**`. Required adding `server.fs.allow: [path.resolve(__dirname, "..")]` in `vite.config.ts` so the dev server is allowed to serve files outside the Vite project root (`app/`).
- **dagre typing.** `dagre`'s `graphlib.Graph` defaults its three generic params to `any`. We instantiate with `Graph<GraphLabel, NodeLabel, EdgeLabel>` using dagre's own exported label types — `NodeLabel` already declares optional `x` and `y`, so no post-layout casts are needed.
- **Parser scope.** The parser handles two doc-id patterns: `00-project.md → root`, and `<dir>/00-<slug>.md → <dir>`. All other paths map to `<dir>/<basename>`. The "## Children" manifest table is matched by a regex on rows of the form `` | `id` | title | deps | status | ``. `dependsOn` cell extraction also uses backtick capture, so plain `—` becomes an empty list.
- **Manifest-only children.** Children listed in a parent's manifest but lacking an authored `.md` file are surfaced as `DocNode { authored: false, status: PLANNED }`. They render with a dashed border in `DocDagNode`.
- **Dependency vs parent edges.** Both are passed to `dagre.setEdge` so rank assignment respects either. Only deps are drawn as visible arrows (dashed bezier in `--color-accent` with a "depends on" label); parent relations are conveyed by spatial grouping per D11 — a translucent dashed rounded rect emitted as a `subtree`-typed React Flow node behind each parent's children. Subtree rects are non-interactive (`selectable: false`, `draggable: false`) and have `style.zIndex: -1` so they sit behind doc tiles even if a future reorder of the node array changes paint order.
- **No drag.** `nodesDraggable={false}` — this is a read-only view of authored doc state. When task DAGs arrive, drag may still be off because dagre-laid-out graphs shouldn't be hand-tweaked.

### Deviations from the spec

- The Design names `useDocGraph.ts` as living in `src/components/dag/`; I placed it there as planned but it's a thin re-export of the parser. The actual swap point for the API-backed source will be this file alone.
- React Flow's `Background`, `MiniMap`, and `Controls` are styled inline via the `style` prop and Tailwind class overrides. There's a small amount of `!important`-prefixed Tailwind in `DagCanvas.tsx` to override React Flow's stock control styling so it matches the cream theme. This is the documented escape hatch in xyflow's CSS guidance.

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
- A new "subtree" node type per parent with ≥2 children frames its kids with a dashed rounded rect; the parent's own doc tile sits separately above. Subtree nodes are non-interactive (`selectable: false`, `draggable: false`, click handler ignores them).
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

### Open follow-ups

- React Flow ships a sizable CSS file (`@xyflow/react/dist/style.css`). Audit which classes are actually used and consider cherry-picking once styles stabilize.
- The bundle warning ("chunks larger than 500 kB") will be addressed when 03-docs lands — code-splitting per panel becomes meaningful once there are multiple heavy panels.
- The `?raw` query is the standard Vite pattern; double-check the `query: "?raw"` + `import: "default"` combination still parses correctly under future Vite versions.

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. `/dag` renders the graph described in §Design > Acceptance check; all 9 current+planned nodes appear with correct status chips.
2. Parent edges are **not** drawn as lines (F4). The `root` and `01-ui` doc tiles sit above their respective subtrees without connecting arrows.
3. A translucent dashed rounded rect frames the `01-ui` subtree (the seven `01-shell` … `07-replay` tiles), labeled with the parent id `01-ui` and title in the top-left corner. No subtree rect is drawn for `root` (only one child).
4. Every `dependsOn` edge is rendered as a dashed accent-colored bezier arrow — including the six `01-shell ← {02-dag, 03-docs, 04-tasks, 05-logs, 06-health, 07-replay}` sibling deps that round-1 incorrectly suppressed. (As of v1.1 the edges no longer carry a "depends on" text label — see D12.)
5. Edges are bezier curves, not orthogonal `smoothstep` routes (F3).
6. Subtree rects sit behind the doc tiles; clicking on a rect does **not** open the inspector (only doc-tile clicks do).
7. Clicking each doc tile updates the inspector content; `Esc` still closes the inspector.
8. Removing a `.md` file under `docs/` and reloading drops the corresponding node; adding one (with a valid `**Node ID:**` and `**Parent:**`) adds it.
9. `pnpm typecheck`, `pnpm lint`, and `pnpm build` all exit zero.
10. No new network requests beyond Vite dev-server traffic.

---

## Children

None.
