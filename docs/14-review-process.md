# Review Process

**Node ID:** `14-review-process`
**Parent:** project root (`docs/00-project.md`)
**Status:** VERIFY
**Created:** 2026-11-13
**Last Updated:** 2026-11-13
**Dependencies:** `11-workflow-scripts`, `06-agent-dispatcher/04-prompt-templates`

---

## Requirements

**Requirements confirmed:** 2026-11-13

**Requirements amended:** 2026-11-13 — the four constraints are also acceptance checks. No new outcome.

**Requirements amended:** 2026-11-13 — a partial the operator has waived may advance. No new outcome.

**Requirements amended:** 2026-11-13 — the script may name the legal result values and the legal row verdicts, and may not state which rows produce which result. The node advances when no row failed and every partial is waived. The out-of-scope line no longer names a component. No new outcome.

**Outcome.** Spec review and implementation review are specified once, and the places that specify them agree.

**Acceptance.**

- The playbook, the workflow script, and the reviewer prompts judge a review the same way. Comparing them shows one definition. None of them states which rows produce which result. The workflow script may name the legal result values and the legal row verdicts.
- Both reviews follow the same steps. The review is written into the node before the status changes. A fix the review fully specifies is applied. The node advances only when no row failed and every partial is one the operator waived.
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
- No automatic refusal to finish a node when no independent review ran.
- Changing how requirements are confirmed before design.

## Design

One review result, defined in one place. Spec review and implementation review both emit it and both follow the same three steps. They still check different things.

Decomposition checkpoint, run against this draft: none of the signals fire. The files below share one contract, the review result. One implementer can land the edit in one session. The spec is under the size cap. This node sits at depth 1. The "three independent files" signal does not fire, because the files share that contract.

### Files

Edited:

```
.ledger/process/verification-signoff.md          # the only definition of the result
.ledger/process/leaf-workflow.md                 # stages 2, 3, 6, 7, and the commit-pattern bullets
docs/00-project.md                               # §6.2 failed-verification sentence only
.claude/workflows/leaf-workflow.js               # schema, prompts, record-then-branch
server/src/dispatcher/prompts/shared.ts          # reminder + three personas
server/src/dispatcher/prompts/specReview.ts
server/src/dispatcher/prompts/verify.ts
server/src/dispatcher/prompts/reverify.ts
server/test/dispatcher/prompts/*.snapshot.test.ts  # regenerated from the prompts
```

Two finished specs quote the old verdict lists as if they were current. In `docs/11-workflow-scripts/00-workflow-scripts.md`, replace the sentences that describe the old procedure: the skipped spec review proceeds with a synthetic `REVIEW_SCHEMA`; stage 3 is one commit that both records the review and approves; and a node already at `SPEC_REVIEW` skips the review and starts at approval. A node at `SPEC_REVIEW` or `VERIFY` whose latest disposition is `changes-required` runs that review again. `followups` waits. That spec's `REVIEW_SCHEMA` block names the three legal values and does not state which rows produce which result. In `docs/06-agent-dispatcher/04-prompt-templates.md`, the persona sentences become a pointer to `verification-signoff.md` and do not list those values. Do not edit any other paragraph:

```
docs/11-workflow-scripts/00-workflow-scripts.md          # REVIEW_SCHEMA block, the two procedure sentences, and the re-entry line
docs/06-agent-dispatcher/04-prompt-templates.md          # persona sentences that list headline verdicts
```

Not edited: every existing `Spec Review` and `Implementation Review` section, `leaf-workflow-finish.js`, `maintenance-round.md` (it cites stage 2 and lists no verdict words), and the task runner. After the playbook edits, run `.claude/scripts/sync-process` so registered children receive the two process docs.

### The result

