# Spirit

**Status:** tests

## Part

`docs/01-processes/00-processes.md`

## Parent

`docs/_plans/16-spirit.md`

## Outcome

**Outcome confirmed:** 2026-11-22

The spirit states the intent that the spirit review reads. A sub-part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it.

## Decisions

*(not started)*

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

**Setup.** This piece has written that rule with the project's spirit. A part need not have a spirit of its own. The words in this plan are not the rule.

**Action.** The agent points at the rule and reads when a part has a spirit of its own. A person can point at the same rule and read the same words.

**Looked at.** The condition those words give. A part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it. A failed check has no such rule to point at, or the rule gives a different condition.

## Tests

*(not started)*

## Design

*(not started)*

## Implementation notes

*(not started)*

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
