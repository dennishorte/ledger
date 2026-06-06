# Node Rendering, Status Visualization & Canvas

**Node ID:** `01-ui/02-dag/03-rendering`
**Parent:** `01-ui/02-dag`
**Status:** PLANNED
**Created:** 2026-06-06
**Last Updated:** 2026-06-06
**Dependencies:** `01-ui/02-dag/01-data-source`, `01-ui/02-dag/02-layout`

---

## Requirements

Render the DAG on a React Flow canvas: the node components, their status visualization, and the canvas chrome that wires the layout hook into React Flow. This child owns pixels and affordances; it consumes positioned nodes/edges from `02-layout` and the `DocNode` model from `01-data-source`.

1. **Three node render forms:**
   - Leaf `doc` tile (`DocDagNode.tsx`) — title, id, status chip (240×64).
   - Expanded `subtree` container (`DocSubtreeNode.tsx`) — dashed rounded rect whose **header strip IS the parent** (status chip + id + title, solid background) + a collapse chevron; dashed interior is click-inert. Depth-based background intensity + border strength so nested subtrees are legible at low zoom.
   - Collapsed `collapsedSubtree` rollup tile (`DocCollapsedSubtreeNode.tsx`) — stacked-card cue (offset shadow + doubled top edge), parent status chip + id + truncated title, a descendant count, and a per-status colored-dot tally summing to the count, plus an expand chevron.
2. **Canvas (`DagCanvas.tsx`).** React Flow wrapper + `ReactFlowProvider`; cream-themed `Controls`; registers the three node types; imperative once-per-mount `fitView` (so toggles don't yank the viewport); renders the bulk-toggle `<Panel>` (Expand all / Collapse all / Reset to active work) wired to `02-layout`'s store actions; `onNodeClick` opens the inspector (`04-inspector`) and `onToggleExpand` writes an override. `DagPanel.tsx` is a thin shell: `<DagCanvas />` lazy-loaded (`React.lazy` + `Suspense`) so the elkjs chunk lands off the landing route.
3. **Status color mapping.** `StatusChip.tsx` (in `src/components/ui/`) + `statusColors.ts` (`STATUS_STYLES`, shared with the collapsed-tile dot tally): DRAFT/PLANNED/DEFERRED → `--color-muted` (PLANNED/DEFERRED dashed); SPEC_REVIEW/VERIFY → `--color-warning`; APPROVED/IN_PROGRESS → `--color-accent`; COMPLETE → `--color-success`; ISSUE_OPEN → `--color-danger`. All colors flow through cream-theme tokens in `globals.css`; token gaps are filled there, never in component CSS.
4. **Affordance separation.** The collapse chevron is its own `<button>` with `stopPropagation`; the header/body click opens the inspector. Collapsing a node must not open the inspector and vice-versa. Pan and zoom via React Flow defaults; no minimap; no drag (`nodesDraggable={false}`); connection handles hidden (`isConnectable={false}`, 1×1 transparent) since this is a read-only view.
5. `pnpm typecheck`, `pnpm lint`, `pnpm build` pass at zero output.

**Out of scope:** layout geometry and the expansion policy/store (`02-layout`); the inspector's content (`04-inspector` — this child only fires `openInspector`); the data model (`01-data-source`).

## Design

`DagCanvas` calls `useDagLayout(docs, expandedIds, onToggleExpand)` (from `02-layout`), memoizes `computeEffectiveExpansion(docs, overrides)`, and renders `<ReactFlow nodes edges nodeTypes={{ doc, subtree, collapsedSubtree }} />`. Subtree rects render behind doc tiles via depth-based `zIndex` (`-100 + depth`) and `pointerEvents: "none"` on the subtree wrapper (the inner header `<button>` carries `pointer-events-auto` and wins as the CSS leaf). The cream theme's `Background` dot pattern paints under everything; `Controls` and the bulk-toggle `<Panel>` are restyled to match the theme.

Status chips and the dot tally read `STATUS_STYLES` from `statusColors.ts` (extracted out of `StatusChip.tsx` so non-component consumers don't trip `react-refresh/only-export-components`).

## Decisions

None yet. Governed by parent `01-ui/02-dag` Decisions **D3** (manifest-only PLANNED rendered dashed), **D11** (no parent edges; hierarchy via subtree rect), **D13** (subtree header strip IS the parent; dashed interior click-inert), and **D12** (v1.1 visual simplification: no edge label, hidden handles, no minimap).

## Open Issues

- **React Flow CSS footprint.** `@xyflow/react/dist/style.css` is sizable; audit which classes are actually used and consider cherry-picking once styling stabilizes. *(Priority: LOW.)*

## Implementation Notes

None yet. (Render forms evolved across v1.0 doc tiles → v1.2 header-IS-parent subtree → v1.4 collapsed rollup tile; see the parent's Implementation Notes version table and git.)

## Verification

How completion will be confirmed:

1. All three node forms render: leaf tile, expanded subtree container (header strip = parent), collapsed rollup tile (stacked card + descendant count + per-status dot tally summing to the count). No subtree rect for a single-child parent.
2. Each node's status chip matches its doc's `**Status:**`; PLANNED/manifest-only nodes show a dashed border.
3. Clicking the chevron toggles collapse/expand **without** opening the inspector; clicking the header/body opens the inspector **without** toggling; the dashed interior is click-inert.
4. Pan/zoom work; no minimap; canvas uses cream-theme tokens only (no new color tokens beyond `globals.css`).
5. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero.

## Children

None.
