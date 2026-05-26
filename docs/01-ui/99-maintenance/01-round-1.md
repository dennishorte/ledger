# UI Maintenance Round 1

**Node ID:** `01-ui/99-maintenance/01-round-1`
**Parent:** `01-ui/99-maintenance`
**Status:** SPEC_REVIEW
**Created:** 2026-05-26
**Last Updated:** 2026-05-26 (DRAFT → SPEC_REVIEW)

**Dependencies:** `01-ui/02-dag`, `01-ui/03-docs`, `01-ui/04-tasks`, `01-ui/05-logs`, `01-ui/06-health` (all originating siblings, all COMPLETE)

---

## Requirements

Curated punch list of MEDIUM/LOW/TRIVIAL Open Issues accumulated across COMPLETE `01-ui` siblings. Five items from four siblings. The HIGH-priority `10-orchestration` parent-status rollup bug is explicitly **excluded** from this round and routes through `leaf-workflow.md` §8b on its originating leaf.

Each item below names: **Source** (originating leaf + bullet), **Origin priority**, and **Why this round** (per playbook §1).

### R1 — Collapse parent node into its subtree container

- **Source:** `01-ui/02-dag` Open Issues bullet "Parent node renders floating above its own subtree container."
- **Origin priority:** MEDIUM (visible in current screenshots; trivial fix).
- **Why this round:** mechanical layout/component change; pairs with R2 in the same files (`useDagLayout.ts` + `DocSubtreeNode.tsx`); reviewing the combined diff is cheap because both edits live in the dagre-layout path.

### R2 — Compute transitive reduction on dep edges before render

- **Source:** `01-ui/02-dag` Open Issues bullet "Redundant transitive dependency edges drawn."
- **Origin priority:** MEDIUM (affects readability; fix in `useDagLayout.ts`).
- **Why this round:** mechanical graph-algorithm addition; shares `useDagLayout.ts` with R1, so the round absorbs the file-coupling rather than spawning two separate single-leaf §8b loops.

### R3 — Threshold the `(reconnecting…)` pill in the log-stream header

- **Source:** `01-ui/05-logs` Open Issues bullet "Reconnect-attempt flicker."
- **Origin priority:** LOW (polish).
- **Why this round:** ~5-line addition in `useLogStream.ts` (or `ConnectionPill.tsx`) — a `setTimeout` gate so the pill only shows after ≥500 ms of unresolved error state. Round-shaped because it bundles trivially with the others.

### R4 — Defensive empty-state for `/docs` when the doc tree is empty

- **Source:** `01-ui/03-docs` Open Issues bullet "Empty-state for `/docs` if zero docs exist."
- **Origin priority:** TRIVIAL (cannot happen today; degradation guard).
- **Why this round:** one-line `if (!nodes.length) return <EmptyState …/>` in `DocsPanel.tsx` / `DocsTree.tsx`. Pure defensive code; perfect TRIVIAL filler for a round.

### R5 — Move `StatusChip` to `src/components/ui/` and update imports

