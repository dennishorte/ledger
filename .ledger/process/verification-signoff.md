# Per-Requirement Sign-Off Format

The structured output every independent review produces — spec review (leaf-workflow stage 2), implementation review (stage 6), and their dispatched equivalents (`spec_review` / `verify` / `reverify` task personas). It replaces the freeform "verdict + findings by severity" with a **row-per-requirement sign-off matrix**, so a review cannot pass without confronting each requirement individually, with evidence.

This is the framework's standing mitigation for the **self-audit problem** (PRD §11): the agent that wrote an artifact cannot reliably check its own work, so the check runs in an independent context *and* is forced into a shape that rubber-stamping cannot satisfy. Independence (clean context) supplies the *who*; this format supplies the *rigor*.

---

## The matrix

The review's primary artifact is a table with exactly one row per checkable item:

```markdown
| # | Item (verbatim or tight paraphrase) | Verdict | Evidence |
|---|-------------------------------------|---------|----------|
| R1 | <a Requirements bullet>            | PASS    | server/src/x.ts:42; `pnpm test` green (88/88) |
| R2 | <a Requirements bullet>            | FAIL    | no handler for the empty-input case — x.ts:60 throws |
| A1 | <an Acceptance-check item>          | PARTIAL | renders, but sort order wrong; follow-up filed |
| A2 | <an Acceptance-check item>          | N/A     | browser-only; code-present, not run headless |
```

**What gets a row:**
- **Spec review** — the requirements-fidelity rows below, then one row per PRD §-coverage item the spec must address, plus one per Requirements bullet the spec declares. The matrix *is* the coverage matrix. Fidelity leads.
- **Implementation review / verify / reverify** — one row for the Requirements text itself (unchanged since confirmation, or an amendment is recorded), then one row per **Requirements** bullet *and* one per **Acceptance-check** item in the spec. Nothing is implicitly covered.

### Requirements fidelity (spec review)

These rows come before the coverage rows. They check the design against the confirmed requirements, not the spec against itself.

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| F1 | Acceptance line, verbatim | PASS / FAIL | Which Requirements bullet and which part of Design serves it. A line nothing serves is FAIL. |
| F2 | Requirements bullet, verbatim | PASS / FAIL | Which acceptance line it traces to. A bullet that traces to no line is FAIL — scope the confirmation did not contain. |
| F3 | Requirements text matches the confirmation commit | PASS / FAIL | `git` diff against the commit that set `**Requirements confirmed:**`, or the `**Requirements amended:**` line that explains the difference. |

A Requirements bullet that names a file, a component, a library, or a mechanism is a design decision sitting in the wrong section. Record that as FAIL on its F2 row.

A node that reached DRAFT before the confirmation line existed gets F3 as `N/A` with that reason. Do not invent a confirmation retroactively.

### Requirements text (implementation review)

One row, ahead of the per-bullet rows:

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| R0 | Requirements unchanged since confirmation, or an amendment is recorded | PASS / FAIL / N/A | Diff of the Requirements section against the confirmation commit. A rewrite that makes the code look on-target, with no `**Requirements amended:**` line, is FAIL. N/A when the node predates the confirmation line. |

This row does not re-open design-versus-goal. Stage 2's fidelity rows already did that. R0 checks that the frozen text did not move during implementation.

---

## Verdicts

| Verdict | Meaning |
|---------|---------|
| **PASS** | Met, *and* backed by concrete evidence. |
| **FAIL** | Not met, or met but unverifiable (see evidence discipline). |
| **PARTIAL** | Partly met; a follow-up Open Issue is filed in the same pass (cite its priority). |
| **N/A** | Genuinely out of scope for this artifact (deferred item, browser-only check in a headless run). Must say *why*. |

**Evidence discipline — the load-bearing rule.** A `PASS` must cite something checkable: a `file:line`, a gate exit (`pnpm typecheck` exit 0), a named test, or a quoted spec clause. "Looks correct" / "seems fine" is not evidence. **A row that claims PASS with no concrete evidence is recorded as FAIL.** This is what makes the matrix resistant to self-audit: vague approval is structurally invalid, not merely frowned upon.

---

## Aggregate verdict — derived, not asserted

The headline verdict must be *derivable* from the matrix, not stated independently of it. The fidelity rows (F1–F3) and the R0 row are part of the matrix for this purpose:

- any **FAIL** → `NEEDS_REVISIONS` (or `NEEDS_MAJOR_REVISIONS` if a FAIL is on a core Requirement)
- no FAIL, ≥1 **PARTIAL** with filed follow-ups → `READY_WITH_FOLLOWUPS` (verify) / `NEEDS_MINOR_REVISIONS` (spec review)
- all **PASS / N/A** → `READY_FOR_COMPLETE` (verify) / `LGTM` (spec review)

If the stated verdict and the matrix disagree, the matrix wins and the review is incomplete.

---

## Where it lands

The matrix is durable provenance, exactly like the existing audit tables (`leaf-workflow.md` "Audit tables as durable provenance"):

- A **spec review** matrix lands in the spec's `Spec Review (YYYY-MM-DD)` section (between Open Issues and Implementation Notes), alongside or in place of the older finding table.
- An **implementation review** matrix lands in the `Implementation Review (YYYY-MM-DD)` subsection of Implementation Notes.
- A **dispatched** reviewer (`spec_review` / `verify` / `reverify`) emits the matrix as its review body and references it in the `runner.complete_task` / `runner.await_human_review` call. Findings by severity (Blocking / Should-fix / Nit) remain a useful *secondary* grouping for FAIL/PARTIAL rows, but the matrix is primary.

---

## Notes

- The matrix does **not** replace severity-grouped findings — it subsumes the pass/fail signal and references the findings for the rows that are not PASS. Keep both; lead with the matrix.
- Acceptance items that genuinely require human eyes (browser walk-through) are `N/A` for a headless dispatched verifier with the reason "operator gate" — they move the task to `await_human_review` rather than `complete_task`. The operator's browser pass is the real sign-off for those rows (leaf-workflow stage 8).
- This format is the per-requirement half of the self-audit mitigation. The independence half (review runs in a fresh context / separate dispatched persona) is already in place — leaf-workflow stages 2 & 6 and the `spec_review`/`verify`/`reverify` task personas.
