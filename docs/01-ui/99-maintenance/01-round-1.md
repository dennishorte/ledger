# UI Maintenance Round 1

**Node ID:** `01-ui/99-maintenance/01-round-1`
**Parent:** `01-ui/99-maintenance`
**Status:** COMPLETE (v1, 2026-05-26)
**Created:** 2026-05-26
**Last Updated:** 2026-05-26 (VERIFY → COMPLETE)

**Dependencies:** `01-ui/03-docs`, `01-ui/04-tasks`, `01-ui/05-logs`, `01-ui/06-health` (originating siblings, all COMPLETE). `01-ui/02-dag` no longer in scope — see Spec Review B1.

---

## Requirements

Curated punch list of MEDIUM/LOW/TRIVIAL Open Issues accumulated across COMPLETE `01-ui` siblings. Four items from four siblings (post-SPEC_REVIEW; the original five-item list dropped the `02-dag` parent-collapse item — see Spec Review B1). The HIGH-priority `10-orchestration` parent-status rollup bug is excluded and routes through `leaf-workflow.md` §8b on its originating leaf.

Each item below names: **Source** (originating leaf + bullet), **Origin priority**, and **Why this round** (per playbook §1).

### R1 — Compute transitive reduction on dep edges before render

- **Source:** `01-ui/02-dag` Open Issues bullet "Redundant transitive dependency edges drawn."
- **Origin priority:** MEDIUM (affects readability; fix in `useDagLayout.ts`).
- **Why this round:** mechanical graph-algorithm addition contained to one file. The original round paired this with the parent-collapse item (now deferred), but R1 stands on its own as a pure data-shaping change.

### R2 — Threshold the `(reconnecting…)` pill in the log-stream header

- **Source:** `01-ui/05-logs` Open Issues bullet "Reconnect-attempt flicker."
- **Origin priority:** LOW (polish).
- **Why this round:** ~5-line addition in `useLogStream.ts` (and corresponding read-site in `ConnectionPill.tsx`) — a `setTimeout` gate so the pill only shows after ≥500 ms of unresolved error state. Round-shaped because it bundles trivially with the others.

### R3 — Defensive empty-state for `/docs` when the doc tree is empty

- **Source:** `01-ui/03-docs` Open Issues bullet "Empty-state for `/docs` if zero docs exist."
- **Origin priority:** TRIVIAL (cannot happen today; degradation guard).
- **Why this round:** one-line `if (!nodes.length) return <EmptyState …/>` in `DocsPanel.tsx` / `DocsTree.tsx`. Pure defensive code; perfect TRIVIAL filler for a round.

### R4 — Move `StatusChip` to `src/components/ui/` and update imports

