# LLM Project Framework
 
**Last verified:** `b31111e3480801ceaf5f5f9e40214587e90b7471` on `main`
**Last updated:** 2026-11-18

## What this is for

This process keeps a project on course when LLMs do the design and the implementation. It keeps a record of what should be built and of the decisions that govern that work. A design is written and accepted before any code, and the finished work is checked against that record. The person running the project confirms the goal and accepts the result.

## Design

The lasting description follows the shape of the project. This file is the root. Each part of the project has a living doc in that part's folder, written in the present tense. A part that sits inside another lives in a folder inside it. These files have no lifecycle status.

A plan updates the living doc for the part it changed. A new living doc is added only when that part does not have one yet.

A plan is one piece of work and lives in `docs/_plans/`. A point-in-time writeup stays in `docs/_investigations/`.

When a living doc can go stale, stamp **Last verified** with `git rev-parse HEAD` immediately before the commit that changes it. The doc never names the commit it lives in.

The process is the playbooks in `.ledger/process/`. They are the source. This file does not restate them.

| Playbook | What it is for |
|---|---|
| `plan-workflow.md` | Take one plan from PLANNED through COMPLETE |
| `verification-signoff.md` | The review matrix and the only definition of `pass` |

A child project gets these playbooks from `.claude/scripts/sync-process`.

## Decisions

| | Decision | Why |
|---|---|---|
| D1 | A plan lives in `docs/_plans/` and is removed once its lasting outcome is written into a living doc. | The plan is the work. The living doc is the record that remains. |
| D2 | A child project is edited only when you ask. | A change in this repo is about the process. Copying it into another project is a separate decision. |
