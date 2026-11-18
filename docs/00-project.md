# LLM Project Framework

**Last verified:** `91c61497b42ebe71d46f8b1880ba6cfdb9dccdc9` on `main`
**Last updated:** 2026-11-18

## What this is for

An LLM will start building before the goal is written down, and a later session cannot tell what was decided or why. This process puts the record first. A plan states the goal, and later the acceptance criteria and the design. A separate review checks the work against that goal. The operator decides when it is done.

## What a project contains

A project that uses this process has its own `docs/` tree and a copy of the playbooks in `.ledger/process/`. The living docs at the top of `docs/` are the lasting description. A plan in `docs/_plans/` is one piece of work, and it is removed once its lasting outcome is written into a living doc. The procedure for doing the work is the playbooks. `docs/README.md` is the index of those playbooks.

This repo is that process. A child project is created with `new-project`. This repo does not run the child project's work.

## Decisions

| Decision | Why |
|---|---|
| The product is the playbooks and the layout of `docs/`. | The operator does not use an app, a server, or a task runner for this work. |
| A child project is edited only when the operator asks. | A change in this repo is about the process. Copying it into another project is a separate decision. `sync-process` is that copy. |
| A finished plan leaves `docs/_plans/` after its lasting outcome is in a living doc. | The plan is the work. The living doc is the record that remains. |

## Open issues

- **Parallel worktrees can edit the same file.** Two plans in separate worktrees have no automatic way to reserve a file. The operator chooses work whose files do not overlap, or resolves the conflict when the second worktree is rebased onto `main`. The procedure is `.ledger/process/leaf-workflow.md`. *(Priority: MEDIUM.)*

An issue that belongs to one plan stays on that plan. This section is for a problem that crosses plans.

## Plans

The work documents live in `docs/_plans/`. This list is the ones that exist.

| ID | Title | Depends on | Status |
|----|-------|------------|--------|
| `15-review-decisions` | Important decisions are recorded where later work can find them, and the design and review of that work consider those decisions | `.ledger/process/verification-signoff.md` | PLANNED |

`15-review-decisions` is the unfinished plan.
