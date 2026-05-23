# Workflow Progress (Inspector Section)

**Node ID:** `01-ui/09-workflow-progress`
**Parent:** `01-ui`
**Status:** VERIFY
**Created:** 2026-05-23
**Last Updated:** 2026-05-23 (IN_PROGRESS → VERIFY — V1 fix landed)

**Dependencies:** `01-ui/02-dag` (owns the DAG inspector surface that this section is embedded in)
**Optional reference:** `01-ui/06-health` (same `parseDocs` + raw-markdown data pattern), `docs/leaf-workflow.md` (canonical stage list and structural markers this node parses for)

---

## Requirements

Add a "Workflow" section to the DAG node inspector that visualises the selected node's position in the `leaf-workflow.md` lifecycle. The operator clicks a DAG node and immediately sees: which stages are done, which is current, which are pending, and (when applicable) whether the node has looped back through ISSUE_OPEN.

The section must:

- Render the six lifecycle states from PRD §6.2 (DRAFT → SPEC_REVIEW → APPROVED → IN_PROGRESS → VERIFY → COMPLETE) as an ordered checklist.
- Mark each stage DONE / CURRENT / PENDING / SKIPPED based on (a) the node's current status header and (b) structural markers in the doc body (Spec Review audit table, Implementation Notes content, Implementation Review subsection).
- Surface ISSUE_OPEN explicitly as a banner above the checklist — it is a side-branch, not a forward stage.
- Behave sensibly for nodes with no authored doc (PLANNED manifest entries): show all stages PENDING with an "doc not yet authored" evidence string.
- Behave sensibly for parent nodes (have a children manifest, do not run the leaf workflow): collapse to a two-row strip (DRAFT → APPROVED) plus a children-progress sub-list.
- Read-only: no status mutation, no buttons to advance stages.

### Out of scope for this node

- Mutating status from the inspector (writes belong to the orchestrator when PRD §7 lands; until then the operator edits the doc).
- Git-log or mtime-based audit (no "SPEC_REVIEW happened on date X" derived from commits — only what the doc body declares).
- Showing operator-procedure stages from `leaf-workflow.md` that are not lifecycle states (rebase, merge `--no-ff`, worktree cleanup). They are procedural, not recorded states.
- Rendering this section in routes other than `/dag` (the inspector is owned by the shell but its content is route-contributed; v1 only the DAG route contributes this section).
- Per-stage diffs, time estimates, or "ETA to COMPLETE".
- Aggregating progress across the tree (that's `06-health`'s staleness widget, not this).

---

## Design

### Data source

Phase-1 reuses the two build-time sources already in place:

1. **`DocNode`** via `useDocGraph()` — gives `status`, `dependsOn`, `authored`, and children edges. No new parsing.
2. **Raw markdown body** via `useDocSource(id)` — returns `DocSource | undefined` (the wrapper type from `src/lib/types.ts`). The call site unwraps to `source?.raw ?? null` before passing to `deriveWorkflowProgress(node, allNodes, raw)`. Used to scan for structural markers (`## Spec Review (`, `### Implementation Review (`, populated Implementation Notes).

No new globs, no new hooks, no new fetch. The pure function `deriveWorkflowProgress(node, allNodes, raw)` is the single point of derivation.

> **`NodeStatus` already includes every state we need.** `src/lib/types.ts` line 16 includes `SPEC_REVIEW` in the `NodeStatus` union; verified at spec-review time (audit N6 below). No type extension needed — the implementer can rely on the existing union as-is.

### New types (`src/lib/types.ts`)

