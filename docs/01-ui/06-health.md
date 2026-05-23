# Project Health Dashboard

**Node ID:** `01-ui/06-health`
**Parent:** `01-ui`
**Status:** COMPLETE (v1, 2026-05-23)
**Created:** 2026-05-22
**Last Updated:** 2026-05-23 (promotion)

**Dependencies:** `01-ui/01-shell`
**Optional reference:** `01-ui/02-dag` (dep-impact preview reuses `DocNode`/`NodeId` types), `01-ui/08-markdown` (declared as a planned consumer per D9 — `<MarkdownBody>` is not invoked in v1; issue items render as plain text)

---

## Requirements

Replace the `HealthDashboardPanel` empty state at `/health` with a real single-pane project health dashboard. This is PRD §8.7. The panel synthesises four categories of health signal into one operator surface:

1. **Open-issue roll-up.** Every `## Open Issues` section across the document tree, aggregated into a single filterable list. Each item links to its source document at the relevant section anchor.
2. **Staleness indicators.** Nodes where implementation artifacts have changed since last verification. Phase-1 scope: staleness is inferred from the combination of node status (`VERIFY`, `ISSUE_OPEN`) and the presence of authored open issues, not from file-system mtime tracking (that requires the health daemon, which does not exist yet).
3. **Cumulative token-cost by subtree.** A roll-up of estimated token spend by document subtree. Phase-1 scope: displayed as a placeholder widget with hard-coded zeros and a clear "No cost data — awaiting API" label. The widget is fully specced and wired for real data without structural changes.
4. **Dependency-impact preview.** Given a proposed edit (targeted at a specific node), show which downstream nodes would be transitively affected. Phase-1 scope: a read-only "what depends on X?" query over the existing `DocNode[]` graph, without task invalidation logic (no task runner exists).

Phase-1 scope is explicitly narrower than the full PRD vision because the health daemon, task runner, artifact tracker, and API server do not yet exist. Every widget is designed so that wiring in real data replaces only the data-fetch layer, not the component structure.

### Out of scope for this node

- Real staleness detection against implementation file mtimes (requires health daemon).
- Token-cost data from an API (no cost tracker exists; widget renders zeros).
- True dep-impact invalidation based on task resource claims (requires task runner and the task type model from `04-tasks`).
- Issue editing or status mutation (read-only panel).
- Live/streaming updates (no API yet; build-time data as in `02-dag`).
- Approval gates, task injection from the health panel (those live in `04-tasks`).
- `human_review` task gating triggered from health state (deferred to `04-tasks`).

---

## Design

### Data source

Phase-1 data flows from two sources, both build-time:

1. **`DocNode[]`** — the existing output of `parseDocs.ts` (introduced by `02-dag`), consumed via a re-exported `useDocGraph()` hook. This gives the panel node metadata, statuses, and dependency edges without any new parsing.
2. **Raw markdown bodies** — already globbed in the same pattern as `03-docs`'s `useDocSource`. The health panel uses the same hook (`useDocSource(id)`) to extract open-issue items from each authored doc. No new glob or parse infrastructure is needed; `useDocSource` is re-imported from `src/components/docs/useDocSource.ts` once `03-docs` ships it.

If `03-docs` ships first, import `useDocSource` directly. If `06-health` ships first, implement a minimal local version of the hook (raw glob + text extraction only, no link resolution needed here) and note the duplication in Implementation Notes. The `03-docs` node already established this parallel-order approach (see `03-docs` D9).

> **Hook-rules note.** `useHealthData` calls `useDocSource(id)` inside a loop over authored nodes. This is only safe because `useDocSource` is a thin lookup over an eager build-time map (Vite `import.meta.glob` with `{ eager: true }`) — it does not contain conditional hook calls, suspend, or trigger re-renders mid-loop. If the underlying implementation ever becomes async (TanStack Query, lazy glob, etc.), this loop must be replaced with a single batch query that returns `Map<NodeId, string>` in one call. Bake this assumption into a code comment at the call site and re-check during `03-docs` integration.

> **`DocNode` field name.** The canonical raw-body lookup key on `DocNode` is `source` (as shipped in `src/lib/types.ts`), not `docPath` (as `02-dag.md` reads in places). `useHealthData` and `parseIssueItems` consume `node.source` directly.

### New types (`src/lib/types.ts`)

