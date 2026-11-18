# Workflow — current-state reference

**Scope:** the operator playbooks in `.ledger/process/` and the two scripts
that run them, `.claude/workflows/leaf-workflow.js` (stages 1–8) and
`leaf-workflow-finish.js` (stages 9–11). Per-project knobs live in
`.ledger/project.json` under `workflow`.
**Last verified:** `350789833f56d18ec77f8d22b7062fafa91640b5` on `main`.
**Owning nodes:** [`11-workflow-scripts`](../11-workflow-scripts/00-workflow-scripts.md),
[`12-workflow-decomposition`](../12-workflow-decomposition.md),
[`13-reference-layer`](../13-reference-layer.md),
[`14-review-process`](../14-review-process.md).
**Regenerate line counts:** `wc -l .claude/workflows/*.js .ledger/process/*.md`

The server does not read this directory. `validateProjectMetadata` drops the
`workflow` key when it builds `ProjectMetadata` ([`parser.md`](parser.md)).
Scripts open `.ledger/project.json` themselves.

## 1. Module map

| File | Lines | Role |
|---|---:|---|
| `.claude/workflows/leaf-workflow.js` | 979 | Stages 1–8. Worktree, implement, post-implementation pause, rebase, review, operator gate |
| `.claude/workflows/leaf-workflow-finish.js` | 266 | Stages 9–11. Promote, merge, cleanup. Reference-doc check is in the Promote prompt |
| `.ledger/process/leaf-workflow.md` | 410 | The playbook the scripts follow |
| `.ledger/process/verification-signoff.md` | 119 | The one review result both reviews record. A review that ran advances only on `pass`. `skipSpecReview` still moves the node to `APPROVED` with no review section |
| `.ledger/process/decomposition.md` | 79 | How to split a node. Stage 1 exits here when a signal fires |
| `.ledger/process/maintenance-round.md` | 127 | Batched maintenance. Includes the `_reference` stamp sweep |
| `.ledger/process/doc-size-resolution.md` | 46 | What to do when a doc is over the size threshold |
| `.ledger/process/open-issue-resolution.md` | 273 | Working an open issue through to a closed bullet |
| `.ledger/process/open-issue-queue.md` | 65 | Queue of issues to pick up |
| `.ledger/process/next-action.md` | 132 | How to choose the next node |

`.claude/scripts/sync-process` copies `.ledger/process/*.md` to each child
listed in `.ledger/child-projects`. `docs/_reference/` stays in the project
that wrote it. New projects are scaffolded by `.claude/scripts/new-project`,
which embeds this convention in the child's `CLAUDE.md`.

## 2. Entry points

The scripts are Claude workflow entry points, not CLI commands. Each `phase()`
in the JS file is one operator-visible step.

**`leaf-workflow.js` phases:** Inspect, Requirements, Design, Spec Review,
Approve, Implement, Post-Impl Gate (only when `workflow.postImplementationGate`
is set), Rebase, Impl Review, Fixes, Gate.

**`leaf-workflow-finish.js` phases:** Inspect, Promote, Merge, Cleanup.

Playbook stages in `leaf-workflow.md` are numbered 1–11 and line up with those
two scripts. Stage 1 includes the decomposition checkpoint
([`12-workflow-decomposition`](../12-workflow-decomposition.md)): a yes on any
signal stops the draft and moves the operator to `decomposition.md`.

**This repo's `workflow` block** (`.ledger/project.json`):

| Key | Value here |
|---|---|
| `baseBranch` | `main` |
| `rootDoc` | `00-project` |
| `typesEntrypoint` | `app/src/lib/types.ts` |
| `apiPort` / `uiPort` | `4180` / `4179` |
| `worktreeSetup` | `ln -sf {repo}/.env {dir}/.env` |
| `gates` | `pnpm -C {dir}/app` typecheck, lint, and build. Implement, rebase, and impl review pass the worktree as `{dir}`. Stage 10 passes the repo root |
| `e2eGate` | `pnpm -C {dir}/e2e test` |
| `postImplementationGate` | absent. The pause does not run |

`{dir}` is the worktree (or the repo, depending on the stage). `{repo}` is
the repo root. `{nodeId}` is available to the post-implementation command.
Placeholders are substituted on every occurrence.

