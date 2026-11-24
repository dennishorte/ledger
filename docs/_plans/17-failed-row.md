# Failed rows and smaller suggestions

**Status:** accepted

## Part

`docs/01-processes/00-processes.md`

## Outcome

**Outcome confirmed:** 2026-11-23

When a review fails a row, that row is repaired without asking the person. An agent who did not write the review makes the edit the row determines. The next review covers the rows that repair can change. The person is asked in two cases: the failed row does not determine one edit, or the repair would change the outcome or the requirements.

A smaller suggestion is a note the confirmed text does not require. The review records it, and it has no verdict. It does not hold the step, and it does not by itself call for another review.

When a failed row is being repaired, the repair also makes each suggestion that names one edit. The review of that repair includes any row whose evidence that edit changed. A suggestion that names no single edit is left on the review.

When no row failed, no suggestion is applied. The step advances, and the suggestions stay on the review for a later change to find. The person does not have to read them for the step to pass.

**Accepted:** 2026-11-24

The person accepts the finished work.

## Decisions

| | Decision | Reason |
|---|----------|--------|
| D1 | The written rule is the Rules section of `docs/01-processes/00-processes.md`. A person points at that rule. Each acceptance sentence is written there, in the words of that check, in the order of the checks. | It serves every acceptance check. Each check points at the written rule and reads its sentence there. |
| D2 | Each of those sentences is one obligation. Behavior has one episode for it. The case is the situation the sentence names. The action is what the sentence says is done. The result is the sentence. The episode for the repair without asking is the situation where the row determines one edit and the repair would not change the outcome or the requirements. The episode for the two cases is the situation where the failed row does not determine one edit, or the repair would change the outcome or the requirements, and the action is that the person is asked. | It serves every acceptance check. The sentence the check reads is the obligation, and the episode's result is that sentence. The two episode situations serve the check that a failed row is repaired without asking the person, and the check that shows the two cases where the person is asked. |
| D3 | The review records a smaller suggestion in that review, outside the matrix. The suggestion has no verdict. A further defect stays a new row, because the confirmed text already requires it. | It serves the check that the review records the suggestion, and that the suggestion has no verdict. It serves the check that the suggestion does not hold the step, and does not by itself call for another review. It serves the check that a smaller suggestion is a note the confirmed text does not require. |
| D4 | `.ledger/process/review.md` states the suggestion sentences of the rule, in the place of the sentence that every other such note is left out. A note that is why a row fails stays part of the review. | It serves the check that a smaller suggestion is a note the confirmed text does not require. It serves the check that the review records the suggestion, and that the suggestion has no verdict. It serves the check that the suggestion does not hold the step, and does not by itself call for another review. It serves the check that, when a failed row is being repaired, the repair also makes each suggestion that names one edit. It serves the check that a suggestion that names no single edit is left on the review. It serves the check that, when no row failed, no suggestion is applied. It serves the check that the step advances, and that the suggestions stay on the review for a later change to find. It serves the check that the person does not have to read the suggestions for the step to pass. |
| D5 | `.ledger/process/verification-signoff.md` states the repair sentences of the rule. An agent who did not write the review makes the edit the row determines. A finding names the row, the severity, the description, and whether it is mechanical. A new session reviews the repaired artifact. The next review covers the rows that repair can change. The review of that repair includes any row whose evidence that edit changed. `applied` records that the edit landed and does not remove the FAIL. The earlier review stays. A FAIL leaves the step where it is. When no row failed, the step advances as the rule says. | It serves the check that a failed row is repaired without asking the person. It serves the check that an agent who did not write the review makes the edit the row determines. It serves the check that the next review covers the rows that repair can change. It serves the check that shows the two cases where the person is asked. It serves the check that, when a failed row is being repaired, the repair also makes each suggestion that names one edit. It serves the check that the review of that repair includes any row whose evidence that edit changed. It serves the check that, when no row failed, no suggestion is applied. It serves the check that the step advances, and that the suggestions stay on the review for a later change to find. It serves the check that the person does not have to read the suggestions for the step to pass. |
| D6 | `.ledger/process/plan-workflow.md`, in the failed-review rule, states that a failed row is repaired without asking the person, that an agent who did not write the review makes the edit the row determines, that the person is asked in the two cases, that the repair also makes each suggestion that names one edit, and that the next review covers the rows that repair can change. The recorded matrix stays. A new session reviews the repaired artifact. The person amends the outcome and the requirements. An agent does not. | It serves the check that a failed row is repaired without asking the person. It serves the check that an agent who did not write the review makes the edit the row determines. It serves the check that the next review covers the rows that repair can change. It serves the check that shows the two cases where the person is asked. It serves the check that, when a failed row is being repaired, the repair also makes each suggestion that names one edit. |

## Requirements

**Requirements confirmed:** 2026-11-23

**Acceptance.**

