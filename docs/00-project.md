# LLM Project Framework

**Last verified:** `892c33a440157b6c27d0f85d0e71fd1d81f599c9` on `main`
**Last updated:** 2026-11-18

This repo is the written process for running a project with an LLM. Work is specified in `docs/`, reviewed by someone who did not write it, and promoted only when the operator says so. The procedure is the playbooks in `.ledger/process/`. How the files are arranged is `.ledger/process/docs-layout.md`.

## 1. What this is for

An LLM will start building before the goal is written down, and a later session cannot tell what was decided or why. This process puts the record first. A plan states the goal and later the acceptance criteria and design. A separate review checks the work against that goal. The operator decides when it is done.

## 2. What this project contains

The product is the playbooks and the layout of `docs/`. A child project is created with its own `docs/` tree and a copy of the playbooks. This repo does not run that project's work.

## 6.1 Document sections

Each unit of work is a node. The node document has these sections:

| Section | Purpose |
|---|---|
| **Requirements** | What this unit must accomplish, including what is out of scope |
| **Design** | How it will be accomplished |
| **Decisions** | The choices, and why |
| **Open Issues** | Problems and questions still open |
| **Implementation Notes** | What was learned while doing the work |
| **Verification** | How each requirement is checked |
| **Children** | None for a leaf. A manifest for a parent |

The lifecycle state is the `**Status:**` line in the header. A parent also holds a manifest of its children and the dependencies between them.

A node lives in `docs/_plans/` while the work is underway. When the work is finished, the lasting outcome is written into a living doc at the top of `docs/`, and the node is removed. This file is a living doc. It stays.

## 6.2 Node lifecycle

```
DRAFT → SPEC_REVIEW → APPROVED → IN_PROGRESS → VERIFY → COMPLETE
                                                       ↓
                                                  ISSUE_OPEN
                                                       ↓
                                              (back to APPROVED or DRAFT)

(any active state) → DEFERRED
COMPLETE           → DEPRECATED
```

An agent may not begin implementation until a node reaches `APPROVED`. A failed spec review or implementation review stays at `SPEC_REVIEW` or `VERIFY` and records the matrix. `ISSUE_OPEN` is the operator rejecting during the walk. The operator, not the reviewer, promotes `VERIFY` to `COMPLETE`.

`DEFERRED` means no further work is planned. The status line records when and why. A deferred node may be reactivated by moving it back to an earlier state.

`DEPRECATED` is reachable only from `COMPLETE`. It means the work shipped and was later removed. The status line records when and why. A deprecated node counts toward parent completion the same way a completed node does.

A parent reaches `COMPLETE` when every child is `COMPLETE`, `DEFERRED`, or `DEPRECATED`, except a child marked `**Node Kind:** maintenance-container`. That child stays at `APPROVED` and can take new rounds after the parent is complete. It does not block the parent, and the parent does not close it.

## 6.6 When a node stays a leaf

Split a node only when it holds two or more independent responsibilities and one person cannot finish it in one worktree. The procedure is `.ledger/process/decomposition.md`.

A node stays a leaf when any of these hold:

1. **Single responsibility.** You cannot name two children that would own different files or types. If both would write the same surface, the node stays whole and that surface has one owner.
2. **One implementer.** One person can finish it in one worktree without splitting the work further. If the implementer would have to hand pieces to other people, the node should have been a parent.
3. **Size floor.** The draft is comfortably under the size guidance in `leaf-workflow.md` (default 12 000 tokens) and the change is bounded. A small node gains nothing from a manifest.
4. **Depth cap.** Nesting past 4 levels from this file to a leaf needs a written reason in the parent's Decisions. Deeper than that usually means a middle level is not coordinating anything and should be collapsed.

## 10. Constraints

- No implementation until the node is `APPROVED`.
- The reviewer writes the sign-off into the doc and does not change the lifecycle status.
- The operator promotes `VERIFY` to `COMPLETE`.
- A decision that exists only in conversation is written into the doc before the work relies on it.
- A registered child project is edited only when the operator asks.

## 11. Open issues

- **Parallel worktrees can edit the same file.** Two implementations in separate worktrees have no automatic way to reserve a file. The operator chooses work whose files do not overlap, or resolves the conflict when the second worktree is rebased onto `main`. The procedure is `.ledger/process/leaf-workflow.md`. *(Priority: MEDIUM.)*

Issues that belong to one node stay on that node. This section is for a problem that crosses nodes.

## 14. Children

The work documents live in `docs/_plans/`. This manifest lists the ones that exist.

| ID | Title | Depends on | Status |
|----|-------|------------|--------|
| `12-workflow-decomposition` | A checkpoint at the end of leaf-workflow stage 1, so an oversized node is split before spec review | `.ledger/process/leaf-workflow.md`, `.ledger/process/decomposition.md`, `docs/00-project.md` §6.6 | COMPLETE (v1, 2026-06-12) |
| `13-reference-layer` | Present-tense notes at the top of `docs/`, separate from the work documents | `.ledger/process/leaf-workflow.md`, `.claude/scripts/new-project` | COMPLETE (v1, 2026-09-18) |
| `14-review-process` | One shared judgment and one shared procedure for spec review and implementation review | `.ledger/process/verification-signoff.md`, `.ledger/process/leaf-workflow.md` | COMPLETE (v1, 2026-11-13) |
| `15-review-decisions` | Important decisions are recorded where later work can find them, and the design and review of that work consider those decisions | `14-review-process` | PLANNED |

`15-review-decisions` is the unfinished node.