## 3. Data contracts

The `workflow` object is specified in
`docs/_schemas/project-metadata.schema.json` (`additionalProperties: false`
on both the project object and the workflow object). Fields:

| Field | Required | When omitted |
|---|---|---|
| `baseBranch` | no | `main` |
| `rootDoc` | no | `00-project` |
| `typesEntrypoint` | no | Spec-review prompt skips the types bullet |
| `apiPort`, `uiPort` | no | The schema text says default `4180` / `4179`, overridable by `LEDGER_PORT` / `LEDGER_UI_PORT`. The scripts do not read those env vars. Omitted `apiPort` stops `leaf-workflow.js` during Inspect. Both scripts default only `uiPort` to `4179` |
| `gates[]` | no | `{ label, command }`. Empty means no gate commands |
| `e2eGate` | no | E2E stage skipped |
| `worktreeSetup[]` | no | No setup after `git worktree add`. Steps must be idempotent and uncommitted |
| `postImplementationGate` | no | `{ command, artifactPath? }`. Absent means no pause between implement and rebase |

Review output is the matrix in `verification-signoff.md`. Both spec review
and implementation review record a disposition of `pass`, `followups`, or
`changes-required` before any status change, and a review that ran advances only on `pass`
([`14-review-process`](../14-review-process.md)). `skipSpecReview` still
commits `SPEC_REVIEW` → `APPROVED` with no review section
(`leaf-workflow.js`). The sign-off playbook allows that shortcut.

Stage 9 (Promote) lists files the node touched and, when `docs/_reference/`
exists, greps it for those paths or the node id. A section that cites one
of them and is stale is updated in the same commit, with **Last verified**
set to `git rev-parse HEAD` taken before the commit. An absent
`docs/_reference/` directory, or a doc that does not cite the touched paths
or the node id, means no edit. [`13-reference-layer`](../13-reference-layer.md).

## 4. Runtime state surfaces

Git holds the worktree branch, the status line in the node doc, and the
parent's children-manifest row. Gate approval is also a `human_review` task
the script writes and later reads back through the API, so resume state
lives in the runner store as well as in git. The scripts are idempotent on
re-entry; a second run of a finished phase skips work already recorded in
the doc.

`postImplementationGate` and the stage-8 operator gate both create a
`human_review` task through the running server. The body uses `resourceClaims`
and `reviewPayload` so it matches `task-input.schema.json`
([`11-workflow-scripts/01-post-implementation-gate`](../11-workflow-scripts/01-post-implementation-gate.md)).
When the post-implementation gate is configured, the implement phase commits
the work and leaves the node at `IN_PROGRESS`. The `IN_PROGRESS` → `VERIFY`
commit runs after the operator approves that task (`leaf-workflow.js`). A
rejection commits a fix in that same worktree, then re-runs the gate command
and opens a new `human_review` task. The node stays `IN_PROGRESS`.

## 5. Invariants

- Implementation runs in a worktree branched from local `baseBranch`. The
  branch merges back with `--no-ff` at stage 10. This is separate from a
  Cursor agent worktree, which forks from the pushed remote and must not be
  merged.
- `worktreeSetup` output is gitignored (the ledger step symlinks `.env`).
  It is not part of the implementation commit.
- Stage 9 updates a reference section when it cites a touched path or the
  node id and that section is stale. The stamp is the pre-commit HEAD. The
  doc does not name the commit that introduces the update.
- Playbook edits in this repo are the source. Child checkouts receive them
  from `sync-process`, not from a symlink.
- The API server can be running a project whose `workflow` block is
  schema-valid while `ctx.project` still has no `workflow` field. Scripts
  and server are two readers.

## 6. Active migration

[`15-review-decisions`](../15-review-decisions.md) is PLANNED. It will record
decisions where later design and review can find them. It has not changed
`verification-signoff.md` or the prompts yet.

`maintenance-round.md` is the backstop for `_reference` drift on commits that
never pass through stage 9. A doc is punch-list material when
`git log <stamp>..HEAD -- <cited paths>` is non-empty. There is no scanner
monitor for that check ([`health-scanner.md`](health-scanner.md) §6).
