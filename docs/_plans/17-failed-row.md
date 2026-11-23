# Failed rows and smaller suggestions

**Status:** tests

## Part

`docs/01-processes/00-processes.md`

## Outcome

**Outcome confirmed:** 2026-11-23

When a review fails a row, that row is repaired without asking the person. An agent who did not write the review makes the edit the row determines. The next review covers the rows that repair can change. The person is asked in two cases: the failed row does not determine one edit, or the repair would change the outcome or the requirements.

A smaller suggestion is a note the confirmed text does not require. The review records it, and it has no verdict. It does not hold the step, and it does not by itself call for another review.

When a failed row is being repaired, the repair also makes each suggestion that names one edit. The review of that repair includes any row whose evidence that edit changed. A suggestion that names no single edit is left on the review.

When no row failed, no suggestion is applied. The step advances, and the suggestions stay on the review for a later change to find. The person does not have to read them for the step to pass.

## Decisions

*(not started)*

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

*(not started)*

## Design

*(not started)*

## Implementation notes

*(not started)*

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