- A person can point at the written rule and see that a failed row is repaired without asking the person.
- A person can point at the written rule and see that an agent who did not write the review makes the edit the row determines.
- A person can point at the written rule and see that the next review covers the rows that repair can change.
- A person can point at the written rule and see the two cases where the person is asked: the failed row does not determine one edit, or the repair would change the outcome or the requirements.
- A person can point at the written rule and see that a smaller suggestion is a note the confirmed text does not require.
- A person can point at the written rule and see that the review records the suggestion, and that the suggestion has no verdict.
- A person can point at the written rule and see that the suggestion does not hold the step, and does not by itself call for another review.
- A person can point at the written rule and see that, when a failed row is being repaired, the repair also makes each suggestion that names one edit.
- A person can point at the written rule and see that the review of that repair includes any row whose evidence that edit changed.
- A person can point at the written rule and see that a suggestion that names no single edit is left on the review.
- A person can point at the written rule and see that, when no row failed, no suggestion is applied.
- A person can point at the written rule and see that the step advances, and that the suggestions stay on the review for a later change to find.
- A person can point at the written rule and see that the person does not have to read the suggestions for the step to pass.

**Constraints.**

- The person amends the outcome and the requirements. An agent does not.
- A failed review stays recorded.
- A failed row holds the step.
- The repair of a failed row is made by an agent who did not write the review.
- The reviewer of a repair did not write that repair.
- A child project is edited only when asked.
- This project does not carry out a child project's work.

**Out of scope.**

- A later change that finds a suggestion left on the review.
- The person's amendment of the outcome or the requirements.
- Choosing an edit when the failed row does not determine one edit.
- Choosing an edit for a suggestion that names no single edit.
- A child project's work.

## Test design

The checks are run on the writing this piece has produced. They are not run on the project from before that writing. The agent is the one who runs the check. A person can point at the same rule and see the same words.

### A person can point at the written rule and see that a failed row is repaired without asking the person.

**Setup.** This piece has written the rule. The written rule is one this writing has produced.

**Action.** The agent points at the written rule. The agent reads that a failed row is repaired without asking the person. A person can point at the same rule and see the same words.

**Looked at.** The written rule says that a failed row is repaired without asking the person. A failed check has no such rule to point at, or the rule does not say that a failed row is repaired without asking the person.

### A person can point at the written rule and see that an agent who did not write the review makes the edit the row determines.

**Setup.** This piece has written the rule. The written rule is one this writing has produced.

**Action.** The agent points at the written rule. The agent reads that an agent who did not write the review makes the edit the row determines. A person can point at the same rule and see the same words.

**Looked at.** The written rule says that an agent who did not write the review makes the edit the row determines. A failed check has no such rule to point at, or the rule does not say that an agent who did not write the review makes the edit the row determines.

### A person can point at the written rule and see that the next review covers the rows that repair can change.

**Setup.** This piece has written the rule. The written rule is one this writing has produced.

**Action.** The agent points at the written rule. The agent reads that the next review covers the rows that repair can change. A person can point at the same rule and see the same words.

**Looked at.** The written rule says that the next review covers the rows that repair can change. A failed check has no such rule to point at, or the rule does not say that the next review covers the rows that repair can change.

### A person can point at the written rule and see the two cases where the person is asked: the failed row does not determine one edit, or the repair would change the outcome or the requirements.

**Setup.** This piece has written the rule. The written rule is one this writing has produced.

**Action.** The agent points at the written rule. The agent reads the two cases where the person is asked. A person can point at the same rule and see the same words.

**Looked at.** The written rule shows the two cases where the person is asked. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements. A failed check has no such rule to point at, or the rule does not say those two cases.

### A person can point at the written rule and see that a smaller suggestion is a note the confirmed text does not require.

**Setup.** This piece has written the rule. The written rule is one this writing has produced.

**Action.** The agent points at the written rule. The agent reads that a smaller suggestion is a note the confirmed text does not require. A person can point at the same rule and see the same words.

**Looked at.** The written rule says that a smaller suggestion is a note the confirmed text does not require. A failed check has no such rule to point at, or the rule does not say that a smaller suggestion is a note the confirmed text does not require.

### A person can point at the written rule and see that the review records the suggestion, and that the suggestion has no verdict.

**Setup.** This piece has written the rule. The written rule is one this writing has produced.

**Action.** The agent points at the written rule. The agent reads that the review records the suggestion, and that the suggestion has no verdict. A person can point at the same rule and see the same words.

**Looked at.** The written rule says that the review records the suggestion. It says that the suggestion has no verdict. A failed check has no such rule to point at, or the rule does not say that the review records the suggestion and that the suggestion has no verdict.

### A person can point at the written rule and see that the suggestion does not hold the step, and does not by itself call for another review.

**Setup.** This piece has written the rule. The written rule is one this writing has produced.

**Action.** The agent points at the written rule. The agent reads that the suggestion does not hold the step, and does not by itself call for another review. A person can point at the same rule and see the same words.

**Looked at.** The written rule says that the suggestion does not hold the step. It says that the suggestion does not by itself call for another review. A failed check has no such rule to point at, or the rule does not say that the suggestion does not hold the step and does not by itself call for another review.

### A person can point at the written rule and see that, when a failed row is being repaired, the repair also makes each suggestion that names one edit.

**Setup.** This piece has written the rule. The written rule is one this writing has produced.

**Action.** The agent points at the written rule. The agent reads that, when a failed row is being repaired, the repair also makes each suggestion that names one edit. A person can point at the same rule and see the same words.

**Looked at.** The written rule says that, when a failed row is being repaired, the repair also makes each suggestion that names one edit. A failed check has no such rule to point at, or the rule does not say that, when a failed row is being repaired, the repair also makes each suggestion that names one edit.

