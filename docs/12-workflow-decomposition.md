# Workflow Decomposition Checkpoint

**Node ID:** `12-workflow-decomposition`
**Parent:** `00-project`
**Status:** VERIFY
**Created:** 2026-06-11
**Last Updated:** 2026-06-11
**Dependencies:** `.ledger/process/leaf-workflow.md`, `.ledger/process/decomposition.md`, `docs/00-project.md` §6.6

---

## Requirements

### In scope

- R1: Add a decomposition checkpoint to `.ledger/process/leaf-workflow.md` at the end of stage 1 — a short, opinionated decision-tree the operator runs against the freshly-drafted DRAFT spec before submitting it for spec review.
- R2: The checkpoint is a bulleted break-if-yes signal list (≤6 bullets, scannable in under 30 seconds) drawn directly from PRD §6.6's decompose-when predicate.
- R3: If any signal fires the operator exits to `.ledger/process/decomposition.md` instead of advancing to stage 2; the checkpoint text must say so explicitly with the reference path.
- R4: The checkpoint introduces no new lifecycle state, no extra commit, and no new tooling — it is a pure text addition to an existing process doc.
- R5: The signal list must be tight enough to produce a clear binary answer: decompose or proceed. Ambiguous "it depends" signals are out — they belong in `decomposition.md` Step 0 prose, which already handles the nuanced cases.

### Out of scope (v1)

- Automated enforcement (task-runner gate that refuses to advance DRAFT → SPEC_REVIEW without a recorded checkpoint answer).
- A separate `doc_decompose` task that triggers automatically when the checkpoint fires.
- Any changes to `decomposition.md`, PRD §6.6, or other process docs beyond `leaf-workflow.md`.
- UI surface — this is a process-doc change only.
- E2E tests — no code surface introduced.

---

## Design

### File changed

```
.ledger/process/leaf-workflow.md
```

One section is added. No other files are modified.

### Checkpoint placement

At the end of **stage 1 ("DRAFT — author the spec")**, after the list of required spec sections and the "add to parent manifest" instruction, insert a new subsection:

```
#### Decomposition checkpoint — before advancing to stage 2

Run these signals against the freshly written DRAFT. If **any** fire, stop and follow
`.ledger/process/decomposition.md` instead of proceeding to stage 2.

- **Unrelated concerns:** you can name ≥2 prospective child responsibilities with
  non-overlapping data contracts (different files, types, or endpoints each would own).
- **Single-implementer breach:** one agent cannot ship the full node in one worktree
  session without itself having to dispatch sub-agents.
- **Size already large:** the DRAFT spec is already pushing the token-size threshold
  (default 12 000 tokens) or the implementation diff is clearly unbounded.
- **Depth headroom exhausted:** this node already sits at nesting level 4, so any
  children would exceed the depth cap with no written coordination justification in the
  parent's Decisions section.
- **≥3 independent top-level files:** the Design section lists ≥3 files that have no
  shared type or interface dependency — a strong proxy for hidden multi-responsibility.

If none fire, the node is a leaf. Proceed to stage 2.
```

### Signal rationale map

| Signal | §6.6 rule it encodes |
|--------|---------------------|
| Unrelated concerns | Rule 1 (single responsibility — primary test) |
| Single-implementer breach | Rule 2 (recursion floor) |
| Size already large | Rule 3 (size floor) |
| Depth headroom exhausted | Rule 4 (depth cap) |
| ≥3 independent top-level files | Rule 1 proxy — cheaper to evaluate than enumerating full data-contract overlap |

### Acceptance checks

