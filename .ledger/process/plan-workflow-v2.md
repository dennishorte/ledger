# Plan workflow

The procedure for one plan. The plan is a temporary file in `docs/_plans/`. A plan with no parent is removed when its lasting outcome has been written into a living doc. A sub-plan stays until that parent is removed.

A plan with one outcome walks seven steps. A plan whose outcome is made of several pieces records the decisions those pieces share, creates a sub-plan for each piece, and waits for them. The person running the project confirms the outcome, confirms the requirements, and accepts the finished work. An agent writes each artifact between those moments, and a different agent reviews it in a fresh session.

`verification-signoff.md` is the review matrix and the only definition of `pass`. A step advances only when its disposition is `pass`. The row lists in this file are what that matrix covers for each step.

## The steps

1. **Outcome.** What is true when the work is done. A high-level outcome may name the pieces that make it true. The person confirms it.
2. **Requirements.** The checks, the constraints, and what is out of scope. The person confirms them. A plan that has sub-outcomes does this inside each sub-plan, after the shared decisions.
3. **Test design.** How each check is decided. An independent review.
4. **Test implementation.** Those checks become executable tests. An independent review.
5. **Implementation design.** How the tests will be made to pass. An independent review.
6. **Implementation.** The tests are made to pass. An independent review, then the person's acceptance.
7. **Record.** The living docs say what is now true, and the plan is removed.

## Rules for every step

- **Shared decisions come before the pieces.** A high-level outcome may name several sub-outcomes. The plan records the decisions those pieces share, and the person confirms them, before any sub-plan goes into its own requirements, tests, or design.
- **A fresh session.** A writing step starts in a new session. Put the confirmed text of the earlier steps at the top of the prompt and again at the end. Do not continue the session that wrote the previous step.
- **The author does not review.** The reviewer has not written the artifact under review.
- **The next step waits.** Do not start it while this step is still in review, or before its gate commit has landed.
- **A failed review stays here.** Keep the recorded matrix. Revise the artifact and review it again.
- **An earlier step is not rewritten from a later one.** If the outcome, the requirements, the test design, the tests, or the design is wrong, return to that step. The person amends the outcome and the requirements. An agent does not.
- **Each gate is its own commit** on the plan. The message names the step.

## The plan file

A plan is `docs/_plans/NN-name.md`. `NN` is a zero-padded two-digit sequence number. It sets display order only. Leave a gap when inserting a file. Do not renumber the files that are already there.

**Status** is one of: `outcome`, `coordinating`, `requirements`, `test-design`, `tests`, `design`, `implementation`, `accepted`.

Sections, in order. A section that has not been reached says `*(not started)*`.

- **Part** — the living doc for the part of the project this work changes
- **Outcome** — the high-level sentence, then any sub-outcomes
- **Decisions** — on a coordinating plan, the choices its pieces share; on a single piece, the choices made in its implementation design
- **Requirements** — Acceptance, Constraints, Out of scope
- **Test design**
- **Tests**
- **Design**
- **Implementation notes**
- **Reviews** — one recorded matrix per review, newest last

## 1. Outcome

Status is `outcome`.

Write the outcome in the person's words: what is true when the work is done. If that outcome is made of distinct pieces, name each piece under it, one sentence each, in the person's words. If the person has already said it, copy that wording. If they have not, ask. Do not invent it.

Name the part of the project this work changes. **Part** is the path of the living doc that describes that part. Work on the whole project names `docs/00-project.md`.

The person edits the text and sets `**Outcome confirmed:** YYYY-MM-DD`. That confirmation is their commit. The agent does not make it. When the outcome names sub-outcomes, the commit sets Status to `coordinating`. When it does not, the commit sets Status to `requirements`.

## Decisions the plan follows

A plan reads every decision that governs its part, and no decision that governs only some other part.

Start at the doc named in **Part** and read its Decisions section. Then read the Decisions section of the doc for the part that contains it, and repeat until `docs/00-project.md` is included. The doc that contains another is the living doc for the parent folder, or `docs/00-project.md` when the part is a top-level system. Stop there. Do not read a sibling part.

A civilization plan reads the civilization doc and the project root. It does not read the geography doc. A plan on one piece of civilization also reads that piece's doc, then civilization, then the project root.

A sub-plan names its own part. That part is the parent's part, or a narrower doc inside it. The sub-plan fetches its own chain. It also follows the parent plan's confirmed decisions.

A decision that later work in one part must follow is written into that part's living doc. A decision that more than one top-level part must follow is written into `docs/00-project.md`. Step 7 is where that write happens.

## Coordinating a plan that has sub-outcomes

Status is `coordinating`.

This plan does not continue to requirements, tests, design, or implementation. Those steps happen in the sub-plans, after the decisions they share are confirmed.

Write the decisions that more than one piece has to follow, and the order between the pieces. A decision names the pieces it binds and the reason. A decision that chooses a file, a function, or a mechanism inside one piece belongs in that piece's design.

The person edits the decisions and sets `**Decisions confirmed:** YYYY-MM-DD`. That confirmation is their commit. The agent does not make it.

**Review.** One row per sub-outcome: it is a piece of the parent outcome, and it is a piece a person could finish on its own. One row per decision: it binds more than one piece, and it does not choose a detail inside a single piece. One row for the order: each dependency says which piece has to be finished first, and why. On `pass`, one commit records the matrix and creates the sub-plans.

The parent file stays where it is. Each sub-plan is a new file in a folder beside it. A parent at `docs/_plans/NN-name.md` keeps that path. Its pieces go in `docs/_plans/NN-name/`, as `MM-piece.md`. The folder name is the parent's name without `.md`, so the file and the folder sit next to each other. `MM` is a zero-padded sequence number within that parent. Leave a gap when inserting one. Do not renumber the files that are already there.

