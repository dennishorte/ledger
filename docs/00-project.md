# LLM Project Framework

## Responsibility

Keeps a project on course when an LLM does the design and the implementation.

Does not carry out a child project's work.

## Parts

[Processes](00-project/01-processes.md)

[Scripts](00-project/02-scripts.md)

## Offers

None

## Dependencies

None

## Behavior

Case: a change to this project while a child project is registered.
Setup: `.ledger/child-projects` lists `/Users/dennis/code/worldgen` and `/Users/dennis/code/dog`. Neither project has been asked to change.
Action: the change is made in this project.
Result: a child project is edited only when asked.

## Rules

A child project is edited only when asked.

## Words

**Child project.** A project listed in `.ledger/child-projects`. It keeps its own docs and its own copy of the files in `.ledger/process/`.

**Design.** The written account of how a piece of work will be done.

**Implementation.** The carrying out of a design.

## Checked

None
