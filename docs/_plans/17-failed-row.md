# Failed rows and smaller suggestions

**Status:** requirements

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
