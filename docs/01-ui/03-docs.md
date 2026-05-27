# Document Viewer Panel

**Node ID:** `01-ui/03-docs`
**Parent:** `01-ui`
**Status:** COMPLETE (v1, 2026-05-22)
**Created:** 2026-05-22
**Last Updated:** 2026-05-22

---

## Requirements

Replace the `DocsPanel` and `DocViewerPanel` empty states with a real document-viewing experience over the project's own `docs/**` tree. This is the second of the round-2 panels (PRD §8.3) and the natural sibling to `02-dag` — same data source (build-time parse of `docs/**.md`), different rendering. After this node ships, the DAG inspector's existing "Open document" link resolves to real content for every authored node.

Phase-1 scope, narrower than PRD §8.3 because no doc store, no task runner, and no API server exist yet:

1. `/docs` renders an **index** of every `DocNode` (authored + manifest-only) as a hierarchical tree, with status chip and link per node. The tree mirrors what the DAG panel shows, but reads as a list, not a graph.
2. `/docs/:nodeId` renders the **viewer** for a single node:
   - A sticky header with id, title, status chip, parent link, and (when applicable) a "Manifest-only — no authored doc yet" notice.
   - The doc body as rendered Markdown when the node is authored.
   - For manifest-only nodes, a placeholder body that surfaces parent manifest metadata (dependsOn, declared status) and a back-link.
