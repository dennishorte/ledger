# Review Process

**Node ID:** `14-review-process`
**Parent:** project root (`docs/00-project.md`)
**Status:** SPEC_REVIEW
**Created:** 2026-11-13
**Last Updated:** 2026-11-13
**Dependencies:** `11-workflow-scripts`, `06-agent-dispatcher/04-prompt-templates`

---

## Requirements

**Requirements confirmed:** 2026-11-13

**Outcome.** Spec review and implementation review are specified once, and the places that specify them agree.

**Acceptance.**

- The playbook, the workflow script, and the reviewer prompts judge a review the same way. Comparing them shows one definition. None of them carries its own list of verdict words.
- Both reviews follow the same steps. The review is written into the node before the status changes. A fix the review fully specifies is applied. The node advances only when every row passed.
- When a row is only partly met, both reviews stop for the operator, and the operator's decision is written on that row. When a row fails, the work is changed and that review runs again.
- The spec review still checks the design against the confirmed requirements. The implementation review still checks the code against the approved spec, including the build, lint, types, and tests.
- Review records already written on finished nodes keep the words they were written with.

**Constraints.**

- The operator's sign-off is still what marks a node complete.
- The operator may still skip spec review on a small spec they trust. Implementation review still cannot be skipped.
- No new lifecycle status.
- An amendment that adds an outcome still goes back through spec review.

**Out of scope.**

- Reviewing finished nodes again under the new rules.
- A task-runner gate that refuses to complete a node when no independent review ran.
- Changing how requirements are confirmed before design.

## Design

One review result, defined in one place. Spec review and implementation review both emit it and both follow the same three steps. They still check different things.

Decomposition checkpoint, run against this draft: none of the signals fire. The files below share one contract, the review result. One implementer can land the edit in one session. The spec is under the size cap. This node sits at depth 1. The "three independent files" signal does not fire, because the files share that contract.

### Files

Edited:

```
.ledger/process/verification-signoff.md          # the only definition of the result
.ledger/process/leaf-workflow.md                 # stages 2, 3, 6, 7 cite it
.claude/workflows/leaf-workflow.js               # schema, prompts, record-then-branch
server/src/dispatcher/prompts/shared.ts          # reminder + three personas
server/src/dispatcher/prompts/specReview.ts
server/src/dispatcher/prompts/verify.ts
server/src/dispatcher/prompts/reverify.ts
server/test/dispatcher/prompts/*.snapshot.test.ts  # regenerated from the prompts
```

Two finished specs quote the old verdict lists as if they were current. Replace those quotations with a pointer to `verification-signoff.md`. Do not edit any other paragraph:

```
docs/11-workflow-scripts/00-workflow-scripts.md          # the REVIEW_SCHEMA block only
docs/06-agent-dispatcher/04-prompt-templates.md          # persona sentences that list headline verdicts
```

Not edited: every existing `Spec Review` and `Implementation Review` section, `leaf-workflow-finish.js`, `maintenance-round.md` (it cites stage 2 and lists no verdict words), and the task runner. After the playbook edits, run `.claude/scripts/sync-process` so registered children receive the two process docs.

### The result

`verification-signoff.md` is the only place that says how a review is judged. The playbook, the script, and the prompts name the legal words and point there. They do not restate the mapping.

Row verdicts stay `PASS`, `FAIL`, `PARTIAL`, `N/A`. A `PASS` without something checkable is stored as `FAIL`.

Disposition is a function of the rows only:

| Rows | Disposition |
|---|---|
| Any `FAIL` | `changes-required` |
| No `FAIL`, at least one `PARTIAL` | `followups` |
| Every row `PASS` or `N/A` | `pass` |

Severity does not change the disposition. A finding does not outvote the table.

The reviewer returns:

- `disposition` — one of those three words
- the matrix
- findings, each with `rowId`, `severity` (`Blocking`, `Should-fix`, `Nit`), `description`, `fix`, `isMechanical`
- a short summary

Every finding names a row. A finding on a `PASS` or `N/A` row is mechanical. If the summary names a different disposition than the table, the table wins.

Headline words that new reviews do not use: `LGTM`, `READY_FOR_APPROVAL`, `READY_FOR_COMPLETE`, `READY_WITH_FOLLOWUPS`, `NEEDS_MINOR_REVISIONS`, `NEEDS_REVISIONS`, `NEEDS_MAJOR_REVISIONS`. A review record written before this node keeps the word it was written with. The living sources do not list those words.

### The three steps

Spec review and implementation review do the same three steps.

1. **Record, before any status change.** Write the matrix into the node in its own commit. Status stays `SPEC_REVIEW` or `VERIFY`. Columns:

   `| # | Item | Verdict | Evidence | Resolution |`

   Findings sit under the table. Resolution cells start empty. The spec-review section stays between Open Issues and Implementation Notes. The implementation-review subsection stays inside Implementation Notes.

2. **Apply a fully specified fix, then recompute.** A mechanical finding is one whose fix text is the whole edit. Set that row's resolution to `applied`. Disposition is computed again from rows that are still `FAIL` or `PARTIAL` and have an empty resolution.

3. **Advance only on `pass`.**
   - Spec review: the next commit moves `SPEC_REVIEW` → `APPROVED`.
   - Implementation review: status stays `VERIFY`, and the operator gate opens. The review does not mark the node complete.

Otherwise stop. The audit is already in the doc.

- A `PARTIAL` may be closed by the operator in either review. The resolution is `waived`, and an Open Issue is filed. When every open row is `applied` or `waived` and no `FAIL` remains, the recomputed disposition is `pass`, and step 3 runs.
- A `FAIL` is not waived. The work changes, and that review runs again. The implementation rerun is the existing `reverify` persona. It returns the same result shape, over the failed rows and any row the fix touched. It includes the requirements-text row when the fix touched Requirements.

