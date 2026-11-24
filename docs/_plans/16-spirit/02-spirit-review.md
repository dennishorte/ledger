# Spirit review

**Status:** accepted

## Part

`docs/01-processes/02-review/00-review.md`

## Parent

`docs/_plans/16-spirit.md`

## Outcome

**Outcome confirmed:** 2026-11-22

**Outcome amended:** 2026-11-23 — A spirit finding is defined.

A spirit review reads the change, the spirit of the part that change changes, and the spirits of the parts above it. It does not read the record pages. The letter decides the pass, and the person answers a spirit finding.

**Spirit finding.** A miss. The change does not fit the intent the review read. A review with no finding does not ask the person for an answer.

**Accepted:** 2026-11-23

The person accepts the finished work.

## Decisions

| # | Decision | Reason |
|---|----------|--------|
| D1 | How a spirit review runs is a section added at the end of `.ledger/process/review.md`, headed "Spirit review." Every line already in that file stays as it is. No other file is changed. | This serves each acceptance check. The checks are a reading of the writing this piece produces, and this section is that writing: "A person can point at a spirit review and see the change it read," "A person can point at a spirit review and see the spirit of the part that change changes," "A person can point at a spirit review and see the spirits of the parts above that part," "A person can point at a spirit review and see that it did not read the record pages," "A person can point at the pass and see that the letter decided it," "A person can point at a spirit finding and see that the change does not fit the intent the review read," "A person can point at a spirit review with no finding and see that it does not ask the person for an answer," and "A person can point at a spirit finding and see the person's answer." The parent's D4 is met because this piece adds only how the spirit review runs, as this section, and the rest of the file stays as it is. The parent's D1 is met because the section is not on a record page, and "What a reader reads" is not edited, so the letter reading set does not gain the spirit. |
| D2 | The section says a spirit review is a written account, and the account shows the change it read. | This serves "A person can point at a spirit review and see the change it read." The change is on the review, and it is the change the review read. |
| D3 | The section says the review walks from the part the change changes up through the parts above it, reads `spirit.md` beside the page of the part the change changes when that file is beside the page, and shows that spirit. | This serves "A person can point at a spirit review and see the spirit of the part that change changes." The parent's D2 is met because the review meets that spirit by this walk. The file `spirit.md` beside the page is the place the spirit piece settled. This piece does not choose that place again. |
| D4 | The section says that walk reads `spirit.md` beside the page of each part above the part the change changes, when that file is beside the page, and the review shows those spirits. | This serves "A person can point at a spirit review and see the spirits of the parts above that part." The parent's D2 is met because those spirits are met by the same walk, and the review adds no other way to find them. |
| D5 | The section says the review shows what it read. What it shows is the change and the spirits it read. It does not read the record pages. The record pages are not among what it shows it read. | This serves "A person can point at a spirit review and see that it did not read the record pages." The review shows what it read, and the record pages are not in that set. The parent's D1 is met because this reading is not added to the letter reading set. |
| D6 | The section says the letter decides the pass, and the pass shows that the letter decided it. The letter is the facts on the record pages. Finished work is still checked against the record. The spirit review does not decide the pass. The review does not accept finished work. | This serves "A person can point at the pass and see that the letter decided it." What decided the pass is the letter, and the pass shows that. The spirit review does not take the pass, and it does not accept the work. |
| D7 | The section says a spirit finding is a miss. The intent the review read is the spirits it read. The finding shows that the change does not fit that intent. | This serves "A person can point at a spirit finding and see that the change does not fit the intent the review read." |
| D8 | The section says a spirit review with no finding does not ask the person for an answer. | This serves "A person can point at a spirit review with no finding and see that it does not ask the person for an answer." |
| D9 | The section says a spirit finding shows the person's answer. The answer stays with the person. It does not become a fact the next change follows, and it does not become part of the spirit. | This serves "A person can point at a spirit finding and see the person's answer." The parent's D3 is met because the answer stays with the person and does not become a fact the next change follows. The next change follows the facts on the record pages. |

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