### A person can point at the written rule and see that the review of that repair includes any row whose evidence that edit changed.

**Setup.** This piece has written the rule. The written rule is one this writing has produced.

**Action.** The agent points at the written rule. The agent reads that the review of that repair includes any row whose evidence that edit changed. A person can point at the same rule and see the same words.

**Looked at.** The written rule says that the review of that repair includes any row whose evidence that edit changed. A failed check has no such rule to point at, or the rule does not say that the review of that repair includes any row whose evidence that edit changed.

### A person can point at the written rule and see that a suggestion that names no single edit is left on the review.

**Setup.** This piece has written the rule. The written rule is one this writing has produced.

**Action.** The agent points at the written rule. The agent reads that a suggestion that names no single edit is left on the review. A person can point at the same rule and see the same words.

**Looked at.** The written rule says that a suggestion that names no single edit is left on the review. A failed check has no such rule to point at, or the rule does not say that a suggestion that names no single edit is left on the review.

### A person can point at the written rule and see that, when no row failed, no suggestion is applied.

**Setup.** This piece has written the rule. The written rule is one this writing has produced.

**Action.** The agent points at the written rule. The agent reads that, when no row failed, no suggestion is applied. A person can point at the same rule and see the same words.

**Looked at.** The written rule says that, when no row failed, no suggestion is applied. A failed check has no such rule to point at, or the rule does not say that, when no row failed, no suggestion is applied.

### A person can point at the written rule and see that the step advances, and that the suggestions stay on the review for a later change to find.

**Setup.** This piece has written the rule. The written rule is one this writing has produced.

**Action.** The agent points at the written rule. The agent reads that the step advances, and that the suggestions stay on the review for a later change to find. A person can point at the same rule and see the same words.

**Looked at.** The written rule says that the step advances. It says that the suggestions stay on the review for a later change to find. A failed check has no such rule to point at, or the rule does not say that the step advances and that the suggestions stay on the review for a later change to find.

### A person can point at the written rule and see that the person does not have to read the suggestions for the step to pass.

**Setup.** This piece has written the rule. The written rule is one this writing has produced.

**Action.** The agent points at the written rule. The agent reads that the person does not have to read the suggestions for the step to pass. A person can point at the same rule and see the same words.

**Looked at.** The written rule says that the person does not have to read the suggestions for the step to pass. A failed check has no such rule to point at, or the rule does not say that the person does not have to read the suggestions for the step to pass.

## Tests

This piece writes no executable tests. The checks cannot be run until this piece has written its content. They are a reading of that writing. The person recorded this on 2026-11-23 and moved the plan to design.

## Design

The written rule is the Rules section of `docs/01-processes/00-processes.md`. A person points at that rule. These sentences are written there.

A failed row is repaired without asking the person.

An agent who did not write the review makes the edit the row determines.

The next review covers the rows that repair can change.

The person is asked in two cases. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements.

A smaller suggestion is a note the confirmed text does not require.

The review records the suggestion, and the suggestion has no verdict.

The suggestion does not hold the step, and does not by itself call for another review.

When a failed row is being repaired, the repair also makes each suggestion that names one edit.

The review of that repair includes any row whose evidence that edit changed.

A suggestion that names no single edit is left on the review.

When no row failed, no suggestion is applied.

When no row failed, the step advances, and the suggestions stay on the review for a later change to find.

When no row failed, the person does not have to read the suggestions for the step to pass.

Each sentence is one obligation. Behavior has one episode for that obligation. The case is the situation the sentence names. The action is what the sentence says is done. The result is the sentence. The episode for the repair without asking uses the situation where the row determines one edit and the repair would not change the outcome or the requirements. The person is not asked. The episode for the two cases uses the situation where the failed row does not determine one edit, or the repair would change the outcome or the requirements. The person is asked.

The review records the suggestion in that review, outside the matrix. The suggestion has no verdict. A further defect stays a new row. The confirmed text already requires a further defect. A smaller suggestion is a note the confirmed text does not require.

`.ledger/process/review.md` states the suggestion sentences. A note that is why a row fails stays part of the review. The sentence that every other such note is left out is replaced by these sentences. A smaller suggestion is a note the confirmed text does not require. The review records the suggestion, and the suggestion has no verdict. The suggestion does not hold the step, and does not by itself call for another review. When a failed row is being repaired, the repair also makes each suggestion that names one edit. A suggestion that names no single edit is left on the review. When no row failed, no suggestion is applied. When no row failed, the step advances, and the suggestions stay on the review for a later change to find. When no row failed, the person does not have to read the suggestions for the step to pass.

`.ledger/process/verification-signoff.md` states the repair sentences. A failed row is repaired without asking the person. An agent who did not write the review makes the edit the row determines. A finding names the row, the severity, the description, and whether it is mechanical. The person is asked in two cases. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements. When a failed row is being repaired, the repair also makes each suggestion that names one edit. The next review covers the rows that repair can change. The review of that repair includes any row whose evidence that edit changed. A new session reviews the repaired artifact. `applied` records that the edit landed and does not remove the FAIL. The earlier review stays. A FAIL leaves the step where it is. When no row failed, no suggestion is applied. When no row failed, the step advances, and the suggestions stay on the review for a later change to find. When no row failed, the person does not have to read the suggestions for the step to pass. These sentences replace the reviewer applying a fully specified fix, the finding's fix text as the edit, a full spec-review rerun, and an implementation rerun that covers the failed rows, the rows the fix touched, and the requirements-text row.

