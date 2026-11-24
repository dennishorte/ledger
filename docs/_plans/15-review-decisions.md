# Decisions previously made

**Status:** design

## Part

`docs/01-processes/00-processes.md`

## Outcome

**Outcome confirmed:** 2026-11-24

**Spirit.** Designs and reviews respect the decisions previously made that directly affect this part.

A design follows each decision previously made that directly affects this part. Each review that decides a pass includes each of those decisions. A decision that does not directly affect this part is left out. A review that leaves out a decision that does directly affect this part does not pass. A review that passes shows that the work follows each included decision.

## Decisions

| | Decision | Reason |
|---|----------|--------|
| D1 | The writing this piece produces is `.ledger/process/plan-workflow.md` and `.ledger/process/review.md`. No example decision, design, or review is added. | It serves every acceptance check. The checks read that writing. The test design says a missing example is not a failed check, and that no decision, design, or review is invented so that an example exists. |
| D2 | A decision previously made is a fact in the reading set of the part being changed, or a confirmed decision on the parent plan. It directly affects this part when this change would be wrong if that decision were ignored. A design follows each such decision. A decision that does not directly affect this part is left out of the design and is not restated. The sentence that a sub-plan follows the parent plan's confirmed decisions is replaced by this limit. | It serves the check that a design follows each decision previously made that directly affects this part. It serves the check that a decision that does not directly affect this part is left out of the design. |
| D3 | The reviews that decide a pass are the coordinating review, the test-design review, the test review, the design review, and the implementation review. Each includes each decision previously made that directly affects this part, and leaves out a decision that does not. A spirit review is unchanged. | It serves the check that a review that decides a pass shows each decision previously made that directly affects this part. It serves the check that such a review leaves out a decision that does not directly affect this part. |
| D4 | A review that leaves out a decision previously made that directly affects this part does not pass. The sentence "one row per decision fetched" is removed from the design review and the implementation review. The rows D3 and D4 name are the rows those reviews use. | It serves the check that a review that leaves out a decision that does directly affect this part does not pass. It serves the check that a review that decides a pass shows each such decision, because there is one account of those rows. |
| D5 | A review that passes shows, for each included decision, that the work follows it. In `.ledger/process/review.md`, for each review that decides a pass, the evidence for an included decision points at the part of the artifact that follows it. The row fails when that part is absent. | It serves the check that a review that passes shows that the work follows each included decision. It serves the check that a review that decides a pass shows each decision previously made that directly affects this part. |
| D6 | In `.ledger/process/verification-signoff.md`, the spec-review sentence that gives one row per fact in the reading set is removed. The rows a review uses are the ones `.ledger/process/plan-workflow.md` names. The verdict rules in that file stay as they are. | It serves the check that a decision that does not directly affect this part is left out. It serves the check that a review that decides a pass includes each decision that does directly affect this part. A second account would include a fact the first account leaves out. |

## Requirements

**Requirements confirmed:** 2026-11-24

**Acceptance.**

- A person can point at a design and see that it follows each decision previously made that directly affects this part.
- A person can point at a review that decides a pass and see each decision previously made that directly affects this part.
- A person can point at a design, and at a review that decides a pass, and see that a decision that does not directly affect this part is left out.
- A person can point at a review that leaves out a decision that does directly affect this part and see that the review does not pass.
- A person can point at a review that passes and see that the work follows each included decision.

**Constraints.**

None

**Out of scope.**

- A review that does not decide a pass (spirit reviews).
- Changing a decision previously made.

## Test design

The checks are run on the writing this piece has produced. They are not run on the project from before that writing. A missing example is not a failed check. No decision, design, or review is invented so that an example exists.

### A person can point at a design and see that it follows each decision previously made that directly affects this part.

**Setup.** This piece has written how a design treats a decision previously made. The design is one this writing has produced. At least one decision previously made directly affects this part. Where this writing has produced no such design, the example is missing.

**Action.** The agent points at the design and reads each decision previously made that directly affects this part. A person can point at the same design and see the same.

**Looked at.** Each of those decisions on the design. The design follows each one. A failed check has a design that leaves one of them out, or that does not follow one.

### A person can point at a review that decides a pass and see each decision previously made that directly affects this part.

**Setup.** This piece has written how a review that decides a pass treats a decision previously made. The review is one this writing has produced, and it decides a pass. At least one decision previously made directly affects this part. Where this writing has produced no such review, the example is missing.

**Action.** The agent points at that review and reads each decision previously made that directly affects this part. A person can point at the same review and see the same.

**Looked at.** Each of those decisions on the review. A failed check has a review that decides a pass and does not show one of them.

### A person can point at a design, and at a review that decides a pass, and see that a decision that does not directly affect this part is left out.

**Setup.** This piece has written how a design and a review that decides a pass treat a decision previously made. The design and the review are ones this writing has produced. A decision previously made does not directly affect this part. Where this writing has produced no such decision, the example is missing.

**Action.** The agent points at the design and at the review and looks for that decision. A person can point at the same design and the same review and see the same.

**Looked at.** That decision is left out of the design and left out of the review. A failed check has that decision in the design or in the review.

### A person can point at a review that leaves out a decision that does directly affect this part and see that the review does not pass.

**Setup.** This piece has written how a review treats a decision previously made that directly affects this part. The review is one this writing has produced, and it leaves out such a decision. Where this writing has produced no such review, the example is missing.

**Action.** The agent points at that review and reads whether it passes. A person can point at the same review and see the same.