A failure of the confirmation row (fidelity row F3, or implementation row R0) is `changes-required`. The fix is to put the text back, or to record an amendment. An amendment that adds an outcome still comes back through spec review.

On a later entry, a review section that already exists is not a pass. Advance only when the recomputed disposition is `pass`. A skipped spec review writes no review section and no synthetic matrix. The approve commit says that no formal review was run.

### What each review checks

Spec review rows, in order: fidelity F1, F2, F3, then one row per product-requirements item the spec must cover and one per Requirements bullet. The operator may still skip it on a small spec they trust.

Implementation review rows, in order: R0, then one row per Requirements bullet and one per acceptance check. The reviewer runs the build, lint, typecheck, and tests, and cites the exit codes. A check that needs a person in the browser is `N/A — operator gate`. This review cannot be skipped. Its prompt uses the stage-6 list in the playbook. It does not ask whether `meta` is a pure literal, and it does not ask whether stage coverage matches the playbook.

### Playbook, script, prompts

`leaf-workflow.md` stages 2, 3, 6, and 7 delete their headline-verdict lists and point at `verification-signoff.md` for the result and the three steps. Stage 2 keeps the skip. Stage 6 keeps the mandatory gate list. Stage 3's finding-only table is replaced by the five-column matrix.

`leaf-workflow.js` names `disposition` on the review object, with enum `pass`, `followups`, `changes-required`. The row verdict enum is unchanged. The spec-review and implementation-review prompts name their row set and point at the sign-off doc. They do not restate the mapping. Stage 3 and the implementation-review fix stage both record the audit before they branch. An unresolved `FAIL`, or a `PARTIAL` that is not `applied` or `waived`, returns `manual-needed` after that commit. The skip path does not synthesize `LGTM`.

`signOffMatrixReminder` names the three legal dispositions and points at the sign-off doc for which one applies. The `spec_review`, `verify`, and `reverify` preambles and success criteria do the same. `verify` still requires the gates. Snapshot tests are regenerated, and `pnpm -C server exec vitest run test/dispatcher/prompts` exits 0.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | `verification-signoff.md` is the only definition of the disposition. The playbook, the script, and the prompts point at it. | Acceptance 1. Restating the mapping is how the three lists drifted. |
| D2 | Three dispositions, and severity does not change them. | The row id already says whether a failure is the outcome or a side clause. A second headline for "major" versus "minor" is the split the sources could not keep aligned. |
| D3 | A `PARTIAL` is waivable in both reviews. A `FAIL` is not. | Acceptance 3. A partly met row means the same thing in both reviews: a recorded gap is waiting on the operator. The waiver is written on the row. |
| D4 | The audit commit does not change lifecycle status. The status commit happens only after the recomputed disposition is `pass`. | Acceptance 2. |
| D5 | The review object field is `disposition`, not a transition word. | A review cannot mark the node complete. The operator's sign-off still does that. `READY_FOR_COMPLETE` named a transition this review does not perform. |
| D6 | Historical `Spec Review` and `Implementation Review` sections stay word for word. | Acceptance 5. |
| D7 | `reverify` returns the same result shape, over a narrower row set. | Acceptance 3. A second vocabulary for the rerun would be another list. |

## Open Issues

None.

## Implementation Notes

*(none yet — pre-implementation)*

## Verification

The acceptance checks, now runnable. No new outcome.

1. **One definition.** From the repo root, this returns no matches:

   ```
   rg -n "LGTM|READY_FOR_APPROVAL|READY_FOR_COMPLETE|READY_WITH_FOLLOWUPS|NEEDS_MINOR_REVISIONS|NEEDS_REVISIONS|NEEDS_MAJOR_REVISIONS" \
     .ledger/process/verification-signoff.md \
     .ledger/process/leaf-workflow.md \
     .claude/workflows/leaf-workflow.js \
     server/src/dispatcher/prompts
   ```

   The `REVIEW_SCHEMA` block in `docs/11-workflow-scripts/00-workflow-scripts.md` and the persona sentences touched in `docs/06-agent-dispatcher/04-prompt-templates.md` name `pass`, `followups`, and `changes-required`, and do not contain those words. The rest of those two files is outside this check.

2. **Same steps.** In `.claude/workflows/leaf-workflow.js`, the spec-review record and the implementation-review record are each committed while status is unchanged. The status moves, or the operator gate opens, only when every `FAIL` and `PARTIAL` row has resolution `applied` or `waived`. `pnpm -C server exec vitest run test/dispatcher/prompts` exits 0, and the `spec_review`, `verify`, and `reverify` snapshots name the three dispositions.

3. **A partial stops, a failure is reviewed again.** The same script returns `manual-needed` when a `FAIL` has an empty resolution or a `PARTIAL` is not `applied` or `waived`, and that return happens after the audit commit. `reverify.ts` describes the same disposition and limits its rows to the previous failures plus rows the fix touched.

4. **The two reviews still check different work.** The spec-review prompt in the script and `specReview.ts` still require fidelity rows F1, F2, and F3. `verify.ts` still requires the build, lint, typecheck, and tests. The implementation-review prompt in the script does not contain `pure literal` or `stage coverage`. `leaf-workflow.md` still says the operator may skip spec review and may not skip implementation review.

5. **Old records stay.** `git diff` for the implementation does not change a heading matching `Spec Review` or `Implementation Review` in any doc other than this one.

No end-to-end test. This node changes process docs, a workflow script, and reviewer prompts. It adds no UI panel and no API endpoint.

The constraints, read off the playbook after the edit: the operator's sign-off is still the step that marks a node complete; no new lifecycle status appears; an amendment that adds an outcome is still sent back through spec review.

## Children

None.