3. **Cross-doc links work.** Inline-code references of the form `` `docs/<path>.md` `` that resolve to an authored node become `<Link>`s to `/docs/<that-node-id>`. Operator can click through the doc tree.
4. **Section anchors.** Every `##` and `###` heading gets a slug id and a hover-visible `#` anchor link. Deep-linking to `/docs/01-ui/02-dag#decisions` jumps to the Decisions section.
5. **GFM tables** (used heavily in every doc's Decisions / Children / Implementation Notes) render correctly.
6. **Code fences** render with monospaced styling and a subtle surface; syntax highlighting is **deferred** (see Open Issues — docs contain ~no inline code today and shiki's bundle cost is non-trivial).
7. Navigation between docs uses the existing **encoded-segment route** (`/docs/${encodeURIComponent(id)}`) — already in use by the DAG inspector. No URL-scheme change.
8. `pnpm typecheck` and `pnpm lint` continue to pass at zero output. `pnpm build` continues to succeed.

**Out of scope for this node:**

- **Version history and diffs.** No doc store exists. The parent doc's `Diff renderer choice` open issue stays open and is re-evaluated when versioning lands.
- **Producing-task attribution.** No task runner exists.
- **Staleness indicators tied to implementation artifacts.** No artifact tracking exists.
- **Inline open-issue indicators tied to the issue lifecycle.** The doc's `## Open Issues` section still renders as plain markdown; structured issue rendering arrives with the issue model.
- **Editing.** Read-only view.
- **Live updates.** Build-time glob, same as `02-dag`. HMR refreshes on file change in dev.
- **Right-rail TOC.** Deferred — page is short enough today that the sticky header + section anchors are sufficient (see Open Issues).
- **Full-text search across docs.** Deferred to a later node; index size is small enough today that browser `Ctrl-F` on the tree page suffices.

---

## Design

### Data source: extend the existing build-time parse

`02-dag` introduced `src/lib/parseDocs.ts` and consumed only metadata (`DocNode`). The doc viewer additionally needs the raw markdown body. Two options:

| Option | Pros | Cons |
|---|---|---|
| Inline `body: string` on `DocNode` | One hook, one type | Bloats every consumer of `DocNode` (DAG panel) with full markdown payloads they don't use; couples view-model to source. |
| Sibling `DocSource` type + paired `useDocSource(id)` hook | DAG stays metadata-only; clear separation of concerns | One more hook to learn. |

**Chosen: sibling type.** New in `src/lib/types.ts`:

```ts
export interface DocSource {
  id: NodeId;
  /** Raw markdown body, with the metadata header preserved. */
  raw: string;
}
```

`DocSource` carries the payload only. The source-path field is **not** duplicated — `DocNode.source` (already shipped by `02-dag` in `src/lib/types.ts`) is the canonical path key. Call sites that need both fields read `DocNode.source` from the matching node, not from `DocSource`. This avoids a drift bug `06-health` already flags (`06-health.md` §Design > Data source explicitly names `node.source` as the lookup key).

A new hook `src/components/docs/useDocSource.ts` reuses the same `import.meta.glob("../../../docs/**/*.md", { query: "?raw", import: "default", eager: true })` pattern as `parseDocs.ts`, returning `DocSource | undefined` keyed by `NodeId`. The hook does not re-parse; it surfaces the raw text and lets the renderer handle it.

`parseDocs.ts` gains a small helper `idForPath(path: string): NodeId | null`. It is a **sibling** of the existing extractor, not a strict inverse — the existing extractor takes Vite's absolute glob key (something like `/abs/path/to/app/.../docs/01-ui/02-dag.md`) and strips everything up to `docs/`. `idForPath` takes the *relative* form used in author-written cross-doc references (`docs/01-ui/02-dag.md`) and returns the same `NodeId`. Both helpers normalise to the same id space; the wrapping logic is shared. This is a pure refactor — no behavior change for the DAG.

### Routes & layout

No router changes. Existing routes:

```ts
{ path: "docs", element: <DocsPanel /> },
{ path: "docs/:nodeId", element: <DocViewerPanel /> },
```

URL encoding for nested ids (`/docs/01-ui%2F02-dag`) is already in use; `useParams` returns the decoded value. Confirmed working via the DAG inspector's existing Link.

**`/docs` (`DocsPanel`).** Renders the full `DocNode[]` as a nested list:

```
LLM Project Framework                        [DRAFT]
└─ 01-ui                                     [APPROVED]
   ├─ 01-shell                               [COMPLETE]
   ├─ 02-dag                                 [COMPLETE]
   ├─ 03-docs                                [COMPLETE]         ← self
   ├─ 04-tasks                               [PLANNED]
   ├─ 05-logs                                [PLANNED]
   ├─ 06-health                              [DRAFT]
   ├─ 07-replay                              [PLANNED]
   └─ 08-markdown                            [COMPLETE]
```

Each row: indent by depth, monospace id, plain title to its right, status chip on the far right. Each row is a `<Link to={`/docs/${encodeURIComponent(id)}`}>`. PLANNED rows are styled muted/dashed to match their DAG appearance.

No left-rail nav-tree inside the docs section — the index page is the nav-tree. The shell's existing left sidebar (DAG / Documents / Tasks / Health) stays the global nav.

**`/docs/:nodeId` (`DocViewerPanel`).** Three stacked regions inside the main content area:

```
┌─────────────────────────────────────────────────────────┐
│ Sticky header                                           │
│   ‹ Back to all documents                               │
│   01-ui/02-dag             [COMPLETE]                   │
│   DAG Panel                                             │
│   parent: 01-ui          source: docs/01-ui/02-dag.md   │
├─────────────────────────────────────────────────────────┤
│ Body (rendered markdown, scrolls)                       │
│                                                         │
│   # DAG Panel                                           │
│   ...                                                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

The sticky header is owned by the panel, not the shell. It always shows id + status + title + parent + source path; the "Back to all documents" link goes to `/docs`.

For manifest-only nodes (no authored doc), the body region renders a small inline notice plus the parent-manifest row that declared this node (id, declared title, deps, declared status). No markdown to render.

For an unknown id (no authored doc and no manifest reference), render an `EmptyState` with `404 — document not found.` and a back link to `/docs`. This is the same empty-state pattern the shell already established.

### Markdown rendering: consume `01-ui/08-markdown`

The markdown rendering pipeline (plugin set, component overrides, typography, anchor links) is owned by `01-ui/08-markdown` and consumed here via the `<MarkdownBody>` component. This node's responsibility is composing it correctly:

- Construct a doc-tree-aware **link resolver**: `resolveDocLink(href: string): string | null` uses `parseDocs.ts`'s new `idForPath` helper to map paths like `docs/01-ui/02-dag.md` → `NodeId`, returning the route `/docs/${encodeURIComponent(id)}` on a hit, `null` on a miss. Pass to `<MarkdownBody resolveDocLink={…} />`.
- The resolver also handles the inline-code idiom (`` `docs/foo.md` ``) — `<MarkdownBody>` calls the same callback for inline code that matches the docs-path shape (see `08-markdown` D3).

**Anchor contract with `06-health`.** `rehype-slug` produces lowercase-hyphenated slugs from heading text (`## Open Issues` → `open-issues`). `06-health` emits cross-doc links of shape `/docs/${id}#open-issues` for issue-row click-throughs. The slug is therefore part of the cross-panel contract — **renaming the `## Open Issues` heading in any spec doc, or changing `rehype-slug`'s configuration, would silently break `06-health`'s deep links**. If either changes, audit `06-health` consumers.

If `08-markdown` lands first, this node imports the shipped component directly. If `03-docs` lands first in implementation order, it fronts a temporary inline `<DocBody>` matching the shape `08-markdown` will export, and the swap is mechanical once `08-markdown` ships. Either order works in parallel worktrees because the contract is fixed (see Decisions D9).

### Components

```
src/components/docs/
  DocsTree.tsx          // nested list rendering for /docs
  DocViewer.tsx         // sticky header + <MarkdownBody> body
  useDocSource.ts       // raw markdown lookup by NodeId
src/lib/
  parseDocs.ts          // unchanged behavior; gains exported `idForPath` helper
```

`DocsPanel.tsx` becomes `<DocsTree />` plus a small header. `DocViewerPanel.tsx` resolves the id from `useParams`, looks up the `DocNode` (for header) and `DocSource` (for body), constructs the link resolver, and renders `<DocViewer />`.

### Status header chip reuse

`StatusChip` lives at `src/components/ui/StatusChip.tsx` (relocated by `99-maintenance/01-round-1` R4, 2026-05-26 — was under `dag/` at the time of this spec's authoring). The doc viewer reuses it as-is.

### Acceptance check (manual)

A reviewer running `pnpm dev` and visiting `/docs` must see:

1. The hierarchical tree of every authored and manifest-only node — currently 10 (root + 01-ui + the eight round-2 panels including `08-markdown`). Anchor this check to the rendered tree, not to a hard-coded list, so adding a sibling later doesn't silently invalidate it.
2. Each row links to `/docs/<id>`; clicking a planned-only row goes to the manifest-only viewer; clicking an authored row goes to the rendered viewer.
3. Status chips visible per row, matching the DAG panel's chips for the same nodes.
4. PLANNED rows visibly distinct (muted text or dashed leader).

At `/docs/01-ui/02-dag`:

5. Sticky header shows `01-ui/02-dag · COMPLETE · DAG Panel · parent 01-ui · source docs/01-ui/02-dag.md`.
6. Body renders the full markdown including the Decisions table and the Children table.
7. Inline `` `docs/01-ui/01-shell.md` `` becomes a `<Link>` to `/docs/01-ui%2F01-shell`. Clicking navigates without a full reload.
8. Clicking `##` Decisions heading deep-links to `…#decisions`; navigating to `/docs/01-ui/02-dag#decisions` directly scrolls to it.

At `/docs/01-ui/04-tasks` (planned, no authored doc):

9. The manifest-only notice renders. No body.
10. Parent link goes back to `/docs/01-ui`.

At `/docs/non-existent`:

11. 404 empty state with a "Back to all documents" link.

Cross-cutting:

12. DAG panel's inspector "Open document" link still works; clicking from `/dag` lands on the viewer.
13. Shell `Esc` handler does not interfere with markdown content (no inspector open).
14. `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.
15. No new network requests beyond Vite dev-server traffic.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Build-time `import.meta.glob` for doc bodies, paired sibling type `DocSource` rather than inlining `body` on `DocNode` | Keeps the DAG panel's view-model lean (the DAG doesn't need markdown bytes) and gives a clean swap point when the doc store lands — replace `useDocSource` with a TanStack Query against the API, `DocNode` consumers untouched. |
| D2 | Markdown rendering pipeline extracted to `01-ui/08-markdown` as a dependency | Markdown rendering is shared infra; `05-logs`, `04-tasks`, and `07-replay` are all plausible future consumers. Re-extracting later, after multiple panels had each inlined the pipeline, would be churn. The original D2 ("no shiki in v1") and D3 ("inline-code path detection") moved to `08-markdown` along with the renderer. |
| D3 | Doc-tree-aware link resolution is owned **here**, not in `08-markdown` | `08-markdown` accepts a `resolveDocLink(href) => string \| null` callback. This node supplies the implementation that knows about `parseDocs.ts`, `NodeId`, and the `/docs/:nodeId` route shape. Keeps `08-markdown` generic and reusable. |
| D4 | No router changes — keep `/docs/:nodeId` with `encodeURIComponent(id)` | The DAG inspector already encodes ids this way and `useParams` correctly decodes the segment. Switching to splat (`/docs/*`) would buy nothing and would silently break the existing Link until updated. |
| D5 | No right-rail TOC in v1 | The longest current doc is `01-ui/00-ui.md` at ~170 lines; section anchors via `08-markdown`'s autolinked headings make jumping cheap. Adds complexity (sticky positioning, scroll spy, viewport sizing) for negligible value at this scale. Reassess if any single doc grows past ~400 lines. |
| D6 | No left-rail doc-tree inside the docs viewer | The shell already owns the global nav (sidebar). Adding a sub-nav-tree on every doc page would split nav attention between two columns. The `/docs` index *is* the nav-tree; the viewer is a single-doc surface. |
| D7 | Reuse `StatusChip` from `src/components/dag/` as-is, do not move to `src/components/ui/` | Two consumers isn't enough to justify a shared location yet. Move when a third panel needs it (likely 04-tasks or 06-health, which both render statuses). |
| D8 | Manifest-only nodes are visitable at `/docs/<id>`, not 404'd | Every node in the DAG should be clickable to its doc URL even when no markdown file exists yet — operator should not have to know which nodes are authored. The viewer surfaces the manifest fields so the URL still has *something* to say. |
| D9 | `03-docs` and `08-markdown` are implementable in either order | The contract between them is `<MarkdownBody>`'s public surface (defined in `08-markdown` §Design). Whichever node ships first stubs the other side against that contract; the swap is mechanical. This unblocks parallel worktree dispatch. |
| D10 | The viewer route is itself the full-content surface — no shell inspector use | `02-dag` opens its inspector for node detail because the DAG canvas is the primary surface and detail wouldn't fit. `06-health` D12 opts out for the same reason inverted (its rows already show the structured signal in line). `03-docs` is the dedicated full-content viewer — opening an inspector on top of it would be a redundant detail layer over the same document. The route handles its own back-link and parent-link affordances. If a future "preview a doc without leaving the current view" need emerges, revisit (likely needs `<DocPreview>` as a sibling component rather than reusing the inspector). |

---

## Open Issues

- **Syntax highlighting.** Tracked on `01-ui/08-markdown`; no separate item here. *(Priority: LOW.)*
- **Diff renderer for version history.** Inherited from parent `01-ui/00-ui.md` Open Issues. No version store exists yet; revisit when one does. *(Priority: LOW.)*
- **Right-rail TOC / scroll-spy.** Deferred per D5. Add if any single doc grows past ~400 lines or if operator feedback says navigation is painful. *(Priority: LOW.)*
- **Edit affordance.** Read-only is correct for Phase 1, but operators editing docs is a near-future need. A "Edit in editor" button that copies the source path to clipboard would be the lightweight v1.5 move. *(Priority: LOW.)*
- ~~**Empty-state for `/docs` if zero docs exist.** Cannot happen today (the parser always finds at least `00-project.md`), but the panel should still degrade gracefully. Handle with a generic empty state. *(Priority: TRIVIAL.)*~~ → addressed by `99-maintenance/01-round-1` R3 (2026-05-26). Implementation Review S1 expanded the guard to cover the orphan-only case too (`allNodes.length === 0 || roots.length === 0`).
- **Long-doc render perf.** Re-rendering the full `react-markdown` tree on every navigation is fine at current sizes. If body sizes grow significantly, consider memoization keyed by `(id, raw)` or virtualization at the section level. *(Priority: LOW.)*
- **Cross-subtree link resolution edge cases.** `idForPath` will receive whatever string appears in backticks; malformed paths (typos, paths to non-doc files) should fall through to plain-code rendering, not throw. Spec compliance: no console errors for malformed link targets. *(Priority: LOW — covered by the "unresolved paths render as plain code" rule, but worth a unit test.)*

---

## Spec Review (2026-05-22)

Independent review against this DRAFT after authoring. Verdict: NEEDS_MINOR_REVISIONS, no blockers. Audit of findings and how each was handled:

| # | Finding | Resolution |
|---|---------|------------|
| S1 | `DocSource` declared a `.path` field duplicating `DocNode.source` (already canonical in `types.ts`; `06-health` already names `node.source` as the lookup key). High-probability source of a drift bug at implementation time. | Removed `.path` from `DocSource`. Added prose explicitly directing call sites to read the path from `DocNode.source`. The drift bug is now closed in the spec before implementation starts. |
| S2 | Inspector contract not stated. `02-dag` uses the inspector; `06-health` D12 opts out. `03-docs` was silent. | Added D10 explicitly opting out: the viewer route is itself the full-content surface, no inspector layered on top. |
| S3 | The `#open-issues` anchor target — emitted by `06-health` for issue-row click-throughs — depends on `rehype-slug`'s slug for `## Open Issues`, but the spec never documents this cross-panel contract. | Added "Anchor contract with `06-health`" subsection under §Design > Markdown rendering, calling out the slug as part of the cross-panel contract and flagging the rename risk. |
| N1 | `parseDocs.ts` location consistency check. | Non-issue — reviewer self-resolved. No change. |
| N2 | `idForPath` "inverse" claim was imprecise — the existing extractor takes an absolute Vite glob key while `idForPath` takes a relative `docs/...md` path. Not strict inverses. | Reworded as "sibling helper," explained the input-shape difference, and noted both share normalisation. |
| N3 | Acceptance check item 1 said "all 9 nodes" but the tree has 10 (08-markdown was added). Either count would drift again as siblings are added. | Reworded to anchor on the rendered tree rather than a hard-coded count, so future sibling additions don't invalidate the check. |
| N4 | Bundle delta estimate didn't account for the fact that `08-markdown` already shipped the deps to `package.json` (currently tree-shaken). | Replaced the estimate with a precise expectation and named the baseline (post-fixture-removal build at commit `ea1ebaa`: 716 KB raw / 232 KB gzip). Now reproducible. |

Nothing punted. All findings applied. Audit table retained so the implementing agent can see what was decided.

---

## Implementation Notes

**Implementation date:** 2026-05-22

**New files created:**

- `src/components/docs/useDocSource.ts` — build-time `import.meta.glob` hook returning `DocSource | undefined` by `NodeId`. Uses `idForPath` to normalise absolute Vite glob keys into the same id space as `parseDocs.ts`. Returns `undefined` (never throws) for unknown ids.
- `src/components/docs/DocsTree.tsx` — hierarchical `/docs` index. Recursive `TreeRow` component; PLANNED rows rendered muted/italic. Depth-based `paddingLeft` for visual hierarchy; `└─` leader for child rows. EmptyState fallback if the doc tree is empty (edge case).
- `src/components/docs/DocViewer.tsx` — sticky-header + body for a single node. Three render states: authored (sticky header + `<MarkdownBody>` with doc-aware resolver), manifest-only (sticky header + inline metadata table), 404 (EmptyState). `--prose-scroll-margin-top` overridden to `120px` on the `<MarkdownBody>` ancestor to accommodate the sticky header height (spec callout #4).

**Modified files:**

- `src/lib/types.ts` — added `DocSource { id: NodeId; raw: string }` (no `.path` field per spec S1).
- `src/lib/parseDocs.ts` — added exported `idForPath(path: string): NodeId | null`. Accepts relative `docs/…` form used in author cross-doc references; normalises to same id space as `pathToNodeId` by prepending `/` and delegating.
- `src/routes/DocsPanel.tsx` — replaced `<EmptyState>` placeholder with `<DocsTree />`.
- `src/routes/DocViewerPanel.tsx` — replaced `<EmptyState>` placeholder with `<DocViewer node={…} source={…} />`. Resolves node + source from `loadDocNodes()` + `useDocSource(id)` at the route level.

**Decisions made during implementation:**

- `useDocSource` builds its internal `NodeId → raw` map by converting absolute Vite glob keys back to the `docs/…` relative form (via `indexOf("/docs/")`) and then calling `idForPath`. This mirrors `parseDocs.ts`'s own strategy rather than duplicating the stripping logic.
- `DocsTree` calls `loadDocNodes()` at module scope (same pattern as `DagCanvas`). The tree map is also computed at module scope for zero-cost re-renders.
- `DocViewerPanel` calls `loadDocNodes()` at module scope to avoid re-parsing on every render; `allNodes.find()` is called per render (array is small, no perf concern at current scale).
- `resolveDocLink` is a **module-level function**, not a hooked callback (post-review fix; see Implementation Review R1). `idForPath` is pure and module-stable, so closing over component state isn't required; the module-level form gives a permanently stable reference for free without any hook ceremony.
- `SCROLL_MARGIN = "120px"` is a named constant in `DocViewer.tsx` to make the sticky-header coupling explicit and easy to adjust if the header grows.
- `DocsTree` row leaders use `├─` for non-last siblings and `└─` for the last, matching the spec's design diagram (post-review fix; see Implementation Review R2). Sibling index is threaded through `TreeRow` via an `isLastSibling` prop.

**Bundle delta:** baseline 722.84 KB raw / 234.35 KB gzip → 899.71 KB raw / 289.11 KB gzip. Delta: **+176.87 KB raw / +54.76 KB gzip**. Within spec estimate (+170 KB / +55 KB). The four `react-markdown` deps (previously tree-shaken) are now live. Pre-existing >500 kB chunk warning unchanged; no threshold bump.

**Deviations from spec:** None. All spec decisions (D1–D10, S1–S3) implemented as specified.

---

### Implementation Review (2026-05-22)

Independent code review against the implementation produced one Should-fix and two Nits. Audit:

| # | Finding | Resolution |
|---|---------|------------|
| R1 | `useCallback` for `resolveDocLink` was placed after a conditional early return on the 404 path, requiring an `eslint-disable-next-line react-hooks/rules-of-hooks` suppression to ship. | Hoisted out of the component entirely. `resolveDocLink` is now a module-level function — `idForPath` closes over nothing, so the hook ceremony was unnecessary. Removed the suppression comment. Reference identity is stable across renders automatically. |
| R2 | `DocsTree` row leaders rendered `└─` for every non-root row, never `├─`. Cosmetic deviation from the spec's design diagram. | Threaded an `isLastSibling: boolean` prop through `TreeRow`; the iterator at every level passes `idx === lastIdx`. Rows now display `├─` for non-last siblings and `└─` for the last. |
| N1 | `useDocSource.ts` introduces a second `import.meta.glob` call duplicating `parseDocs.ts`'s. Vite dedupes at build time. | Accepted as-is. The duplication is module-level but Vite resolves both to the same dependency graph; cleaning it up (export the glob from `parseDocs.ts`) saves no runtime cost and adds an entanglement. Revisit if a third consumer appears. |

Build/lint/typecheck remain at zero after the fixes. Bundle numbers unchanged (no runtime code shift).

---

## Verification

When this node moves to `VERIFY`, the verifier confirms the full Acceptance check list (1–15) plus:

1. `parseDocs.ts` continues to pass its existing parser smoke test (no behavior change for DAG consumers); the new exported `idForPath` helper is the inverse of the existing id extraction for every doc currently in the tree.
2. `useDocSource(id)` returns `undefined` (not a thrown error) for unknown ids; the viewer renders the 404 empty state.
3. Following a cross-doc Link does not cause a full page reload (verified by checking that the Vite client connection stays open).
4. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero. Bundle delta is reported in Implementation Notes. Expected: ~+170 KB raw / ~+55 KB gzip — `react-markdown` + `remark-gfm` + `rehype-slug` + `rehype-autolink-headings` are already in `package.json` (shipped by `08-markdown`) but are currently tree-shaken because no route imports `<MarkdownBody>`. Importing it from this panel restores them to the bundle. The pre-implementation baseline to measure against is the post-fixture-removal build (716 KB raw / 232 KB gzip on commit `ea1ebaa`).
5. DAG panel regression check: clicking a node in `/dag` still opens the inspector with no errors, and the "Open document" link in the inspector lands on the viewer.

---

## Children

None.