`.ledger/process/plan-workflow.md` states, in the failed-review rule, that a failed row is repaired without asking the person. An agent who did not write the review makes the edit the row determines. The person is asked in two cases. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements. When a failed row is being repaired, the repair also makes each suggestion that names one edit. The next review covers the rows that repair can change. The recorded matrix stays. A new session reviews the repaired artifact. The person amends the outcome and the requirements. An agent does not.

## Implementation notes

The checks are a reading of the written rule, the Rules section of `docs/01-processes/00-processes.md`. Each acceptance sentence is there, in the words of the check. The checks were read on 2026-11-24. Each one shows the sentence the check names.

## Reviews

### Outcome review, 2026-11-23

**Disposition:** changes-required

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| O1 | A failed row is repaired without asking the person. An agent who did not write the review makes the edit the row determines. | PASS | "When a review fails a row, that row is repaired without asking the person. An agent who did not write the review makes the edit the row determines." |
| O2 | The next review covers the rows that repair can change. | PASS | "The next review covers the rows that repair can change." |
| O3 | The person is asked in two cases only: the failed row does not determine one edit, or the repair would change the outcome or the requirements. | PASS | "The person is asked in two cases: the failed row does not determine one edit, or the repair would change the outcome or the requirements." |
| O4 | A smaller suggestion is recorded on the review, has no verdict, does not hold the step, and does not by itself call for another review. | PASS | "The review records it, and it has no verdict. It does not hold the step, and it does not by itself call for another review." |
| O5 | When a failed row is being repaired, the repair also makes each suggestion that names one edit. The review of that repair includes any row whose evidence that edit changed. A suggestion that names no single edit is left on the review. | PASS | "When a failed row is being repaired, the repair also makes each suggestion that names one edit. The review of that repair includes any row whose evidence that edit changed. A suggestion that names no single edit is left on the review." |
| O6 | When no row failed, no suggestion is applied. The step advances. The suggestions stay on the review for a later change to find. The person does not have to read them for the step to pass. | PASS | "When no row failed, no suggestion is applied. The step advances, and the suggestions stay on the review for a later change to find. The person does not have to read them for the step to pass." |
| O7 | A person is not required to consider a review finding when the response to that finding is obvious. | FAIL | The Outcome section lacks this. It does not say a person is not required to consider a review finding, and it does not use an obvious response as the condition. "When a review fails a row, that row is repaired without asking the person." "The person does not have to read them for the step to pass." |
| O8 | Smaller suggestions have a defined handling. | PASS | "A smaller suggestion is a note the confirmed text does not require. The review records it, and it has no verdict. It does not hold the step, and it does not by itself call for another review." "When a failed row is being repaired, the repair also makes each suggestion that names one edit. The review of that repair includes any row whose evidence that edit changed. A suggestion that names no single edit is left on the review." "When no row failed, no suggestion is applied. The step advances, and the suggestions stay on the review for a later change to find. The person does not have to read them for the step to pass." |

Findings:

O7. The outcome does not say a person is not required to consider a review finding when the response to that finding is obvious. Evidence: the Outcome section has no such clause. "When a review fails a row, that row is repaired without asking the person." "The person does not have to read them for the step to pass."

### Test design review, 2026-11-23

