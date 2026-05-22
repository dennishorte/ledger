# DAG Panel

**Node ID:** `01-ui/02-dag`
**Parent:** `01-ui`
**Status:** VERIFY
**Created:** 2026-05-22
**Last Updated:** 2026-05-22

---

## Requirements

Replace the `DagPanel` empty state at `/dag` with a real graph rendering that gives the operator their first useful view onto the framework's state. This is the leading panel of the round-2 decomposition (PRD §8.1) and the first place a task DAG will eventually surface.

Phase-1 scope, narrower than PRD §8.1 because no task runner exists yet:

1. Render the project's **document tree** (the implementation nodes under `docs/`) as a directed graph: each `docs/*.md` is a node, parent → child edges from the manifests.
2. Render **planned** child nodes declared in a parent's manifest even when no doc file exists yet, distinguished visually from authored nodes.
3. Show each node's **lifecycle status** (PRD §6.2: DRAFT, SPEC_REVIEW, APPROVED, IN_PROGRESS, VERIFY, COMPLETE, ISSUE_OPEN, plus the manifest-only `PLANNED` pseudo-state) as a colored chip on the node.
4. **Pan, zoom, and minimap** via React Flow defaults.
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

Edges:

- **Parent → child** edges, from authored docs and from manifest-only children alike.
- **Dependency** edges from the manifest's `dependsOn` column (id-resolved within the same parent's children for now). Rendered as dashed arrows distinct from the parent-child solid arrows.

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
  StatusChip.tsx         // small colored pill, one per NodeStatus
  NodeInspector.tsx      // content shown in the shell inspector on click
  useDagLayout.ts        // dagre layout hook
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
2. Parent → child edges drawn from root down.
3. Each node's status chip matches the doc's `**Status:**` line (e.g., `01-ui/01-shell` shows `VERIFY` now, `COMPLETE` after promotion).
4. Planned-but-unauthored nodes (`03-docs`, `04-tasks`, `05-logs`, `06-health`, `07-replay`) render with a dashed border and `PLANNED` chip.
5. Clicking any node opens the right-hand inspector with the node's details; clicking again or selecting a different node updates content. The inspector's existing `Esc`-to-close still works.
6. Pan and zoom work; the minimap is visible.
7. The graph layout looks reasonable without any manual coord tweaking — adding a new file under `docs/` and reloading repositions everything automatically.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Build-time parse of `docs/**` as the data source for Phase 1 | Manifests in docs are canonical; a hand-authored TS fixture would drift. Parser is small and the schema is regular. Swap to API when the backend lands. |
| D2 | dagre over elkjs | ≤30 nodes for the foreseeable future; dagre is ~20× smaller and visually equivalent at this scale. |
| D3 | Manifest-only "PLANNED" nodes render with dashed border | Operator should see the full intended tree, not just what's been authored. Visual distinction prevents confusion with real nodes. |
| D4 | `DocNode` shape introduced in `src/lib/types.ts` (was empty) | First domain types arrive with the first panel that needs them, per `01-ui` §Design conventions. |
| D5 | Click → inspector, not click → navigate | Inspector keeps the operator's spatial context (graph still visible). A "View document" link inside the inspector handles the navigate case. |
| D6 | No live updates / SSE in this node | No API exists. Static-per-load keeps the implementation honest about its data source; live updates land with the API. |
| D7 | Dependency edges (`dependsOn`) drawn as dashed arrows, distinct from parent-child solid arrows | Two semantically different edge types must be visually separable; reuses React Flow's edge type system without custom edge components. |

---

## Open Issues

- **Cross-subtree dependency edges.** The manifest's `dependsOn` column today only references siblings under the same parent (e.g., `02-dag` depends on `01-shell`). PRD §6.1 allows cross-subtree dependencies. Parser resolves by id within the full node set, but no current manifest exercises cross-subtree, so this is untested. *(Priority: LOW.)*
- **Graph layout for very large trees.** dagre struggles past ~500 nodes. Re-evaluate when the doc count grows past ~50. *(Priority: LOW.)*
- **Inspector content shape conflicts when multiple panels open it.** This node ships a `NodeInspector` specific to DAG node clicks. Later panels (Tasks, Docs) will each ship their own. The shell store holds `ReactNode`, so there's no contract conflict — but a future "inspector context registry" might be cleaner. Defer. *(Priority: LOW.)*

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
- **Dependency vs parent edges.** Both are passed to dagre so rank assignment respects either. They're visually distinguished: parent → child is a solid arrow in `--color-border-strong`; `dependsOn` is a dashed accent-colored arrow with a "depends on" label.
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

### Open follow-ups

- React Flow ships a sizable CSS file (`@xyflow/react/dist/style.css`). Audit which classes are actually used and consider cherry-picking once styles stabilize.
- The bundle warning ("chunks larger than 500 kB") will be addressed when 03-docs lands — code-splitting per panel becomes meaningful once there are multiple heavy panels.
- The `?raw` query is the standard Vite pattern; double-check the `query: "?raw"` + `import: "default"` combination still parses correctly under future Vite versions.

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. `/dag` renders the graph described in §Design > Acceptance check; all 9 current+planned nodes appear with correct status chips and edge directions.
2. Clicking each node updates the inspector content; `Esc` still closes the inspector.
3. Removing a `.md` file under `docs/` and reloading drops the corresponding node; adding one (with a valid `**Node ID:**` and `**Parent:**`) adds it.
4. `pnpm typecheck`, `pnpm lint`, and `pnpm build` all exit zero.
5. No new network requests beyond Vite dev-server traffic.

---

## Children

None.
