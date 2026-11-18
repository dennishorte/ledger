# Current-state notes

**What this is:** present-tense notes about how the process works today.
These notes are the markdown files at the top of `docs/`, next to
`docs/00-project.md`.
**What it is not:** a plan. Plans are temporary and live in
`docs/_plans/`. `docs/_investigations/` is a point-in-time writeup behind an
open issue. The project itself is [`docs/00-project.md`](00-project.md).

These notes do not carry a lifecycle status.

**Last verified:** `91c61497b42ebe71d46f8b1880ba6cfdb9dccdc9` on `main`.
A doc never names the commit it lives in. Stamp `git rev-parse HEAD` from
immediately before the commit that changes this file.

## The process

The process is the playbooks in `.ledger/process/`. They are the source.
This file does not restate them.

| Playbook | What it is for |
|---|---|
| `docs-layout.md` | Where a file in `docs/` belongs |
| `leaf-workflow.md` | Take one leaf from PLANNED through COMPLETE |
| `verification-signoff.md` | The review matrix and the only definition of `pass` |
| `next-action.md` | Choose the single next action |
| `decomposition.md` | Split a node that is too big to be one leaf |
| `maintenance-round.md` | Batch small fixes on an already-complete subtree |
| `doc-size-resolution.md` | What to do when a doc has grown too large to work in |
| `open-issue-queue.md` | The standing list of deferred issues |
| `open-issue-resolution.md` | Work down a backlog of open issues |

A child project receives these files from `.claude/scripts/sync-process`. It does not run a server from this repo.