`verification-signoff.md` is the only place that says how a review is judged, including which rows produce which disposition. The playbook and the prompts point there. They do not restate the mapping. The prompts do not list the disposition words. The playbook may name a disposition where it branches, and that naming is not the mapping. The script schema's `disposition` field is the closed set of legal values. It does not say when each value applies. That set is not a second definition. The table below is the only statement of which rows produce which result. It is written into `verification-signoff.md` and nowhere else.

Row verdicts stay `PASS`, `FAIL`, `PARTIAL`, `N/A`. A `PASS` without something checkable is stored as `FAIL`.

Disposition is a function of the latest matrix and the resolutions on it:

| Latest matrix | Disposition |
|---|---|
| Any `FAIL`, including one marked `applied` or `waived` | `changes-required` |
| No `FAIL`, and at least one `PARTIAL` that is not `waived` | `followups` |
| No `FAIL`, and every `PARTIAL` is `waived`, or every row is `PASS` or `N/A` | `pass` |

Severity does not change the disposition. A finding does not outvote the table.

The reviewer returns:

- `disposition` — one of those three words
- the matrix
- findings, each with `rowId`, `severity` (`Blocking`, `Should-fix`, `Nit`), `description`, `fix`, `isMechanical`
- a short summary

Every finding names a row. A finding on a `PASS` or `N/A` row does not change that verdict and is not applied. If the summary names a different disposition than the table, the table wins.

`applied` is valid only on a `FAIL`. It records that the edit landed and does not remove the `FAIL`. The next entry dispatches that review. `waived` is valid only on a `PARTIAL`. A `PARTIAL` is closed only by `waived`.

Headline words that new reviews do not use: `LGTM`, `READY_FOR_APPROVAL`, `READY_FOR_COMPLETE`, `READY_WITH_FOLLOWUPS`, `NEEDS_MINOR_REVISIONS`, `NEEDS_REVISIONS`, `NEEDS_MAJOR_REVISIONS`. A review record written before this node keeps the word it was written with. The living sources do not list those words.

### The three steps

Spec review and implementation review do the same three steps.

1. **Record, before any status change.** Write the matrix into the node in its own commit. Status stays `SPEC_REVIEW` or `VERIFY`. Columns:

   `| # | Item | Verdict | Evidence | Resolution |`

   Findings sit under the table. Resolution cells start empty. The spec-review section stays between Open Issues and Implementation Notes. The implementation-review subsection stays inside Implementation Notes.

2. **Apply a fully specified fix, then review again.** `applied` is valid only on a `FAIL`, as the result table says. Set that resolution when the finding's fix text is the whole edit. The next entry dispatches that review. A spec-review rerun is a full spec review. An implementation rerun covers the rows the result table calls failed, any row the fix touched, and the requirements-text row when the fix touched Requirements. The new review is a new dated section. The latest section is the one that counts. The earlier section stays.

3. **Advance on `pass`.** When the disposition is `pass`, spec review's next commit moves `SPEC_REVIEW` → `APPROVED`. Implementation review stays at `VERIFY`, and the operator gate opens. The review does not mark the node complete. The operator's sign-off still does that.

`followups` and `changes-required` stop. The audit is already in the doc. A review failure does not move the node. It stays at `SPEC_REVIEW` or `VERIFY`. `docs/00-project.md` §6.2 is changed so that sentence matches: a failed spec review or implementation review stays there and records the matrix, and `ISSUE_OPEN` is the operator rejecting during the walk. No new lifecycle status.

- On `followups`, the operator may write `waived` on a partial and file an Open Issue. Disposition is computed again from the result table. The node advances only when that disposition is `pass`.
- On `changes-required`, the work changes, including when the review fully specified the fix, and that review runs again on the next entry.
  - Spec review: dispatch stage 2 again.
  - Implementation review: the `reverify` persona. It returns the same result shape and runs the same build, lint, typecheck, and tests. Its rows are the ones named in step 2. Its preamble does not describe `ISSUE_OPEN` as the place a review failure is stored.

A heading is not a pass, for a Spec Review section or an Implementation Review subsection. The script does not treat either heading as review-done while the disposition is not `pass`.