- **Source:** identical bullet on `01-ui/04-tasks` Open Issues AND `01-ui/06-health` Open Issues — both name the move as the action when the third panel consumes the chip. This is exactly the dedup case called out in the playbook's §Known limitations.
- **Origin priority:** LOW (cosmetic refactor; pre-authorized).
- **Why this round:** the third-consumer trigger has fired (`02-dag` + `03-docs` + `06-health` consume `StatusChip` directly; `04-tasks`'s `TaskStatusChip` is a sibling component that reuses the same color tokens). The move is mechanical: relocate the file, update three import paths. Bundling it here closes two Open Issue bullets in a single sweep.

### Out of scope (considered and rejected)

The following accumulated items were evaluated against the round-curation criteria (playbook §2) and excluded. The SPEC_REVIEW pass should scrutinize these rejections.

| Item | Origin priority | Reason for exclusion |
|---|---|---|
| `01-ui/10-orchestration` Open Issues bullet "Parent status doesn't roll up child status." | **HIGH** | HIGH items route through `leaf-workflow.md` §8b on the originating leaf, never a round. The full single-leaf cycle is appropriate weight for a HIGH. |
| `01-ui/05-logs` Open Issues bullet "`02-dag` follow-up: 'View task logs' affordance." | MEDIUM | Not mechanical: introduces a reverse `useTaskList()` query, a new affordance in `NodeInspector.tsx`, and a multi-match list UX (when >1 task claims a node). The bullet itself calls out the wiring shape (a, b). Deserves its own `02-dag` v1.2 leaf, not a maintenance batch. |
| `01-ui/00-ui.md` parent Open Issues bullet "Transport choice (WebSocket vs SSE) for live updates." | MEDIUM | Architectural decision that constrains `src/lib/ws.ts` and pairs with the API server's transport story. Not a UI maintenance item; finalize alongside `04-api-server`'s round-2 work or in a dedicated decision-record commit. |
| `01-ui/08-markdown` Open Issues bullet "Anchor scroll offset under sticky headers." | MEDIUM | **Stale bullet.** `--prose-scroll-margin-top` shipped with `08-markdown` v1 (see its Implementation Notes "`scroll-margin-top`: Applied to `h2` and `h3` via CSS variable…default 80px"). Resolution is a strikethrough-only doc edit on `08-markdown`; not round-shaped. Recommend a stage-10-style strikethrough commit folded into the next round's merge, or a one-off `08-markdown` housekeeping commit independent of any round. |
| `01-ui/03-docs` Open Issues bullet "Cross-subtree link resolution edge cases." | LOW | Tests-only addition. Useful but the client vitest project exists (added by `05-logs`); the test belongs more naturally to a future `08-markdown` or `03-docs` polish pass that also looks at the resolver path holistically. Defer to round-2 if accumulated test gaps surface. |
| `01-ui/05-logs` Open Issues bullet "Cross-doc test coverage" (golden test against `sample-session.jsonl`). | LOW | Same shape as the rejected `03-docs` test above. Defer to a tests-focused future round so the round has one coherent shape. |
| Remaining LOW/TRIVIAL items across the subtree (filter chip ergonomics, edit affordances, syntax-highlighting choice, language-only evidence strings, inspector ordering, etc.). | LOW / TRIVIAL | No concrete mechanical fix yet — most are awaiting dogfooding signal or design judgment that is bigger than a round. Stay parked in their originating Open Issues. |

---

## Design

This round contains five self-contained items. The batching shape is **mechanical-only with one shared file**: items R1 and R2 both touch `app/src/components/dag/useDagLayout.ts`. All other items live in distinct files. No shared abstraction is introduced.

Per-item design sketches below. None of these are full re-specs — the originating bullets already describe the intended fix; this section just locks the implementation surface.

### R1 — Parent node collapses into subtree container

**Files:** `app/src/components/dag/DocSubtreeNode.tsx`, `app/src/components/dag/useDagLayout.ts`.

**Current behaviour:** `useDagLayout.ts` emits two React Flow nodes for a decomposed parent — a regular `DocDagNode` *and* a `subtree`-typed `DocSubtreeNode` wrapping its children. The two are spatially adjacent but visually unconnected; the parent looks orphaned next to the labelled subtree box.

**Target behaviour:** the parent's status chip, ID, and name render *inside the subtree container's header*, and the standalone parent node is suppressed. The subtree box's header **is** the parent node — click target, status badge, link affordance all move into the header.

**Implementation shape:**

- `useDagLayout.ts`: when emitting a `subtree` node for a parent `P`, suppress the standalone `DocDagNode` emission for `P`. Parent edges from `P`'s grandparent stop at the subtree box. Dep edges originating from `P` originate at the subtree box's header.
- `DocSubtreeNode.tsx`: header gains the same chip/ID/name composition that `DocDagNode.tsx` renders. Click forwards to the same `useShellStore.openInspector(...)` payload `DocDagNode` would have used.
- Manifest-only (planned) parents stay on the standalone-node path (dashed border, no children to wrap).

### R2 — Transitive reduction on dep edges before dagre

**File:** `app/src/components/dag/useDagLayout.ts`.

**Current behaviour:** every declared `dependsOn` edge is passed to dagre and drawn. Implied transitive edges produce visible clutter (live example named in the originating bullet: `01-shell → 03-docs` is implied by `01-shell → 08-markdown → 03-docs`).

**Target behaviour:** compute the transitive reduction over the dep edge set before passing edges to React Flow for rendering. Dagre still receives every edge for rank assignment (so layout doesn't shift), but the drawn edge set is the reduction.

**Implementation shape:**

- New local helper `transitiveReduction(edges: DepEdge[]): DepEdge[]` in `useDagLayout.ts`. Standard DAG transitive-reduction algorithm: for each edge `u → v`, drop it if a longer path `u → … → v` exists in the edge set.
- Apply **only to `dep`-typed edges**. Parent edges are unaffected (per existing semantics). When task-DAG edges arrive (claims, deps — currently unimplemented), the reduction must be partitioned by edge type — same-type only. The originating bullet flags this; the helper enforces it from day one.
- Dagre receives the unreduced edge set; React Flow receives the reduced set. Two separate variables; no in-place mutation.

### R3 — Threshold the reconnecting pill

**Files:** `app/src/components/logs/useLogStream.ts` (or wherever `reconnectAttempt` lives) and `app/src/components/logs/ConnectionPill.tsx`.

**Current behaviour:** `useLogStream`'s `reconnectAttempt` increments on every EventSource `onerror`. The pill flashes "(reconnecting…)" on every transient error, including the sub-50ms blips that resolve immediately.

**Target behaviour:** the pill only shows the reconnecting state after the error state has persisted for ≥500 ms.

**Implementation shape:**

- Add a `reconnectVisible` boolean to the hook's state. On `onerror`, schedule a `setTimeout(() => setReconnectVisible(true), 500)`. On `onopen`, clear the timeout and set `reconnectVisible = false`. The pill reads `reconnectVisible`, not `reconnectAttempt`, when deciding whether to show the reconnecting copy.
- Threshold constant `RECONNECT_VISIBLE_DELAY_MS = 500` declared near the top of `useLogStream.ts`.

### R4 — Empty-state guard at `/docs`

**Files:** `app/src/routes/DocsPanel.tsx` (or `DocsTree.tsx`, whichever owns the top-level render).

**Current behaviour:** the recursive tree-row component assumes a non-empty doc set. The parser today always returns at least `00-project.md`, so this is unreachable — but a misconfigured project root or future API-backed source could produce empty arrays.

**Target behaviour:** when the doc node list is empty, render `<EmptyState …/>` with copy like "No documents found." Same `EmptyState` component the shell already exposes.

**Implementation shape:**

- One-line guard at the top of the docs panel's render: `if (allNodes.length === 0) return <EmptyState title="No documents found" body="…" />;`.
- Wording follows the convention of existing empty states (`DocViewerPanel` 404 path is the nearest reference).

### R5 — `StatusChip` relocation

**Files moved / modified:** `app/src/components/dag/StatusChip.tsx` → `app/src/components/ui/StatusChip.tsx`. Import sites updated in every consumer (verified by `grep -r 'from.*dag/StatusChip' app/src` at implementation time — expect: `DocDagNode.tsx`, the `03-docs` viewer, and `06-health`'s widgets).

**Implementation shape:**

- `git mv app/src/components/dag/StatusChip.tsx app/src/components/ui/StatusChip.tsx` (the implementer agent's worktree, not main).
- Update each import path. Module contents unchanged. `TaskStatusChip` (sibling under `tasks/`) stays where it is — its color-token reuse does not justify a cross-module dependency on `StatusChip` itself.
- No tests changed; the component has no test today. The post-move build + lint + typecheck pass is the gate.

### Combined-diff considerations

- **R1 + R2 share `useDagLayout.ts`.** The combined diff in that file: R1 adds a branch that suppresses standalone-node emission for parents; R2 adds a transitive-reduction pass before edge output. Both changes are additive and orthogonal — they should compose without conflict. The implementer should write R1 first, then R2, so the reviewer can see two clean diff hunks.
- **R5 touches three import sites.** Each is a single-line change; the move itself is `git mv`. Lint + typecheck + build catch any missed updates.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Bundle R1 and R2 in this round despite both touching `useDagLayout.ts`. | Both are MEDIUM-priority `02-dag` items with the same fix surface; splitting them would mean two §8b loops on the same file in sequence. Per playbook §2 ("Cross-leaf coupling"), the round is "prepared to reason about the combined diff" because both edits are additive and orthogonal. |
| D2 | `StatusChip` lives under `src/components/ui/`, not under any panel's directory. | Three panels now consume it (`02-dag`, `03-docs`, `06-health`). The "co-locate with first consumer" principle is overruled by the third-consumer trigger that both `04-tasks` and `06-health` Open Issues already named. |
| D3 | Reject the `08-markdown` "anchor scroll offset" bullet as out-of-scope on grounds of staleness (the fix already shipped with `08-markdown` v1). | Closing it requires a strikethrough-only doc edit on the originating leaf, not a code change. A round whose shape is mechanical code fixes shouldn't be padded with doc-only housekeeping; that's its own narrow commit. Recorded here so the SPEC_REVIEW pass can confirm or override. |
| D4 | Reject HIGH-priority `10-orchestration` parent-rollup bug. | Playbook §1 hard-routes HIGH items to leaf-workflow §8b on the originating leaf. Including a HIGH would defeat the round's "batched trivial fixes" framing. |

---

## Open Issues

*(none yet — pre-implementation)*

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this round moves to VERIFY, the verifier confirms one acceptance check per curated item (per playbook §1).

1. **R1 acceptance.** Open `/dag` with the current doc tree. Confirm: (a) the `01-ui` parent renders as the **header** of the subtree container (status chip + ID + name visible at the top of the container box), no standalone `01-ui` node next to or above the container; (b) clicking the header opens the same inspector content that clicking the standalone parent node previously opened; (c) parent and dep edges to/from the parent terminate at the container's edge, not at a separate floating node.
2. **R2 acceptance.** With `01-shell`, `08-markdown`, and `03-docs` all rendered, confirm the implied edge `01-shell → 03-docs` is **not drawn**, while the explicit edges `01-shell → 08-markdown` and `08-markdown → 03-docs` are. Verify by inspection at `/dag`. Inspect React Flow's edges array via React DevTools (or a temporary console log in `useDagLayout.ts`) to confirm dagre still received the unreduced set (rank/layout unchanged from a screenshot baseline pre-fix).
3. **R3 acceptance.** With the API server stopped, navigate to `/logs/:taskId`. Confirm the pill does **not** show "(reconnecting…)" during the sub-100ms initial connection blip. Stop the server mid-stream and confirm the pill shows the reconnecting state after ~500 ms. Restart the server and confirm the pill resolves cleanly.
4. **R4 acceptance.** Temporarily point the docs panel at an empty source (or stub the parser to return `[]`). Confirm the route renders an `EmptyState` rather than throwing or showing a blank panel. Restore the source.
5. **R5 acceptance.** Confirm `app/src/components/ui/StatusChip.tsx` exists and `app/src/components/dag/StatusChip.tsx` does not. Run `grep -r 'components/dag/StatusChip' app/src` and confirm zero matches. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` all exit zero.

Standard gate: all three of `typecheck` / `lint` / `build` exit zero on the rebased worktree before promotion to COMPLETE.

---

## Children

*(none — rounds are leaves)*
