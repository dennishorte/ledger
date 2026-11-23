# Spirit

**Status:** implementation

## Part

`docs/01-processes/00-processes.md`

## Parent

`docs/_plans/16-spirit.md`

## Outcome

**Outcome confirmed:** 2026-11-22

The spirit states the intent that the spirit review reads. A sub-part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it.

## Decisions

| # | Decision | Reason |
|---|----------|--------|
| D1 | The project's spirit is the file `docs/spirit.md`, beside the root page `docs/00-project.md`. The filename is `spirit.md`. | This serves "A person can point at the project's spirit and see an intent the record pages do not state" by giving that spirit a file to point at. It serves "A person can point at the record pages and see that the spirit is not a fact there" because the record page in that directory is `docs/00-project.md`, and `docs/spirit.md` is not a record page. The parent's D1 is met because the spirit stays off the record pages, so the letter reading set, which reads those pages, does not include it. The parent's D4 is met because this piece chooses the filename. |
| D2 | `docs/spirit.md` has one paragraph, the project's intent, in the person's words. The filing rule is not in that file. That paragraph is the only place those words are written. | This serves "A person can point at the project's spirit and see an intent the record pages do not state." The person writes that intent, and no record page states it. It also serves "A person can point at the record pages and see that the spirit is not a fact there," because the intent is written in the spirit file and is not written on a record page. |
| D3 | `.ledger/process/spirit.md` holds the sentence "A sub-part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it." The writing adds no spirit file beside any other part's page. | This serves "A person can point at the rule that a sub-part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it." The person points at this sentence in the process doc and reads that condition. The project's spirit does not contain the rule. A part need not have a spirit of its own, so no other spirit file is added and no part is invented so that an example exists. |
| D4 | One sentence is added at the end of "Outside the record" in `.ledger/process/system-record.md`: "A spirit is kept in `spirit.md` beside the page of the part it belongs to." Every other line in that file stays as it is. | This serves "A person can point at the record pages and see that the spirit is not a fact there." The sentence that says where a spirit is kept lands in the process file, and no record page states the spirit. It serves "A person can point at the project's spirit and see an intent the record pages do not state" because the place it names, beside the root page, is `docs/spirit.md`. The parent's D2 is met because a sub-part's spirit is kept with that sub-part, beside that sub-part's page, and the writing adds no other home for it. The parent's D4 is met because this piece adds where a spirit is kept, as this one sentence, and the rest of the file stays as it is. The sentence does not say how a spirit review runs. |

## Requirements

**Requirements confirmed:** 2026-11-23

**Acceptance.**

- A person can point at the project's spirit and see an intent the record pages do not state.
- A person can point at the record pages and see that the spirit is not a fact there.
- A person can point at the rule that a sub-part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it.

**Constraints.**

- The spirit is not a fact on a record page, so the letter reading set does not include it.
- A sub-part spirit is found only by the walk from the part a change changes up through the parts above it.
- This piece adds only where a spirit is kept. The rest of a file it changes stays as it is.
- This piece chooses where the spirit text is kept.
- A spirit finding does not become part of the spirit.

**Out of scope.**

- How a spirit review runs.
- An executable test that fails before this writing exists.

## Test design

The checks are run on the writing this piece has produced. They are not run on the project from before that writing.

### A person can point at the project's spirit and see an intent the record pages do not state.

**Setup.** This piece has written the project's spirit. The record pages are the pages that state what is true of the project now.

**Action.** The agent points at one intent in that spirit and reads the record pages for that intent. A person can point at the same intent and read the same pages.

**Looked at.** That intent in the spirit, and the statements on the record pages. The intent is in the spirit, and no record page states it. A failed check has no intent in the spirit to point at, or has that intent stated on a record page.

### A person can point at the record pages and see that the spirit is not a fact there.

**Setup.** This piece has written the project's spirit. The record pages are the pages that state what is true of the project now.

**Action.** The agent points at the record pages and reads the facts on them for that spirit. A person can point at the same pages and read the same facts.

**Looked at.** The facts on the record pages. The spirit is not a fact on them. A failed check has the spirit as a fact on a record page.

### A person can point at the rule that a sub-part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it.

**Setup.** This piece has written that rule. The rule is not part of the project's spirit. A part need not have a spirit of its own. The words in this plan are not the rule.

**Action.** The agent points at the rule and reads when a part has a spirit of its own. A person can point at the same rule and read the same words.

**Looked at.** The condition those words give. A part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it. A failed check has no such rule to point at, or the rule gives a different condition.

## Tests

This piece writes no executable tests. The checks in the test design are a reading of the writing this piece produces. An executable test that fails before that writing exists is out of scope. The person recorded this on 2026-11-23 and moved the plan to design.

## Design