- A1: The checkpoint subsection appears verbatim in stage 1 of `.ledger/process/leaf-workflow.md`, positioned after the parent-manifest instruction and before the next stage heading.
- A2: The text explicitly names `.ledger/process/decomposition.md` as the exit target when any signal fires.
- A3: Every signal is traceable to a §6.6 rule (no signals invented outside the canonical leaf/decompose predicate).
- A4: The checkpoint adds no new lifecycle state — the Status lifecycle diagram in the doc is unchanged.
- A5: No other file is modified by the implementation.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | End of stage 1, before stage 2 — not before stage 1 | The checkpoint needs a DRAFT spec to evaluate; running it before authoring produces false negatives (empty doc is always small and single-responsibility). The operator writes the DRAFT first, then decides whether it should be decomposed. |
| D2 | Bulleted break-if-yes signals, not a prose paragraph | The stage 1 operator is in authoring mode, not reading mode. A scannable list that fires YES/NO per signal is usable under cognitive load; prose requires re-reading. Parallels decomposition.md Step 0 but is even tighter — five bullets, each actionable. |
| D3 | ≥3 independent top-level files as a proxy for Rule 1 | Enumerating full data-contract overlap (Rule 1's precise test) is expensive during spec authoring. Counting independent top-level files in the Design section is a cheaper, reliable proxy: if three files share no types, the node almost certainly carries ≥2 non-overlapping responsibilities. False positives are low because the full Rule 1 test in decomposition.md Step 0 is the real arbiter — the proxy just flags candidates. |
| D4 | No new lifecycle state | Decomposition is a shape change, not a lifecycle transition (decomposition.md Notes). Inserting a `DECOMPOSE_CHECK` state would be wrong in principle (the DRAFT hasn't been reviewed yet) and wrong in practice (it multiplies states without adding enforcement value). |
| D5 | Reference decomposition.md explicitly, not inline procedure | The full decomposition procedure is already in decomposition.md. Duplicating it in leaf-workflow.md would drift. The checkpoint's only job is to decide whether to leave the leaf-workflow entirely; the destination doc owns the what-to-do-next logic. |

---

## Open Issues

- **LOW — No automated enforcement of the checkpoint.** An operator can read the checkpoint, see signals fire, and proceed anyway. The fix is a task-runner gate that requires a recorded checkpoint verdict before DRAFT → SPEC_REVIEW is allowed; deferred until dispatch is the default path and gate primitives are cheap to add. For now the checkpoint is a forcing-function convention, not a hard wall.

---

## Spec Review (2026-06-11)

| # | Finding | Resolution |
|---|---------|------------|
| 1 | Should-fix: Signal 4 "Depth headroom exhausted" wording pointed in the wrong direction — "adding this leaf" read as a test on whether to add a node rather than whether to decompose the current DRAFT. Rewording to fire when the current node is at depth 4 and children would exceed the cap. | applied |
| 2 | Nit: Verification section repeated Acceptance checks verbatim from Design with no verifier-specific callouts. Collapsed into a forward reference plus one mechanical check per item. | applied |

---

## Implementation Notes

**v1 — 2026-06-11**

- Single file changed: `.ledger/process/leaf-workflow.md`. No code, no deps, no bundle delta.
- Checkpoint subsection inserted verbatim from Design §Checkpoint placement at line 47 of `leaf-workflow.md`, after the "Add the new node to its parent's children manifest" line (line 45) and before `### 2.` (line 66).
- All five signals map to §6.6 rules per the rationale table in Design §Signal rationale map.
- Lifecycle diagram in leaf-workflow.md is byte-for-byte identical to pre-implementation — A4 confirmed.
- Gate results: typecheck exit 0, lint exit 0, build exit 0. No TypeScript files changed; gates confirm baseline health.
- E2E: N/A — no UI or API surface introduced (spec Verification §E2E, out-of-scope R1–R5).

### Implementation Review (2026-06-11)

**Verdict:** READY_FOR_COMPLETE

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | Checkpoint subsection present in leaf-workflow.md | PASS | `grep -n "Decomposition checkpoint" .ledger/process/leaf-workflow.md` confirms subsection at correct position |
| 2 | Exit instruction names decomposition.md verbatim | PASS | `grep "decomposition.md" .ledger/process/leaf-workflow.md` confirms reference |
| 3 | All signals map to §6.6 rules | PASS | Rationale table in Design §Signal rationale map covers all five signals |
| 4 | Lifecycle diagram unchanged | PASS | No new lifecycle states; Implementation Notes A4 confirmed |
| 5 | Only leaf-workflow.md changed (plus this doc + parent manifest) | PASS | Single file change; no code, no deps, no bundle delta |
| 6 | Gates pass (typecheck, lint, build) | PASS | Recorded in v1 Implementation Notes — no TS files changed |

**Applied:** none (findings list was empty)
**Skipped:** none

---

## Verification

This node introduces no UI panel and no API endpoint. The only artifact is a text change to `.ledger/process/leaf-workflow.md`.

See Design §Acceptance checks (A1–A5) for the full acceptance criteria. Verifier confirms each by:

- A1: `grep -n "Decomposition checkpoint" .ledger/process/leaf-workflow.md` — confirm the subsection appears after the "Add the new node to its parent's children manifest" line and before the stage 2 heading.
- A2: `grep "decomposition.md" .ledger/process/leaf-workflow.md` — confirm the exit instruction names `.ledger/process/decomposition.md` verbatim.
- A3: Cross-check each signal against the rationale map in Design §Signal rationale map — every signal should map to a numbered §6.6 rule.
- A4: `git diff main -- .ledger/process/leaf-workflow.md | grep "lifecycle\|DRAFT\|SPEC_REVIEW\|APPROVED\|IN_PROGRESS\|VERIFY\|COMPLETE"` — confirm no lifecycle diagram lines changed (the diagram block is byte-for-byte identical to pre-implementation).
- A5: `git diff --name-only main` — confirm only `leaf-workflow.md` (and this node's doc + parent manifest) changed.

E2E: No Playwright tests required — no UI or API surface introduced. "Passes existing suite" applies.

---

## Children

None. Single responsibility (one text edit to one process doc), single implementer, bounded diff — leaf per §6.6.