A failure of the confirmation row (fidelity row F3, or implementation row R0) is judged by the result table. The fix is to put the text back, or to record an amendment. An amendment that adds an outcome still comes back through spec review. Any requirements amendment is reviewed again.

On a later entry, `pass` advances without a new dispatch. `changes-required` dispatches that review again. `followups` stops for the operator and does not dispatch. A skipped spec review writes no review section and no synthetic matrix. The approve commit says that no formal review was run.

The dispatched reviewer records the matrix, applies a fully specified fix, and recomputes. It does not change lifecycle status. The status commit and the operator gate stay in the workflow script. A passing disposition ends with `runner.complete_task`. The other two end with `runner.await_human_review` and the open rows. It does not call `runner.complete_task` for a non-pass, and it does not call `runner.fail_task` for a review that reached a judgment. After it applies a fix, it recomputes from the result table and then branches on that disposition.

### What each review checks

Spec review rows, in order: fidelity F1, F2, F3, then one row per product-requirements item the spec must cover and one per Requirements bullet. The operator may still skip it on a small spec they trust.

Implementation review rows, in order: R0, then one row per Requirements bullet and one per acceptance check. The reviewer runs the build, lint, typecheck, and tests, and cites the exit codes. A check that needs a person in the browser is `N/A — operator gate`. This review cannot be skipped. Its prompt uses the stage-6 list in the playbook. It does not ask whether `meta` is a pure literal, and it does not ask whether stage coverage matches the playbook.

### Playbook, script, prompts

`leaf-workflow.md` stages 2, 3, 6, and 7 delete their headline-verdict lists and point at `verification-signoff.md` for the result and the three steps. Stage 2 keeps the skip. Stage 6 keeps the mandatory gate list. Stage 3's finding-only table is replaced by the five-column matrix. The Patterns bullets "Every status transition is a commit" and "Apply-easy, punt-substantive, discuss-leftovers" are updated to the same steps: the audit is its own commit, and a `changes-required` result is reviewed again before the status moves. They do not state which rows produce which result.

`leaf-workflow.js` names `disposition` on the review object. The schema enum is `pass`, `followups`, `changes-required`, and the schema does not say when each applies. Findings require `rowId` plus the fields they have today. The row verdict enum is unchanged. The spec-review and implementation-review prompts name their row set and point at the sign-off doc. They do not list the disposition words and do not restate the mapping. Stage 3 and the implementation-review fix stage both record the audit before they branch. They advance when the disposition is `pass`. They return `manual-needed` when it is `followups` or `changes-required`. They do not state which rows produce which result. The skip path does not synthesize a review result.

