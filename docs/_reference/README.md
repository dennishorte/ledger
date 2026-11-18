# docs/_reference — current-state notes

**What this is:** present-tense notes about how the process works today.
**What it is not:** a work node. Work nodes are temporary and live in
`docs/_nodes/`. `docs/_investigations/` is a point-in-time writeup behind an
Open Issue. [`13-reference-layer`](../_nodes/13-reference-layer.md).

These notes stay in `docs/_reference/` until they move to the root of `docs/`.
They do not carry a lifecycle status.

**Last verified:** `bd84c7f2a9932dbf980a3492afa875cdec21aade` on `main`.
A doc never names the commit it lives in. Stamp `git rev-parse HEAD` from
immediately before the commit that changes this file.

## The process

The process is the playbooks in `.ledger/process/`. They are the source.
This folder does not restate them.

| Playbook | What it is for |
|---|---|
| `leaf-workflow.md` | Take one leaf from PLANNED through COMPLETE |
| `verification-signoff.md` | The review matrix and the only definition of `pass` |
| `next-action.md` | Choose the single next action |
| `decomposition.md` | Split a node that is too big to be one leaf |
| `maintenance-round.md` | Batch small fixes on an already-complete subtree |
| `doc-size-resolution.md` | What to do when a doc has grown too large to work in |
| `open-issue-queue.md` | The standing list of deferred issues |
| `open-issue-resolution.md` | Work down a backlog of open issues |

A child project receives these files from `.claude/scripts/sync-process`. It does not run a server from this repo.