**Disposition:** pass

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| A1 | A person can point at the written rule and see that a failed row is repaired without asking the person. | PASS | "This piece has written the rule. The written rule is one this writing has produced." "The agent points at the written rule. The agent reads that a failed row is repaired without asking the person. A person can point at the same rule and see the same words." "The written rule says that a failed row is repaired without asking the person." If the check failed, that statement would be absent: "A failed check has no such rule to point at, or the rule does not say that a failed row is repaired without asking the person." |
| A2 | A person can point at the written rule and see that an agent who did not write the review makes the edit the row determines. | PASS | "This piece has written the rule. The written rule is one this writing has produced." "The agent points at the written rule. The agent reads that an agent who did not write the review makes the edit the row determines. A person can point at the same rule and see the same words." "The written rule says that an agent who did not write the review makes the edit the row determines." If the check failed, that statement would be absent: "A failed check has no such rule to point at, or the rule does not say that an agent who did not write the review makes the edit the row determines." |
| A3 | A person can point at the written rule and see that the next review covers the rows that repair can change. | PASS | "This piece has written the rule. The written rule is one this writing has produced." "The agent points at the written rule. The agent reads that the next review covers the rows that repair can change. A person can point at the same rule and see the same words." "The written rule says that the next review covers the rows that repair can change." If the check failed, that statement would be absent: "A failed check has no such rule to point at, or the rule does not say that the next review covers the rows that repair can change." |
| A4 | A person can point at the written rule and see the two cases where the person is asked: the failed row does not determine one edit, or the repair would change the outcome or the requirements. | PASS | "This piece has written the rule. The written rule is one this writing has produced." "The agent points at the written rule. The agent reads the two cases where the person is asked. A person can point at the same rule and see the same words." "The written rule shows the two cases where the person is asked. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements." If the check failed, those two cases would be unshown: "A failed check has no such rule to point at, or the rule does not say those two cases." |
| A5 | A person can point at the written rule and see that a smaller suggestion is a note the confirmed text does not require. | PASS | "This piece has written the rule. The written rule is one this writing has produced." "The agent points at the written rule. The agent reads that a smaller suggestion is a note the confirmed text does not require. A person can point at the same rule and see the same words." "The written rule says that a smaller suggestion is a note the confirmed text does not require." If the check failed, that statement would be absent: "A failed check has no such rule to point at, or the rule does not say that a smaller suggestion is a note the confirmed text does not require." |
| A6 | A person can point at the written rule and see that the review records the suggestion, and that the suggestion has no verdict. | PASS | "This piece has written the rule. The written rule is one this writing has produced." "The agent points at the written rule. The agent reads that the review records the suggestion, and that the suggestion has no verdict. A person can point at the same rule and see the same words." "The written rule says that the review records the suggestion. It says that the suggestion has no verdict." If the check failed, the record or the lack of a verdict would be unshown: "A failed check has no such rule to point at, or the rule does not say that the review records the suggestion and that the suggestion has no verdict." |
| A7 | A person can point at the written rule and see that the suggestion does not hold the step, and does not by itself call for another review. | PASS | "This piece has written the rule. The written rule is one this writing has produced." "The agent points at the written rule. The agent reads that the suggestion does not hold the step, and does not by itself call for another review. A person can point at the same rule and see the same words." "The written rule says that the suggestion does not hold the step. It says that the suggestion does not by itself call for another review." If the check failed, either claim would be unshown: "A failed check has no such rule to point at, or the rule does not say that the suggestion does not hold the step and does not by itself call for another review." |
| A8 | A person can point at the written rule and see that, when a failed row is being repaired, the repair also makes each suggestion that names one edit. | PASS | "This piece has written the rule. The written rule is one this writing has produced." "The agent points at the written rule. The agent reads that, when a failed row is being repaired, the repair also makes each suggestion that names one edit. A person can point at the same rule and see the same words." "The written rule says that, when a failed row is being repaired, the repair also makes each suggestion that names one edit." If the check failed, that statement would be absent: "A failed check has no such rule to point at, or the rule does not say that, when a failed row is being repaired, the repair also makes each suggestion that names one edit." |
| A9 | A person can point at the written rule and see that the review of that repair includes any row whose evidence that edit changed. | PASS | "This piece has written the rule. The written rule is one this writing has produced." "The agent points at the written rule. The agent reads that the review of that repair includes any row whose evidence that edit changed. A person can point at the same rule and see the same words." "The written rule says that the review of that repair includes any row whose evidence that edit changed." If the check failed, that statement would be absent: "A failed check has no such rule to point at, or the rule does not say that the review of that repair includes any row whose evidence that edit changed." |
| A10 | A person can point at the written rule and see that a suggestion that names no single edit is left on the review. | PASS | "This piece has written the rule. The written rule is one this writing has produced." "The agent points at the written rule. The agent reads that a suggestion that names no single edit is left on the review. A person can point at the same rule and see the same words." "The written rule says that a suggestion that names no single edit is left on the review." If the check failed, that statement would be absent: "A failed check has no such rule to point at, or the rule does not say that a suggestion that names no single edit is left on the review." |
| A11 | A person can point at the written rule and see that, when no row failed, no suggestion is applied. | PASS | "This piece has written the rule. The written rule is one this writing has produced." "The agent points at the written rule. The agent reads that, when no row failed, no suggestion is applied. A person can point at the same rule and see the same words." "The written rule says that, when no row failed, no suggestion is applied." If the check failed, that statement would be absent: "A failed check has no such rule to point at, or the rule does not say that, when no row failed, no suggestion is applied." |
| A12 | A person can point at the written rule and see that the step advances, and that the suggestions stay on the review for a later change to find. | PASS | "This piece has written the rule. The written rule is one this writing has produced." "The agent points at the written rule. The agent reads that the step advances, and that the suggestions stay on the review for a later change to find. A person can point at the same rule and see the same words." "The written rule says that the step advances. It says that the suggestions stay on the review for a later change to find." If the check failed, either claim would be unshown: "A failed check has no such rule to point at, or the rule does not say that the step advances and that the suggestions stay on the review for a later change to find." |
| A13 | A person can point at the written rule and see that the person does not have to read the suggestions for the step to pass. | PASS | "This piece has written the rule. The written rule is one this writing has produced." "The agent points at the written rule. The agent reads that the person does not have to read the suggestions for the step to pass. A person can point at the same rule and see the same words." "The written rule says that the person does not have to read the suggestions for the step to pass." If the check failed, that statement would be absent: "A failed check has no such rule to point at, or the rule does not say that the person does not have to read the suggestions for the step to pass." |

Findings: none.

### Design review, 2026-11-23

