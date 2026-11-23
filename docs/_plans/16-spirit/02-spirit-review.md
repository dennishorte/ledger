# Spirit review

**Status:** design

## Part

`docs/01-processes/02-review/00-review.md`

## Parent

`docs/_plans/16-spirit.md`

## Outcome

**Outcome confirmed:** 2026-11-22

**Outcome amended:** 2026-11-23 — A spirit finding is defined.

A spirit review reads the change, the spirit of the part that change changes, and the spirits of the parts above it. It does not read the record pages. The letter decides the pass, and the person answers a spirit finding.

**Spirit finding.** A miss. The change does not fit the intent the review read. A review with no finding does not ask the person for an answer.

## Decisions

*(not started)*

## Requirements

**Requirements confirmed:** 2026-11-23

**Acceptance.**

- A person can point at a spirit review and see the change it read.
- A person can point at a spirit review and see the spirit of the part that change changes.
- A person can point at a spirit review and see the spirits of the parts above that part.
- A person can point at a spirit review and see that it did not read the record pages.
- A person can point at the pass and see that the letter decided it.
- A person can point at a spirit finding and see that the change does not fit the intent the review read.
- A person can point at a spirit review with no finding and see that it does not ask the person for an answer.
- A person can point at a spirit finding and see the person's answer.

**Constraints.**

- The spirit is not a fact on a record page, so the letter reading set does not include it.
- A sub-part spirit is found only by the walk the spirit review takes, from the part a change changes up through the parts above it.
- The person's answer to a spirit finding does not become a fact the next change follows.
- This piece adds only how the spirit review runs. The rest of a file it changes stays as it is.
- Finished work is still checked against the record.
- The review does not accept finished work.

**Out of scope.**

- Where a spirit is kept, and the spirit's filename.
- Writing the project's spirit.
- Writing a sub-part's spirit.
- The rule for when a sub-part has a spirit of its own.
- Accepting finished work.

## Test design

The checks are run on the writing this piece has produced. They are not run on the project from before that writing. A missing example is not a failed check. No change, part, or finding is invented so that an example exists. A review with no finding is a case only for the check that names a review with no finding. The check for the person's answer applies when there is a finding. No other check passes or fails based on whether a finding exists.

### A person can point at a spirit review and see the change it read.

**Setup.** This piece has written how a spirit review runs. The spirit review is one this writing has produced. Where this writing has produced no spirit review, the example is missing.

**Action.** The agent points at the spirit review and reads the change it read. A person can point at the same review and see the same change.

**Looked at.** The change on that review. It is the change the review read. A failed check has a spirit review that does not show the change it read.

### A person can point at a spirit review and see the spirit of the part that change changes.

**Setup.** This piece has written how a spirit review runs. The spirit review is one this writing has produced. Where the part that change changes has no spirit, the example is missing.

**Action.** The agent points at the spirit review and reads the spirit of the part that change changes. A person can point at the same review and see the same spirit.

**Looked at.** That spirit on the review. It is the spirit of the part that change changes. A failed check has that spirit read by the review and not shown on the review.

### A person can point at a spirit review and see the spirits of the parts above that part.

**Setup.** This piece has written how a spirit review runs. The spirit review is one this writing has produced. Where a part above that part has no spirit, the example is missing.

**Action.** The agent points at the spirit review and reads the spirits of the parts above that part. A person can point at the same review and see the same spirits.

**Looked at.** Those spirits on the review. They are the spirits of the parts above that part. A failed check has a spirit of a part above that part read by the review and not shown on the review.

### A person can point at a spirit review and see that it did not read the record pages.

**Setup.** This piece has written how a spirit review runs. The spirit review is one this writing has produced. The record pages are the pages that state what is true of the project now.

**Action.** The agent points at the spirit review and reads what it read. A person can point at the same review and see the same.

**Looked at.** What the review shows it read. The record pages are not among it. A failed check has a record page among what the review shows it read, or a review that shows nothing it read.

### A person can point at the pass and see that the letter decided it.

**Setup.** This piece has written how a spirit review runs. The pass is one this writing has produced. The letter is the facts on the record pages. Where this writing has produced no pass, the example is missing.

**Action.** The agent points at the pass and reads what decided it. A person can point at the same pass and see the same decision.

**Looked at.** What decided the pass. The letter decided it. A failed check has a pass that the letter did not decide, or a pass that does not show what decided it.

### A person can point at a spirit finding and see that the change does not fit the intent the review read.

