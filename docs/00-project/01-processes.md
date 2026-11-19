# Processes

## Responsibility

Describes the processes that keep a project on track.
Describes how to integrate those processes into a project.

## Parts

None

## Offers

**Person.** The person running the project.

**Goal.** What the person says will be true when a piece of work is done.

**Record.** The pages that state what is true of the project now.

**Result.** The finished work.

**Plan.** One piece of work, kept as a file in `docs/_plans/`.

The person confirms the goal.
The result is checked against the record.
The person accepts the result.
The plan's file is removed once the record states what the goal said would be true.

## Dependencies

None

## Behavior

Case: a plan whose goal is not confirmed.
Setup: the goal is written in the plan. The person has not confirmed it.
Action: the person confirms the goal.
Result: the person has confirmed the goal.

Case: a finished plan.
Setup: the work is finished. The record states what the goal said would be true.
Action: the result is checked against the record.
Result: the result has been checked against the record.

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

Case: a writeup.
Setup: the note is about one moment in the work.
Action: the note is filed.
Result: the writeup is kept in `docs/_investigations/`.

## Rules

A design is accepted before implementation starts.
A writeup is kept in `docs/_investigations/`.

## Words

**Writeup.** A note about one moment in the work.

## Checked

None
