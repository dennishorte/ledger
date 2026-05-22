# Document Viewer Panel

**Node ID:** `01-ui/03-docs`
**Parent:** `01-ui`
**Status:** DRAFT
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
  /** Source path relative to repo root, e.g. `docs/01-ui/02-dag.md`. */
  path: string;
}
```

And a new hook `src/components/docs/useDocSource.ts` that reuses the same `import.meta.glob("../../../docs/**/*.md", { query: "?raw", import: "default", eager: true })` pattern as `parseDocs.ts`, returning `DocSource | undefined` keyed by `NodeId`. The hook does not re-parse; it surfaces the raw text and lets the renderer handle it.

`parseDocs.ts` gains a small helper `idForPath(path: string): NodeId` (the inverse of its current id-extraction logic) so both the source hook and the cross-doc link rewriter can resolve `docs/path/to/file.md` → `NodeId` consistently. This is a pure refactor — extract a helper from the existing path-parsing logic; no behavior change for the DAG.

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
   ├─ 03-docs                                [DRAFT]            ← self
   ├─ 04-tasks                               [PLANNED]
   ├─ 05-logs                                [PLANNED]
   ├─ 06-health                              [DRAFT]
   ├─ 07-replay                              [PLANNED]
   └─ 08-markdown                            [VERIFY]
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

`StatusChip` already lives at `src/components/dag/StatusChip.tsx`. The doc viewer reuses it as-is. (Long-term, when a third panel needs it, move to `src/components/ui/`; not yet — premature.)

### Acceptance check (manual)

A reviewer running `pnpm dev` and visiting `/docs` must see:

1. The hierarchical tree of all 9 nodes (`root`, `01-ui`, `01-shell`, `02-dag`, `03-docs`, plus the four still-planned siblings).
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

---

## Open Issues

- **Syntax highlighting.** Tracked on `01-ui/08-markdown`; no separate item here. *(Priority: LOW.)*
- **Diff renderer for version history.** Inherited from parent `01-ui/00-ui.md` Open Issues. No version store exists yet; revisit when one does. *(Priority: LOW.)*
- **Right-rail TOC / scroll-spy.** Deferred per D5. Add if any single doc grows past ~400 lines or if operator feedback says navigation is painful. *(Priority: LOW.)*
- **Edit affordance.** Read-only is correct for Phase 1, but operators editing docs is a near-future need. A "Edit in editor" button that copies the source path to clipboard would be the lightweight v1.5 move. *(Priority: LOW.)*
- **Empty-state for `/docs` if zero docs exist.** Cannot happen today (the parser always finds at least `00-project.md`), but the panel should still degrade gracefully. Handle with a generic empty state. *(Priority: TRIVIAL.)*
- **Long-doc render perf.** Re-rendering the full `react-markdown` tree on every navigation is fine at current sizes. If body sizes grow significantly, consider memoization keyed by `(id, raw)` or virtualization at the section level. *(Priority: LOW.)*
- **Cross-subtree link resolution edge cases.** `idForPath` will receive whatever string appears in backticks; malformed paths (typos, paths to non-doc files) should fall through to plain-code rendering, not throw. Spec compliance: no console errors for malformed link targets. *(Priority: LOW — covered by the "unresolved paths render as plain code" rule, but worth a unit test.)*

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this node moves to `VERIFY`, the verifier confirms the full Acceptance check list (1–15) plus:

1. `parseDocs.ts` continues to pass its existing parser smoke test (no behavior change for DAG consumers); the new exported `idForPath` helper is the inverse of the existing id extraction for every doc currently in the tree.
2. `useDocSource(id)` returns `undefined` (not a thrown error) for unknown ids; the viewer renders the 404 empty state.
3. Following a cross-doc Link does not cause a full page reload (verified by checking that the Vite client connection stays open).
4. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero. Bundle delta is reported in Implementation Notes when the node moves to VERIFY (expected: +~150–250 KB raw / +~50–80 KB gzip from `react-markdown` + `remark-gfm` + `rehype-slug` + `rehype-autolink-headings`).
5. DAG panel regression check: clicking a node in `/dag` still opens the inspector with no errors, and the "Open document" link in the inspector lands on the viewer.

---

## Children

None.