The writing this piece adds is one section at the end of `.ledger/process/review.md` (D1). The section is headed "Spirit review." Every line already in that file stays as it is. No other file is changed. No record page is edited. "What a reader reads" stays as it is, so the letter reading set does not gain the spirit. That is the parent's D1.

The section states how a spirit review runs. It does not choose where a spirit is kept, it does not write a spirit, and it does not write the rule for when a sub-part has a spirit of its own. It writes no sample change, no sample part, and no sample finding. The section is not a spirit review of a change, it is not a pass, and it is not a finding.

The checks are a reading of this writing. Where the writing has produced no spirit review, no pass, or no finding, the example is missing. A missing example is not a failed check.

The section that is added:

```markdown
## Spirit review

A spirit review is a written account. It reads the change, the spirit of the part that change changes, and the spirits of the parts above it. It does not read the record pages.

The review walks from the part the change changes up through the parts above it. It reads `spirit.md` beside the page of each part on that walk, when that file is beside the page. It does not read the record page.

The review shows the change it read. It shows the spirit of the part that change changes, when it read that spirit. It shows the spirits of the parts above that part, when it read those spirits. What it shows it read is the change and the spirits it read. The record pages are not among what it shows it read.

The letter decides the pass. The letter is the facts on the record pages. The pass shows that the letter decided it. Finished work is still checked against the record. The spirit review does not decide the pass. The review does not accept finished work.

A spirit finding is a miss. The intent the review read is the spirits it read. The finding shows that the change does not fit that intent. The finding shows the person's answer. The answer stays with the person. It does not become a fact the next change follows, and it does not become part of the spirit.

A spirit review with no finding does not ask the person for an answer.
```

### A person can point at a spirit review and see the change it read.

D1 puts the section at the end of `.ledger/process/review.md`. D2 says the review is a written account and the account shows the change it read.

A person points at that account and sees the change. The change on the review is the change the review read.

The section states that rule. It is not itself a spirit review of a change. Where this writing has produced no spirit review, the example is missing. A missing example is not a failed check. No change is invented so that an example exists.

### A person can point at a spirit review and see the spirit of the part that change changes.

D3 says the review walks from the part the change changes up through the parts above it. On that walk it reads `spirit.md` beside the page of the part the change changes, when that file is beside the page, and it shows that spirit. D2 makes the review a written account, so the spirit is on the account.

The file beside the page is the place the spirit piece settled. This piece does not choose that place again. When the file is beside the page, the review reads it and shows it. A person points at the review and sees that spirit. It is the spirit of the part that change changes.

When that file is not beside the page, the review does not read a spirit there and does not invent one. The test design says that where the part that change changes has no spirit, the example is missing. A missing example is not a failed check.

### A person can point at a spirit review and see the spirits of the parts above that part.

D4 says the same walk reads `spirit.md` beside the page of each part above the part the change changes, when that file is beside the page, and the review shows those spirits. D3 starts the walk at the part the change changes and takes it up through the parts above. The parent's D2 is that walk, and it is the only way the review finds those spirits. The review adds no list and no link from a record page.

The parts above are the containing parts, up through the project. The spirit beside a part's page is the one the review shows when the file is there. The project's spirit is already `docs/spirit.md`, beside `docs/00-project.md`. The walk meets it when the project is above the part the change changes. This piece does not write that spirit again.

A person points at the review and sees those spirits. They are the spirits of the parts above that part. Where a part above has no spirit, the review does not read one and does not invent one. The example for that part is missing. A missing example is not a failed check.

### A person can point at a spirit review and see that it did not read the record pages.

D5 says the review shows what it read. What it shows is the change and the spirits it read. It does not read the record pages. The record pages are not among what it shows it read. The walk in D3 reads `spirit.md` and does not read the record page.

