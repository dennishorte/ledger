# Current-state notes

**What this is:** present-tense notes about how the process works today.
These notes are the markdown files at the top of `docs/`, next to
`docs/00-project.md`.
**What it is not:** a plan. Plans are temporary and live in
`docs/_plans/`. `docs/_investigations/` is a point-in-time writeup behind an
open issue. The project itself is [`docs/00-project.md`](00-project.md).

These notes do not carry a lifecycle status.

**Last verified:** `9097096a654a36b9bba76bae3fd465ed94e14237` on `main`.
A doc never names the commit it lives in. Stamp `git rev-parse HEAD` from
immediately before the commit that changes this file.

## The process

The process is the playbooks in `.ledger/process/`. They are the source.
This file does not restate them.

| Playbook | What it is for |
|---|---|
| `leaf-workflow.md` | Take one leaf from PLANNED through COMPLETE |
| `verification-signoff.md` | The review matrix and the only definition of `pass` |
| `decomposition.md` | Split a node that is too big to be one leaf |

A child project receives these files from `.claude/scripts/sync-process`. It does not run a server from this repo.
