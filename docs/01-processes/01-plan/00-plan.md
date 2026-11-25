# Plan

## Responsibility

Carries one piece of work from a confirmed goal through an accepted result.

Does not state what is true of the project now.

## Parts

None

## Offers

**Person.** The person running the project.

**Goal.** What the person says will be true when a piece of work is done.

**Result.** The finished work.

**Plan.** One piece of work, kept as a file in `docs/_plans/`.

**Spirit review.** An account of whether the work fits the intent of its part.

**Finding.** A miss in a spirit review.

**Letter.** The facts that decide the pass.

**Outcome.** The step in which the person confirms the goal.

**Requirements.** The step in which the checks on the goal are written.

The person confirms the goal.
The person accepts the result.

A spirit review is performed on the shared decisions of a plan that is split into pieces.
A spirit review at the outcome and at the requirements is performed before the person confirms.
A finding waits for the person's answer before the step advances.
When the person says the change fits, the answer stays on the review and the letter decides the pass.
When the person amends the outcome or the requirements, the work returns to that step.
A spirit review with no finding does not ask the person.

After a draft that requires a review, the review and the revision loop run before the person is asked.
When that loop finds nothing the person has to resolve, the work continues through the plan without pausing.
The person is asked when the finished work is ready to be accepted.
The person is not asked because a step ended.

## Dependencies

None

## Behavior

Case: a plan whose goal is not confirmed.
Setup: the goal is written in the plan. The person has not confirmed it.
Action: the person confirms the goal.
Result: the person has confirmed the goal.

Case: a finished plan whose result has been checked.
Setup: the result has been checked against the record. The person has not accepted it.
Action: the person accepts the result.
Result: the person has accepted the result.

Case: a plan whose goal is now stated in the record.
Setup: the record states what the goal said would be true. The plan file is in `docs/_plans/`.
Action: the plan file is removed.
Result: the plan's file is removed once the record states what the goal said would be true.

Case: implementation of a plan.
Setup: the design is accepted. Implementation has not started.
Action: implementation starts.
Result: a design is accepted before implementation starts.

Case: a plan that is split into pieces.
Setup: the pieces share decisions.
Action: a spirit review is performed.
Result: a spirit review is performed on the shared decisions of a plan that is split into pieces.

Case: the outcome or the requirements, before the person confirms.
Setup: the person has not confirmed.
Action: a spirit review is performed.
Result: a spirit review at the outcome and at the requirements is performed before the person confirms.

Case: a spirit review with a finding.
Setup: the finding has no answer from the person.
Action: the step is read.
Result: a finding waits for the person's answer before the step advances.

Case: the person says the change fits.
Setup: a spirit review has a finding. The person says the change fits.
Action: the answer is written on the review.
Result: when the person says the change fits, the answer stays on the review and the letter decides the pass.

Case: the person amends the outcome or the requirements.
Setup: the person amends the outcome or the requirements.
Action: the work returns to that step.
Result: when the person amends the outcome or the requirements, the work returns to that step.

Case: a spirit review with no finding.
Setup: the spirit review has no finding.
Action: the review is read.
Result: a spirit review with no finding does not ask the person.

Case: the outcome, the requirements, or the design.
Setup: the plan is at that step.
Action: a spirit review is performed.
Result: a spirit review is performed at the outcome, at the requirements, and at the design.

Case: a step at which a spirit review is performed.
Setup: the step has not advanced.
Action: a spirit review is performed.
Result: a spirit review is performed before that step advances.

Case: a draft that requires a review.
Setup: the draft is written. The person has not been asked about it.
Action: the review and the revision loop run.
Result: after a draft that requires a review, the review and the revision loop run before the person is asked.

Case: a review and revision loop with nothing the person has to resolve.
Setup: the loop has run. It found nothing the person has to resolve.
Action: the work continues.
Result: when that loop finds nothing the person has to resolve, the work continues through the plan without pausing.

Case: finished work that is ready to be accepted.
Setup: the result has been checked against the record. The person has not been asked to accept it.
Action: the person is asked.
Result: the person is asked when the finished work is ready to be accepted.

Case: a step has ended.
Setup: the step has ended. Nothing remains that the person has to resolve.
Action: the work continues.
Result: the person is not asked because a step ended.

## Rules

The plan's file is removed once the record states what the goal said would be true.
A design is accepted before implementation starts.

A spirit review is performed at the outcome, at the requirements, and at the design.
A spirit review is performed before that step advances.

## Words

None

## Checked

None
