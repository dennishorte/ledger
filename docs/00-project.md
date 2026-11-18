# LLM Project Framework
 
**Last verified:** `330dc8a4aa5267e50c27667dcda9b037d27dc46f` on `main`
**Last updated:** 2026-11-18

## What this is for

This process keeps a project on course when LLMs do the design and the implementation. It keeps a record of what should be built and of the decisions that govern that work. A design is written and accepted before any code, and the finished work is checked against that record. The person running the project confirms the goal and accepts the result.

## Design

The lasting description of a project is the markdown files at the top of `docs/`, written in the present tense. This file is the project root. A further lasting description is a new file here, named for what it describes. These files have no lifecycle status.

A plan is one piece of work and lives in `docs/_plans/`. A point-in-time writeup stays in `docs/_investigations/`.

When a living doc can go stale, stamp **Last verified** with `git rev-parse HEAD` immediately before the commit that changes it. The doc never names the commit it lives in.

The process is the playbooks in `.ledger/process/`. They are the source. This file does not restate them.

| Playbook | What it is for |
|---|---|
| `leaf-workflow.md` | Take one leaf from PLANNED through COMPLETE |
| `verification-signoff.md` | The review matrix and the only definition of `pass` |

A child project gets these playbooks from `.claude/scripts/sync-process`.

## Decisions

| | Decision | Why |
|---|---|---|
| D1 | A plan lives in `docs/_plans/` and is removed once its lasting outcome is written into a living doc. | The plan is the work. The living doc is the record that remains. |
| D2 | A child project is edited only when you ask. | A change in this repo is about the process. Copying it into another project is a separate decision. |
