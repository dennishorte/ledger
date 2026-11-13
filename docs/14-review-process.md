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

**Requirements amended:** 2026-11-13 — the four constraints are also acceptance checks. No new outcome.

**Outcome.** Spec review and implementation review are specified once, and the places that specify them agree.

**Acceptance.**

- The playbook, the workflow script, and the reviewer prompts judge a review the same way. Comparing them shows one definition. None of them carries its own list of verdict words.
- Both reviews follow the same steps. The review is written into the node before the status changes. A fix the review fully specifies is applied. The node advances only when every row passed.
- When a row is only partly met, both reviews stop for the operator, and the operator's decision is written on that row. When a row fails, the work is changed and that review runs again.
- The spec review still checks the design against the confirmed requirements. The implementation review still checks the code against the approved spec, including the build, lint, types, and tests.
- Review records already written on finished nodes keep the words they were written with.
- The operator's sign-off is still what marks a node complete.
- The operator may still skip spec review on a small spec they trust. Implementation review still cannot be skipped.
- No new lifecycle status.
- An amendment that adds an outcome still goes back through spec review.

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

Two finished specs quote the old verdict lists as if they were current. Replace those quotations with a pointer to `verification-signoff.md`. In `docs/11-workflow-scripts/00-workflow-scripts.md`, also replace two sentences that describe the old procedure: the skipped spec review proceeds with a synthetic `REVIEW_SCHEMA`, and stage 3 is one commit that both records the review and approves. Do not edit any other paragraph:

```
docs/11-workflow-scripts/00-workflow-scripts.md          # REVIEW_SCHEMA block, plus those two sentences
docs/06-agent-dispatcher/04-prompt-templates.md          # persona sentences that list headline verdicts
```

Not edited: every existing `Spec Review` and `Implementation Review` section, `leaf-workflow-finish.js`, `maintenance-round.md` (it cites stage 2 and lists no verdict words), and the task runner. After the playbook edits, run `.claude/scripts/sync-process` so registered children receive the two process docs.

### The result

`verification-signoff.md` is the only place that says how a review is judged, including which rows produce which disposition. The playbook and the prompts point there. They do not restate the mapping, and they do not list the disposition words. The script schema's `disposition` field is the closed set of legal values. It does not say when each value applies. That set is not a second definition. A list of verdict words, in the acceptance line, is a statement of which result to reach.

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

2. **Apply a fully specified fix, then recompute.** A mechanical finding is one whose fix text is the whole edit. Set that row's resolution to `applied`. A mechanical `FAIL` is not reviewed again. Disposition is computed again from rows that are still `FAIL` or `PARTIAL` and have an empty resolution.

3. **Advance only on `pass`.** That is when no `FAIL` remains and every `PARTIAL` is `applied` or `waived`. A waived row is the operator's decision on a partial. It is not a passed row, and a `FAIL` cannot be closed that way.
   - Spec review: the next commit moves `SPEC_REVIEW` → `APPROVED`.
   - Implementation review: status stays `VERIFY`, and the operator gate opens. The review does not mark the node complete. The operator's sign-off still does that.

Otherwise stop. The audit is already in the doc. A review failure does not move the node. It stays at `SPEC_REVIEW` or `VERIFY`. `ISSUE_OPEN` stays the step where the operator rejects during the walk. This node does not edit that step, and it adds no lifecycle status.

- A `PARTIAL` may be closed by the operator in either review. The resolution is `waived`, and an Open Issue is filed. When no `FAIL` remains and every `PARTIAL` is `applied` or `waived`, the recomputed disposition is `pass`, and step 3 runs.
- A `FAIL` is not waived. A mechanical `FAIL` is `applied` and is not reviewed again. Any other `FAIL`: the work changes, and that review runs again.
  - Spec review: dispatch stage 2 again. The new review is a new dated section. The latest section is the one that counts. The earlier section stays. A heading is not a pass. The script does not treat the existence of a Spec Review heading as review-done while the latest section still has a non-mechanical `FAIL` with an empty resolution.
  - Implementation review: the `reverify` persona. It returns the same result shape, over the failed rows, any row the fix touched, and the requirements-text row when the fix touched Requirements. Its preamble does not describe `ISSUE_OPEN` as the place a review failure is stored.

