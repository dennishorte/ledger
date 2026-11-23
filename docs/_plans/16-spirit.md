# Spirit of the system

**Status:** coordinating

## Part

`docs/01-processes/00-processes.md`

## Outcome

**Outcome confirmed:** 2026-11-22

The spirit of the system is a review path alongside the letter of the system.

**Spirit.** A text kept off the record. It states the intent of the project, or of one part, where the letter does not state that intent.

**Letter.** The facts on the record pages.

- The spirit states the intent that the spirit review reads. A sub-part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it.
- A spirit review reads the change, the spirit of the part that change changes, and the spirits of the parts above it. It does not read the record pages. The letter decides the pass, and the person answers a spirit finding.

## Decisions

**Decisions confirmed:** 2026-11-23

D1. The spirit is not a fact on a record page, so the letter reading set does not include it.
Binds: the spirit piece, the spirit review
Reason: The record is the pages that state what is true of the project now. The letter is the facts on those pages. The spirit states the intent the spirit review reads. Kept off the record pages, the spirit stays out of the letter reading set.

D2. A sub-part spirit is found only by the walk the spirit review takes, from the part a change changes up through the parts above it.
Binds: the spirit piece, the spirit review
Reason: The spirit review reads the spirit of the part a change changes and the spirits of the parts above it. The spirit piece keeps a sub-part's spirit with that sub-part. The spirit review meets it by starting at the part a change changes and walking up through the parts above it.

D3. A spirit finding is answered by the person, and the answer does not become a fact the next change follows.
Binds: the spirit piece, the spirit review
Reason: The letter decides the pass. The person answers a spirit finding. The next change follows the facts on the record pages. Both pieces leave the answer with the person and off those pages.

D4. The spirit piece adds where a spirit is kept. The spirit review adds how that review runs. A sentence can land in an existing file. The rest of that file stays as it is.
Binds: the spirit piece, the spirit review
Reason: Where a spirit is kept is the spirit piece's work. How the review runs is the spirit review's work. Each piece adds only that. The spirit's own filename is chosen in the spirit piece.

The spirit piece finishes first. The spirit review starts after the spirit piece is accepted. The spirit review reads the spirit the spirit piece keeps, and the spirit piece is the one that settles where a spirit is kept, including its filename. The spirit piece has nothing to wait for. The walk that finds a sub-part spirit is already D2.

## Requirements

*(not started)*

## Test design

*(not started)*

## Tests

*(not started)*

## Design

*(not started)*

## Implementation notes

*(not started)*

## Reviews

### Coordinating review, 2026-11-22

**Disposition:** changes-required

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| S1 | The spirit piece is the first bullet. The spirit is what the review reads, and a sub-part has its own spirit when that part's intent is not already said by the spirits above it. A person can finish that piece alone. | PASS | The piece is that bullet. The artifact bounds it so the other piece does not share the work, and so it waits for nothing: "The spirit piece owns where a spirit is kept, and it owns `.ledger/process/system-record.md`." "Each file belongs to one piece." "The spirit piece has nothing to wait for." |
| S2 | The spirit review is the second bullet. It reads the spirit of the part a change changes and the spirits above it, the letter decides the pass, and the person answers a spirit finding. A person can finish that piece alone. | PASS | Its work is its own files, and it starts only after the spirit piece is accepted: "The spirit review owns `.ledger/process/review.md` and `.ledger/process/plan-workflow.md`." "How the review runs is the spirit review's work, in `.ledger/process/review.md` and `.ledger/process/plan-workflow.md`." "Each file belongs to one piece." "The spirit review starts after the spirit piece is accepted." |
| D1 | The spirit is not a fact on a record page, so the letter reading set does not include it. The decision binds both pieces, and it does not choose a detail inside one piece. | FAIL | "Binds: the spirit piece, the spirit review." The exclusion binds both: "Kept off the record pages, the spirit stays out of that set." The same reason also chooses which pages the letter reads: "The letter reads the page of the part a change changes and every page above it. That is the letter reading set." That reading is how the review runs, and "How the review runs is the spirit review's work." The spirit piece does not read those pages. |
| D2 | A sub-part spirit is found only by the walk from the changed part up through the parts above. The decision binds both pieces, and it does not choose a detail inside one piece. | PASS | "Binds: the spirit piece, the spirit review." "The spirit piece keeps a sub-part's spirit with that sub-part. The spirit review meets it by starting at the part a change changes and walking up through the parts above it." The filename stays inside the spirit piece: "The spirit's own filename is chosen in the spirit piece." |
| D3 | The person answers a spirit finding, and the answer does not become a fact the next change follows. The decision binds both pieces, and it does not choose a detail inside one piece. | PASS | "Binds: the spirit piece, the spirit review." "Both pieces leave the answer with the person and off those pages." "The next change follows the facts on the record pages." The spirit piece leaves the answer off the pages. The spirit review leaves it with the person. |
| D4 | The spirit piece owns where a spirit is kept and `system-record.md`. The spirit review owns `review.md` and `plan-workflow.md`. The decision binds both pieces, and it does not choose a detail inside one piece. | PASS | "Binds: the spirit piece, the spirit review." "Each file belongs to one piece. Where a spirit is kept is the spirit piece's work." "How the review runs is the spirit review's work, in `.ledger/process/review.md` and `.ledger/process/plan-workflow.md`." "The spirit's own filename is chosen in the spirit piece." |
| O1 | The spirit review depends on the spirit piece. The order says the spirit piece finishes first, and why. | PASS | "The spirit piece finishes first. The spirit review starts after the spirit piece is accepted. The spirit review reads the spirit, and the spirit piece is the one that settles where a spirit is kept, including its filename. The spirit piece has nothing to wait for. The walk that finds a sub-part spirit is already D2." |

