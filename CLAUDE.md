# Claude/agent briefing — LLM Project Framework

This repo is the written process for running a project with an LLM. Work is specified in `docs/`, reviewed by someone who did not write it, and promoted only when the operator says so. There is no app, server, task runner, or dispatcher.

## Start here

- **`docs/00-project.md`** — the root page of the system record. Read it for what this system does and the obligations it keeps.
- **`.ledger/process/system-record.md`** — how a page is written, read, and edited. Read it before changing a page.
- **`.ledger/process/plan-workflow.md`** — how a plan goes from a confirmed outcome through acceptance. Read it before driving a plan.
- **`.ledger/process/verification-signoff.md`** — the review matrix, and the only definition of `pass`.

## Documentation discipline

A node is one piece of work under `docs/_plans/`. The lasting description is the system record: one page per part under `docs/`, outside `_plans/` and `_investigations/`. How a page is written, read, and edited is `.ledger/process/system-record.md`. A point-in-time writeup stays in `docs/_investigations/`.

Every plan follows `plan-workflow.md`.

- **Status:** `outcome`, `coordinating`, `requirements`, `test-design`, `tests`, `design`, `implementation`, `accepted`.
- **Sections:** Part, Outcome, Decisions, Requirements, Test design, Tests, Design, Implementation notes, Reviews.
- No implementation until the implementation design has passed review.

**To find current focus:** read the plans in `docs/_plans/`. The most-recently-advanced plan tells you where work currently lives.

## How work proceeds

Follow `plan-workflow.md`. Each gate is its own commit on the plan. An independent reviewer writes the sign-off matrix. The person running the project accepts the finished work.

The software that once automated this process — the React UI, the API server, the task runner, the agent dispatcher, the health scanner, and the workflow scripts — was removed on 2026-11-17. The node docs that specified that software were removed on 2026-11-18. The playbooks are the process.

## Scripts

Small wrappers in `.claude/scripts/` (allowlisted in `.claude/settings.json`):

- `.claude/scripts/doc-status [prefix]` — table of node → lifecycle status across `docs/`
- `.claude/scripts/lines <file> <start> [end]` — numbered line range
- `.claude/scripts/new-project <path> [--name NAME]` — scaffold a child project: `docs/`, a `CLAUDE.md`, and a copy of these playbooks
- `.claude/scripts/sync-process [<path> ...]` — copy `.ledger/process/*.md` from here to every registered child. Run it only when the operator asks.

## Other projects

A child project holds its own `docs/` tree, `.ledger/` config, and the playbooks it received from here. It does not run software from this repo. The registry is `.ledger/child-projects`.

Do not edit a child project unless the operator specifically asks. A change in this repo stays in this repo. Copying playbooks out with `sync-process` is a child-project edit.

## Hard constraints

- **No implementation until the implementation design has passed review.**
- **Harness `isolation: 'worktree'` is read-only-only.** That worktree forks from the pushed remote, so during a session with unpushed commits it is stale, and its branch must never be merged back. Use it for read-only work. File-changing work follows `plan-workflow.md`, which branches from the local integration branch (`main`).
- Each gate is its own commit on the plan. A parent plan does not keep a copy of a sub-plan's status.
- The doc tree is the source of truth. If a doc and the work disagree, update one of them on purpose. A fact that stays only in conversation is not durable; write it on the page that homes it.
- Do not edit a registered child project unless the operator specifically asks for that change.