A failure of the confirmation row (fidelity row F3, or implementation row R0) is `changes-required`. The fix is to put the text back, or to record an amendment. An amendment that adds an outcome still comes back through spec review.

On a later entry, a review section that already exists is not a pass. If the latest section recomputes to `pass`, advance. If it is `followups` and the operator has waived the open partials, recompute and advance without a new dispatch. If a non-mechanical `FAIL` is still unresolved, dispatch that review again. A skipped spec review writes no review section and no synthetic matrix. The approve commit says that no formal review was run.

The dispatched reviewer does these same three steps inside its task. It writes the matrix and does not change lifecycle status. It applies mechanical fixes and recomputes. `pass` ends with `runner.complete_task`. `followups` and `changes-required` end with `runner.await_human_review` and the open rows. It does not call `runner.complete_task` on a non-pass, and it does not call `runner.fail_task` for a review that reached a judgment.

### What each review checks

Spec review rows, in order: fidelity F1, F2, F3, then one row per product-requirements item the spec must cover and one per Requirements bullet. The operator may still skip it on a small spec they trust.

Implementation review rows, in order: R0, then one row per Requirements bullet and one per acceptance check. The reviewer runs the build, lint, typecheck, and tests, and cites the exit codes. A check that needs a person in the browser is `N/A — operator gate`. This review cannot be skipped. Its prompt uses the stage-6 list in the playbook. It does not ask whether `meta` is a pure literal, and it does not ask whether stage coverage matches the playbook.

### Playbook, script, prompts

`leaf-workflow.md` stages 2, 3, 6, and 7 delete their headline-verdict lists and point at `verification-signoff.md` for the result and the three steps. Stage 2 keeps the skip. Stage 6 keeps the mandatory gate list. Stage 3's finding-only table is replaced by the five-column matrix.

`leaf-workflow.js` names `disposition` on the review object. The schema enum is `pass`, `followups`, `changes-required`, and the schema does not say when each applies. Findings require `rowId` plus the fields they have today. The row verdict enum is unchanged. The spec-review and implementation-review prompts name their row set and point at the sign-off doc. They do not list the disposition words and do not restate the mapping. Stage 3 and the implementation-review fix stage both record the audit before they branch. They return `manual-needed` after that commit when a `FAIL` has an empty resolution or a `PARTIAL` is not `applied` or `waived`. They advance only when no `FAIL` remains and every `PARTIAL` is `applied` or `waived`. The skip path does not synthesize a review result.

`signOffMatrixReminder` points at the sign-off doc and does not list the disposition words. The `spec_review`, `verify`, and `reverify` preambles and success criteria do the same, and they name the terminal call for each disposition. `verify` still requires the gates. Snapshot tests are regenerated, and `pnpm -C server exec vitest run test/dispatcher/prompts` exits 0.

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
| D8 | A review failure stays at `SPEC_REVIEW` or `VERIFY`. `ISSUE_OPEN` stays the operator's rejection during the walk. | The audit has to exist before any status change. Moving a review failure to `ISSUE_OPEN` would make that status change part of the review. No new lifecycle status. The product requirement that a failed verification reaches `ISSUE_OPEN` stays on that walk, which this node does not edit. |
| D9 | The script schema names the three legal disposition values. The playbook and the prompts do not. | Acceptance 1. A schema that accepts any string is how the old verdict lists drifted. Naming the legal values is not a statement of which rows produce which value. That statement stays in `verification-signoff.md`. |

## Open Issues

None.

## Spec Review (2026-11-13)