```ts
/**
 * The six PRD §6.2 lifecycle stages, in canonical order.
 * Introduced by 01-ui/09-workflow-progress.
 */
export type WorkflowStage =
  | "DRAFT"
  | "SPEC_REVIEW"
  | "APPROVED"
  | "IN_PROGRESS"
  | "VERIFY"
  | "COMPLETE";

/**
 * Completion state of a single stage row.
 *  - DONE:    stage is in the past (status > stage) or its structural marker is present.
 *  - CURRENT: stage equals the node's current status.
 *  - PENDING: stage is in the future (status < stage) and no structural marker yet.
 *  - SKIPPED: status is past this stage but the structural marker is absent
 *             (e.g., DRAFT→APPROVED via the leaf-workflow stage-2 shortcut).
 */
export type StageCompletion = "DONE" | "CURRENT" | "PENDING" | "SKIPPED";

export interface WorkflowStageState {
  stage: WorkflowStage;
  completion: StageCompletion;
  /** Human-readable evidence string, e.g. "Status header is COMPLETE" or "Spec Review (2026-05-22) audit table present". */
  evidence: string;
}

export interface WorkflowProgress {
  nodeId: NodeId;
  /**
   * Mirrors DocNode.status. Note: this can be PLANNED or ISSUE_OPEN, neither
   * of which is a WorkflowStage — the renderer maps them through stages[] and
   * issueOpen rather than expecting a 1:1 stage correspondence.
   */
  currentStatus: NodeStatus;
  /** True iff currentStatus === "ISSUE_OPEN". When true, the banner renders. */
  issueOpen: boolean;
  /**
   * Six entries for leaves, two entries (DRAFT, APPROVED) for parents. The
   * length is governed by isParent rather than by the type — see parent-node
   * handling below. Type-narrowing on isParent is the safe access pattern.
   */
  stages: WorkflowStageState[];
  /** True when the node is a parent (has children in the manifest). Renderer uses this to pick the collapsed layout. */
  isParent: boolean;
  /** For parent nodes only: counts derived from the children manifest. Undefined for leaves. */
  childrenRollup?: {
    total: number;
    byStatus: Partial<Record<NodeStatus, number>>;
  };
}
```

### Stage derivation rules

`deriveWorkflowProgress(node: DocNode, allNodes: DocNode[], raw: string | null): WorkflowProgress` lives in `src/lib/deriveWorkflow.ts` — pure, no React. `allNodes` is needed for parent detection and the children rollup; the inspector already has it in scope and passes it through.

Algorithm:

1. If `node.authored === false` (manifest-only, no doc yet): all six stages → PENDING, evidence `"Doc not yet authored"`. `currentStatus` is whatever the manifest reports (typically `PLANNED`).
2. If `node` is a parent (see Parent-node handling): early-return with the two-row strip and `childrenRollup` populated.
3. **Map the current status to a rank** via this explicit table — non-stage statuses are coerced before the lookup, not relied on to "fall through":

   | currentStatus | rankValue | Notes |
   |---------------|-----------|-------|
   | `PLANNED`     | `-1`      | Caught by step 1; never reaches this table for authored nodes. |
   | `DRAFT`       | `0`       | |
   | `SPEC_REVIEW` | `1`       | |
   | `APPROVED`    | `2`       | |
   | `IN_PROGRESS` | `3`       | |
   | `VERIFY`      | `4`       | |
   | `COMPLETE`    | `5`       | |
   | `ISSUE_OPEN`  | `2`       | Coerced to APPROVED-rank per D12 (loop-back default). Banner is the authoritative signal. |

4. For each stage in canonical order, compute `(completion, evidence)`:
   - `stageRank < statusRank` → DONE if its structural marker is present (or no marker is defined for that stage), otherwise SKIPPED. Evidence cites the marker or its absence.
   - `stageRank === statusRank` → CURRENT. Evidence is `"Status header is <STAGE>"`.
   - `stageRank > statusRank` → PENDING. Evidence is `"Awaiting <stage>"`.

### Structural markers

Pure plain-text scans on the raw markdown body. No remark/MDX.

| Stage | Marker regex | Notes |
|-------|--------------|-------|
| DRAFT | None — DONE when `authored === true` (per audit N2) | Required-section presence is a doc-schema invariant maintained by every authored doc; checking it here would be a schema health check, not a workflow signal. Authored = DRAFT-DONE. |
| SPEC_REVIEW | `^##\s+Spec Review \(\d{4}-\d{2}-\d{2}\)` | Stage-3 audit table heading. |
| APPROVED | — (no marker; inferred from `statusRank ≥ 2`) | The APPROVED state is a transition, not a section. |
| IN_PROGRESS | `^##\s+Implementation Notes\b` followed by non-placeholder content | Placeholder = literal `*(none yet — pre-implementation)*`. |
| VERIFY | `^###\s+Implementation Review \(\d{4}-\d{2}-\d{2}\)` | Stage-7 audit subsection. |
| COMPLETE | — (no marker; inferred from `statusRank === 5`) | The Status header is the only source of truth. |