The writing is the file `docs/spirit.md`, the process doc `.ledger/process/spirit.md`, and one new sentence in `.ledger/process/system-record.md`. The checks are a reading of that writing. No record page is edited. The letter reading set still reads the part's page, the pages above it, and a neighbor's Offers. It does not gain `spirit.md`.

`docs/spirit.md` is one paragraph, the project's intent (D2). The filing rule is not in that file (D3). A spirit finding is not a paragraph of that file, and the person's answer to a finding is not written on a record page. The next change follows the facts on the record pages. That is the parent's D3.

### A person can point at the project's spirit and see an intent the record pages do not state.

D1 places the project's spirit at `docs/spirit.md`, beside `docs/00-project.md`. D4 names that place: `spirit.md` beside the page of the part the spirit belongs to. For the project, the page is the root page, so the file is `docs/spirit.md`.

D2 makes that file one paragraph, the project's intent, in the person's words. The person writes an intent, and no record page states that intent. The writing puts the sentence in that paragraph and nowhere else. A person points at that paragraph. The record pages are the pages that state what is true of the project now. Those pages do not state that intent.

### A person can point at the record pages and see that the spirit is not a fact there.

D1 keeps the spirit in `docs/spirit.md`. That file is not a record page. D2 keeps the intent in that file. D4 puts the where-sentence in `.ledger/process/system-record.md`, at the end of "Outside the record," after the paragraph that is already there. That paragraph stays as it is. The new sentence is: "A spirit is kept in `spirit.md` beside the page of the part it belongs to."

No record page gains a sentence, a Parts entry, or a link to the spirit. A person who points at the record pages and reads the facts on them does not find the spirit among those facts. Kept off those pages, the spirit stays out of the letter reading set. That is the parent's D1.

### A person can point at the rule that a sub-part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it.

D3 writes the rule in `.ledger/process/spirit.md`. The sentence is: "A sub-part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it."

A person points at that sentence and reads the condition those words give. A sub-part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it. The words in this plan are not the rule. The sentence in `.ledger/process/spirit.md` is the rule. The project's spirit does not contain it.

This piece writes the project's spirit only, as the intent. A part need not have a spirit of its own. No spirit file is added beside any other part's page, and no part is added so that an example exists.

### Where a spirit is kept

D1 chooses the filename `spirit.md` for the project's spirit and for a sub-part's spirit. D4 records where that file is kept, as the one new sentence in `.ledger/process/system-record.md`. The rest of that file stays as it is. That is the parent's D4.

`.ledger/process/spirit.md` is the process doc. It is not a spirit kept beside a part's page. It holds the rule in D3.

A sub-part that has a spirit of its own, under the rule in D3, keeps it in `spirit.md` beside that sub-part's page. The part's page is the `00-name.md` in that part's directory, so the spirit file is in that same directory, with the sub-part. The directories nest with the parts, so a walk from the part a change changes up through the parts above it passes the directory of each of those parts. This piece adds no list of spirits and no link from a record page. The spirit has no other home. How a spirit review runs that walk is out of scope for this piece.

The checks are a reading of this writing. This piece writes no executable test.

## Implementation notes

`docs/spirit.md` is the project's intent, one paragraph. The rule is the sentence in `.ledger/process/spirit.md`. The where-sentence stays at the end of Outside the record in `.ledger/process/system-record.md`. No record page was edited. No spirit file was added beside any other part's page.

## Reviews

### Test design review, 2026-11-23

**Disposition:** changes-required

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| A1 | A person can point at the project's spirit and see an intent the record pages do not state. | PASS | "This piece has written the project's spirit." "The agent points at one intent in that spirit and reads the record pages for that intent." "That intent in the spirit, and the statements on the record pages." "A failed check has no intent in the spirit to point at, or has that intent stated on a record page." |
| A2 | A person can point at the record pages and see that the spirit is not a fact there. | PASS | "This piece has written the project's spirit." "The agent points at the record pages and reads the facts on them for that spirit." "The facts on the record pages." "A failed check has the spirit as a fact on a record page." |
| A3 | A person can point at the rule that a sub-part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it. | FAIL | The line is that a person can point at the rule. The test design also decides the check by whether a part has a spirit of its own. "No part having a spirit of its own is a pass when the spirits above it already say that intent." "or a part has a spirit of its own when the spirits above it already say that intent." |

Findings:

A3. The test design adds a check. It passes that check when a part has no spirit of its own and the spirits above it already say the intent, and it fails that check when a part has a spirit of its own in that same case. The confirmed line is that a person can point at the rule. Evidence: "No part having a spirit of its own is a pass when the spirits above it already say that intent." "A failed check has no such rule to point at, the rule gives a different condition, or a part has a spirit of its own when the spirits above it already say that intent."

### Test design review, 2026-11-23

