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

The person confirms the goal.
The person accepts the result.

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

## Rules

The plan's file is removed once the record states what the goal said would be true.
A design is accepted before implementation starts.

## Words

None

## Checked

None
