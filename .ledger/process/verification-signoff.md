# Per-Requirement Sign-Off Format

The structured output every independent review produces — spec review (leaf-workflow stage 2) and implementation review (stage 6). It replaces the freeform "verdict + findings by severity" with a **row-per-requirement sign-off matrix**, so a review cannot pass without confronting each requirement individually, with evidence.

This is the framework's standing mitigation for the **self-audit problem** (PRD §11): the agent that wrote an artifact cannot reliably check its own work, so the check runs in an independent context *and* is forced into a shape that rubber-stamping cannot satisfy. Independence (clean context) supplies the *who*; this format supplies the *rigor*.

---

## The matrix

The review's primary artifact is a table with exactly one row per checkable item:

```markdown
| # | Item (verbatim or tight paraphrase) | Verdict | Evidence | Resolution |
|---|-------------------------------------|---------|----------|------------|
| R1 | <a Requirements bullet>            | PASS    | server/src/x.ts:42; `pnpm test` green (88/88) | |
| R2 | <a Requirements bullet>            | FAIL    | no handler for the empty-input case — x.ts:60 throws | |
| A1 | <an Acceptance-check item>          | PARTIAL | renders, but sort order wrong; follow-up filed | |
| A2 | <an Acceptance-check item>          | N/A     | browser-only; code-present, not run headless | |
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

## The result

This is the only statement of which rows produce which result. Row verdicts stay `PASS`, `FAIL`, `PARTIAL`, `N/A`. A `PASS` without something checkable is stored as `FAIL`.

Disposition is a function of the latest matrix and the resolutions on it:

| Latest matrix | Disposition |
|---|---|
| Any `FAIL`, including one marked `applied` or `waived` | `changes-required` |
| No `FAIL`, and at least one `PARTIAL` that is not `waived` | `followups` |
| No `FAIL`, and every `PARTIAL` is `waived`, or every row is `PASS` or `N/A` | `pass` |

Severity does not change the disposition. A finding does not outvote the table.

The reviewer returns `disposition` (one of those three words), the matrix, findings, and a short summary. Every finding names a row (`rowId`) and has `severity` (`Blocking`, `Should-fix`, `Nit`), `description`, `fix`, and `isMechanical`. A finding on a `PASS` or `N/A` row does not change that verdict and is not applied. If the summary names a different disposition than the table, the table wins.

`applied` is valid only on a `FAIL`. It records that the edit landed and does not remove the `FAIL`. The next entry dispatches that review. `waived` is valid only on a `PARTIAL`. A `PARTIAL` is closed only by `waived`.

## The three steps

Spec review and implementation review do the same three steps.

1. **Record, before any status change.** Write the matrix into the node in its own commit. Status stays `SPEC_REVIEW` or `VERIFY`. Resolution cells start empty. The spec-review section stays between Open Issues and Implementation Notes. The implementation-review subsection stays inside Implementation Notes.

2. **Apply a fully specified fix, then review again.** `applied` is valid only on a `FAIL`. Set that resolution when the finding's fix text is the whole edit. The next entry dispatches that review. A spec-review rerun is a full spec review. An implementation rerun covers the rows this table calls failed, any row the fix touched, and the requirements-text row when the fix touched Requirements. The new review is a new dated section. The latest section is the one that counts. The earlier section stays.

3. **Advance on `pass`.** When the disposition is `pass`, spec review's next commit moves `SPEC_REVIEW` → `APPROVED`. Implementation review stays at `VERIFY`, and the operator gate opens. The review does not mark the node complete. The operator's sign-off still does that.

`followups` and `changes-required` stop. The audit is already in the doc. A review failure does not move the node. It stays at `SPEC_REVIEW` or `VERIFY`. `ISSUE_OPEN` is the operator rejecting during the walk.

On `followups`, the operator may write `waived` on a partial and file an Open Issue. Disposition is computed again from the table above. The node advances only when that disposition is `pass`.

On `changes-required`, the work changes, including when the review fully specified the fix, and that review runs again. Spec review repeats stage 2. Implementation review repeats stage 6 on the rows named in step 2, and runs the same checks as the review it follows.

A heading is not a pass. On a later entry, `pass` advances without a new dispatch. `changes-required` dispatches that review again. `followups` stops for the operator and does not dispatch. A skipped spec review writes no review section and no synthetic matrix. The approve commit says that no formal review was run.

The reviewer writes the matrix into the doc, applies a fully specified fix, and recomputes. The reviewer does not change lifecycle status. After a fix, the reviewer recomputes from this table and follows the disposition.

---

## Where it lands

The matrix is durable provenance, exactly like the existing audit tables (`leaf-workflow.md` "Audit tables as durable provenance"):

- A **spec review** matrix lands in the spec's `Spec Review (YYYY-MM-DD)` section (between Open Issues and Implementation Notes).
- An **implementation review** matrix lands in the `Implementation Review (YYYY-MM-DD)` subsection of Implementation Notes.
- Findings by severity remain a secondary grouping. The matrix is primary. A review record written before this result existed keeps the word it was written with.

---

## Notes

- The matrix does **not** replace severity-grouped findings. Keep both. Lead with the matrix.
- A check that needs a person is `N/A` with the reason "operator gate". That row does not by itself change the disposition. The operator's pass is the real sign-off for those rows (leaf-workflow stage 8).
- This format is the per-requirement half of the self-audit mitigation. The independence half is a review that runs in a fresh context — leaf-workflow stages 2 and 6.