**Disposition:** pass

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| A1 | A person can point at the written rule and see that a failed row is repaired without asking the person. | PASS | "The written rule is the Rules section of `docs/01-processes/00-processes.md`. A person points at that rule. These sentences are written there." "A failed row is repaired without asking the person." |
| A2 | A person can point at the written rule and see that an agent who did not write the review makes the edit the row determines. | PASS | "An agent who did not write the review makes the edit the row determines." |
| A3 | A person can point at the written rule and see that the next review covers the rows that repair can change. | PASS | "The next review covers the rows that repair can change." |
| A4 | A person can point at the written rule and see the two cases where the person is asked: the failed row does not determine one edit, or the repair would change the outcome or the requirements. | PASS | "The person is asked in two cases. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements." |
| A5 | A person can point at the written rule and see that a smaller suggestion is a note the confirmed text does not require. | PASS | "A smaller suggestion is a note the confirmed text does not require." |
| A6 | A person can point at the written rule and see that the review records the suggestion, and that the suggestion has no verdict. | PASS | "The review records the suggestion, and the suggestion has no verdict." |
| A7 | A person can point at the written rule and see that the suggestion does not hold the step, and does not by itself call for another review. | PASS | "The suggestion does not hold the step, and does not by itself call for another review." |
| A8 | A person can point at the written rule and see that, when a failed row is being repaired, the repair also makes each suggestion that names one edit. | PASS | "When a failed row is being repaired, the repair also makes each suggestion that names one edit." |
| A9 | A person can point at the written rule and see that the review of that repair includes any row whose evidence that edit changed. | PASS | "The review of that repair includes any row whose evidence that edit changed." |
| A10 | A person can point at the written rule and see that a suggestion that names no single edit is left on the review. | PASS | "A suggestion that names no single edit is left on the review." |
| A11 | A person can point at the written rule and see that, when no row failed, no suggestion is applied. | PASS | "When no row failed, no suggestion is applied." |
| A12 | A person can point at the written rule and see that the step advances, and that the suggestions stay on the review for a later change to find. | PASS | "When no row failed, the step advances, and the suggestions stay on the review for a later change to find." |
| A13 | A person can point at the written rule and see that the person does not have to read the suggestions for the step to pass. | PASS | "When no row failed, the person does not have to read the suggestions for the step to pass." |
| C1 | The written rule is the Rules section of `docs/01-processes/00-processes.md`. A person points at that rule. Each acceptance sentence is written there, in the words of that check, in the order of the checks. | PASS | Serves A1 through A13. "These sentences are written there." The sentences follow the checks in order, from "A failed row is repaired without asking the person." through "When no row failed, the person does not have to read the suggestions for the step to pass." |
| C2 | Each of those sentences is one obligation. Behavior has one episode for it. The case is the situation the sentence names. The action is what the sentence says is done. The result is the sentence. The episode for the repair without asking is the situation where the row determines one edit and the repair would not change the outcome or the requirements. The episode for the two cases is the situation where the failed row does not determine one edit, or the repair would change the outcome or the requirements, and the action is that the person is asked. | PASS | Serves every acceptance check: "Each sentence is one obligation. Behavior has one episode for that obligation. ... The result is the sentence." Serves A1: "The episode for the repair without asking uses the situation where the row determines one edit and the repair would not change the outcome or the requirements. The person is not asked." Serves A4: "The episode for the two cases uses the situation where the failed row does not determine one edit, or the repair would change the outcome or the requirements. The person is asked." |
| C3 | The review records a smaller suggestion in that review, outside the matrix. The suggestion has no verdict. A further defect stays a new row, because the confirmed text already requires it. | PASS | Serves A5, A6, and A7. "The review records the suggestion in that review, outside the matrix. The suggestion has no verdict. A further defect stays a new row. The confirmed text already requires a further defect. A smaller suggestion is a note the confirmed text does not require." The written rule states A7: "The suggestion does not hold the step, and does not by itself call for another review." |
| C4 | `.ledger/process/review.md` states the suggestion sentences of the rule, in the place of the sentence that every other such note is left out. A note that is why a row fails stays part of the review. | PASS | Serves A5, A6, A7, A8, A10, A11, A12, and A13. "`.ledger/process/review.md` states the suggestion sentences. A note that is why a row fails stays part of the review. The sentence that every other such note is left out is replaced by these sentences. A smaller suggestion is a note the confirmed text does not require. The review records the suggestion, and the suggestion has no verdict. The suggestion does not hold the step, and does not by itself call for another review. When a failed row is being repaired, the repair also makes each suggestion that names one edit. A suggestion that names no single edit is left on the review. When no row failed, no suggestion is applied. When no row failed, the step advances, and the suggestions stay on the review for a later change to find. When no row failed, the person does not have to read the suggestions for the step to pass." |
| C5 | `.ledger/process/verification-signoff.md` states the repair sentences of the rule. An agent who did not write the review makes the edit the row determines. A finding names the row, the severity, the description, and whether it is mechanical. A new session reviews the repaired artifact. The next review covers the rows that repair can change. The review of that repair includes any row whose evidence that edit changed. `applied` records that the edit landed and does not remove the FAIL. The earlier review stays. A FAIL leaves the step where it is. When no row failed, the step advances as the rule says. | PASS | Serves A1, A2, A3, A4, A8, A9, A11, A12, and A13. "`.ledger/process/verification-signoff.md` states the repair sentences. A failed row is repaired without asking the person. An agent who did not write the review makes the edit the row determines. ... The person is asked in two cases. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements. When a failed row is being repaired, the repair also makes each suggestion that names one edit. The next review covers the rows that repair can change. The review of that repair includes any row whose evidence that edit changed. ... When no row failed, no suggestion is applied. When no row failed, the step advances, and the suggestions stay on the review for a later change to find. When no row failed, the person does not have to read the suggestions for the step to pass." |
| C6 | `.ledger/process/plan-workflow.md`, in the failed-review rule, states that a failed row is repaired without asking the person, that an agent who did not write the review makes the edit the row determines, that the person is asked in the two cases, that the repair also makes each suggestion that names one edit, and that the next review covers the rows that repair can change. The recorded matrix stays. A new session reviews the repaired artifact. The person amends the outcome and the requirements. An agent does not. | PASS | Serves A1, A2, A3, A4, and A8. "`.ledger/process/plan-workflow.md` states, in the failed-review rule, that a failed row is repaired without asking the person. An agent who did not write the review makes the edit the row determines. The person is asked in two cases. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements. When a failed row is being repaired, the repair also makes each suggestion that names one edit. The next review covers the rows that repair can change." |
| T1 | The tests on the branch are unchanged since their review. | PASS | Tests: "This piece writes no executable tests. The checks cannot be run until this piece has written its content. They are a reading of that writing. The person recorded this on 2026-11-23 and moved the plan to design." There is no tests-review matrix and no test branch. `git diff -- docs/_plans/17-failed-row.md` does not change the Tests section. |