**Disposition:** pass

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| A1 | A person can point at the project's spirit and see an intent the record pages do not state. | PASS | "This piece has written the project's spirit." "The agent points at one intent in that spirit and reads the record pages for that intent." "That intent in the spirit, and the statements on the record pages." "The intent is in the spirit, and no record page states it." "A failed check has no intent in the spirit to point at, or has that intent stated on a record page." |
| A2 | A person can point at the record pages and see that the spirit is not a fact there. | PASS | "This piece has written the project's spirit." "The agent points at the record pages and reads the facts on them for that spirit." "The facts on the record pages." "The spirit is not a fact on them." "A failed check has the spirit as a fact on a record page." |
| A3 | A person can point at the rule that a sub-part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it. | PASS | "This piece has written that rule with the project's spirit." "The agent points at the rule and reads when a part has a spirit of its own." "The condition those words give." "A part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it." "A failed check has no such rule to point at, or the rule gives a different condition." |

Findings: none.

### Design review, 2026-11-23

**Disposition:** pass

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| A1 | A person can point at the project's spirit and see an intent the record pages do not state. | PASS | "D1 places the project's spirit at `docs/spirit.md`, beside `docs/00-project.md`." "D2 makes the first paragraph the project's intent." "A person points at that paragraph." "Those pages do not state that intent." |
| A2 | A person can point at the record pages and see that the spirit is not a fact there. | PASS | "No record page gains a sentence, a Parts entry, or a link to the spirit. A person who points at the record pages and reads the facts on them does not find the spirit among those facts." |
| A3 | A person can point at the rule that a sub-part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it. | PASS | "The paragraph is this sentence: \"A sub-part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it.\"" "A person points at that paragraph and reads the condition those words give." |
| C1 | The project's spirit is the file `docs/spirit.md`, beside the root page `docs/00-project.md`. The filename is `spirit.md`. | PASS | "This serves \"A person can point at the project's spirit and see an intent the record pages do not state\" by giving that spirit a file to point at. It serves \"A person can point at the record pages and see that the spirit is not a fact there\"" |
| C2 | The first paragraph of `docs/spirit.md` is the project's intent. The words are marked `_(person)_`. The person writes an intent that no record page states. That paragraph is the only place those words are written. | PASS | "This serves \"A person can point at the project's spirit and see an intent the record pages do not state.\"" "It also serves \"A person can point at the record pages and see that the spirit is not a fact there,\"" |
| C3 | The second paragraph of `docs/spirit.md` is the sentence "A sub-part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it." The writing adds no spirit file beside any other part's page. | PASS | "This serves \"A person can point at the rule that a sub-part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it.\"" |
| C4 | One sentence is added at the end of "Outside the record" in `.ledger/process/system-record.md`: "A spirit is kept in `spirit.md` beside the page of the part it belongs to." Every other line in that file stays as it is. | PASS | "This serves \"A person can point at the record pages and see that the spirit is not a fact there.\"" "It serves \"A person can point at the project's spirit and see an intent the record pages do not state\"" |
| P1 | The spirit is not a fact on a record page, so the letter reading set does not include it. | PASS | "No record page is edited." "It does not gain `spirit.md`." "Kept off those pages, the spirit stays out of the letter reading set. That is the parent's D1." |
| P2 | A sub-part spirit is found only by the walk the spirit review takes, from the part a change changes up through the parts above it. | PASS | "a walk from the part a change changes up through the parts above it passes the directory of each of those parts." "This piece adds no list of spirits and no link from a record page. The spirit has no other home." "The parent's D2 is met because a sub-part's spirit is kept with that sub-part, beside that sub-part's page, and the writing adds no other home for it." |
| P3 | A spirit finding is answered by the person, and the answer does not become a fact the next change follows. | PASS | "the person's answer to a finding is not written on a record page. The next change follows the facts on the record pages. That is the parent's D3." |
| P4 | The spirit piece adds where a spirit is kept. The spirit review adds how that review runs. A sentence can land in an existing file. The rest of that file stays as it is. The spirit's own filename is chosen in the spirit piece. | PASS | "D1 chooses the filename `spirit.md`. D4 records where that file is kept, as the one new sentence in `.ledger/process/system-record.md`. The rest of that file stays as it is. That is the parent's D4." "How a spirit review runs that walk is out of scope for this piece." "The sentence does not say how a spirit review runs." |
| T1 | The tests on the branch are unchanged since their review. | PASS | "This piece writes no executable tests." "The person recorded this on 2026-11-23 and moved the plan to design." There is no tests-review matrix and no test branch. `git diff` does not change that Tests section. `git status` shows no test files. The other dirty paths are not this artifact. |

Findings: none.

The person skipped a review of the design amendment on 2026-11-23. The filing rule moved from `docs/spirit.md` to `.ledger/process/spirit.md`, and the test design setup now says the rule is not part of the project's spirit. No formal review was run.
