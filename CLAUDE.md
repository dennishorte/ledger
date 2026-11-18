# Claude/agent briefing — LLM Project Framework

This repo is the written process for running a project with an LLM. Work is specified in `docs/`, reviewed by someone who did not write it, and promoted only when the operator says so. There is no app, server, task runner, or dispatcher.

## Start here

- **`docs/00-project.md`** — this project's root. Read it for scope. Its §14 holds the children manifest.
- **`.ledger/process/leaf-workflow.md`** — how a leaf goes from PLANNED through COMPLETE. Read it before driving a node.
- **`.ledger/process/verification-signoff.md`** — the review matrix, and the only definition of `pass`.
- **`.ledger/process/next-action.md`** — how to choose the single next thing to do.
- The other playbooks in **`.ledger/process/`**: `decomposition.md`, `maintenance-round.md`, `doc-size-resolution.md`, `open-issue-queue.md`, `open-issue-resolution.md`.

## Documentation discipline

A node is a working document for one piece of work. It lives in `docs/_nodes/` and is removed once that work is finished and its lasting outcome is written into the living docs. The living docs are `docs/_reference/` today. They move to the root of `docs/` later. `docs/00-project.md` stays at the root.

Every node follows the schema in PRD §6.1:

- **Required sections:** Requirements, Design, Decisions, Open Issues, Implementation Notes, Verification, Children.
- **Lifecycle (§6.2):** DRAFT → SPEC_REVIEW → APPROVED → IN_PROGRESS → VERIFY → COMPLETE (or → ISSUE_OPEN → back).
- Parents hold a children manifest with declared dependencies.
- No agent may begin implementation until a node reaches APPROVED (§10).

**To find current focus:** walk the children manifests starting at `docs/00-project.md` §14 and descend through Status fields. The most-recently-advanced leaf node tells you where work currently lives.

## How work proceeds

Follow `leaf-workflow.md`. Each lifecycle change is its own git commit, and it updates both the node doc and the parent's children manifest. An independent reviewer writes the sign-off matrix into the doc before status moves. The operator, not the reviewer, promotes VERIFY to COMPLETE.

The software that once automated this process — the React UI, the API server, the task runner, the agent dispatcher, the health scanner, and the workflow scripts — was removed on 2026-11-17. The node docs that specified that software were removed on 2026-11-18. The playbooks are the process.

## Scripts

Small wrappers in `.claude/scripts/` (allowlisted in `.claude/settings.json`):

- `.claude/scripts/doc-status [prefix]` — table of node → lifecycle status across `docs/`
- `.claude/scripts/lines <file> <start> [end]` — numbered line range
- `.claude/scripts/new-project <path> [--name NAME]` — scaffold a child project: `docs/`, a `CLAUDE.md`, and a copy of these playbooks
- `.claude/scripts/sync-process [<path> ...]` — copy `.ledger/process/*.md` from here to every registered child. **Run this after editing a playbook.**

## Other projects

A child project holds its own `docs/` tree, `.ledger/` config, and the playbooks it received from here. It does not run software from this repo. The registry is `.ledger/child-projects`.

## Hard constraints

- **No implementation until a node reaches APPROVED.**
- **Harness `isolation: 'worktree'` is read-only-only.** That worktree forks from the pushed remote, so during a session with unpushed commits it is stale, and its branch must never be merged back. Use it for read-only work. File-changing work follows `leaf-workflow.md`, which branches from the local integration branch (`main`).
- Status changes update the node doc and the parent's children manifest in the same commit.
- The doc tree is the source of truth. If a doc and the work disagree, update one of them on purpose. Decisions that stay only in conversation are not durable; write them down.
