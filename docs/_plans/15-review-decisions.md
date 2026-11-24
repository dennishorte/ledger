# Decisions previously made

**Status:** test-design

## Part

`docs/01-processes/00-processes.md`

## Outcome

**Outcome confirmed:** 2026-11-24

**Spirit.** Designs and reviews respect the decisions previously made that directly affect this part.

A design follows each decision previously made that directly affects this part. Each review that decides a pass includes each of those decisions. A decision that does not directly affect this part is left out. A review that leaves out a decision that does directly affect this part does not pass. A review that passes shows that the work follows each included decision.

## Decisions

*(not started)*

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

*(not started)*

## Design

*(not started)*

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