That pass commit creates the files. Each new file starts at Status `requirements`. Its Outcome is the parent's sentence for that piece, copied verbatim, with the parent's confirmation date. Its Part is the parent's part, or a narrower doc inside it when the piece is already known to be narrower. Its Parent line is the path of the parent plan. The sub-plan then follows this procedure from step 2, and it follows the parent's confirmed decisions. The piece is named once, in the parent's outcome, and that sentence is copied into the sub-plan at creation. After that, the parent does not keep a record of the sub-plan's status or of how the work is going. The order between pieces stays in the parent's decisions.

A piece that itself has pieces does the same thing one level down. The sub-plan file stays at `docs/_plans/NN-name/MM-piece.md`, and its pieces go in `docs/_plans/NN-name/MM-piece/`.

A sub-plan with a dependency does not start until every plan it depends on is `accepted` and that piece's outcome is in a living doc. Pieces with no dependency can proceed together. Two sub-plans do not own the same files. If they would, the parent decision gives that surface to one of them before either continues.

A sub-plan that needs a decision the parent has not made stops. The decision is added on the parent, confirmed by the person, and reviewed, before the sub-plan continues.

A sub-plan stays on disk after it is accepted, so its siblings can still read it. The parent does not copy that status. It reads the sub-plan files. It goes to step 7 when every plan file in the folder beside it is `accepted`.

## 2. Requirements

Status is `requirements`.

Write three parts, and nothing that chooses a mechanism:

- **Acceptance.** The checks that prove the outcome. Each one names something a person can point at.
- **Constraints.** What must stay as it is.
- **Out of scope.** What this plan will not do.

A requirement that names a file, a component, a library, or a mechanism is a design decision and belongs in step 5, not here.

The person edits the text, replaces anything still marked `_(operator)_`, and sets `**Requirements confirmed:** YYYY-MM-DD`. That confirmation is their commit. The agent does not make it. The commit sets Status to `test-design`.

A later change adds `**Requirements amended:** YYYY-MM-DD — <what changed>` and returns to the earliest step the change affects. An amendment that adds an outcome returns to step 1.

## 3. Test design

Status is `test-design`.

For each acceptance check, write the setup, the action, and what shows that it passed. The acceptance wording stays in Acceptance. The check stays something a person can run and confirm. The agent is the one who runs it.

The test design does not name a file, a function, a library, or a mechanism. It does not add an outcome or an acceptance check.

**Review.** One row per acceptance check. A row passes when the test design has a setup, an action, and what is looked at, and when it names none of those forbidden things. A check with no test design fails. On `pass`, one commit records the matrix and sets Status to `tests`.

## 4. Test implementation

Status is `tests`.

Cut a branch from the local integration branch (`main`). File-changing work uses that branch. The read-only harness worktree is not used for this.

Write the executable tests that are the accepted test design, and no other tests. They fail because the behavior is not implemented yet. A test that already passes is either the wrong test or a check of behavior that already existed. Say which, in Implementation notes.

The agent runs the tests and records the result. The person can run the same tests and confirm them. A check that takes longer than a single agent turn is recorded with its expected runtime, and the result is recorded where the review can see it. Do not shorten the check so it fits the turn.

**Review.** One row per test-design item. A row passes when the test matches that item, fails because the behavior is not implemented yet (or the note explains behavior that already existed), and does not depend on a structure the test design did not name. On `pass`, one commit records the matrix and sets Status to `design`. The branch stays unmerged.

## 5. Implementation design

Status is `design`.

Write how the accepted tests will be made to pass. Every choice names the acceptance check it serves. A choice that serves no check is left out.

**Decisions** are a numbered table, D1 onward, one row per choice, with the reason.

The design does not change the tests, the test design, the requirements, or the outcome.

**Review.** One row per acceptance check, naming the part of the design that serves it. A check that nothing serves fails. A choice that serves no check fails. One further row: the tests on the branch are unchanged since their review. Also one row per decision fetched for this plan, including each confirmed decision on the parent plan. On `pass`, one commit records the matrix and sets Status to `implementation`.

## 6. Implementation

Status is `implementation`.

On the same branch, make the accepted tests pass. Rebase the branch onto local `main` before the review, so the diff is only this work.

Do not change the tests or the design. If the design cannot satisfy a test, stop and return to step 5. If a test does not match the accepted test design, return to step 4.

**Review.** One row per accepted test, with evidence it passes. One row that the tests are unchanged since their review. One row that the design is unchanged since its review. One row per decision fetched for this plan, including each confirmed decision on the parent plan. On `pass`, one commit records the matrix. Status stays `implementation` until the person accepts.

**Acceptance.** The review has already run the tests and recorded the evidence. The person accepts the finished work. They can run the tests themselves before accepting. They set `**Accepted:** YYYY-MM-DD`. That commit is theirs. The agent does not make it. It sets Status to `accepted`.

Merge the branch to `main` after that commit. The merge does not change a living doc and does not delete the plan.

## 7. Record

On `main`. A single-piece plan enters here after acceptance. A coordinating plan enters here when every plan file in the folder beside it is `accepted`.

Update the living doc named in **Part**. Write what is now true there. A coordinating plan adds only what its pieces have not already recorded. Present tense. No lifecycle status. Stamp **Last verified** with `git rev-parse HEAD` immediately before the commit that changes the doc. The doc never names the commit it lives in.

Add a new living doc only when that part does not have one yet. The new doc goes in the folder for the part of the project it describes. If nothing that later work needs to read has changed, leave the living docs alone.

A plan that has a parent stays at `accepted`. The parent removes it later. A plan that has no parent is deleted in this same commit, together with every plan under its folder.

Further work is a new plan.