Independent review in a fresh context. Verdict under the current rules: **NEEDS_MAJOR_REVISIONS**. The revisions in this commit are the resolutions. The node stays at `SPEC_REVIEW` for the next review.

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| F1-1 | One definition; none of the three places carries its own list of verdict words | PARTIAL | Design told every source to name the three disposition words | Revised. D9: only the script schema names the legal values. The playbook and the prompts point at the mapping and do not list it. |
| F1-2 | Same steps; record before the status change; apply a fully specified fix; advance only when every row passed | PARTIAL | The steps were specified for the script. The prompts still completed on the old headline words | Revised. The dispatched reviewer does the same three steps, then `complete_task` on `pass` and `await_human_review` otherwise. |
| F1-3 | A partial stops for the operator; a failure is changed and that review runs again | PARTIAL | A spec-review failure had no second dispatch once a heading existed | Revised. A heading is not a pass. A non-mechanical spec-review failure dispatches stage 2 again into a new dated section. |
| F1-4 | Spec review checks the design against confirmed requirements; implementation review checks the code, including build, lint, types, and tests | PASS | §What each review checks | — |
| F1-5 | Finished review records keep their words | PASS | D6 and §Files | — |
| F2-1 | Outcome | PASS | Traces to acceptance line 1 | — |
| F2-2 | Acceptance line 1 | PASS | The acceptance line | — |
| F2-3 | Acceptance line 2 | PASS | The acceptance line | — |
| F2-4 | Acceptance line 3 | PASS | The acceptance line | — |
| F2-5 | Acceptance line 4 | PASS | The acceptance line | — |
| F2-6 | Acceptance line 5 | PASS | The acceptance line | — |
| F2-7 | Operator sign-off marks a node complete | FAIL | No acceptance line would fail if the review marked the node complete | Amended. The constraint is now an acceptance line. Design step 3 and D5 serve it. |
| F2-8 | Spec review may be skipped; implementation review may not | FAIL | No acceptance line mentioned the skip | Amended. The constraint is now an acceptance line. §What each review checks serves it. |
| F2-9 | No new lifecycle status | FAIL | No acceptance line mentioned the lifecycle set | Amended. The constraint is now an acceptance line. D8 serves it. |
| F2-10 | An amendment that adds an outcome goes back through spec review | FAIL | No acceptance line mentioned amendments | Amended. The constraint is now an acceptance line. The confirmation-row paragraph serves it. |
| F2-11 | Out of scope: do not review finished nodes again | PASS | Bounds acceptance line 5 | — |
| F2-12 | Out of scope: no task-runner gate | PASS | Bounds acceptance line 1 | — |
| F2-13 | Out of scope: do not change how requirements are confirmed | PASS | Bounds acceptance line 4 | — |
| F3 | Requirements text matches confirmation commit `471b485` | PASS | Diff showed the Requirements section unchanged at review time | This commit amends Requirements and records the amendment. |
| P1 | PRD §6.2: failed verification goes to `ISSUE_OPEN`; no new status | PARTIAL | A failed implementation review stayed at `VERIFY`, and the design rewrote the preamble that describes `ISSUE_OPEN` | Revised. D8: a review failure stays put. `ISSUE_OPEN` stays the operator's walk. The preamble drops `ISSUE_OPEN` as the place a review failure is stored. |
| P2 | PRD §11 self-audit residual stays deferred | PASS | Out of scope, and the task runner is not edited | — |
| S1–S6 | Required sections and `SPEC_REVIEW` status | PASS | All present | — |
| X1 | Root-child schema shape | PASS | Matches the sibling process nodes | — |
| X2 | Dependency declaration | PASS | Header and §14 row agree | — |
| X3 | One implementer, one contract | PASS | Decomposition checkpoint | — |
| X4 | The runnable check and the steps agree | FAIL | Verification item 2 allowed a waived `FAIL` | Revised. Advance only when no `FAIL` remains and every `PARTIAL` is `applied` or `waived`. A mechanical `FAIL` is applied and not re-reviewed. |
| X5 | House style | PASS | Same skeleton as the sibling process nodes | — |

