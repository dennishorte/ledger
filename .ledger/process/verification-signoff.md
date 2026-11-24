# Per-Requirement Sign-Off Format

The structured output every independent review in `plan-workflow.md` produces. It replaces the freeform "verdict + findings by severity" with a **row-per-requirement sign-off matrix**, so a review cannot pass without confronting each requirement individually, with evidence.

The person who wrote an artifact cannot reliably check their own work, so the check runs in an independent context and is forced into a shape that a rubber stamp cannot satisfy. A fresh context supplies the independence. This format supplies the check.

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
- The rows a review uses are the ones `.ledger/process/plan-workflow.md` names.
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

The reviewer returns `disposition` (one of those three words), the matrix, findings, and a short summary. A finding names the row, the severity, the description, and whether it is mechanical. A finding on a `PASS` or `N/A` row does not change that verdict and is not applied. If the summary names a different disposition than the table, the table wins.

`applied` is valid only on a `FAIL`. It records that the edit landed and does not remove the `FAIL`. A new session reviews the repaired artifact. `waived` is valid only on a `PARTIAL`. A `PARTIAL` is closed only by `waived`.

## The three steps

Spec review and implementation review do the same three steps.

1. **Record, before any status change.** Write the matrix into the plan's Reviews section in its own commit. Status stays on the current step. Resolution cells start empty. Newest matrix last.

2. **Repair, then review again.** A failed row is repaired without asking the person. An agent who did not write the review makes the edit the row determines. The person is asked in two cases. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements. When a failed row is being repaired, the repair also makes each suggestion that names one edit. The next review covers the rows that repair can change. The review of that repair includes any row whose evidence that edit changed. A new session reviews the repaired artifact. `applied` records that the edit landed and does not remove the `FAIL`. The earlier review stays. A FAIL leaves the step where it is. When no row failed, no suggestion is applied. When no row failed, the step advances, and the suggestions stay on the review for a later change to find. When no row failed, the person does not have to read the suggestions for the step to pass. The new review is a new dated section. The latest section is the one that counts. The earlier section stays.

3. **Advance on `pass`.** When the disposition is `pass`, the plan advances as `plan-workflow.md` says. The review does not accept the finished work. The person running the project does that.

`followups` and `changes-required` stop. The matrix is already in the plan. A review failure does not move the plan. It stays on that step.

On `followups`, the operator may write `waived` on a partial and file an Open Issue. Disposition is computed again from the table above. The node advances only when that disposition is `pass`.

On `changes-required`, a failed row is repaired without asking the person. An agent who did not write the review makes the edit the row determines. The person is asked in two cases. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements. The next review covers the rows that repair can change.

A heading is not a pass. On a later entry, `pass` advances without a new dispatch. `changes-required` is repaired without asking the person, and a new session reviews the rows that repair can change. `followups` stops for the operator and does not dispatch. A skipped spec review writes no review section and no synthetic matrix. The approve commit says that no formal review was run.

The reviewer writes the matrix into the doc and recomputes. The reviewer does not change the artifact. The reviewer does not change lifecycle status. An agent who did not write the review makes the edit the row determines. After a repair, a new session reviews the repaired artifact and follows the disposition.

---

## Where it lands

The matrix is recorded in the plan's Reviews section, newest last.

- Findings by severity remain a secondary grouping. The matrix is primary. A review record written before this result existed keeps the word it was written with.

---

## Notes

- The matrix does **not** replace severity-grouped findings. Keep both. Lead with the matrix.
- A check that needs a person is `N/A` with the reason "operator gate". That row does not by itself change the disposition. The person's acceptance is the sign-off for the finished work.
- This format is the per-requirement half of the self-audit mitigation. The independence half is a review that runs in a fresh context, as `plan-workflow.md` requires.
