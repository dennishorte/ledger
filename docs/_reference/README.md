# docs/_reference — current-state notes

**What this is:** present-tense notes about how the process works today.
**What it is not:** history. The node docs (`docs/NN-*`) are the append-only
audit trail. `docs/_investigations/` is a point-in-time writeup behind an
Open Issue. [`13-reference-layer`](../13-reference-layer.md).

Underscore-prefixed folders under `docs/` are framework-internal. They are
not nodes and they do not carry a lifecycle status.

**Last verified:** `5814ceb54fd3e54dac1f3288de62533b30e4e19d` on `main`.
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