| # | Finding | Resolution |
|---|---------|------------|
| B1 | Four constraints had no acceptance check | Amended. Not mechanical. Operator directed this revision. |
| B2 | Verification item 2 allowed a waived failure | Applied. |
| S1 | A failed spec review could not run again | Applied. New dated section; heading is not a pass. |
| S2 | A mechanical failure and a re-review were both required | Applied. Mechanical `FAIL` is applied and not re-reviewed. |
| S3 | Stop listing the three disposition words everywhere | Not taken as written. D9. The schema keeps the closed set. The playbook and the prompts do not list it. |
| S4 | Map each disposition to a terminal call | Applied. `pass` completes the task. The other two wait for the operator. |
| S5 | Say what happens to `ISSUE_OPEN` | Applied. D8. |
| N1 | Findings require `rowId` | Applied. |
| N2 | The rerun check omitted the requirements-text row | Applied. |
| N3 | `sync-process` had no check | Applied. Verification item 7. |
| N4 | Two old procedure sentences sat beside the schema block | Applied. §Files widens that edit to those two sentences. |

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

   `followups` and `changes-required` appear in `.claude/workflows/leaf-workflow.js` and in `.ledger/process/verification-signoff.md`. This returns no matches:

   ```
   rg -n "followups|changes-required" \
     .ledger/process/leaf-workflow.md \
     server/src/dispatcher/prompts
   ```

   The `REVIEW_SCHEMA` block in `docs/11-workflow-scripts/00-workflow-scripts.md` names the same three legal values and does not state which rows produce which value. The persona sentences touched in `docs/06-agent-dispatcher/04-prompt-templates.md` point at `verification-signoff.md` and do not list those values.

2. **Same steps.** In `.claude/workflows/leaf-workflow.js`, the spec-review record and the implementation-review record are each committed while status is unchanged. The status moves, or the operator gate opens, only when no `FAIL` remains and every `PARTIAL` is `applied` or `waived`. A `FAIL` with resolution `waived` does not advance. `pnpm -C server exec vitest run test/dispatcher/prompts` exits 0. The `spec_review`, `verify`, and `reverify` snapshots point at `verification-signoff.md`, call `runner.complete_task` only for a passing disposition, and call `runner.await_human_review` for the other two.

3. **A partial stops, a failure is reviewed again.** The same script returns `manual-needed` after the audit commit when a `FAIL` has an empty resolution or a `PARTIAL` is not `applied` or `waived`. A mechanical `FAIL` is `applied` and does not dispatch again. A non-mechanical spec-review `FAIL` dispatches stage 2 again into a new dated section, and a Spec Review heading alone does not count as review-done. `reverify.ts` limits its rows to the previous failures, the rows the fix touched, and the requirements-text row when the fix touched Requirements.

4. **The two reviews still check different work.** The spec-review prompt in the script and `specReview.ts` still require fidelity rows F1, F2, and F3. `verify.ts` still requires the build, lint, typecheck, and tests. The implementation-review prompt in the script does not contain `pure literal` or `stage coverage`. `leaf-workflow.md` still says the operator may skip spec review and may not skip implementation review.

5. **Old records stay.** `git diff` for the implementation does not change a heading matching `Spec Review` or `Implementation Review` in any doc other than this one.

6. **The four constraint checks.** `leaf-workflow.md` still says the operator's sign-off marks a node complete, and the implementation-review steps open the operator gate without setting complete. The same playbook still allows skipping spec review and does not allow skipping implementation review. The edited playbook and script add no lifecycle status. The confirmation-row paragraph still sends an amendment that adds an outcome back through spec review.

7. **Playbook copies.** `.claude/scripts/sync-process` reports `sync` or `ok` for each registered child.

No end-to-end test. This node changes process docs, a workflow script, and reviewer prompts. It adds no UI panel and no API endpoint.

## Children

None.