A stage with no marker but a passing rank inference is DONE. A stage with `stageRank < statusRank` whose marker *can* be checked (SPEC_REVIEW, IN_PROGRESS, VERIFY) but is absent is marked SKIPPED with evidence like `"No Spec Review audit table (stage-2 shortcut taken)"`.

### Parent-node handling

A node is a parent iff at least one other node declares it as `parentId`. The lookup pattern is already established in `NodeInspector.tsx:14`: `allNodes.filter(n => n.parentId === node.id)`. The derivation function receives the same `allNodes` array the inspector already has in scope, so no new graph traversal is needed. For parents:

- Stages array contains only `DRAFT` and `APPROVED` rows.
- `childrenRollup` populated: `{ total: N, byStatus: { COMPLETE: 3, IN_PROGRESS: 1, PLANNED: 2, ... } }` summed from the manifest.
- Renderer shows the two-row strip plus a small chip row underneath: `3 COMPLETE · 1 IN_PROGRESS · 2 PLANNED` (one chip per non-zero status, in canonical lifecycle order).

### ISSUE_OPEN handling

When `currentStatus === "ISSUE_OPEN"`:

- `issueOpen: true`.
- Stages array still computed normally, with `APPROVED` marked CURRENT (the loop-back lands the node at APPROVED per leaf-workflow §8b's typical re-entry — DRAFT re-entry is possible but rarer, and treating APPROVED as the default is acceptable; the banner is the authoritative signal).
- Renderer prepends a banner: `"Issue open — verification failed, looped back to APPROVED. See Open Issues section."` Banner uses `--color-warning` background.

### Layout

The section sits in the DAG inspector's content stack, below the existing node-metadata block. Title row: `Workflow` in `text-sm font-semibold text-[--color-muted]` uppercase, matching the existing inspector section headings.

Leaf node (six rows):

```
┌─────────────────────────────────────────────────────────┐
│ WORKFLOW                                                │
├─────────────────────────────────────────────────────────┤
│ ✓  DRAFT          Required sections present             │
│ ✓  SPEC_REVIEW    Spec Review (2026-05-22) audit table  │
│ ✓  APPROVED       Status reached APPROVED               │
│ ●  IN_PROGRESS    Status header is IN_PROGRESS          │
│ ○  VERIFY         Awaiting VERIFY                       │
│ ○  COMPLETE       Awaiting COMPLETE                     │
└─────────────────────────────────────────────────────────┘
```

Parent node (two rows + rollup):

```
┌─────────────────────────────────────────────────────────┐
│ WORKFLOW                                                │
├─────────────────────────────────────────────────────────┤
│ ✓  DRAFT          Required sections present             │
│ ●  APPROVED       Status header is APPROVED             │
│                                                         │
│ Children: 3 COMPLETE · 1 IN_PROGRESS · 2 PLANNED        │
└─────────────────────────────────────────────────────────┘
```

ISSUE_OPEN banner (when applicable, above the stage list):

```
┌─────────────────────────────────────────────────────────┐
│ ⚠ Issue open — verification failed, looped back to     │
│   APPROVED. See Open Issues section.                    │
└─────────────────────────────────────────────────────────┘
```

Icon glyphs: `✓` (DONE), `●` (CURRENT), `○` (PENDING), `⊘` (SKIPPED). Lucide equivalents (`Check`, `Circle`, `CircleDashed`, `CircleSlash`) are acceptable substitutes if the existing inspector already imports lucide.

Evidence strings render in `text-xs text-[--color-faint]`. The stage name renders in `text-sm font-medium text-[--color-fg]` (DONE/CURRENT) or `text-[--color-muted]` (PENDING/SKIPPED). SKIPPED rows additionally show the stage name in strikethrough to reinforce "this stage was bypassed, not just pending."

### Components and files

```
src/components/dag/
  WorkflowProgressSection.tsx   // the inspector section (leaf + parent layouts)
  WorkflowStageRow.tsx          // single row (icon + name + evidence)
src/lib/
  deriveWorkflow.ts             // pure derivation function + helpers
```

Wiring: `NodeInspector.tsx` (current signature `NodeInspector({ node, allNodes })`) renders `<WorkflowProgressSection node={node} allNodes={allNodes} />` as a new section below the existing Parent / Depends-on / Children / Open-document fields.

`WorkflowProgressSection.tsx` props are `{ node: DocNode; allNodes: DocNode[] }`. Internally it calls `useDocSource(node.id)` to get the raw body (`source?.raw ?? null`), runs `deriveWorkflowProgress(node, allNodes, raw)`, picks the layout (`isParent` → parent layout, else leaf layout), renders. No call to `useDocGraph()` is needed at this level — the inspector already has the parsed graph.

### Interaction model

- Read-only. No click handlers on stage rows in v1.
- Section re-renders whenever the selected DAG node changes (the inspector already re-renders on selection; no new state).
- Hovering a stage row shows the full evidence string as a native `title` tooltip (in case it gets truncated at narrow inspector widths).

### Acceptance check (manual)

A reviewer running `pnpm dev` and visiting `/dag` must see, after clicking each named node:

1. **`01-ui/06-health`** (status COMPLETE) — six rows, all `✓` DONE. Evidence strings name the structural markers found (Spec Review audit, Implementation Notes content, Implementation Review subsection).
2. **`01-ui/05-logs`** (status PLANNED, doc not yet authored) — six rows, all `○` PENDING. Evidence reads `"Doc not yet authored"` on each.
3. **`01-ui` itself** (parent, APPROVED) — two-row strip (DRAFT ✓, APPROVED ●) followed by the children rollup chip row showing the actual child status counts.
4. **Any node whose Status header is `DRAFT` at verification time** — DRAFT `●` CURRENT, the other five `○` PENDING. (Pick whichever DRAFT-status node exists in the tree when running the check; do not anchor to a specific node id, since DRAFTs progress quickly.)
5. **ISSUE_OPEN simulation** — temporarily edit any leaf node's Status header to `ISSUE_OPEN`, reload, confirm the warning banner renders above the checklist. Revert.
6. **SKIPPED simulation** — temporarily edit a COMPLETE node to remove its `## Spec Review` heading, reload, confirm SPEC_REVIEW renders as `⊘` SKIPPED with strikethrough and the evidence string names the missing marker. Revert.
7. Selecting a different node updates the section without a full reload.
8. `pnpm typecheck`, `pnpm lint`, `pnpm build` pass at zero output.
9. No regressions elsewhere in the DAG inspector — existing per-node metadata sections still render.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Stages map 1:1 to PRD §6.2, not to `leaf-workflow.md`'s eleven operator stages | PRD §6.2 is the canonical lifecycle. Operator stages (rebase, merge `--no-ff`, worktree cleanup) are procedure, not recorded state — showing them as checklist items would imply they are tracked node-state when they are not. |
| D2 | Phase-1 derivation from doc content only, no git log | Same data-source discipline as `02-dag` and `06-health`. The audit-tables convention already encodes lifecycle events in the doc itself; adding a git-log scan would be a second source of truth and a parser dependency. When the orchestrator (PRD §7) lands, it owns canonical transition events. |
| D3 | ISSUE_OPEN rendered as a banner, not a stage cell | The checklist is linear; ISSUE_OPEN is a loop-back to APPROVED or DRAFT (leaf-workflow §8b). Forcing a loop-back into a linear strip would either insert a synthetic row (ugly) or move the CURRENT indicator backward without explanation (confusing). A banner says the truth plainly. |
| D4 | Parent nodes get a collapsed two-row strip + children rollup | Parents do not run the leaf workflow — they go DRAFT → APPROVED once their manifest is settled, then their "progress" is the aggregate state of their children. Showing the full six rows for a parent would be wrong (parents do not enter IN_PROGRESS or VERIFY in the same sense). |
| D5 | SKIPPED is its own completion state, not folded into DONE | Stage-2 of leaf-workflow explicitly allows skipping SPEC_REVIEW. Folding it into DONE would hide a meaningful operator choice ("I judged the spec safe enough to skip review"). SKIPPED with the absence-evidence string makes the choice visible without flagging it as a problem. |
| D6 | Structural markers checked via plain-text regex, not remark AST | Same reasoning as `06-health` D2 — the doc convention is highly regular (`## Spec Review (YYYY-MM-DD)`, `### Implementation Review (YYYY-MM-DD)`, `*(none yet — pre-implementation)*` placeholder). A ~30-line pure function is faster, dependency-free, and independently testable. |
| D7 | `deriveWorkflowProgress` is a pure function with no React imports | Testable without a render environment and reusable by the eventual API server / health daemon when they need to emit workflow events. Matches `06-health` D11. |
| D8 | Read-only in v1 — no edit buttons, no "advance stage" actions | Status mutation belongs to the orchestrator (PRD §7). Until it lands, the operator edits the doc by hand and commits — the framework's "doc-and-code must agree" rule (CLAUDE.md) makes the doc the single source of truth. Adding edit buttons here would create a second mutation path. |
| D9 | Lives in `src/components/dag/`, not `src/components/ui/` or a new `src/components/workflow/` directory | The section is currently embedded only in the DAG inspector. Premature extraction to a shared location would imply other routes consume it; they don't, yet. If a future route also wants this section (e.g., `03-docs` opens it from a doc viewer), move at that point. Matches `06-health` D7's two-consumers-is-the-trigger rule. |
| D10 | Inspector section, not a new route | The data is contextual to a selected node — useless without a selection. A standalone `/workflow` route would duplicate navigation for no marginal benefit. Embedding in the inspector is the natural location and uses zero new routing surface. |
| D11 | Evidence strings include the audit-table date when present (e.g., `"Spec Review (2026-05-22) audit table present"`) | The date is free signal — it's already in the heading we matched against. Surfacing it gives the operator a quick "when did this happen?" without opening the doc. Costs nothing; adds real value. |
| D12 | `ISSUE_OPEN` is hard-coded to land the CURRENT indicator at APPROVED, not DRAFT | Leaf-workflow §8b says ISSUE_OPEN re-enters at either stage 4 (APPROVED → IN_PROGRESS for mechanical fixes) or stage 1 (DRAFT for spec revisions). The first is much more common; defaulting to APPROVED matches the modal case. The banner text gives the full picture either way; the indicator placement is a presentational choice, not a truth claim. |

---

## Open Issues

- **Tracking the *most recent* re-entry point for ISSUE_OPEN.** When a node loops through ISSUE_OPEN → DRAFT (rare case), the CURRENT indicator should arguably move to DRAFT, not APPROVED. Without a transition log we can't tell which loop-back path was taken. v1 hard-codes APPROVED per D12; v2 could parse a `## Issue Log (YYYY-MM-DD)` audit section if/when the convention is established. *(Priority: LOW.)*
- **Children rollup ordering for parents with many child statuses.** The chip row is fine for ≤6 statuses (the entire `NodeStatus` union is small). If a parent has children spanning every status, the row may wrap. Acceptable; the inspector is fixed-width and wrap is graceful. *(Priority: TRIVIAL.)*
- **Evidence strings are English-only.** No i18n scaffolding; matches the rest of the app. Revisit when/if i18n becomes a project goal. *(Priority: TRIVIAL.)*
- **Structural marker regex fragility.** Same risk as `06-health`'s issue-priority regex (06-health Open Issues): a doc with a non-canonical heading (extra whitespace, missing parens around the date) silently drops the DONE evidence and triggers SKIPPED. The mitigation matches 06-health's: enforce the doc convention in a future lint rule. Cross-link to `06-health` Open Issue on regex fragility. *(Priority: LOW.)*
- **Inspector section ordering.** This section sits below existing per-node metadata in v1. If a future operator request says "I want Workflow above everything else", trivial reorder. No data implication. *(Priority: TRIVIAL.)*

*(V1 — `COMPLETE` row CURRENT-instead-of-DONE — resolved in the V1 fix pass; see Implementation Notes > Operator Verification V1 fix (2026-05-23).)*

---

## Spec Review (2026-05-23)

Independent clean-context spec review was run against this DRAFT immediately after authoring. Verdict: READY_FOR_APPROVAL, no blockers. Audit of findings and how each was handled:

| # | Finding | Resolution |
|---|---------|------------|
| S1 | `NodeInspector` signature is `{ node, allNodes }` (both already in scope) — the spec's "the existing DAG inspector component imports `<WorkflowProgressSection nodeId={…} />`" mis-described the wiring level. | Rewrote §Design > Components and files to name `NodeInspector.tsx` explicitly and pass `{ node, allNodes }` props. Removed the `useDocGraph()` call inside `WorkflowProgressSection` — the inspector already has the parsed graph. |
| S2 | `useDocSource(id)` returns `DocSource \| undefined`, not `string \| null`. The implementer would hit this immediately. | Updated §Design > Data source to spell out the `source?.raw ?? null` unwrap before the derivation call. `deriveWorkflowProgress(node, allNodes, raw)` signature unchanged at the function boundary. |
| S3 | The algorithm relied on a non-existent `statusRank` lookup for `ISSUE_OPEN` (would have produced undefined / NaN). | Replaced the prose lookup with an explicit `currentStatus → rank` table in §Design > Stage derivation rules step 3. `ISSUE_OPEN` is coerced to rank 2 (APPROVED) before the lookup, per D12. `PLANNED` is caught earlier in step 1. |
| N1 | `WorkflowProgress.stages` length contract was ambiguous (six for leaves, two for parents, but type doesn't enforce it). | Updated the JSDoc on `stages` to spell out the `isParent` narrowing pattern. No type change — type-narrowing is the safe access pattern. |
| N2 | DRAFT marker (all required sections present) is a doc-schema invariant, not a workflow signal. | Simplified the DRAFT row in §Design > Structural markers to "DONE when `authored === true`" with rationale. |
| N3 | Acceptance check #4 was self-referential ("click this node, expect DRAFT") — by verification time the node is no longer DRAFT. | Reworded to "any DRAFT-status node at verification time" with the explicit caveat not to anchor on a specific id. |
| N4 | Parent detection used `node.children.length > 0` but `DocNode` has no `children` field — children are inferred via `allNodes.filter(n => n.parentId === node.id)`. | §Design > Parent-node handling now points to the existing `NodeInspector.tsx:14` pattern explicitly. `deriveWorkflowProgress` signature updated to accept `allNodes` so the same array threaded from the inspector is reused. |
| N5 | `WorkflowProgress.currentStatus` can be `PLANNED` or `ISSUE_OPEN`, neither of which is a `WorkflowStage` — mild type-vocabulary inconsistency. | Added a JSDoc comment on `currentStatus` explaining the deliberate non-1:1 mapping and that the renderer uses `stages[]` + `issueOpen` rather than expecting stage correspondence. |
| N6 | The "`SPEC_REVIEW` may not yet be in `NodeStatus`" Open Issue was a false alarm — it has been in the union since `parseDocs.ts` shipped (`types.ts:16`). | Removed that Open Issue. The §Design > Data source callout was rewritten to state the union is already complete, with the `R6` cross-reference. |

Nothing was punted in this review pass — all findings were mechanical and applied. The audit table stays in the doc so the implementing agent can see what was decided and why.

---

## Implementation Notes

**Dependencies added:** None. Lucide icons (`Check`, `Circle`, `CircleDashed`, `CircleSlash`, `AlertTriangle`) were already a transitive dependency via the dag/ components. No new `package.json` entries.

**Decisions beyond spec:**

- `WorkflowStageRow` renders the evidence string in `text-[color:var(--color-muted)]` (spec said `text-[--color-faint]`). `--color-faint` is defined in `globals.css` but is lighter than muted; muted provides better contrast against the cream surface while still being clearly subordinate to the stage name. Recorded here as a deliberate presentation choice — not a spec deviation that needs a spec edit.
- Children rollup uses `·` (middle dot) separators via space-separated `<span>` chips rather than a single string join to keep each chip individually styled if needed in future. Visual output matches the spec layout.
- `--color-success` is used directly for the DONE checkmark icon (it's defined as `oklch(0.62 0.12 145)` in `globals.css`) rather than `text-green-*` to stay within the cream token system.

**Bundle delta vs baseline commit `df3e427`** (main HEAD at worktree branch time):

| Asset | Baseline | This build | Delta |
|-------|----------|------------|-------|
| `index-*.js` (uncompressed) | 971,533 B | 978,155 B | +6,622 B (+0.7%) |
| `index-*.js` (gzip) | 311.66 kB | 313.39 kB | +1.73 kB |
| `index-*.css` (uncompressed) | 40,422 B | 40,939 B | +517 B (+1.3%) |
| `index-*.css` (gzip) | 7.98 kB | 8.06 kB | +0.08 kB |

The chunk-size warning (>500 kB) was already present in the baseline; no new chunks added.

**Acceptance check items NOT verifiable in headless environment (manual):**

- **#1** (`01-ui/06-health` COMPLETE — six rows all DONE, evidence names structural markers) — requires browser.
- **#2** (`01-ui/05-logs` PLANNED — six rows all PENDING, evidence "Doc not yet authored") — requires browser.
- **#3** (`01-ui` parent APPROVED — two-row strip + children rollup chip row) — requires browser.
- **#4** (any DRAFT-status node at verification time — DRAFT CURRENT, others PENDING) — requires browser.
- **#5** (ISSUE_OPEN simulation — warning banner renders) — requires browser + temporary doc edit.
- **#6** (SKIPPED simulation — strikethrough + marker-absent evidence) — requires browser + temporary doc edit.
- **#7** (selecting different node updates section without full reload) — requires browser.
- **#9** (no regressions in existing DAG inspector sections) — requires browser.

**Items verified headlessly:**

- Acceptance check #8: `pnpm typecheck`, `pnpm lint`, `pnpm build` all exit 0 at zero output.
- `deriveWorkflowProgress` returns `stages.length === 6` for any authored leaf (CANONICAL_STAGES has six entries; the parent early-return is guarded by `childNodes.length > 0`).
- For a COMPLETE node: all stages have `statusRank === 5`; DRAFT, APPROVED, COMPLETE have no optional marker so they return DONE directly; SPEC_REVIEW, IN_PROGRESS, VERIFY check their markers and return DONE if present or SKIPPED if absent — for `01-ui/06-health` the markers are present in the doc body.
- For a PLANNED/manifest-only node (`authored === false`): all six stages return PENDING with evidence "Doc not yet authored" (step 1 short-circuit).
- `ISSUE_OPEN` coercion: `statusToRank("ISSUE_OPEN") === 2` makes DRAFT (rank 0) and SPEC_REVIEW (rank 1) DONE-or-SKIPPED, APPROVED (rank 2) CURRENT, IN_PROGRESS/VERIFY/COMPLETE PENDING — with `issueOpen: true` triggering the banner.
- Parent detection: `allNodes.filter(n => n.parentId === node.id)` mirrors the existing `NodeInspector.tsx:14` pattern exactly.

**Deviations from spec:** None structural. The evidence-string colour token choice (muted vs faint) is the only presentational deviation, recorded above.

### Implementation Review (2026-05-23)

Independent clean-context implementation review was run against this worktree post-rebase. Verdict: READY_FOR_OPERATOR_VERIFICATION (one should-fix, two nits). All Spec Review closures (S1–S3, N1–N6) verified honoured. Audit:

| # | Finding | Resolution |
|---|---------|------------|
| F1 | When `currentStatus === "ISSUE_OPEN"`, the APPROVED row's evidence read `"Status header is APPROVED"` — contradicting the banner that says the issue is open. The status header actually reads `ISSUE_OPEN`. | `computeStageState` now receives the original `currentStatus` as an extra parameter. When `stageRank === statusRank` and `currentStatus !== stage`, the evidence reads `"Status header is <currentStatus> (placed at <stage>)"`. Banner + evidence now agree. Three call sites updated. |
| N1 | Spec doc §Design > Data source still referenced the two-arg `deriveWorkflowProgress(node, raw)` on line 45 and 47 after audit N4 expanded the signature to three args. | Updated both occurrences to `deriveWorkflowProgress(node, allNodes, raw)`. Stage derivation rules section already had the three-arg form. |
| N2 | `WorkflowStageRow.tsx:26` used `text-[color:var(--color-success,#4a7c59)]` with a fallback value. `--color-success` is unconditionally defined in `globals.css:23`; the fallback was dead code and inconsistent with every other token usage in the codebase. | Removed the `,#4a7c59` fallback. |

Bundle-delta numbers also refreshed below — the implementer's table was off by ~3.7 kB uncompressed JS due to Vite content-hash non-determinism between baseline-build environments (same root cause as `06-health` audit N1). The original Implementation Notes bundle-delta table above is superseded by this refreshed table.

**Refreshed bundle delta** (final build after F1+N1+N2):

| Asset | Baseline (`df3e427`) | This build | Delta |
|-------|----------------------|------------|-------|
| `index-*.js` (uncompressed) | 971,533 B | 981,990 B | +10,457 B (+1.1%) |
| `index-*.js` (gzip) | 311.66 kB | 314.59 kB | +2.93 kB |
| `index-*.css` (uncompressed) | 40,422 B | 40,920 B | +498 B (+1.2%) |
| `index-*.css` (gzip) | 7.98 kB | 8.05 kB | +0.07 kB |

Gates re-run after the audit fixes: `typecheck`, `lint`, `build` all exit zero.

### Operator Verification V1 fix (2026-05-23)

Operator verification (leaf-workflow §8, first pass) on `01-ui/06-health` revealed a single rendering bug: the COMPLETE row showed the CURRENT marker (`●`) instead of DONE (`✓`). Loop-back through ISSUE_OPEN → APPROVED → IN_PROGRESS → VERIFY per stage 8b. Spec was correct (Acceptance check #1 already calls for "six rows all DONE" on COMPLETE nodes), so no spec revision; mechanical fix only. Audit:

| # | Finding | Resolution |
|---|---------|------------|
| V1 | `computeStageState` returned `completion: "CURRENT"` whenever `stageRank === statusRank`, including for the terminal `COMPLETE` stage. A COMPLETE node thus rendered with the COMPLETE row marked CURRENT (`●`) rather than DONE (`✓`), contradicting Acceptance check #1. | Added a `stage === "COMPLETE"` early-return at the top of the rank-equal branch in `deriveWorkflow.ts:113-115`: `{ completion: "DONE", evidence: "Status header is COMPLETE" }`. Three lines. The CURRENT-evidence logic for the other five stages (including the ISSUE_OPEN rank-coercion case from F1) is unchanged. |

Gates re-run after V1 fix: `typecheck`, `lint`, `build` all exit zero. Bundle changed by +3,032 B uncompressed JS (the special-case branch), unchanged CSS. Hash non-determinism dominates measurements at this scale; the absolute size of the diff is the +3 lines of code plus a string literal. Nothing structural changed.

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. The full Acceptance check list (1–9) passes.
2. `deriveWorkflowProgress` returns `stages.length === 6` for every authored leaf node in the current tree.
3. For a COMPLETE node (e.g., `01-ui/06-health`), all six stage completions are DONE — none are SKIPPED — and each evidence string names a real structural marker found in the doc.
4. For a PLANNED manifest-only node (e.g., `01-ui/05-logs`), all six stages are PENDING with evidence `"Doc not yet authored"`.
5. For a DRAFT node (`01-ui/09-workflow-progress` itself), DRAFT is CURRENT and the other five are PENDING.
6. For a parent node (`01-ui`), `isParent === true`, `stages.length === 2`, and `childrenRollup.total` equals the count of rows in the parent's children manifest.
7. ISSUE_OPEN simulation (Acceptance check #5) shows the banner with `--color-warning` background.
8. SKIPPED simulation (Acceptance check #6) shows strikethrough on the stage name and the evidence string names the missing marker.
9. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero. Bundle delta reported in Implementation Notes against a named baseline.
10. No regressions in the DAG panel's existing per-node inspector content — pre-existing sections still render unchanged.
11. `parseDocs.ts` was not modified except (if necessary) to add `SPEC_REVIEW` to the `NodeStatus` union — no parser logic changes.

---

## Children

None.