`signOffMatrixReminder` points at the sign-off doc and does not list the disposition words. The `spec_review`, `verify`, and `reverify` preambles and success criteria do the same. They call `runner.complete_task` only for a passing disposition, and `runner.await_human_review` for the other two. `verify` and `reverify` both require the gates. Snapshot tests are regenerated, and `pnpm -C server exec vitest run test/dispatcher/prompts` exits 0.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | `verification-signoff.md` is the only definition of the disposition. The playbook, the script, and the prompts point at it. | Acceptance 1. Restating the mapping is how the three lists drifted. |
| D2 | Three dispositions, and severity does not change them. | The row id already says whether a failure is the outcome or a side clause. A second headline for "major" versus "minor" is the split the sources could not keep aligned. |
| D3 | A `PARTIAL` is waivable in both reviews, and a waived partial may advance. A `FAIL` is not waivable. | Acceptance line 2, as amended, and acceptance line 3. The waiver is the operator's decision, written on the row. A failure is a change to the work, and that review runs again. |
| D4 | The audit commit does not change lifecycle status. The status commit happens only after the recomputed disposition is `pass`. | Acceptance 2. |
| D5 | The review object field is `disposition`, not a transition word. | A review cannot mark the node complete. The operator's sign-off still does that. `READY_FOR_COMPLETE` named a transition this review does not perform. |
| D6 | Historical `Spec Review` and `Implementation Review` sections stay word for word. | Acceptance 5. |
| D7 | `reverify` returns the same result shape, over a narrower row set. | Acceptance 3. A second vocabulary for the rerun would be another list. |
| D8 | A review failure stays at `SPEC_REVIEW` or `VERIFY`. `ISSUE_OPEN` stays the operator's rejection during the walk. §6.2 says so. | The audit has to exist before any status change. Moving a review failure to `ISSUE_OPEN` would make that status change part of the review. No new lifecycle status. The product sentence is updated to the rule the playbook already follows. |
| D9 | The script schema names the legal disposition values and the legal row verdicts. The playbook and the prompts do not state which rows produce which result. | Acceptance line 1, as amended. A schema that accepts any string is how the old verdict lists drifted. Naming the legal values is not that statement. The statement stays in `verification-signoff.md`. |

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
| X4 | The runnable check and the steps agree | FAIL | Verification item 2 allowed a waived `FAIL` | Revised in this pass, then superseded by the second pass: a `FAIL` is reviewed again after the edit, and a waived `FAIL` does not advance. |
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

## Spec Review (2026-11-13, second pass)

Independent review of the revised design. Verdict under the current rules: **NEEDS_MAJOR_REVISIONS**. This commit is the resolution. The node stays at `SPEC_REVIEW`.

| # | Item | Verdict | Resolution |
|---|------|---------|------------|
| F1-1 | One definition; no separate verdict lists | PASS | — |
| F1-2 | Advance only when every row passed | FAIL | Amended. A waived partial may advance. The recompute no longer treats a waived failure as closed. |
| F1-3 | A failure is reviewed again | FAIL | Revised. A fully specified fix is applied, and that review runs again. `applied` does not clear the failure. |
| F1-4 through F1-9 | The other acceptance lines | PASS | — |
| F2-1 through F2-17 | Requirements bullets trace to an acceptance line | PASS | — |
| F3 | Requirements match the confirmation, or the amendment explains the difference | PASS | This commit adds a second amendment line for the waiver. |
| P1, P2, S1–S6, D1, M1, H1, T1 | Lifecycle, schema, scope, house style | PASS | — |
| C1 | The design agrees with itself | FAIL | Resolved with F1-2 and F1-3. The persona records, applies, and recomputes; the status commit stays in the script. |

| # | Finding | Resolution |
|---|---------|------------|
| B1 | A waived partial advanced while the acceptance line said every row must pass | Amended, as the operator directed. |
| B2 | The recompute closed a waived failure | Applied. Only a later review clears a `FAIL`. `waived` on a `FAIL` does not count. |
| B3 | A fully specified failure was not reviewed again | Applied. The review runs again after the edit. |
| S1 | The persona was told to do the status change and also not to | Applied. |
| S2 | The heading rule named only spec review | Applied. |
| S3 | The commit-pattern bullets were outside the edit list | Applied. |
| S4 | The re-entry line in the finished workflow-scripts spec was frozen | Applied. |
| S5 | The prompt sentence could put the disposition words back | Applied. |
| S6 | The rerun did not say it runs the gates | Applied. |
| N1 | A sentence restated D9 | Applied. Deleted. |
| N2 | A finding on a passed row was eligible to be applied | Applied. |

## Spec Review (2026-11-13, third pass)

Independent review after the waiver and re-review revisions. Verdict under the current rules: **NEEDS_MAJOR_REVISIONS**. This commit is the resolution. The node stays at `SPEC_REVIEW`.

