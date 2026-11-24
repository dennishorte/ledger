# Processes

## Responsibility

Describes the processes that keep a project on track.
Describes how to integrate those processes into a project.

## Parts

[Plan](01-plan/00-plan.md)

[Review](02-review/00-review.md)

[System record](03-system-record/00-system-record.md)

## Offers

None

## Dependencies

[Plan](01-plan/00-plan.md) depends on [Review](02-review/00-review.md).

[Plan](01-plan/00-plan.md) depends on [System record](03-system-record/00-system-record.md).

[Review](02-review/00-review.md) depends on [System record](03-system-record/00-system-record.md).

## Behavior

Case: a review has failed a row. The row determines one edit. The repair would not change the outcome or the requirements.
Setup: the failed row is recorded. The edit the row determines would leave the outcome and the requirements as they are.
Action: the row is repaired. The person is not asked.
Result: a failed row is repaired without asking the person.

Case: a review has failed a row. The row determines one edit.
Setup: the review is recorded. The row determines the edit.
Action: an agent who did not write the review makes that edit.
Result: an agent who did not write the review makes the edit the row determines.

Case: a failed row has been repaired.
Setup: the repair is written.
Action: the next review reads the rows that repair can change.
Result: the next review covers the rows that repair can change.

Case: a review has failed a row. The failed row does not determine one edit, or the repair would change the outcome or the requirements.
Setup: the failed row is recorded.
Action: the person is asked.
Result: the person is asked in two cases. One case is that the failed row does not determine one edit. The other case is that the repair would change the outcome or the requirements.

Case: a review has a note the confirmed text does not require.
Setup: the confirmed text does not require the note.
Action: the note is recorded as a smaller suggestion.
Result: a smaller suggestion is a note the confirmed text does not require.

Case: a review has a smaller suggestion.
Setup: the suggestion is a note the confirmed text does not require.
Action: the review records the suggestion. The suggestion is given no verdict.
Result: the review records the suggestion, and the suggestion has no verdict.

Case: a review has recorded a smaller suggestion.
Setup: the suggestion has no verdict.
Action: the step continues. No further review is called for the suggestion alone.
Result: the suggestion does not hold the step, and does not by itself call for another review.

Case: a failed row is being repaired, and the review has a suggestion that names one edit.
Setup: the repair of the failed row is underway. The suggestion names one edit.
Action: the repair makes that edit.
Result: when a failed row is being repaired, the repair also makes each suggestion that names one edit.

Case: a repair has made a suggestion that names one edit.
Setup: the suggestion's edit is in the repair. A row's evidence is what that edit changed.
Action: the review of that repair includes that row.
Result: the review of that repair includes any row whose evidence that edit changed.

Case: a review has a suggestion that names no single edit.
Setup: the suggestion does not name one edit.
Action: the suggestion is left on the review.
Result: a suggestion that names no single edit is left on the review.

Case: a review in which no row failed has smaller suggestions.
Setup: no row failed. The suggestions are on the review.
Action: no suggestion is applied.
Result: when no row failed, no suggestion is applied.

Case: a review in which no row failed has smaller suggestions.
Setup: no suggestion is applied. The suggestions are on the review.
Action: the step advances.
Result: when no row failed, the step advances, and the suggestions stay on the review for a later change to find.

Case: a review in which no row failed has smaller suggestions, and the step advances.
Setup: the suggestions stay on the review.
Action: the step passes. The person does not read the suggestions.
Result: when no row failed, the person does not have to read the suggestions for the step to pass.

Case: a design of a change.
Setup: a decision previously made directly affects this part.
Action: the design is written.
Result: a design follows each decision previously made that directly affects this part.

Case: a review that decides a pass.
Setup: a decision previously made directly affects this part.
Action: the review is written.
Result: a review that decides a pass includes each decision previously made that directly affects this part.

Case: a design and a review that decides a pass.
Setup: a decision previously made does not directly affect this part.
Action: the design and the review are written.
Result: a decision that does not directly affect this part is left out.

Case: a review that leaves out a decision previously made that directly affects this part.
Setup: the decision directly affects this part. The review leaves it out.
Action: the review is read.
Result: a review that leaves out a decision previously made that directly affects this part does not pass.

Case: a review that passes.
Setup: the review includes each decision previously made that directly affects this part.
Action: the pass is read.
Result: a review that passes shows that the work follows each included decision.

## Rules

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

A design follows each decision previously made that directly affects this part.

A review that decides a pass includes each decision previously made that directly affects this part.

A decision that does not directly affect this part is left out.

A review that leaves out a decision previously made that directly affects this part does not pass.

A review that passes shows that the work follows each included decision.

## Words

**Record.** The pages that state what is true of the project now.

## Checked

None