The record pages are the pages that state what is true of the project now. A person points at the review and reads what it shows it read. That is the change and the spirits it read. The record pages are not among it. The change is shown, so the review does not show nothing it read.

The letter reading set stays the one in "What a reader reads." This piece does not add the spirit to that set. That is the parent's D1.

The section states this. Where this writing has produced no spirit review, the example is missing. A missing example is not a failed check.

### A person can point at the pass and see that the letter decided it.

D6 says the letter decides the pass, and the pass shows that the letter decided it. The letter is the facts on the record pages. Finished work is still checked against the record. The spirit review does not decide the pass. The review does not accept finished work.

A person points at the pass and reads what decided it. The letter decided it, and the pass shows that. The check of finished work against the record stays. The spirit review is not that check and does not accept the work. The record page of Review is not edited. Its facts stay: finished work is checked against the record, and the review does not accept finished work.

This piece produces no pass. Where this writing has produced no pass, the example is missing. A missing example is not a failed check.

### A person can point at a spirit finding and see that the change does not fit the intent the review read.

D7 says a spirit finding is a miss. The intent the review read is the spirits it read. The finding shows that the change does not fit that intent.

A person points at the finding and sees the change against that intent. The change does not fit the intent the review read.

This check applies when there is a finding. The section states what a finding shows. It does not contain a finding. A missing finding is not a failed check. No finding is invented so that an example exists.

### A person can point at a spirit review with no finding and see that it does not ask the person for an answer.

D8 says a spirit review with no finding does not ask the person for an answer.

A person points at that review and sees that it does not ask for an answer. This is the only check that uses a review with no finding. The section states the rule. It is not itself a review with no finding. Where this writing has produced no such review, the example is missing. A missing example is not a failed check.

### A person can point at a spirit finding and see the person's answer.

D9 says the finding shows the person's answer. The answer stays with the person. It does not become a fact the next change follows, and it does not become part of the spirit. The next change follows the facts on the record pages. That is the parent's D3.

A person points at the finding and sees the person's answer. The answer is on the finding. It is not written on a record page, and it is not added to a spirit. The section does not say what the person does with the work beyond that.

This check applies when there is a finding. A missing finding is not a failed check. No finding is invented so that an example exists.

## Implementation notes

The writing is the Spirit review section at the end of `.ledger/process/review.md`. Every line already in that file stayed as it was. No other file was changed. The section is not a review of a change, a pass, or a finding.

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

### Design review, 2026-11-23