```ts
/**
 * A single open-issue item extracted from a doc node's "## Open Issues" section.
 * Introduced by 01-ui/06-health.
 */
export interface IssueItem {
  /** Source node. */
  nodeId: NodeId;
  /** The raw markdown text of the bullet (single item, may be multi-line). */
  text: string;
  /** Priority tag extracted from the item text, e.g. "HIGH", "MEDIUM", "LOW", "TRIVIAL". */
  priority: IssuePriority;
  /**
   * Slug of the "## Open Issues" heading in the source doc, for anchor deep-linking.
   * Always "open-issues" for the current doc schema.
   */
  sectionSlug: string;
}

export type IssuePriority = "HIGH" | "MEDIUM" | "LOW" | "TRIVIAL" | "UNKNOWN";

/**
 * Staleness signal for a single node. Phase-1: derived from status + open issues.
 * Phase-2: will include mtime delta from the health daemon.
 */
export interface StalenessSignal {
  nodeId: NodeId;
  /** True when node status is VERIFY or ISSUE_OPEN, or node has ≥1 HIGH/MEDIUM open issue. */
  isStale: boolean;
  /** Human-readable reason, e.g. "Status is ISSUE_OPEN" or "2 HIGH-priority open issues". */
  reason: string;
}

/**
 * Token-cost roll-up per subtree root. Phase-1: all values are 0 / null.
 * Populated by the API when the cost tracker lands.
 */
export interface SubtreeCost {
  subtreeRootId: NodeId;
  /** Total input tokens in the subtree, or null when unavailable. */
  inputTokens: number | null;
  /** Total output tokens in the subtree, or null when unavailable. */
  outputTokens: number | null;
}

/**
 * Result of a dep-impact query: given a source node, which nodes are downstream?
 */
export interface DepImpactResult {
  /** Node the operator queried on. */
  sourceNodeId: NodeId;
  /** Transitively downstream node IDs (direct + indirect dependents). */
  affectedNodeIds: NodeId[];
}
```

### Issue extraction

A pure function `parseIssueItems(nodeId: NodeId, raw: string): IssueItem[]` in `src/lib/parseIssues.ts`:

1. Locate the `## Open Issues` heading in the raw markdown.
2. Collect contiguous bullet lines underneath it (stop at the next `##` heading or end of file).
3. For each bullet, extract the priority tag using the regex `\(Priority: (HIGH|MEDIUM|LOW|TRIVIAL)\)` (case-insensitive). No match → `UNKNOWN`.
4. Return one `IssueItem` per bullet with the `sectionSlug` set to `"open-issues"`.

The extractor does not use `react-markdown` or `remark` — it is a pure string operation on the raw text. This keeps it fast, dependency-free, and testable in isolation.

If a node has no `## Open Issues` section or the section is empty, return an empty array (not an error).

### Staleness derivation

A pure function `deriveStaleness(nodes: DocNode[], issuesByNode: Map<NodeId, IssueItem[]>): StalenessSignal[]` in `src/lib/deriveHealth.ts`:

- A node is stale if **any** of:
  - Its `status` is `ISSUE_OPEN` or `VERIFY`.
  - It has ≥1 `HIGH`-priority open issue.
  - It has ≥2 `MEDIUM`-priority open issues.
- `reason` is the first matching condition rendered as a short English string.
- Manifest-only nodes (`authored: false`) are excluded — they have no content to be stale against.

This is explicitly a Phase-1 proxy. The real signal (file-mtime vs last-verification-timestamp) arrives with the health daemon.

### Dep-impact query

A pure function `computeDepImpact(sourceNodeId: NodeId, nodes: DocNode[]): DepImpactResult` in `src/lib/deriveHealth.ts`:

- Build a reverse-adjacency map: for each node, which nodes declare it in their `dependsOn`?
- BFS/DFS from `sourceNodeId` over the reverse graph to collect all transitive dependents.
- Return `{ sourceNodeId, affectedNodeIds }`.
- If no node is downstream, `affectedNodeIds` is an empty array (not an error).

The operator selects a node via a `<select>` dropdown in the Dep-Impact widget. The computation runs on every selection change (the graph is small; no memoization needed beyond `useMemo`).

### Layout

Single-page dashboard. No tabs. Four widgets stacked in a 2 × 2 CSS grid at `md:` breakpoint, single column on small viewports. Grid cells are equal-height; overflow within a cell scrolls vertically.