| # | Item | Verdict | Resolution |
|---|------|---------|------------|
| F1-1 | None of the three places carries its own list of verdict words | FAIL | Amended. The script may name the legal result values and the legal row verdicts. None of the three states which rows produce which result. |
| F1-2 | Advance only when every row passed, or every non-pass is a waived partial | FAIL | Amended. Advance when no row failed and every partial is waived. A row marked not applicable does not block. |
| F1-3 through F1-9 | The other acceptance lines | PASS | — |
| F2-1 through F2-15, F2-17 | Requirements bullets | PASS | — |
| F2-16 | Out of scope named a component | FAIL | Amended. The line no longer names one. |
| F3 | Amendments explain the requirements diff | PASS | This commit adds the third amendment line. |
| P1 | Failed verification goes to `ISSUE_OPEN` | FAIL | Revised. §6.2 is edited so a failed review stays put and records the matrix. `ISSUE_OPEN` stays the operator's walk. |
| P2 | Self-audit residual stays deferred | PASS | — |
| C1 | One row set for the next review | FAIL | Revised. A spec-review rerun is a full spec review. An implementation rerun uses the narrower set. |

| # | Finding | Resolution |
|---|---------|------------|
| B1 | The script's legal values were treated as a second mapping | Amended, as directed. D9 stands. |
| B2 | A not-applicable row could not pass the advance sentence | Amended, as directed. |
| B3 | §6.2 still sent every failed verification to `ISSUE_OPEN` | Applied in the design. The sentence is an implementation edit. |
| B4 | The next review had three row sets | Applied. |
| S1 | Out-of-scope line named a component | Applied. |
| S2 | The rerun was not clearly the next entry | Applied. |
| N1 | A heading counted as done while a partial was open | Applied. |
| N2 | The waiver bullet omitted a remaining failure | Applied. |

## Spec Review (2026-11-13, fourth pass)

Independent review of the revised design. Verdict under the current rules: **NEEDS_MAJOR_REVISIONS**. This commit is the resolution. The node stays at `SPEC_REVIEW`.

| # | Item | Verdict | Resolution |
|---|------|---------|------------|
| F1-1 | None of the three places states which rows produce which result | FAIL | Revised. The row rule stays in the result table. The script, the heading check, the later-entry check, and the pattern bullets branch on `pass`, `followups`, and `changes-required`. |
| F1-2 through F1-9 | The other acceptance lines | PASS | — |
| F2 | Requirements bullets, including the amendments | PASS | — |
| F3 | Amendments explain the requirements diff | PASS | Requirements text unchanged in this commit. |
| P1 | §6.2 replacement | PASS | — |
| C1 | The design agrees with itself | FAIL | Resolved with F1-1. A waiver advances only when the recomputed disposition is `pass`. `applied` is only on a `FAIL`. The schema block names the three values; the persona sentences only point. |

| # | Finding | Resolution |
|---|---------|------------|
| B1 | The script was told the row rule the acceptance withholds from it | Applied. Branch on the disposition. |
| B2 | One bullet advanced while a partial was still open | Applied. Advance only when the recomputed disposition is `pass`. An open partial stops and does not dispatch. |
| S1 | The finished schema block was both a pointer and a list of the three values | Applied. The schema block names the values. The persona sentences point and do not list them. |
| S2 | A fully specified partial was both re-reviewed and not re-reviewed | Applied. `applied` is valid only on a `FAIL`. A `PARTIAL` is closed only by `waived`. |

## Spec Review (2026-11-13, fifth pass)

Independent review of the revised design. Verdict under the current rules: **NEEDS_REVISIONS**. This commit is the resolution. The node stays at `SPEC_REVIEW`.

| # | Item | Verdict | Resolution |
|---|------|---------|------------|
| F1-1 through F1-9 | Acceptance lines | PASS | — |
| F2-1 through F2-17 | Requirements bullets | PASS | — |
| F3 | Amendments explain the requirements diff | PASS | Requirements text unchanged in this commit. |
| P1 | §6.2 replacement is described, and the project document is not yet edited | PASS | — |
| C1 | The playbook both omits `changes-required` and uses it | FAIL | Revised. The playbook may name a disposition where it branches. The prompts still do not list those words. |
| C2 through C5 | Waiver, the result table, the failed-review status, and the finished-spec split | PASS | — |