**Setup.** This piece has written how a spirit review runs. The spirit finding is one this writing has produced. This check applies when there is a finding. A review with no finding is not this check. A missing finding is not a failed check.

**Action.** The agent points at the spirit finding and reads that the change does not fit the intent the review read. A person can point at the same finding and see the same.

**Looked at.** The change against that intent. The change does not fit the intent the review read. A failed check has a spirit finding that does not show the change failing to fit the intent the review read.

### A person can point at a spirit review with no finding and see that it does not ask the person for an answer.

**Setup.** This piece has written how a spirit review runs. The review is a spirit review with no finding that this writing has produced. This is the only check that uses a review with no finding. Where this writing has produced no such review, the example is missing.

**Action.** The agent points at that review and reads whether it asks the person for an answer. A person can point at the same review and see the same.

**Looked at.** Whether that review asks the person for an answer. It does not. A failed check has a spirit review with no finding that asks the person for an answer.

### A person can point at a spirit finding and see the person's answer.

**Setup.** This piece has written how a spirit review runs. The spirit finding is one this writing has produced. This check applies when there is a finding. A review with no finding is not this check. A missing finding is not a failed check.

**Action.** The agent points at the spirit finding and reads the person's answer. A person can point at the same finding and see the same answer.

**Looked at.** The person's answer on that finding. A failed check has a spirit finding that does not show the person's answer.

## Tests

This piece writes no executable tests. The checks in the test design are a reading of the writing this piece produces. An executable test that fails before that writing exists is out of scope. The person recorded this on 2026-11-23 and moved the plan to design.

## Design

*(not started)*

## Implementation notes

*(not started)*

## Reviews

### Test design review, 2026-11-23

**Disposition:** pass

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| A1 | A person can point at a spirit review and see the change it read. | PASS | "The spirit review is one this writing has produced." "The agent points at the spirit review and reads the change it read." "The change on that review. It is the change the review read." If the check failed, that change would be absent: "A failed check has a spirit review that does not show the change it read." |
| A2 | A person can point at a spirit review and see the spirit of the part that change changes. | PASS | "The spirit review is one this writing has produced." "The agent points at the spirit review and reads the spirit of the part that change changes." "That spirit on the review. It is the spirit of the part that change changes." If the check failed, that spirit would be unshown: "A failed check has that spirit read by the review and not shown on the review." |
| A3 | A person can point at a spirit review and see the spirits of the parts above that part. | PASS | "The spirit review is one this writing has produced." "The agent points at the spirit review and reads the spirits of the parts above that part." "Those spirits on the review. They are the spirits of the parts above that part." If the check failed, one of those spirits would be unshown: "A failed check has a spirit of a part above that part read by the review and not shown on the review." |
| A4 | A person can point at a spirit review and see that it did not read the record pages. | PASS | "The record pages are the pages that state what is true of the project now." "The agent points at the spirit review and reads what it read." "What the review shows it read. The record pages are not among it." If the check failed, a record page would be among that, or nothing read would be shown: "A failed check has a record page among what the review shows it read, or a review that shows nothing it read." |
| A5 | A person can point at the pass and see that the letter decided it. | PASS | "The pass is one this writing has produced. The letter is the facts on the record pages." "The agent points at the pass and reads what decided it." "What decided the pass. The letter decided it." If the check failed, the decider would be something other than the letter, or no decider would be shown: "A failed check has a pass that the letter did not decide, or a pass that does not show what decided it." |
| A6 | A person can point at a spirit finding and see that the change does not fit the intent the review read. | PASS | "The spirit finding is one this writing has produced." "The agent points at the spirit finding and reads that the change does not fit the intent the review read." "The change against that intent. The change does not fit the intent the review read." If the check failed, that misfit would not be shown: "A failed check has a spirit finding that does not show the change failing to fit the intent the review read." |
| A7 | A person can point at a spirit review with no finding and see that it does not ask the person for an answer. | PASS | "The review is a spirit review with no finding that this writing has produced." "The agent points at that review and reads whether it asks the person for an answer." "Whether that review asks the person for an answer. It does not." If the check failed, that review would ask: "A failed check has a spirit review with no finding that asks the person for an answer." |
| A8 | A person can point at a spirit finding and see the person's answer. | PASS | "This check applies when there is a finding." "The agent points at the spirit finding and reads the person's answer." "The person's answer on that finding." If the check failed, that answer would be absent: "A failed check has a spirit finding that does not show the person's answer." |

Findings: none.