```
┌──────────────────────┬──────────────────────┐
│  Open Issues         │  Staleness           │
│  (scrollable list)   │  (node list)         │
│                      │                      │
├──────────────────────┼──────────────────────┤
│  Token Cost          │  Dep-Impact Preview  │
│  (placeholder zeros) │  (node picker +      │
│                      │   affected list)     │
└──────────────────────┴──────────────────────┘
```

Each widget is a card with a title, optional subtitle/badge, and a content region. Card chrome is consistent: a `1px` border in `--color-border`, rounded corners, cream background, `p-4` internal padding, heading in `text-sm font-semibold text-[--color-muted]` uppercase.

### Components and files

```
src/components/health/
  HealthDashboard.tsx       // outer 2×2 grid, composes the four widgets
  IssueRollupWidget.tsx     // open-issue list with filter controls
  IssueRollupItem.tsx       // single issue row (node chip + priority badge + text excerpt)
  StalenessWidget.tsx       // stale-node list with reason column
  TokenCostWidget.tsx       // subtree cost table (Phase-1: all zeros)
  DepImpactWidget.tsx       // node picker + affected-node list
src/lib/
  parseIssues.ts            // IssueItem extractor (pure, no React)
  deriveHealth.ts           // StalenessSignal derivation + DepImpactResult BFS
```

`HealthDashboardPanel.tsx` becomes a thin wrapper: instantiate `useDocGraph()` and `useHealthData()` (described below), pass results to `<HealthDashboard />`.

A custom hook `src/components/health/useHealthData.ts` encapsulates all data assembly:

```ts
interface HealthData {
  issues: IssueItem[];           // flat list across all nodes, sorted HIGH→TRIVIAL
  staleness: StalenessSignal[];  // only nodes where isStale === true
  subtreeCosts: SubtreeCost[];   // Phase-1: placeholder array
  // Phase-1 convenience: full node set passed through for dep-impact queries
  // and node-label lookups in widgets. Couples widgets to the parseDocs.ts
  // shape; acceptable until a dedicated label/graph slice is warranted.
  nodes: DocNode[];
}

function useHealthData(): HealthData;
```

Internally: calls `useDocGraph()`, iterates nodes to call `useDocSource(id)` for each authored one, runs `parseIssueItems` and `deriveStaleness`, constructs placeholder `SubtreeCost[]`. All synchronous (build-time data).

### Open Issues widget interaction