**Disposition:** pass

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| A1 | A person can point at a spirit review and see the change it read. | PASS | "The review shows the change it read." "A person points at that account and sees the change. The change on the review is the change the review read." |
| A2 | A person can point at a spirit review and see the spirit of the part that change changes. | PASS | "On that walk it reads `spirit.md` beside the page of the part the change changes, when that file is beside the page, and it shows that spirit." "It shows the spirit of the part that change changes, when it read that spirit." "A person points at the review and sees that spirit. It is the spirit of the part that change changes." |
| A3 | A person can point at a spirit review and see the spirits of the parts above that part. | PASS | "the same walk reads `spirit.md` beside the page of each part above the part the change changes, when that file is beside the page, and the review shows those spirits." "It shows the spirits of the parts above that part, when it read those spirits." "A person points at the review and sees those spirits. They are the spirits of the parts above that part." |
| A4 | A person can point at a spirit review and see that it did not read the record pages. | PASS | "It does not read the record pages." "What it shows it read is the change and the spirits it read. The record pages are not among what it shows it read." "The change is shown, so the review does not show nothing it read." |
| A5 | A person can point at the pass and see that the letter decided it. | PASS | "The letter decides the pass." "The pass shows that the letter decided it." "A person points at the pass and reads what decided it. The letter decided it, and the pass shows that." |
| A6 | A person can point at a spirit finding and see that the change does not fit the intent the review read. | PASS | "The intent the review read is the spirits it read. The finding shows that the change does not fit that intent." "A person points at the finding and sees the change against that intent. The change does not fit the intent the review read." |
| A7 | A person can point at a spirit review with no finding and see that it does not ask the person for an answer. | PASS | "A spirit review with no finding does not ask the person for an answer." "A person points at that review and sees that it does not ask for an answer." |
| A8 | A person can point at a spirit finding and see the person's answer. | PASS | "The finding shows the person's answer." "A person points at the finding and sees the person's answer. The answer is on the finding." |
| C1 | How a spirit review runs is a section added at the end of `.ledger/process/review.md`, headed "Spirit review." Every line already in that file stays as it is. No other file is changed. | PASS | "This serves each acceptance check. The checks are a reading of the writing this piece produces, and this section is that writing:" and the reason names each of the eight checks. |
| C2 | The section says a spirit review is a written account, and the account shows the change it read. | PASS | "This serves \"A person can point at a spirit review and see the change it read.\"" |
| C3 | The section says the review walks from the part the change changes up through the parts above it, reads `spirit.md` beside the page of the part the change changes when that file is beside the page, and shows that spirit. | PASS | "This serves \"A person can point at a spirit review and see the spirit of the part that change changes.\"" |
| C4 | The section says that walk reads `spirit.md` beside the page of each part above the part the change changes, when that file is beside the page, and the review shows those spirits. | PASS | "This serves \"A person can point at a spirit review and see the spirits of the parts above that part.\"" |
| C5 | The section says the review shows what it read. What it shows is the change and the spirits it read. It does not read the record pages. The record pages are not among what it shows it read. | PASS | "This serves \"A person can point at a spirit review and see that it did not read the record pages.\"" |
| C6 | The section says the letter decides the pass, and the pass shows that the letter decided it. | PASS | "This serves \"A person can point at the pass and see that the letter decided it.\"" |
| C7 | The section says a spirit finding is a miss. The intent the review read is the spirits it read. The finding shows that the change does not fit that intent. | PASS | "This serves \"A person can point at a spirit finding and see that the change does not fit the intent the review read.\"" |
| C8 | The section says a spirit review with no finding does not ask the person for an answer. | PASS | "This serves \"A person can point at a spirit review with no finding and see that it does not ask the person for an answer.\"" |
| C9 | The section says a spirit finding shows the person's answer. The answer stays with the person. It does not become a fact the next change follows, and it does not become part of the spirit. | PASS | "This serves \"A person can point at a spirit finding and see the person's answer.\"" |
| P1 | The spirit is not a fact on a record page, so the letter reading set does not include it. | PASS | "No record page is edited. \"What a reader reads\" stays as it is, so the letter reading set does not gain the spirit." "The parent's D1 is met because the section is not on a record page, and \"What a reader reads\" is not edited, so the letter reading set does not gain the spirit." |
| P2 | A sub-part spirit is found only by the walk the spirit review takes, from the part a change changes up through the parts above it. | PASS | "The review walks from the part the change changes up through the parts above it." "The parent's D2 is that walk, and it is the only way the review finds those spirits. The review adds no list and no link from a record page." |
| P3 | A spirit finding is answered by the person, and the answer does not become a fact the next change follows. | PASS | "The finding shows the person's answer. The answer stays with the person. It does not become a fact the next change follows" "The next change follows the facts on the record pages. That is the parent's D3." |
| P4 | The spirit piece adds where a spirit is kept. The spirit review adds how that review runs. A sentence can land in an existing file. The rest of that file stays as it is. The spirit's own filename is chosen in the spirit piece. | PASS | "The writing this piece adds is one section at the end of `.ledger/process/review.md`" "Every line already in that file stays as it is. No other file is changed." "It does not choose where a spirit is kept" "The file `spirit.md` beside the page is the place the spirit piece settled. This piece does not choose that place again." |
| T1 | The tests on the branch are unchanged since their review. | PASS | "This piece writes no executable tests." "The person recorded this on 2026-11-23 and moved the plan to design." There is no tests-review matrix and no test branch. `git diff` on this plan leaves that Tests section in place. `git status` shows no test files. `docs/_plans/15-review-decisions.md` and `docs/_plans/17-failed-row.md` are not this artifact. |