| # | Finding | Resolution |
|---|---------|------------|
| C1 | Verification item 1 forbade `changes-required` in the playbook while the pattern bullets require it | Applied. The search covers the prompts only. |

## Implementation Notes

Implemented 2026-11-13 on branch `impl/14-review-process`. No dependencies added. This node changes process docs, the workflow script, and the reviewer prompts. It adds no UI panel and no API endpoint, so there is no end-to-end test.

The result, including which rows produce which result, is written only in `.ledger/process/verification-signoff.md`. The playbook names a result where it branches. The script schema names the legal values `pass`, `followups`, and `changes-required`, and the row verdicts. The prompts point at the sign-off doc and do not list those result words.

`pnpm -C server exec vitest run test/dispatcher/prompts` exited 0: 11 files, 66 tests. Snapshots regenerated for `specReview`, `verify`, and `reverify`.

`.claude/scripts/sync-process` reported `sync` for `leaf-workflow.md` and `verification-signoff.md` in `/Users/dennis/code/worldgen`, and `ok` for the other playbooks.

Deviation: the script's inspect result uses `none` when a review section is absent. That word is not a review disposition. The review object's `disposition` stays the three legal values.

### Implementation Review (2026-11-13)

Independent review of `main..HEAD` on `impl/14-review-process`. Disposition: **changes-required**. 3 FAIL, 2 unwaived PARTIAL, 0 waived PARTIAL, 23 PASS, 1 N/A. Status stays `VERIFY`.