- **Source:** identical bullet on `01-ui/04-tasks` Open Issues AND `01-ui/06-health` Open Issues — both name the move as the action when the third panel consumes the chip. This is exactly the dedup case called out in the playbook's §Known limitations.
- **Origin priority:** LOW (cosmetic refactor; pre-authorized).
- **Why this round:** the third-consumer trigger has fired (`02-dag`, `03-docs`, and `06-health` all consume `StatusChip` directly; `04-tasks`'s `TaskStatusChip` is a sibling component that reuses the same color tokens, not a re-use of `StatusChip` itself). The move is mechanical: relocate the file, update six import paths across three panel directories. Bundling it here closes two Open Issue bullets in a single sweep.

### Out of scope (considered and rejected)

The following accumulated items were evaluated against the round-curation criteria (playbook §2) and excluded. The SPEC_REVIEW pass validated these rejections; one item (the original R1) was moved into this table during review.

| Item | Origin priority | Reason for exclusion |
|---|---|---|
| `01-ui/02-dag` Open Issues bullet "Parent node renders floating above its own subtree container." | MEDIUM | **Moved here during SPEC_REVIEW (B1).** `DocSubtreeNode.tsx` is currently a `pointer-events-none` background rectangle with no chip, no click handler, no `useShellStore` wiring. Collapsing the parent node into the container header requires non-mechanical structural work (interactive header + edge-endpoint redirection in `useDagLayout.ts`) beyond a round's "mechanical patch" framing. Tracked at its originating leaf's Open Issues; addressed via a future `02-dag` v1.1 §8b cycle. |
| `01-ui/10-orchestration` Open Issues bullet "Parent status doesn't roll up child status." | **HIGH** | HIGH items route through `leaf-workflow.md` §8b on the originating leaf, never a round. The full single-leaf cycle is appropriate weight for a HIGH. |
| `01-ui/05-logs` Open Issues bullet "`02-dag` follow-up: 'View task logs' affordance." | MEDIUM | Not mechanical: introduces a reverse `useTaskList()` query, a new affordance in `NodeInspector.tsx`, and a multi-match list UX (when >1 task claims a node). The bullet itself calls out the wiring shape (a, b). Deserves its own `02-dag` v1.2 leaf, not a maintenance batch. |
| `01-ui/00-ui.md` parent Open Issues bullet "Transport choice (WebSocket vs SSE) for live updates." | MEDIUM | Architectural decision that constrains `src/lib/ws.ts` and pairs with the API server's transport story. Not a UI maintenance item; finalize alongside `04-api-server`'s round-2 work or in a dedicated decision-record commit. |
| `01-ui/08-markdown` Open Issues bullet "Anchor scroll offset under sticky headers." | MEDIUM | **Stale bullet.** `--prose-scroll-margin-top` shipped with `08-markdown` v1 (verified during SPEC_REVIEW: declared in `globals.css`, applied in `prose.module.css`, consumed in `DocViewer.tsx`). Resolution is a strikethrough-only doc edit on `08-markdown`; not round-shaped. Handle via a one-off `08-markdown` housekeeping commit independent of any round (the round didn't touch `08-markdown`, so the stage-10 strikethrough convention doesn't apply). |
| `01-ui/03-docs` Open Issues bullet "Cross-subtree link resolution edge cases." | LOW | Tests-only addition. Useful but the client vitest project exists (added by `05-logs`); the test belongs more naturally to a future `08-markdown` or `03-docs` polish pass that also looks at the resolver path holistically. Defer to round-2 if accumulated test gaps surface. |
| `01-ui/05-logs` Open Issues bullet "Cross-doc test coverage" (golden test against `sample-session.jsonl`). | LOW | Same shape as the rejected `03-docs` test above. Defer to a tests-focused future round so the round has one coherent shape. |
| Remaining LOW/TRIVIAL items across the subtree (filter chip ergonomics, edit affordances, syntax-highlighting choice, language-only evidence strings, inspector ordering, etc.). | LOW / TRIVIAL | No concrete mechanical fix yet — most are awaiting dogfooding signal or design judgment that is bigger than a round. Stay parked in their originating Open Issues. |

---

## Design

This round contains four self-contained items, each in distinct files. No shared abstraction is introduced. The post-SPEC_REVIEW shape has no cross-leaf file coupling (the original R1+R2 `useDagLayout.ts` overlap dissolved when R1 was deferred).

Per-item design sketches below. None of these are full re-specs — the originating bullets already describe the intended fix; this section just locks the implementation surface.

### R1 — Transitive reduction on dep edges before dagre

**File:** `app/src/components/dag/useDagLayout.ts`.

**Current behaviour:** every declared `dependsOn` edge is passed to dagre and drawn. Implied transitive edges produce visible clutter (live example named in the originating bullet: `01-shell → 03-docs` is implied by `01-shell → 08-markdown → 03-docs`).

**Target behaviour:** compute the transitive reduction over the dep edge set before passing edges to React Flow for rendering. Dagre still receives every edge for rank assignment (so layout doesn't shift), but the drawn edge set is the reduction.

**Implementation shape:**

- New local helper `transitiveReduction(edges: DepEdge[]): DepEdge[]` in `useDagLayout.ts`. Standard DAG transitive-reduction algorithm: for each edge `u → v`, drop it if a longer path `u → … → v` exists in the edge set.
- Apply **only to `dep`-typed edges**. Parent edges are unaffected (per existing semantics). When task-DAG edges arrive (claims, deps — currently unimplemented), the reduction must be partitioned by edge type — same-type only. The originating bullet flags this; the helper enforces it from day one.
- Dagre receives the unreduced edge set; React Flow receives the reduced set. Two separate variables; no in-place mutation.

### R2 — Threshold the reconnecting pill

**Files:** `app/src/lib/useLogStream.ts` and `app/src/components/logs/ConnectionPill.tsx`.

**Current behaviour:** `useLogStream`'s `reconnectAttempt` increments on every EventSource `onerror`. Mid-stream connection blips that resolve within tens of milliseconds still cause the pill to flash "(reconnecting…)" immediately.

**Target behaviour:** the pill only shows the reconnecting state after the error state has persisted for ≥500 ms.

**Implementation shape:**

- Add a `reconnectVisible` boolean to the hook's state. On `onerror`, schedule a `setTimeout(() => setReconnectVisible(true), 500)`. On `onopen`, clear the pending timeout and set `reconnectVisible = false`. The pill reads `reconnectVisible`, not `reconnectAttempt`, when deciding whether to show the reconnecting copy.
- Threshold constant `RECONNECT_VISIBLE_DELAY_MS = 500` declared near the top of `useLogStream.ts`.

### R3 — Empty-state guard at `/docs`

**Files:** `app/src/routes/DocsPanel.tsx` (or `DocsTree.tsx`, whichever owns the top-level render).

**Current behaviour:** the recursive tree-row component assumes a non-empty doc set. The parser today always returns at least `00-project.md`, so this is unreachable — but a misconfigured project root or future API-backed source could produce empty arrays.

**Target behaviour:** when the doc node list is empty, render `<EmptyState …/>` with copy like "No documents found." Same `EmptyState` component the shell already exposes.

**Implementation shape:**

- One-line guard at the top of the docs panel's render: `if (allNodes.length === 0) return <EmptyState title="No documents found" body="…" />;`.
- Wording follows the convention of existing empty states (`DocViewerPanel` 404 path is the nearest reference).

### R4 — `StatusChip` relocation

**Files moved / modified:** `app/src/components/dag/StatusChip.tsx` → `app/src/components/ui/StatusChip.tsx`. Six import sites updated across three panel directories: `dag/DocDagNode.tsx`, `dag/NodeInspector.tsx`, `docs/DocsTree.tsx`, `docs/DocViewer.tsx`, `health/DepImpactWidget.tsx`, `health/StalenessWidget.tsx` (verified at SPEC_REVIEW time via `grep`).

**Implementation shape:**

- `git mv app/src/components/dag/StatusChip.tsx app/src/components/ui/StatusChip.tsx`.
- Update each of the six import paths. Module contents unchanged. `TaskStatusChip` (sibling under `tasks/`) stays where it is — its color-token reuse does not justify a cross-module dependency on `StatusChip` itself.
- No tests changed; the component has no test today. The post-move build + lint + typecheck pass is the gate.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | `StatusChip` lives under `src/components/ui/`, not under any panel's directory. | Three panels now consume it (`02-dag`, `03-docs`, `06-health`). The "co-locate with first consumer" principle is overruled by the third-consumer trigger that both `04-tasks` and `06-health` Open Issues already named. |
| D2 | Reject the `08-markdown` "anchor scroll offset" bullet as out-of-scope on grounds of staleness, and recommend a one-off `08-markdown` housekeeping commit (not a stage-10 strikethrough). | The fix already shipped with `08-markdown` v1 (verified during SPEC_REVIEW). The playbook §10 strikethrough-plus-pointer convention applies when a round resolves a sibling's bullet; this round does not touch `08-markdown`, so the convention doesn't apply. A standalone housekeeping commit on `08-markdown` is the right shape. |
| D3 | Reject HIGH-priority `10-orchestration` parent-rollup bug. | Playbook §1 hard-routes HIGH items to leaf-workflow §8b on the originating leaf. Including a HIGH would defeat the round's "batched trivial fixes" framing. |

---

## Open Issues

*(none yet — pre-implementation)*

---

## Spec Review (2026-05-26)

Independent clean-context spec review was run against the DRAFT immediately after the SPEC_REVIEW bump. Verdict: NEEDS_MINOR_REVISIONS — one blocking finding around the original R1's true scope, three should-fix items on file paths / counts / verification framing, three nits. All applied:

| # | Finding | Resolution |
|---|---------|------------|
| B1 | Original R1 (parent-collapse-into-subtree) under-described its true scope. `DocSubtreeNode.tsx` is currently a `pointer-events-none` background rectangle — implementing the spec's target turns it into an interactive parent-node header (chip + click + inspector payload + pointer-events scoping) and rewrites parent/dep edge endpoints in `useDagLayout.ts`. Plausibly the largest of the five items and not mechanical. | **Operator decision:** defer the item out of the round. Original R1 dropped from the curated list; remaining items renumbered R1–R4 in this spec. The deferred bullet is moved into the Out-of-scope table with a forward note that it routes through a future `02-dag` v1.1 §8b cycle. It remains as-is in `02-dag`'s Open Issues — no edit there. The original "D1 — bundle R1+R2 despite shared file" Decision was removed (no longer applicable); subsequent Decisions renumbered D1–D3. |
| S1 | Original R3 (now R2) named `app/src/components/logs/useLogStream.ts` as the file location. Actual location is `app/src/lib/useLogStream.ts`. | Path corrected in R2's "Files" line. |
| S2 | Original R5 (now R4) expected three import sites; actual `StatusChip` consumers are six files across `dag/`, `docs/`, `health/`. | R4 updated with the verified six-file list and panel breakdown. |
| S3 | Original R3 (now R2) acceptance check tested the wrong code path — it framed the bug as a "sub-100ms initial connection blip" but `useLogStream` only increments `reconnectAttempt` on `onerror`, never on initial open. The check passed without the fix. | R2 acceptance check rewritten: stop the API server mid-stream, observe pre-fix immediate flash vs post-fix ≥500 ms suppression. Initial-connect wording dropped. |
| N1 | D3 (now D2) recommended two resolution paths for the stale `08-markdown` bullet without picking one. | D2 now picks the one-off housekeeping commit; the strikethrough alternative is explicitly rejected with rationale (round didn't touch `08-markdown`). |
| N2 | Original R2 (now R1) verification over-prescribed how the verifier confirms (DevTools console-log step). | R1 acceptance check simplified to inspection at `/dag` against a pre-fix screenshot baseline. DevTools step dropped. |
| N3 | Original R5 (now R4) Implementation shape included a redundant parenthetical "(the implementer agent's worktree, not main)". | Dropped. The leaf-workflow already locates implementation in the worktree by construction. |

Nothing punted. B1 was an operator judgment call (kept R2 in the round, deferred original R1); the resolution is recorded for durable provenance. Audit table stays in the doc so the implementing agent in stage 4 sees what was decided.

---

## Implementation Notes

**Implementation date:** 2026-05-26.

**Dependencies added:** none.

**Algorithm choice for R1:** BFS-based reachability: for each dep edge `u → v`, run a BFS from `u` through the adjacency list; if `v` is reachable in ≥2 hops, the edge is redundant and dropped. This is the standard "for each edge, check if a longer path exists" formulation — O(E·(V+E)) worst-case, acceptable for ≤500-node DAGs. The adjacency list is built once per call to `transitiveReduction`, not per edge.

**R2 prop rename:** the spec says update `ConnectionPill.tsx` to read `reconnectVisible` instead of `reconnectAttempt`. Renaming the prop required threading through the full call chain: `ConnectionPill` → `LogStreamHeader` → `LogStream` → `LogStreamPanel` (4 files). After Implementation Review N1, `reconnectAttempt` was removed from the hook entirely — interface, state, and the `setReconnectAttempt` call in `onerror`. `reconnectVisible` is the sole reconnection signal exposed by `useLogStream`. The timer guard (`if (reconnectTimerRef.current === null)`) ensures that rapid successive `onerror` calls don't reset the 500 ms window.

**R3 file choice:** the guard belongs in `DocsTree.tsx` (not `DocsPanel.tsx`). `DocsPanel.tsx` is a one-liner that delegates to `DocsTree`; the data (`allNodes`) and the tree-level render logic both live in `DocsTree`. A guard in `DocsPanel` would require threading the `allNodes` reference up, which is worse. The existing `DocsTree` already had a `roots.length === 0` guard (from the `03-docs` implementation). After Implementation Review S1, the guard is **combined**: `allNodes.length === 0 || roots.length === 0` — covers both the empty-doc-set case (spec's stated form) and the all-orphans case (where `allNodes.length > 0` but no node has `parentId === null`).

**R4 relocation:** `git mv` used for the file move (preserves git history). All 6 import sites updated. `grep -rln 'components/dag/StatusChip' app/src` returns zero matches post-edit.

**Bundle delta vs main HEAD baseline (post-fix re-measure):**
- JS: 1,744.74 kB uncompressed / 548.48 kB gzip (worktree) vs 1,740.10 kB / 547.13 kB gzip (main) → +4.64 kB / +1.35 kB gzip
- CSS: 44.17 kB / 8.62 kB gzip (unchanged)

The original Implementation Notes reported +0.71 kB / +0.23 kB; that measurement was off (likely a stale baseline). Implementation Review N2 caught the discrepancy; numbers above are the post-fix gate run.

**Files added:** `app/src/components/ui/StatusChip.tsx` (moved from `dag/`).

**Files modified:**
- `app/src/components/dag/useDagLayout.ts` (R1: `transitiveReduction` helper + application)
- `app/src/lib/useLogStream.ts` (R2: `reconnectVisible` state + timer logic)
- `app/src/components/logs/ConnectionPill.tsx` (R2: prop renamed `reconnectAttempt` → `reconnectVisible`)
- `app/src/components/logs/LogStreamHeader.tsx` (R2: prop threading)
- `app/src/components/logs/LogStream.tsx` (R2: prop threading)
- `app/src/routes/LogStreamPanel.tsx` (R2: prop threading + destructuring)
- `app/src/components/docs/DocsTree.tsx` (R3: `allNodes.length === 0` guard; R4: import path update)
- `app/src/components/dag/DocDagNode.tsx` (R4: import path update)
- `app/src/components/dag/NodeInspector.tsx` (R4: import path update)
- `app/src/components/docs/DocViewer.tsx` (R4: import path update)
- `app/src/components/health/DepImpactWidget.tsx` (R4: import path update)
- `app/src/components/health/StalenessWidget.tsx` (R4: import path update)

**Files deleted:** `app/src/components/dag/StatusChip.tsx` (moved to `ui/`).

**Deviations from spec:** none.

**Headless acceptance status:**
- R1: cannot confirm headlessly — requires browser at `/dag` to verify the `01-shell → 03-docs` implied edge is absent while `01-shell → 08-markdown` and `08-markdown → 03-docs` are drawn.
- R2: cannot confirm headlessly — requires live API server, mid-stream shutdown, and timer observation in the browser.
- R3: cannot confirm headlessly — requires temporarily returning `[]` from the data source and observing the `EmptyState` render.
- R4: confirmed headlessly — `grep -rln 'components/dag/StatusChip' app/src` returns zero matches; all three gates exit zero; `app/src/components/ui/StatusChip.tsx` exists and `app/src/components/dag/StatusChip.tsx` does not.

### Implementation Review (2026-05-26)

Independent clean-context review against the rebased worktree diff. Verdict: NEEDS_MINOR_REVISIONS — zero blocking, one should-fix, two nits. All applied:

| # | Finding | Resolution |
|---|---------|------------|
| S1 | R3 regressed the orphan-only case. Original `DocsTree` guard was `roots.length === 0`; the implementer replaced it with `allNodes.length === 0`. For `allNodes.length > 0 && roots.length === 0` (every node has a `parentId` pointing to a missing parent), the new code fell through to `roots.map(...)` and rendered a blank panel instead of `EmptyState`. The implementer's "empty allNodes implies empty roots" rationale held in one direction only. | Combined the two checks: `if (allNodes.length === 0 \|\| roots.length === 0) return <EmptyState …/>`. `roots` is now computed before the guard. Comment in the source notes the dual coverage. |
| N1 | `reconnectAttempt` was a dead export: still in `UseLogStreamResult` and the return object, with the state and setter still live, despite the implementer's notes claiming it had been removed. No consumer reads it. | Removed `reconnectAttempt: number` from the interface, removed the `useState` for it, removed `setReconnectAttempt` from the `onerror` handler, removed it from the return object, and updated the file-level JSDoc. `reconnectVisible` is now the sole reconnection signal exposed. R2 paragraph above rewritten to match. |
| N2 | Reported bundle delta (+0.71 kB JS / +0.23 kB gzip) was off by ~6×. Post-fix re-measure: +4.64 kB / +1.35 kB gzip. Still well within negligible territory, but the doc said something untrue. | Bundle delta section above rewritten with the post-fix numbers and a note pointing at this audit row. |

Nothing punted; all findings mechanical. Audit retained as durable provenance per playbook §6.

---

## Verification

When this round moves to VERIFY, the verifier confirms one acceptance check per curated item (per playbook §1).

1. **R1 acceptance.** At `/dag`, confirm the implied `01-shell → 03-docs` edge is **not drawn**, while the two explicit edges that imply it (`01-shell → 08-markdown` and `08-markdown → 03-docs`) are drawn. Layout shouldn't shift versus a pre-fix screenshot baseline.
2. **R2 acceptance.** With the API server running, navigate to `/logs/:taskId` and confirm the stream connects without a "(reconnecting…)" flash. Then stop the API server mid-stream. **Without the fix**, the pill flashes "(reconnecting…)" immediately on the first `onerror`. **With the fix**, the pill suppresses the reconnecting suffix for ≥500 ms and only shows it if the error state persists past that threshold. Restart the server; pill resolves cleanly.
3. **R3 acceptance.** Temporarily point the docs panel at an empty source (or stub the parser to return `[]`). Confirm the route renders an `EmptyState` rather than throwing or showing a blank panel. Restore the source.
4. **R4 acceptance.** Confirm `app/src/components/ui/StatusChip.tsx` exists and `app/src/components/dag/StatusChip.tsx` does not. Run `grep -r 'components/dag/StatusChip' app/src` and confirm zero matches. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` all exit zero.

Standard gate: all three of `typecheck` / `lint` / `build` exit zero on the rebased worktree before promotion to COMPLETE.

---

## Children

*(none — rounds are leaves)*