Findings: none.

### Implementation review, 2026-11-23

**Disposition:** pass

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| A1 | A person can point at a spirit review and see the change it read. | PASS | `.ledger/process/review.md`: "The review shows the change it read." The section states that rule and contains no change. The test design says: "Where this writing has produced no spirit review, the example is missing" and "A missing example is not a failed check." The looked-at failure, "a spirit review that does not show the change it read," is not in the writing. |
| A2 | A person can point at a spirit review and see the spirit of the part that change changes. | PASS | "The review walks from the part the change changes up through the parts above it. It reads `spirit.md` beside the page of each part on that walk, when that file is beside the page." "It shows the spirit of the part that change changes, when it read that spirit." The test design says: "Where the part that change changes has no spirit, the example is missing." The looked-at failure, that spirit read and not shown, is not in the writing. |
| A3 | A person can point at a spirit review and see the spirits of the parts above that part. | PASS | The walk goes "up through the parts above it" and reads `spirit.md` "beside the page of each part on that walk, when that file is beside the page." "It shows the spirits of the parts above that part, when it read those spirits." The test design says: "Where a part above that part has no spirit, the example is missing." The looked-at failure, a spirit of a part above read and not shown, is not in the writing. |
| A4 | A person can point at a spirit review and see that it did not read the record pages. | PASS | "What it shows it read is the change and the spirits it read. The record pages are not among what it shows it read." "The review shows the change it read." "It does not read the record pages." "It does not read the record page." What the writing shows as read is the change and the spirits. The record pages are not among that, and the change is shown. |
| A5 | A person can point at the pass and see that the letter decided it. | PASS | "The letter decides the pass. The letter is the facts on the record pages. The pass shows that the letter decided it." The section is not a pass. The test design says: "Where this writing has produced no pass, the example is missing." There is no pass that the letter did not decide, and no pass that leaves the decider unshown. |
| A6 | A person can point at a spirit finding and see that the change does not fit the intent the review read. | PASS | "A spirit finding is a miss. The intent the review read is the spirits it read. The finding shows that the change does not fit that intent." The section contains no finding. The test design says: "This check applies when there is a finding. A missing finding is not a failed check." |
| A7 | A person can point at a spirit review with no finding and see that it does not ask the person for an answer. | PASS | "A spirit review with no finding does not ask the person for an answer." The section states that rule. It is not itself a review with no finding, and it does not ask the person for an answer. The test design says: "Where this writing has produced no such review, the example is missing." |
| A8 | A person can point at a spirit finding and see the person's answer. | PASS | "The finding shows the person's answer." The section contains no finding. The test design says: "This check applies when there is a finding. A missing finding is not a failed check." |
| U1 | The tests are unchanged since their review. | PASS | The Tests section in the working tree is identical to the Tests section at `114dd65`: "This piece writes no executable tests. The checks in the test design are a reading of the writing this piece produces. An executable test that fails before that writing exists is out of scope. The person recorded this on 2026-11-23 and moved the plan to design." `git diff --name-only 114dd65` names `.ledger/process/review.md`, `docs/_plans/15-review-decisions.md`, `docs/_plans/16-spirit/02-spirit-review.md`, and `docs/_plans/17-failed-row.md`. None is a test file. No untracked test file. There is no tests-review matrix. `docs/_plans/15-review-decisions.md` and `docs/_plans/17-failed-row.md` are not this artifact. |
| U2 | The design is unchanged since its review. | PASS | The Design section in the working tree is identical to the Design section at `c43a3de`. |
| C1 | How a spirit review runs is a section added at the end of `.ledger/process/review.md`, headed "Spirit review." Every line already in that file stays as it is. No other file is changed. | PASS | `git diff HEAD -- .ledger/process/review.md` adds only the section at the end, headed "Spirit review." The committed file is a prefix of the working tree, so every line already in that file stays. The writing is that section. `docs/_plans/15-review-decisions.md` and `docs/_plans/17-failed-row.md` are not this artifact. |
| C2 | The section says a spirit review is a written account, and the account shows the change it read. | PASS | "A spirit review is a written account." "The review shows the change it read." |
| C3 | The section says the review walks from the part the change changes up through the parts above it, reads `spirit.md` beside the page of the part the change changes when that file is beside the page, and shows that spirit. | PASS | "The review walks from the part the change changes up through the parts above it. It reads `spirit.md` beside the page of each part on that walk, when that file is beside the page." The part the change changes is the start of that walk. "It shows the spirit of the part that change changes, when it read that spirit." |
| C4 | The section says that walk reads `spirit.md` beside the page of each part above the part the change changes, when that file is beside the page, and the review shows those spirits. | PASS | The walk goes "up through the parts above it" and reads `spirit.md` "beside the page of each part on that walk, when that file is beside the page." "It shows the spirits of the parts above that part, when it read those spirits." |
| C5 | The section says the review shows what it read. What it shows is the change and the spirits it read. It does not read the record pages. The record pages are not among what it shows it read. | PASS | "What it shows it read is the change and the spirits it read. The record pages are not among what it shows it read." "It does not read the record pages." "It does not read the record page." |
| C6 | The section says the letter decides the pass, and the pass shows that the letter decided it. The letter is the facts on the record pages. Finished work is still checked against the record. The spirit review does not decide the pass. The review does not accept finished work. | PASS | "The letter decides the pass. The letter is the facts on the record pages. The pass shows that the letter decided it. Finished work is still checked against the record. The spirit review does not decide the pass. The review does not accept finished work." |
| C7 | The section says a spirit finding is a miss. The intent the review read is the spirits it read. The finding shows that the change does not fit that intent. | PASS | "A spirit finding is a miss. The intent the review read is the spirits it read. The finding shows that the change does not fit that intent." |
| C8 | The section says a spirit review with no finding does not ask the person for an answer. | PASS | "A spirit review with no finding does not ask the person for an answer." |
| C9 | The section says a spirit finding shows the person's answer. The answer stays with the person. It does not become a fact the next change follows, and it does not become part of the spirit. | PASS | "The finding shows the person's answer. The answer stays with the person. It does not become a fact the next change follows, and it does not become part of the spirit." |
| P1 | The spirit is not a fact on a record page, so the letter reading set does not include it. | PASS | The new text is in `.ledger/process/review.md`, not on a record page. "It does not read the record pages." "It does not read the record page." "The letter is the facts on the record pages." The review reads "`spirit.md` beside the page," not the record page. `git diff --name-only c43a3de` does not include `.ledger/process/system-record.md` or a record page. "What a reader reads" still says "Those pages are the reading set. The reader does not read any other page." It does not name `spirit.md`. |
| P2 | A sub-part spirit is found only by the walk the spirit review takes, from the part a change changes up through the parts above it. | PASS | "The review walks from the part the change changes up through the parts above it. It reads `spirit.md` beside the page of each part on that walk, when that file is beside the page." That walk is how the review finds the spirits. The section adds no other way, no list, and no link from a record page. |
| P3 | A spirit finding is answered by the person, and the answer does not become a fact the next change follows. | PASS | "The finding shows the person's answer. The answer stays with the person. It does not become a fact the next change follows, and it does not become part of the spirit." |
| P4 | The spirit piece adds where a spirit is kept. The spirit review adds how that review runs. A sentence can land in an existing file. The rest of that file stays as it is. The spirit's own filename is chosen in the spirit piece. | PASS | The added section at the end of `.ledger/process/review.md` is how the review runs. The committed file is a prefix of the working tree, so the rest of that file stays. The section reads `spirit.md` and does not choose a filename. It does not add where a spirit is kept. |

Findings: none.