| # | Item | Verdict | Evidence | Resolution |
|---|------|---------|----------|------------|
| R0 | Requirements unchanged since `471b485`, or an amendment explains the difference | PASS | `git diff 471b485` of the Requirements section. Three amendment lines at `docs/14-review-process.md:16-20`. | |
| R1 | Outcome: the two reviews are specified once, and those places agree | PASS | `.ledger/process/verification-signoff.md:67` is the only mapping. Playbook points there. Prompts point there at `server/src/dispatcher/prompts/shared.ts:104`. | |
| R2 | One definition. None of the three states which rows produce which result. The script may name the legal values. | PASS | Mapping search exits 1. Schema names the values at `.claude/workflows/leaf-workflow.js:79` and the row verdicts at `:89`. | |
| R3 | Same steps. Record before the status change. Apply a fully specified fix. Advance only when no row failed and every partial is waived. | FAIL | Record-before-status is at `.claude/workflows/leaf-workflow.js:641` and `:906`. A `SPEC_REVIEW` node with disposition `none` does not review or approve, and `:469` still sets `runImpl`, so `:692` starts implementation. | |
| R4 | A partial stops for the operator. A failure is changed and that review runs again. | PARTIAL | Partials stop at `.claude/workflows/leaf-workflow.js:474-480`. A `changes-required` re-entry still runs the `DRAFT → SPEC_REVIEW` commit at `:599-607` when status is already `SPEC_REVIEW`. | |
| R5 | Spec review checks the design against confirmed requirements. Implementation review checks the code, including build, lint, types, and tests. | PASS | Fidelity rows at `.claude/workflows/leaf-workflow.js:621` and `specReview.ts:47`. Gates at `verify.ts:45`, `reverify.ts:45`, and `leaf-workflow.js:873-874`. | |
| R6 | Finished review records keep their words. | PASS | `git diff main..HEAD -U0 -- '*.md'` changes no heading matching `Spec Review` or `Implementation Review`. | |
| R7 | The operator's sign-off marks a node complete. | PASS | `.ledger/process/leaf-workflow.md:223` and `:381`. The gate at `.claude/workflows/leaf-workflow.js:934-970` returns `awaiting-operator`. | |
| R8 | Spec review may be skipped. Implementation review may not. | PASS | `.ledger/process/leaf-workflow.md:143` and `:208`. Skip path `:594-595` and `:668-676` writes no synthetic matrix. | |
| R9 | No new lifecycle status. | PASS | `docs/00-project.md:157-168`. `none` at `.claude/workflows/leaf-workflow.js:69` is an inspect value. | |
| R10 | An amendment that adds an outcome goes back through spec review. | PASS | `.ledger/process/leaf-workflow.md:225`. | |
| R11 | Constraint: operator sign-off marks a node complete. | PASS | Same evidence as R7. | |
| R12 | Constraint: spec review may be skipped; implementation review may not. | PASS | Same evidence as R8. | |
| R13 | Constraint: no new lifecycle status. | PASS | Same evidence as R9. | |
| R14 | Constraint: an outcome-adding amendment goes back through spec review. | PASS | Same evidence as R10. | |
| R15 | Out of scope: do not review finished nodes again. | PASS | Diff touches no finished node's review section. | |
| R16 | Out of scope: no automatic refusal to finish when no independent review ran. | PASS | `git diff main..HEAD -- .claude/workflows/leaf-workflow-finish.js` is empty. | |
| R17 | Out of scope: do not change how requirements are confirmed. | PASS | Confirmation check unchanged at `.claude/workflows/leaf-workflow.js:438`. | |
| A1 | One definition. Old headline words absent. Result words absent from the prompts. Schema names the three values. Persona sentences point. | PASS | Both searches exit 1. Allowed hits at `leaf-workflow.js:79`, `verification-signoff.md:73-75`, `leaf-workflow.md:367`. | |
| A2 | Same steps. Advance or open the gate only on `pass`. Prompt tests exit 0. | FAIL | Non-pass returns at `.claude/workflows/leaf-workflow.js:654-659` and `:921-928`. Prompt tests exit 0, 66 tests. The `none` path still implements, against `.ledger/process/leaf-workflow.md:130`. | |
| A3 | A partial stops. A failure is reviewed again. A heading is not review-done. `reverify` runs the gates. | PARTIAL | Followups return `:474-480`. Heading rule `:437`. Rerun rows `:878-880`. The re-entry still tries the `DRAFT → SPEC_REVIEW` commit at `:599-607`. | |
| A4 | The two reviews still check different work. | PASS | F1–F3 at `.claude/workflows/leaf-workflow.js:621`. Gates at `verify.ts:45` and `reverify.ts:45`. `pure literal` and `stage coverage` search exits 1. | |
| A5 | Old records stay. | PASS | Changed headings are playbook stages 3 and 7, and `verification-signoff.md` `## The result` / `## The three steps`. | |
| A6 | The four constraint checks, including the §6.2 sentence. | PASS | `docs/00-project.md:168` keeps a failed review at `SPEC_REVIEW` or `VERIFY`. `ISSUE_OPEN` is the operator rejecting during the walk. | |
| A7 | `sync-process` reports `sync` or `ok`. | PASS | `verification-signoff.md` matches worldgen. `leaf-workflow.md` differs only by worldgen's section-number lines. The new sentences are in the child file. | |
| S1 | Spec conformance, including that `SPEC_REVIEW` is not safe to implement. | FAIL | `.claude/workflows/leaf-workflow.js:469` and `:692` start implementation while status is `SPEC_REVIEW` and no review section exists. | |
| S2 | Build, lint, and typecheck where this change can break them. | PASS | `pnpm -C server build` exits 0. `pnpm -C server typecheck` exits 0. Prompt tests exit 0. `pnpm -C server lint` exits 1 at `server/src/runner/store.ts:433`, a line identical on `main` and not in this diff. | |
| S3 | No `any`, no eslint-disable, no `console.log`, no dead code in the edited script and prompts. | PASS | The only hit is the prohibition string at `.claude/workflows/leaf-workflow.js:876`. `node --check` exits 0. | |
| S4 | End-to-end test. | N/A | Operator gate. This node adds no UI panel and no API endpoint. | |