Findings:

D1. The decision chooses which pages the letter reads. That reading is a detail of the spirit review. The spirit piece is bound by keeping the spirit off the record pages, and that clause does not use the page list. Evidence: "The letter reads the page of the part a change changes and every page above it. That is the letter reading set." The spirit piece's clause is "Kept off the record pages, the spirit stays out of that set."

### Coordinating review, 2026-11-23

**Disposition:** pass

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| S1 | The first bullet is the spirit piece: the spirit states the intent the spirit review reads, and a sub-part has a spirit of its own when that intent is not already said by the spirits above it. A person can finish it alone. The piece adds where a spirit is kept, and it waits for nothing. | PASS | "The spirit piece adds where a spirit is kept." "Where a spirit is kept is the spirit piece's work." "Each piece adds only that." "The spirit piece keeps a sub-part's spirit with that sub-part." "The spirit piece has nothing to wait for." |
| S2 | The second bullet is the spirit review: it reads the change, the spirit of the part a change changes, and the spirits above it; it does not read the record pages; the letter decides the pass, and the person answers a spirit finding. A person can finish it alone. The piece adds how that review runs, and it starts after the spirit piece is accepted. | PASS | "The spirit review adds how that review runs." "How the review runs is the spirit review's work." "Each piece adds only that." "The rest of that file stays as it is." "The spirit review starts after the spirit piece is accepted." |
| D1 | The spirit is not a fact on a record page, so the letter reading set does not include it. The decision binds the spirit piece and the spirit review, and it does not choose a detail inside one piece. | PASS | "Binds: the spirit piece, the spirit review." "The spirit is not a fact on a record page, so the letter reading set does not include it." "Kept off the record pages, the spirit stays out of the letter reading set." |
| D2 | A sub-part spirit is found only by the walk the spirit review takes, from the part a change changes up through the parts above it. The decision binds the spirit piece and the spirit review, and it does not choose a detail inside one piece. | PASS | "Binds: the spirit piece, the spirit review." "A sub-part spirit is found only by the walk the spirit review takes, from the part a change changes up through the parts above it." "The spirit piece keeps a sub-part's spirit with that sub-part. The spirit review meets it by starting at the part a change changes and walking up through the parts above it." |
| D3 | A spirit finding is answered by the person, and the answer does not become a fact the next change follows. The decision binds the spirit piece and the spirit review, and it does not choose a detail inside one piece. | PASS | "Binds: the spirit piece, the spirit review." "A spirit finding is answered by the person, and the answer does not become a fact the next change follows." "Both pieces leave the answer with the person and off those pages." |
| D4 | The spirit piece adds where a spirit is kept. The spirit review adds how that review runs. A sentence can land in an existing file, and the rest of that file stays as it is. The decision binds the spirit piece and the spirit review, and it does not choose a detail inside one piece. | PASS | "Binds: the spirit piece, the spirit review." "Each piece adds only that." "A sentence can land in an existing file. The rest of that file stays as it is." "The spirit's own filename is chosen in the spirit piece." |
| O1 | The spirit review depends on the spirit piece. The spirit piece finishes first, because the review reads the spirit that piece keeps, and that piece settles where a spirit is kept, including its filename. | PASS | "The spirit piece finishes first. The spirit review starts after the spirit piece is accepted. The spirit review reads the spirit the spirit piece keeps, and the spirit piece is the one that settles where a spirit is kept, including its filename. The spirit piece has nothing to wait for. The walk that finds a sub-part spirit is already D2." |

Findings: none.