Findings: none.

### Implementation review, 2026-11-24

**Disposition:** pass

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| A1 | A person can point at the written rule and see that a failed row is repaired without asking the person. | PASS | Rules, `docs/01-processes/00-processes.md`: "A failed row is repaired without asking the person." |
| A2 | A person can point at the written rule and see that an agent who did not write the review makes the edit the row determines. | PASS | Rules, `docs/01-processes/00-processes.md`: "An agent who did not write the review makes the edit the row determines." |
| A3 | A person can point at the written rule and see that the next review covers the rows that repair can change. | PASS | Rules, `docs/01-processes/00-processes.md`: "The next review covers the rows that repair can change." |
| A4 | A person can point at the written rule and see the two cases where the person is asked: the failed row does not determine one edit, or the repair would change the outcome or the requirements. | PASS | Rules, `docs/01-processes/00-processes.md`: "The person is asked in two cases. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements." |
| A5 | A person can point at the written rule and see that a smaller suggestion is a note the confirmed text does not require. | PASS | Rules, `docs/01-processes/00-processes.md`: "A smaller suggestion is a note the confirmed text does not require." |
| A6 | A person can point at the written rule and see that the review records the suggestion, and that the suggestion has no verdict. | PASS | Rules, `docs/01-processes/00-processes.md`: "The review records the suggestion, and the suggestion has no verdict." |
| A7 | A person can point at the written rule and see that the suggestion does not hold the step, and does not by itself call for another review. | PASS | Rules, `docs/01-processes/00-processes.md`: "The suggestion does not hold the step, and does not by itself call for another review." |
| A8 | A person can point at the written rule and see that, when a failed row is being repaired, the repair also makes each suggestion that names one edit. | PASS | Rules, `docs/01-processes/00-processes.md`: "When a failed row is being repaired, the repair also makes each suggestion that names one edit." |
| A9 | A person can point at the written rule and see that the review of that repair includes any row whose evidence that edit changed. | PASS | Rules, `docs/01-processes/00-processes.md`: "The review of that repair includes any row whose evidence that edit changed." |
| A10 | A person can point at the written rule and see that a suggestion that names no single edit is left on the review. | PASS | Rules, `docs/01-processes/00-processes.md`: "A suggestion that names no single edit is left on the review." |
| A11 | A person can point at the written rule and see that, when no row failed, no suggestion is applied. | PASS | Rules, `docs/01-processes/00-processes.md`: "When no row failed, no suggestion is applied." |
| A12 | A person can point at the written rule and see that the step advances, and that the suggestions stay on the review for a later change to find. | PASS | Rules, `docs/01-processes/00-processes.md`: "When no row failed, the step advances, and the suggestions stay on the review for a later change to find." |
| A13 | A person can point at the written rule and see that the person does not have to read the suggestions for the step to pass. | PASS | Rules, `docs/01-processes/00-processes.md`: "When no row failed, the person does not have to read the suggestions for the step to pass." |
| T1 | The tests are unchanged since their review. The Tests section of the plan is the tests. There is no test branch. | PASS | `git diff HEAD -- docs/_plans/17-failed-row.md` does not change the Tests section. It still reads: "This piece writes no executable tests. The checks cannot be run until this piece has written its content. They are a reading of that writing. The person recorded this on 2026-11-23 and moved the plan to design." There is no test branch. Other edits are not this row. |
| D0 | The design is unchanged since its review. | PASS | `git diff HEAD -- docs/_plans/17-failed-row.md` does not change the Decisions section or the Design section. |
| D1 | The written rule is the Rules section of `docs/01-processes/00-processes.md`. A person points at that rule. Each acceptance sentence is written there, in the words of that check, in the order of the checks. | PASS | `docs/01-processes/00-processes.md`, Rules, in check order: "A failed row is repaired without asking the person." "An agent who did not write the review makes the edit the row determines." "The next review covers the rows that repair can change." "The person is asked in two cases. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements." "A smaller suggestion is a note the confirmed text does not require." "The review records the suggestion, and the suggestion has no verdict." "The suggestion does not hold the step, and does not by itself call for another review." "When a failed row is being repaired, the repair also makes each suggestion that names one edit." "The review of that repair includes any row whose evidence that edit changed." "A suggestion that names no single edit is left on the review." "When no row failed, no suggestion is applied." "When no row failed, the step advances, and the suggestions stay on the review for a later change to find." "When no row failed, the person does not have to read the suggestions for the step to pass." |
| D2 | Each of those sentences is one obligation. Behavior has one episode for it. The case is the situation the sentence names. The action is what the sentence says is done. The result is the sentence. The episode for the repair without asking is the situation where the row determines one edit and the repair would not change the outcome or the requirements. The episode for the two cases is the situation where the failed row does not determine one edit, or the repair would change the outcome or the requirements, and the action is that the person is asked. | PASS | Behavior, `docs/01-processes/00-processes.md`, one episode per Rules sentence, and each Result is that sentence. Repair without asking: "Case: a review has failed a row. The row determines one edit. The repair would not change the outcome or the requirements." "Action: the row is repaired. The person is not asked." "Result: a failed row is repaired without asking the person." Two cases: "Case: a review has failed a row. The failed row does not determine one edit, or the repair would change the outcome or the requirements." "Action: the person is asked." "Result: the person is asked in two cases. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements." The other results are the other eleven sentences, from "an agent who did not write the review makes the edit the row determines." through "when no row failed, the person does not have to read the suggestions for the step to pass." |
| D3 | The review records a smaller suggestion in that review, outside the matrix. The suggestion has no verdict. A further defect stays a new row, because the confirmed text already requires it. | PASS | `.ledger/process/review.md`: "The reviewer looks for a further defect. It is one the confirmed text already requires, and one that none of this step's rows asks about. That defect is a new row." "A smaller suggestion is a note the confirmed text does not require. The review records the suggestion in that review, outside the matrix, and the suggestion has no verdict." |
| D4 | `.ledger/process/review.md` states the suggestion sentences of the rule, in the place of the sentence that every other such note is left out. A note that is why a row fails stays part of the review. | PASS | `.ledger/process/review.md` replaces "Every other such note is left out." The note that fails a row stays: "A note on wording, style, or another approach is part of the review when it is why a row fails." In that place: "A smaller suggestion is a note the confirmed text does not require. The review records the suggestion in that review, outside the matrix, and the suggestion has no verdict. The suggestion does not hold the step, and does not by itself call for another review. When a failed row is being repaired, the repair also makes each suggestion that names one edit. A suggestion that names no single edit is left on the review. When no row failed, no suggestion is applied. When no row failed, the step advances, and the suggestions stay on the review for a later change to find. When no row failed, the person does not have to read the suggestions for the step to pass." |
| D5 | `.ledger/process/verification-signoff.md` states the repair sentences of the rule. An agent who did not write the review makes the edit the row determines. A finding names the row, the severity, the description, and whether it is mechanical. A new session reviews the repaired artifact. The next review covers the rows that repair can change. The review of that repair includes any row whose evidence that edit changed. `applied` records that the edit landed and does not remove the FAIL. The earlier review stays. A FAIL leaves the step where it is. When no row failed, the step advances as the rule says. | PASS | `.ledger/process/verification-signoff.md`: "A finding names the row, the severity, the description, and whether it is mechanical." It does not name a fix. Step 2: "A failed row is repaired without asking the person. An agent who did not write the review makes the edit the row determines. The person is asked in two cases. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements. When a failed row is being repaired, the repair also makes each suggestion that names one edit. The next review covers the rows that repair can change. The review of that repair includes any row whose evidence that edit changed. A new session reviews the repaired artifact. `applied` records that the edit landed and does not remove the FAIL. The earlier review stays. A FAIL leaves the step where it is. When no row failed, no suggestion is applied. When no row failed, the step advances, and the suggestions stay on the review for a later change to find. When no row failed, the person does not have to read the suggestions for the step to pass." "The reviewer writes the matrix into the doc and recomputes. The reviewer does not change the artifact." The fully specified fix, the finding's fix text, the full spec-review rerun, and the implementation rerun of the failed rows, the rows the fix touched, and the requirements-text row are not stated. |
| D6 | `.ledger/process/plan-workflow.md`, in the failed-review rule, states that a failed row is repaired without asking the person, that an agent who did not write the review makes the edit the row determines, that the person is asked in the two cases, that the repair also makes each suggestion that names one edit, and that the next review covers the rows that repair can change. The recorded matrix stays. A new session reviews the repaired artifact. The person amends the outcome and the requirements. An agent does not. | PASS | `.ledger/process/plan-workflow.md`, failed-review rule: "Keep the recorded matrix. A failed row is repaired without asking the person. An agent who did not write the review makes the edit the row determines. The person is asked in two cases. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements. When a failed row is being repaired, the repair also makes each suggestion that names one edit. The next review covers the rows that repair can change. A new session reviews the repaired artifact. The person amends the outcome and the requirements. An agent does not." |

Findings: none.