- **Filter by priority:** a row of toggle-buttons (`HIGH`, `MEDIUM`, `LOW`, `TRIVIAL`) above the list, multi-select. Default: all priorities visible.
- **Filter by node:** a searchable `<select>` or combobox to limit issues to one node. Default: all nodes.
- Each row: left-aligned `StatusChip`-style node badge (reuses `StatusChip` from `src/components/dag/`), priority badge (`HIGH` in `--color-danger`, `MEDIUM` in `--color-warning`, `LOW`/`TRIVIAL` in `--color-muted`), and the issue text truncated to 2 lines. Full text on hover (native `title` attribute) or in the shell inspector.
- Clicking a row navigates to `/docs/${encodeURIComponent(nodeId)}#open-issues` — the document viewer (when `03-docs` ships) with the Open Issues section in view.
- Empty state (no issues at current filter): a small "No open issues matching filters." notice, not the full `<EmptyState>` component (that's for full-panel empty states).

### Staleness widget interaction

- List of stale nodes. Each row: node id, title, reason string, status chip.
- Clicking a row navigates to `/docs/${encodeURIComponent(nodeId)}` — the document viewer for that node.
- Rows sorted: `ISSUE_OPEN` status first, then `VERIFY`, then by issue count descending.
- Empty state (no stale nodes): a small positive confirmation — "All nodes appear healthy." This is a meaningful state worth surfacing clearly.

### Token Cost widget

Phase-1: renders a table with the doc tree's subtree roots (`root`, `01-ui`, and any future subtrees), each row showing a `—` placeholder for input tokens, output tokens, and estimated cost. A muted banner at the top of the widget reads: "Token cost tracking requires the API server — not yet available." The layout and column headers are production-ready so wiring in real data from `SubtreeCost[]` requires no structural change.

### Dep-Impact Preview widget

- A labeled `<select>` dropdown listing all authored nodes by `id — title`. Placeholder option: "Select a node to preview impact…".
- On selection: call `computeDepImpact(selectedNodeId, nodes)` and render the affected list.
- Affected list: each downstream node as a row with id, title, status chip. Rows sorted by subtree order (parent before children, depth-first).
- If the selected node has no downstream dependents: "No downstream nodes depend on this node."
- A muted note below the widget: "Phase 1 — shows doc-tree dependents only. Task invalidation requires the task runner."

### Acceptance check (manual)

A reviewer running `pnpm dev` and visiting `/health` must see:

1. A 2 × 2 grid of four widgets with consistent card chrome.
2. **Open Issues widget** — lists all `IssueItem`s extracted from the current `docs/` tree. Each item shows the source node badge, a priority badge, and the issue text. At least one `IssueItem` per authored doc with a populated `## Open Issues` section appears (do not anchor the check to a specific doc's current contents — those drift). Priority filter toggles work: hiding any populated priority removes its items from the list.
3. **Staleness widget** — at least one stale node appears (e.g., any DRAFT node with a HIGH open issue). Clicking a stale-node row navigates to `/docs/<nodeId>` (or shows 404 empty-state if `03-docs` has not shipped).
4. **Token Cost widget** — table renders with `—` values and the "not yet available" banner. No errors.
5. **Dep-Impact widget** — selecting a node with known dependents (e.g., `01-ui/01-shell`, which `02-dag` depends on) shows `01-ui/02-dag` (and any other panel nodes) in the affected list. Selecting a leaf node with no dependents shows the "No downstream nodes" message.
6. `StatusChip` badges in rows match the same colors as the DAG panel's chips for the same nodes.
7. Clicking an issue row with `03-docs` shipped navigates to the doc viewer at the `#open-issues` anchor. Without `03-docs`, the link still fires (the viewer shows its 404 empty-state gracefully).
8. No new network requests beyond Vite dev-server traffic.
9. `pnpm typecheck`, `pnpm lint`, `pnpm build` pass at zero output.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Phase-1 data from `parseDocs.ts` + raw markdown glob — no API, no daemon | Consistent with `02-dag` and `03-docs` Phase-1 strategy. The panel is useful even without a backend; real signals swap in behind `useHealthData` without component changes. |
| D2 | Issue extraction via plain string parsing, not `remark` | The issue section has a highly regular format (bullet lines, `(Priority: X)` tag). Pulling in remark just to parse one section is unjustified. A ~40-line pure function is faster, simpler, and independently testable. |
| D3 | Staleness is a Phase-1 proxy (status + issue count), not mtime-based | The health daemon (PRD §6.4) drives real staleness detection via artifact-change events. Until it exists, status + open-issue severity is the best signal available and is still actionable. The proxy is clearly labeled in the UI. **Edge case (resolved):** a DRAFT node with a HIGH open issue is flagged stale even though "stale" doesn't literally apply pre-verification. We keep this behavior: a HIGH issue on a DRAFT spec is exactly the signal an operator needs to see, and filtering it out would hide blocking work behind a lifecycle technicality. The `reason` string makes the trigger transparent. |
| D4 | Dep-impact preview is doc-tree-only in Phase-1, explicitly labeled as such | Task-level invalidation (PRD §8.7, "show which downstream tasks would be invalidated") requires the task runner's resource-claim model, which `04-tasks` will introduce. The doc-tree BFS is still genuinely useful: it answers "if I refactor this node's spec, which downstream specs might need updates?" |
| D5 | Token Cost widget ships as a production-ready placeholder | Building the widget shell now prevents the panel from looking broken when the API lands. The wiring cost is minimal; the alternative (shipping without the widget) creates a deferred UX debt that's harder to retrofit. |
| D6 | 2 × 2 CSS grid — no tabs | Four widgets of roughly equal visual weight; a grid gives an at-a-glance dashboard feel. Tabs would force serial scanning. The grid collapses to single-column on narrow viewports naturally via Tailwind breakpoints. |
| D7 | Reuse `StatusChip` from `src/components/dag/` as-is | Same reasoning as `03-docs` D7 — two consumers don't justify moving it to `src/components/ui/`. Reassess when `04-tasks` also needs it (likely). |
| D8 | `useHealthData` hook encapsulates all data assembly | Keeps `HealthDashboardPanel.tsx` a thin shell. Makes Phase-2 swap-out surgical: replace the internals of `useHealthData` with a TanStack Query against the health API; all widget components remain unchanged. |
| D9 | `08-markdown` is a dependency but `<MarkdownBody>` is not used for issue text in v1 | Issue items are rendered as plain text (truncated, with full text on hover). Full markdown rendering of issue bodies is deferred because issue items are short, mixed-priority bullet lines — the overhead of spinning up a `<MarkdownBody>` per item is not warranted. If issue bodies grow complex (multi-paragraph, code blocks), revisit. |
| D10 | Issue-to-doc navigation uses `/docs/:nodeId#open-issues`, gracefully degrading if `03-docs` has not shipped | The link is correct regardless of `03-docs` readiness. If the viewer is not yet live, the shell's 404 empty-state handles it. Avoids a conditional that would need to be cleaned up. |
| D11 | `parseIssues.ts` and `deriveHealth.ts` are pure functions, no React imports | Pure functions are testable without a render environment and can be reused by the API server when it arrives. No framework coupling. |
| D12 | Health-panel row clicks navigate directly to `/docs/:nodeId#…`; the shell inspector is not opened | `02-dag` uses the right-hand inspector for the graph-exploration flow because a DAG node has dense per-node metadata best read in a side panel. The health panel is an aggregation surface — each row already shows the structured signal (issue text, status, dep-impact result) in line. Routing to the source doc is the natural next step; opening the inspector first would be a one-extra-click detour for a richer view of the same data the row already shows. If a future "preview without leaving the page" need emerges (long issue bodies, multi-paragraph reasoning), revisit. |

---

## Open Issues

- **`useDocSource` availability.** This panel needs `useDocSource(id)` from `03-docs`. If `06-health` ships before `03-docs`, a minimal local copy must be added and cleaned up on merge. The mitigation is pre-authorized — coordination overhead only, not a blocking unknown. *(Priority: LOW.)*
- **Issue-extraction regex fragility.** The `(Priority: X)` pattern covers the current doc schema but is sensitive to formatting changes (spacing, capitalization). If future docs use a different tag format, items silently downgrade to `UNKNOWN`. Consider enforcing the tag format in a schema doc or linting rule. *(Priority: LOW.)*
- **`StatusChip` move to `src/components/ui/`.** `06-health` is the likely third consumer (after `02-dag` and `03-docs`). If all three ship before this is resolved, move `StatusChip` to `src/components/ui/` at that point and update imports in all three panels. *(Priority: LOW — triggers on third confirmed consumer.)*
- **Dep-impact BFS performance at scale.** The BFS over `DocNode[]` is linear in node count and fine for the current tree (≤50 nodes). Revisit if the tree grows into the hundreds. *(Priority: LOW.)*
- **Token cost widget real wiring.** When the API server's cost endpoint lands, `useHealthData` must be updated to fetch `SubtreeCost[]` from it. Track this as a follow-up task in the health daemon's spec, not here. *(Priority: LOW — deferred to health daemon node.)*
- **Interaction with PRD §11 open issues.** PRD §11 lists three open issues (`LangGraph resource-locking compatibility`, `Self-audit problem`, `Decomposition termination criteria`) that live on the PRD root, not on any UI node. Those do not have authored `IssueItem`s under the UI tree's docs — they will appear once the PRD node is authored and the root doc is parsed. No action needed now; document the expectation. *(Priority: LOW.)*

---

## Spec Review (2026-05-22)

Independent spec review was run against this DRAFT immediately after authoring. Verdict: NEEDS_MINOR_REVISIONS, no blockers. Audit of findings and how each was handled:

| # | Finding | Resolution |
|---|---------|------------|
| R1 | `08-markdown` listed as a hard dependency in the header, but D9 says `<MarkdownBody>` is not used in v1 — contradiction. | Demoted `08-markdown` to "Optional reference" with an explicit pointer to D9. The forward-looking dep is preserved as documentation, the v1 dep list is now accurate. |
| R2 | `useHealthData` iterates nodes calling `useDocSource(id)` inside a loop — would violate Rules of Hooks unless the underlying hook is a static lookup. | Added a "Hook-rules note" callout under §Design > Data source documenting why the loop is safe (eager build-time map) and the upgrade trigger (if `useDocSource` ever becomes async, refactor to a batch query). |
| R3 | No decision on whether health-panel rows open the shell inspector (as DAG nodes do) or navigate directly to the doc. | Added D12 explicitly choosing direct navigation, with rationale: health panel is an aggregation surface, not an exploration surface. Inspector-first would add a one-extra-click detour. |
| R4 | `DocNode` field has drifted from `docPath` (in `02-dag.md`) to `source` (as shipped in `types.ts`). Implementer would hit this. | Added "`DocNode` field name" callout under §Design > Data source naming the canonical field. |
| N1 | `useDocSource` open-issue priority was MEDIUM but the mitigation is pre-authorized (coordination overhead only). | Recalibrated to LOW. |
| N2 | "Staleness proxy false positives" was an Open Issue but the spec author had a defensible answer. | Promoted into D3 with the chosen behavior (keep flagging DRAFT-with-HIGH-issue) and rationale (it's exactly what the operator should see). Open Issue removed. |
| N3 | Acceptance check #2 named the current `01-ui/00-ui.md` open issues as a test anchor — non-deterministic as docs evolve. | Reworded to a structural property: at least one `IssueItem` per authored doc with a populated `## Open Issues` section. |
| N4 | `HealthData.nodes: DocNode[]` is a leaky abstraction (couples widgets to `parseDocs.ts` shape). | Added an inline comment in the interface acknowledging the Phase-1 trade-off and the upgrade path (dedicated label/graph slice). |

Nothing was punted in this review pass — all findings are minor, all applied. The audit table stays in the doc so a future implementing agent can see what was decided and why without re-deriving the conversation.

---

## Implementation Notes

**Dependencies added:** None. All code is in-tree (`parseDocs.ts`, `useDocGraph`, `useDocSource`-pattern, `StatusChip`).

**Hook-rules deviation (R2):** The spec calls for `useDocSource(id)` to be called in a per-node loop inside `useHealthData`. That pattern is semantically safe because `useDocSource` is a thin synchronous lookup over an eager build-time map. However, the ESLint `react-hooks/rules-of-hooks` rule cannot introspect the implementation and flags any hook call inside `.map()`. To remain lint-clean without suppressing the rule, `useHealthData.ts` duplicates the `import.meta.glob` + `idForPath` pattern from `useDocSource.ts` at module scope, producing a `rawByNodeId: ReadonlyMap<NodeId, string>`. The per-node iteration then uses plain Map lookups — no hook calls in the loop. The spec's HOOK-RULES NOTE assumption (upgrade trigger on async `useDocSource`) is preserved in a file-level comment. This is a zero-behavioral-change deviation: identical data path, no new dependency, no external module added.

**Decisions beyond spec:** None. All choices follow the spec or its referenced decisions.

**Bundle delta vs baseline commit `2be1df9`** (main branch dist from 2026-05-22 18:53):

| Asset | Baseline | This build | Delta |
|-------|----------|------------|-------|
| `index-*.js` (uncompressed) | 904,713 B | 933,995 B | +29,282 B (+3.2%) |
| `index-*.css` (uncompressed) | 37,348 B | 40,348 B | +3,000 B (+8.0%) |
| `index.html` | — | 399 B | — |

Gzip totals reported by Vite: JS 300.11 kB, CSS 7.96 kB. The chunk-size warning (>500 kB) was already present in the baseline build; no new chunks were added.

**Acceptance check items NOT verifiable in headless environment (manual):**

- **#1** (2×2 grid visual, card chrome) — visual only.
- **#2** (Open Issues widget: at least one item per authored doc with issues; priority filter toggles work) — requires browser interaction.
- **#3** (Staleness widget: at least one stale node appears; row click navigates) — requires browser.
- **#4** (Token Cost: table + banner renders, no errors) — visual only.
- **#5** (Dep-Impact: selecting `01-ui/01-shell` shows `01-ui/02-dag`; leaf node shows empty message) — requires browser interaction.
- **#6** (StatusChip badge color parity with DAG panel) — visual only.
- **#7** (Issue row click navigates to `/docs/:nodeId#open-issues`) — requires browser.
- **#8** (No new network requests) — requires browser devtools.
- **#9** (typecheck/lint/build zero output) — **verified in this environment**: all three exit zero.

**Items verified headlessly:**

- Acceptance check #9: `pnpm typecheck`, `pnpm lint`, `pnpm build` all exit 0.
- `computeDepImpact` logic: BFS over reverse-adjacency graph; `01-ui/01-shell` is in `dependsOn` of every panel node per the children manifest, so it will have dependents.
- `deriveStaleness` covers ISSUE_OPEN, VERIFY, HIGH-issue, and ≥2 MEDIUM-issue conditions.
- `parseIssueItems` handles absent `## Open Issues` section (returns `[]`) and bullet extraction with priority regex.

**Deviations from spec:** Only the hook-loop deviation described above. Recorded here; no doc-level spec change needed (the code comment at the call site is the durable record per the spec's own HOOK-RULES NOTE).

### Implementation Review (2026-05-23)

Independent implementation review was run against this worktree post-rebase. Verdict: READY_FOR_OPERATOR_VERIFICATION (two should-fix, four nits). Audit:

| # | Finding | Resolution |
|---|---------|------------|
| F1 | `StalenessWidget` rendered only `id | reason | chip` — spec calls for `id | title | reason | chip`. | Added title column to `StalenessWidget.tsx`; reason demoted to `--color-faint` to keep the row visually weighted toward the title. |
| F2 | `StalenessWidget` tertiary sort was `nodeId.localeCompare`, not "issue count descending" per spec. | Added `issueCount: number` to `StalenessSignal`; `deriveStaleness` populates it from `issues.length`; `StalenessWidget` sorts by `issueCount` descending before falling back to id. The renamed `sortKey` → `statusRank` reflects its single responsibility (the value-arg was unused, dropped). |
| N1 | Reported bundle delta (+29,282 B) differs from measured (+32,568 B) due to build-time hash non-determinism. | Bundle-delta table refreshed below from the final build of this worktree. |
| N2 | `sortKey(_signal, node)` had an unused first parameter. | Subsumed by F2 — function renamed `statusRank(node)`, no unused arg. |
| N3 | `nodeById` in `StalenessWidget` not memoized (cosmetic; widget is small and re-renders rarely). | Skipped. Node list is small (≤50); inconsistency with `DepImpactWidget`'s memoization is not load-bearing. |
| N4 | `DepImpactWidget` affected-list sort is `id.localeCompare`, not depth-first. | Skipped. The project's id naming scheme (`parent/child`, with `/` 0x2F sorting before any letter/digit) makes alphabetical equivalent to DFS for current trees: `01-ui` < `01-ui/01-shell` < `01-ui/02-dag`. If a future id scheme breaks this assumption, revisit. |
| Op-1 | Spec referenced `--color-text-muted` (does not exist as a token); implementation correctly used `--color-muted`. | Spec updated: `text-[--color-text-muted]` → `text-[--color-muted]` in §Design > Layout. |

**Refreshed bundle delta** (final build after F1+F2):

| Asset | Baseline (`2be1df9`) | This build | Delta |
|-------|----------------------|------------|-------|
| `index-*.js` (uncompressed) | 904,713 B | 939,830 B | +35,117 B (+3.9%) |
| `index-*.js` (gzip) | — | 301.84 kB | — |
| `index-*.css` (uncompressed) | 37,348 B | 40,348 B | +3,000 B (+8.0%) |
| `index-*.css` (gzip) | — | 7.96 kB | — |

The original Implementation Notes bundle-delta table above is superseded by this refreshed table.

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. The full Acceptance check list (1–9) passes.
2. `parseIssueItems` returns a non-empty array for at least three authored docs in the current tree, and returns `[]` (not an error) for a doc with no `## Open Issues` section.
3. `deriveStaleness` returns at least one `StalenessSignal` with `isStale: true` from the current tree's authored docs.
4. `computeDepImpact("01-ui/01-shell", nodes)` returns an `affectedNodeIds` array containing at least `01-ui/02-dag`.
5. `computeDepImpact` for a leaf node with no dependents returns `affectedNodeIds: []`.
6. Priority filter toggles on the Open Issues widget correctly add/remove items — verified by toggling `HIGH` off while a HIGH issue is visible and confirming it disappears.
7. The Token Cost widget renders without errors and shows the "not yet available" banner.
8. Clicking a stale-node row navigates to `/docs/<nodeId>` without a full page reload (Vite client connection stays open).
9. `StatusChip` badges in the health panel match the chips in the DAG panel for the same node ids.
10. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero. Bundle delta reported in Implementation Notes.
11. No regressions in the DAG panel (`/dag`) — doc parsing infrastructure is shared; confirm it still renders the full graph.

---

## Children

None.