| # | Finding | Resolution |
|---|---------|------------|
| R3 | A `SPEC_REVIEW` node with no review section starts implementation. | |
| A2 | Verification item 2 says advance only on `pass`. This path implements instead. | |
| S1 | `SPEC_REVIEW` is not safe to implement. Same hole as R3. | |
| R4 | A `changes-required` re-entry still tries to commit `DRAFT → SPEC_REVIEW`. | |
| A3 | Same empty commit on the path that must dispatch the review again. | |

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

   `followups` and `changes-required` appear in `.claude/workflows/leaf-workflow.js`, in `.ledger/process/verification-signoff.md`, and in the pattern bullets of `.ledger/process/leaf-workflow.md`. This returns no matches:

   ```
   rg -n "followups|changes-required" \
     server/src/dispatcher/prompts
   ```

   The `REVIEW_SCHEMA` block in `docs/11-workflow-scripts/00-workflow-scripts.md` names the same three legal values and does not state which rows produce which value. The persona sentences touched in `docs/06-agent-dispatcher/04-prompt-templates.md` point at `verification-signoff.md` and do not list those values.

2. **Same steps.** In `.claude/workflows/leaf-workflow.js`, the spec-review record and the implementation-review record are each committed while status is unchanged. The script advances, or opens the operator gate, only when the disposition is `pass`. Otherwise it returns `manual-needed`. This returns no matches, so those files do not restate which rows produce which result:

   ```
   rg -n "no \`FAIL\`|every \`PARTIAL\`|PARTIAL that is not" \
     .ledger/process/leaf-workflow.md \
     .claude/workflows/leaf-workflow.js \
     server/src/dispatcher/prompts
   ```

   `pnpm -C server exec vitest run test/dispatcher/prompts` exits 0. The `spec_review`, `verify`, and `reverify` snapshots point at `verification-signoff.md`, call `runner.complete_task` only for a passing disposition, and call `runner.await_human_review` for the other two.

3. **A partial stops, a failure is reviewed again.** On the next entry, `changes-required` dispatches that review again into a new dated section. `followups` stops and does not dispatch. A spec-review rerun is a full spec review. An implementation rerun covers the previous failures, the rows the fix touched, and the requirements-text row when the fix touched Requirements. A Spec Review heading, or an Implementation Review subsection, does not by itself count as review-done while the disposition is not `pass`. `reverify.ts` runs the build, lint, typecheck, and tests. `applied` appears only as a resolution on a failed row.

4. **The two reviews still check different work.** The spec-review prompt in the script and `specReview.ts` still require fidelity rows F1, F2, and F3. `verify.ts` and `reverify.ts` still require the build, lint, typecheck, and tests. The implementation-review prompt in the script does not contain `pure literal` or `stage coverage`. `leaf-workflow.md` still says the operator may skip spec review and may not skip implementation review.

5. **Old records stay.** `git diff` for the implementation does not change a heading matching `Spec Review` or `Implementation Review` in any doc other than this one.

6. **The four constraint checks.** `leaf-workflow.md` still says the operator's sign-off marks a node complete, and the implementation-review steps open the operator gate without setting complete. The same playbook still allows skipping spec review and does not allow skipping implementation review. The edited playbook and script add no lifecycle status. `docs/00-project.md` §6.2 says a failed spec review or implementation review stays at `SPEC_REVIEW` or `VERIFY` and records the matrix, and that `ISSUE_OPEN` is the operator rejecting during the walk. The confirmation-row paragraph still sends an amendment that adds an outcome back through spec review.

7. **Playbook copies.** `.claude/scripts/sync-process` reports `sync` or `ok` for each registered child.

No end-to-end test. This node changes process docs, a workflow script, and reviewer prompts. It adds no UI panel and no API endpoint.

## Children

None.