**Looked at.** The review does not pass. A failed check has that review passing.

### A person can point at a review that passes and see that the work follows each included decision.

**Setup.** This piece has written how a passing review shows the work. The review is one this writing has produced, and it passes. It includes each decision previously made that directly affects this part. Where this writing has produced no passing review, the example is missing.

**Action.** The agent points at that review and reads whether the work follows each included decision. A person can point at the same review and see the same.

**Looked at.** The work follows each included decision. A failed check has a passing review that does not show the work following one of them.

## Tests

This piece writes no executable tests. The checks cannot be run until this piece has written its content. They are a reading of that writing. The person recorded this on 2026-11-24 and moved the plan to design.

## Design

The writing is `.ledger/process/plan-workflow.md` and `.ledger/process/review.md`, plus the one sentence D6 removes from `.ledger/process/verification-signoff.md`. The checks are a reading of that writing. No example decision, design, or review is added. Where the writing has produced no instance of a design or a review, the example is missing, and a missing example is not a failed check.

### A person can point at a design and see that it follows each decision previously made that directly affects this part.

D2 writes this into `.ledger/process/plan-workflow.md`, in "Facts the plan follows," and in the design step. A decision previously made is a fact in the reading set of the part being changed, or a confirmed decision on the parent plan. It directly affects this part when this change would be wrong if that decision were ignored. A design follows each such decision.

A person points at that passage and reads that the design follows each of those decisions. The sentence that a sub-plan follows every confirmed decision on the parent plan is replaced by this limit.

### A person can point at a review that decides a pass and see each decision previously made that directly affects this part.

D3 names the reviews that decide a pass: the coordinating review, the test-design review, the test review, the design review, and the implementation review. In `.ledger/process/plan-workflow.md`, each of those reviews includes each decision previously made that directly affects this part.

D5 writes the evidence for that inclusion into `.ledger/process/review.md`. For each of those reviews, the evidence points at the part of the artifact that follows the decision.

A person points at those review passages and sees each such decision on the review. A spirit review does not decide a pass. Its section in `.ledger/process/review.md` stays as it is.

### A person can point at a design, and at a review that decides a pass, and see that a decision that does not directly affect this part is left out.

D2 says a design leaves out a decision that does not directly affect this part, and does not restate it. D3 says each review that decides a pass leaves that decision out. D6 removes the spec-review sentence in `.ledger/process/verification-signoff.md` that gives one row per fact in the reading set, so that sentence does not put a fact that does not directly affect this part onto the review. The verdict rules in that file stay as they are.

A person points at the design passage and at the review passage and does not find that decision there.

### A person can point at a review that leaves out a decision that does directly affect this part and see that the review does not pass.

D4 writes this into each review in `.ledger/process/plan-workflow.md` that decides a pass. A review that leaves out a decision previously made that directly affects this part does not pass. The sentence "one row per decision fetched" is removed from the design review and the implementation review. The rows D3 and D4 name are the rows those reviews use.

A person points at that sentence and reads that the review does not pass.

### A person can point at a review that passes and see that the work follows each included decision.

D5 writes this into `.ledger/process/plan-workflow.md` for each review that decides a pass, and into `.ledger/process/review.md` as the evidence for an included decision. The evidence points at the part of the artifact that follows the decision. The row fails when that part is absent. A review that passes shows, for each included decision, that the work follows it.

A person points at that passage and reads that the work follows each included decision.

The checks are a reading of this writing. This piece writes no executable test. The Tests section stays as it is.

## Implementation notes

*(not started)*

## Reviews

### Test design review, 2026-11-24

**Disposition:** pass

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| A1 | A person can point at a design and see that it follows each decision previously made that directly affects this part. | PASS | "The design is one this writing has produced. At least one decision previously made directly affects this part." "The agent points at the design and reads each decision previously made that directly affects this part." "Each of those decisions on the design. The design follows each one." If the check failed, one of those decisions would be missing or not followed: "A failed check has a design that leaves one of them out, or that does not follow one." |
| A2 | A person can point at a review that decides a pass and see each decision previously made that directly affects this part. | PASS | "The review is one this writing has produced, and it decides a pass. At least one decision previously made directly affects this part." "The agent points at that review and reads each decision previously made that directly affects this part." "Each of those decisions on the review." If the check failed, a passing review would omit one: "A failed check has a review that decides a pass and does not show one of them." |
| A3 | A person can point at a design, and at a review that decides a pass, and see that a decision that does not directly affect this part is left out. | PASS | "This piece has written how a design and a review that decides a pass treat a decision previously made. The design and the review are ones this writing has produced. A decision previously made does not directly affect this part." "The agent points at the design and at the review and looks for that decision." "That decision is left out of the design and left out of the review." If the check failed, the decision would be present in one of them: "A failed check has that decision in the design or in the review." |
| A4 | A person can point at a review that leaves out a decision that does directly affect this part and see that the review does not pass. | PASS | "The review is one this writing has produced, and it leaves out such a decision." "The agent points at that review and reads whether it passes." "The review does not pass." If the check failed, that same review would pass: "A failed check has that review passing." |
| A5 | A person can point at a review that passes and see that the work follows each included decision. | PASS | "The review is one this writing has produced, and it passes. It includes each decision previously made that directly affects this part." "The agent points at that review and reads whether the work follows each included decision." "The work follows each included decision." If the check failed, the passing review would not show that following for one of them: "A failed check has a passing review that does not show the work following one of them." |

Findings: none.
