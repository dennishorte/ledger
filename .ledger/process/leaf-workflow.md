# Leaf-node Implementation Workflow

**Status:** LIVING (revise when the framework's automation reshapes the procedure)
**Last Updated:** 2026-11-17 (Verification is the test plan for the acceptance checks; it does not repeat them)

The standardised procedure for taking a leaf node (a node with no children) from PLANNED through COMPLETE under the current Phase-1 / pre-automation state of the framework. The orchestration substrate (PRD §7 — task runner, agent dispatcher, health daemon) will automate most of this when it lands. Until then, the operator drives it manually with LLM sub-agents.

Parent decomposition — writing the children manifest of a node that doesn't have one yet — is a different procedure and is not covered here.

Reopening a node that has **already reached COMPLETE** — to finish deferred scope or to extend it — is a back-edge the forward stages don't draw. It is covered in **Reopen mode** below. Do not improvise it as an ad-hoc pass; classify it first.

---

## Lifecycle map

Per PRD §6.2:

```
DRAFT → SPEC_REVIEW → APPROVED → IN_PROGRESS → VERIFY → COMPLETE
                                                     ↓
                                                ISSUE_OPEN
                                                     ↓
                                            (back to APPROVED or DRAFT)

COMPLETE ⤺ reopen (post-COMPLETE back-edge — see Reopen mode):
  Route F  finish deferred-but-specced scope   → IN_PROGRESS  (same version)
  Route V  extend, scope intrinsic to the node → DRAFT        (version bump, full re-verify)
  Route N  extend, scope separable             → new sibling/child node (not a reopen)
```

Every state in this diagram is set explicitly in the spec's Status header as the node progresses. The audit tables in the doc and the rows in the parent's children manifest mirror each transition. ISSUE_OPEN is entered when operator verification (stage 8) finds bugs; see stage 8b for the loop-back. The COMPLETE back-edge (Routes F/V) is entered after a node has shipped; see **Reopen mode**. Routes F and V reuse existing lifecycle tokens — no new state is introduced — so PRD §6.2's forward diagram still holds for any single cycle; the version suffix (v1 vs v2) distinguishes cycles.

---

## Stages

### 1. Requirements, then design

The spec is written in two passes. Pass A freezes Requirements while the node is `PLANNED`. The operator confirms that text. Pass B, in a fresh session, writes Design against it and moves the node to `DRAFT`. Design does not start in the session that wrote Requirements. A design written in that same session is how the design replaces the goal.

`DRAFT` keeps its meaning: requirements are confirmed and a design has been written against them, so spec review can begin. No new lifecycle status. A node already at `DRAFT` or later when this phase landed is past the gate — do not block it for a missing confirmation line.

#### 1a. Requirements — Status stays PLANNED

Create `docs/<path>/<id>.md` if it does not exist, or fill a `PLANNED` stub. The doc still carries every §6.1 heading so it validates. Only Requirements and Verification have content.

- **Front-matter:** Node ID, Parent, Status: PLANNED, Created, Last Updated, Dependencies. For direct children of the project root, the Parent line must be `project root (\`docs/00-project.md\`)` — not `` `00-project` `` (which extracts as a literal id that matches nothing and orphans the node).
- **Requirements** — the whole brief, under a page:
  - `**Requirements confirmed:** unconfirmed` on its own line. The agent does not write a date here.
  - **Outcome.** One sentence, in the operator's words: what is true when the work is done.
  - **Acceptance.** The checks that prove it. Each one names something a person can point at.
  - **Constraints.** What must stay as it is.
  - **Out of scope.** What this node will not do.
- **Verification** — the test plan. For each acceptance check, write the setup, the action, and what a person looks at to decide it passed. The acceptance wording stays in Acceptance. Commands and test-file names are filled in at 1c. This pass does not add a new outcome.
- **Design, Decisions, Open Issues, Implementation Notes** — `*(not started)*`.
- **Children** — None, unless this node is already a parent.

A requirement that names a file, a component, a library, or a mechanism is a design decision and does not belong in this pass.

If the operator already stated the outcome, the acceptance checks, and the out-of-scope line, copy that wording verbatim. If any of the three is missing, ask. Do not invent it. Where the operator has not spoken and the parent manifest has only a one-line responsibility, use that line as the Outcome and leave Acceptance, Constraints, and Out of scope as `_(operator)_`.

If the doc already exists and Design contains more than a not-started placeholder, leave Design, Decisions, and Verification untouched in this pass. Still do not set the confirmed date.

Add the node to its parent's children manifest at `PLANNED` in the same commit. Commit message: `docs(<id>): PLANNED requirements`. Then stop.

#### 1b. Operator confirms

The operator edits the requirements, replaces any `_(operator)_` placeholder, and sets `**Requirements confirmed:** YYYY-MM-DD`. That confirmation is its own commit. The agent does not make it.

A later change to the frozen text adds `**Requirements amended:** YYYY-MM-DD — <what changed>`. If the node is already `DRAFT` or later, an amendment that adds an outcome sends it back through stage 2. Finishing work that was already in the confirmed requirements does not touch them (Reopen mode, Route F).

#### 1c. Design — PLANNED → DRAFT

Start a fresh session. Seed it with the confirmed Requirements text, verbatim, at the top of the prompt and again at the end, plus the parent doc and a sibling spec for house style. Do not continue the conversation that wrote the requirements.

The design author writes:

- **Design** — data contract / new types, layout (ASCII wireframes where they help), components and files, interaction model. Every choice names the acceptance line it serves. A choice that serves no line is left out.
- **Decisions** — numbered D1...Dn table, one row per choice, with rationale (the *why*, not the *what*).
- **Open Issues** — priority-tagged (HIGH / MEDIUM / LOW / TRIVIAL).
- **Implementation Notes** — empty: `*(none yet — pre-implementation)*`.
- **Verification** — the test plan. Keep the explanation of how each check is confirmed. Naming a command or a test file is allowed. Adding an outcome that the confirmed requirements do not contain is not.

Tone: opinionated, terse, decision-explicit. Match the depth of `docs/14-review-process.md` and `docs/12-workflow-decomposition.md`.

The design author does not edit Requirements. If the confirmation line is missing, still says `unconfirmed`, or any of Outcome / Acceptance / Out of scope is still `_(operator)_`, stop without writing Design.

Bump Status `PLANNED → DRAFT` in the spec and the parent manifest. One commit: `docs(<id>): PLANNED → DRAFT`.

#### Decomposition checkpoint — before advancing to stage 2

Run these signals against the freshly written DRAFT. If **any** fire, stop and follow
`.ledger/process/decomposition.md` instead of proceeding to stage 2.

- **Unrelated concerns:** you can name ≥2 prospective child responsibilities with
  non-overlapping data contracts (different files, types, or endpoints each would own).
- **Single-implementer breach:** one agent cannot ship the full node in one worktree
  session without itself having to dispatch sub-agents.
- **Size already large:** the DRAFT spec is already pushing the token-size threshold
  (default 12 000 tokens) or the implementation diff is clearly unbounded.
- **Depth headroom exhausted:** this node already sits at nesting level 4, so any
  children would exceed the depth cap with no written coordination justification in the
  parent's Decisions section.
- **≥3 independent top-level files:** the Design section lists ≥3 files that have no
  shared type or interface dependency — a strong proxy for hidden multi-responsibility.

If none fire, the node is a leaf. Proceed to stage 2.

#### Compute-heavy gating checkpoint — before advancing to stage 2

A separate check from decomposition: does the node's acceptance criterion depend on a
long-running probe, simulation, or benchmark (rough wall-clock >~15 min to execute)?

If yes, record it in the Verification section (expected runtime, plus a note that
execution is an operator/main-session step — not part of the implementer's worktree
turn) and flag it for stage 4's dispatch brief below. A dispatched subagent's
background jobs die when its own turn ends; a probe that outlives the turn never lands
its artifact, and the node stalls in IN_PROGRESS with a verdict that never arrives.
Observed empirically: probes under ~20 min completed cleanly inside the implementer's
turn, a ~35 min probe left its node's verdict never landing, and an 81 min probe was
force-closed mid-implementation.

Do not shrink the probe to fit the dispatch budget — that quietly weakens the
acceptance criterion instead of fixing the dispatch problem. If the spec needs N steps
to demonstrate the property, run N steps; route the run to stage 4b's compute-heavy
exception instead.

### 2. DRAFT → SPEC_REVIEW — dispatch reviewer in clean context

Before dispatching, bump the spec's Status header DRAFT → SPEC_REVIEW and update the parent's children manifest row to match. **Commit this transition as its own commit** before dispatching the reviewer — every lifecycle transition produces its own commit (see Patterns below). SPEC_REVIEW is a real lifecycle state per PRD §6.2: it tells any reader (human or agent) that the spec is mid-review and not yet safe to base implementation on. Under the manual workflow the state is transient (typically lasts minutes), but persists meaningfully once the framework's reviewer-agent dispatch is queued behind other tasks.

Spawn a Sonnet sub-agent (general-purpose, no isolation needed — read-only) and brief it:

- Pointer to the spec doc.
- Required reading: relevant PRD sections, parent doc, sibling specs as house-style benchmarks, existing types at `workflow.typesEntrypoint` (this repo: `packages/parser/src/index.ts`).
- Evaluation criteria: requirements fidelity (`.ledger/process/verification-signoff.md`), then schema compliance, PRD coverage, dependency declaration, type additions vs existing types, MVP scoping, internal consistency, house-style alignment.
- Output shape: the per-requirement sign-off matrix. The result and the three steps are in `.ledger/process/verification-signoff.md`. This stage does not restate them. Rows, in order: fidelity F1, F2, F3, then one row per product-requirements item the spec must cover and one per Requirements bullet.

The reviewer runs in clean context so it can give independent judgment — the framework's mitigation for the self-audit problem (PRD §11). The agent that wrote the spec cannot reliably check its own work.

Spec review runs against a `DRAFT`. A `PLANNED` node has not finished stage 1. Do not dispatch a reviewer at a doc whose `**Requirements confirmed:**` line is missing or `unconfirmed`, unless the node was already `DRAFT` or later before the requirements phase (no confirmation line, and Design is already written).

**Shortcut allowed:** if the spec is small, well-established, and you (the operator) trust it cold, skip this stage. Set Status directly to APPROVED with a note in the commit message that no formal review was run. The implementation review (stage 6) is the mandatory gate, not the spec review. The shortcut skips the review. It does not skip the stage-1b confirmation commit.

### 3. Record the audit, then advance on `pass`

The result and the three steps are in `.ledger/process/verification-signoff.md`. This stage does not restate them.

Write the five-column matrix into a **Spec Review (YYYY-MM-DD)** section between Open Issues and Implementation Notes. That commit does not change status. Status stays `SPEC_REVIEW`. The matrix stays in the doc as durable provenance — the implementing agent in stage 4 will read it to know what was already decided.

When the disposition is `pass`, the next commit moves `SPEC_REVIEW` → `APPROVED`. Update the parent's children manifest row and the cross-doc summary lines in that commit. `followups` stops for the operator and does not dispatch. `changes-required` is reviewed again before the status moves. A heading is not a pass.

### 4. APPROVED → IN_PROGRESS → VERIFY — implementer in isolated worktree

Spawn a Sonnet sub-agent with `isolation: "worktree"`. Brief it with:

- Pointer to the spec doc as source of truth.
- Specific callouts from the Spec Review audit table. Those are the highest-leverage details that the implementer would otherwise risk missing.
- Required context: spec docs of any dependencies, parent doc, CLAUDE.md, the actual source files it will touch.
- Process steps — **two commits**, one per status transition:
  - **4a. Entry commit (APPROVED → IN_PROGRESS).** First action inside the worktree: bump Status header APPROVED → IN_PROGRESS in the spec and the parent manifest row, commit. Nothing else in this commit — no implementation files. Gives the git log a clean "implementer started" timestamp and makes IN_PROGRESS a real inhabited state instead of a synthetic transition.
  - **4b. Implementation.** Implement what the spec says. Run the checks the project already uses for that kind of change. Fill Implementation Notes (decisions, deviations, and which checks were run).
    - **Compute-heavy exception.** If the compute-heavy gating checkpoint fired at stage 1, 4b stops once the probe/harness is wired and runnable — the implementer commits the harness, not a completed run, and notes in Implementation Notes that the probe result is pending operator execution. The operator then runs the real probe from the main session (background job, re-invoked on completion) and records the verdict in Implementation Notes before 4c. Do not claim VERIFY on a probe result the implementer's own turn could not have witnessed completing — that includes a background job it kicked off and then reported "done" without waiting for.
  - **4b½. Look at the artifact, when the work produces one.** Some nodes produce a thing a diff does not show (a rendered map, a generated report). The operator looks at it before the exit commit. The node stays `IN_PROGRESS`. A rejection is a note that briefs a fix in the same worktree; the operator looks again. Acceptance is what lets 4c proceed. A node with nothing to look at skips this.
  - **4c. Exit commit (IN_PROGRESS → VERIFY).** Bump Status header IN_PROGRESS → VERIFY in spec + parent manifest, commit. This commit contains the code + Implementation Notes + status bump together — they all belong to the same "implementer finished" event. For a compute-heavy node, this commit does not land until the operator's probe verdict (above) is recorded.
- Reporting: files changed, which checks were run and what they returned, and acceptance-check items the agent could not verify itself.

Why worktree isolation:

- Prevents conflicts when work happens in parallel with other agents or with main-branch changes.
- Gives the agent a clean directory to write tests, fixtures, and intermediate files without polluting main.
- Lets the operator inspect via `git diff` before merging, and abort or retry without main-branch consequences.

### 5. Rebase the worktree onto main HEAD

After the implementer reports "done", rebase the worktree branch onto current main:

```bash
git -C /path/to/worktree rebase main
```

Rationale: the worktree was branched from main at the time of dispatch. While the implementer worked, main may have advanced (other merges, PRD edits, doc-sync commits). Without rebasing, the next stage's `git diff main..HEAD` shows main-only files as **deletions** — a branch-divergence artifact that confuses reviewers (we hit this with the 08-markdown reviewer flagging the "deletion" of `06-health.md` as a `Blocking` finding). Rebasing eliminates the artifact at the source: the diff becomes clean, containing only the worktree's actual additions and modifications.

If the rebase has conflicts, resolve them now — they are the same conflicts the merge would surface, found earlier. Verify the rebased worktree still builds clean (`pnpm typecheck` / `lint` / `build`) before moving on. If conflicts touch the work substantively (not just status-header churn), consider whether the implementer needs another pass.

This stage also tests the **multi-worktree shared-file gap** (see Known Limitations below): if main has changed a file your worktree also changed, the conflict surfaces here.

### 6. Implementation review — reviewer against the rebased worktree diff

Same pattern as stage 2, but against the implementation. Sonnet sub-agent, clean context, pointed at the (now-rebased) worktree branch. Because the diff is clean post-rebase, the reviewer can use `git diff main..HEAD` directly without artifact confusion.

Output shape: the per-requirement sign-off matrix. The result and the three steps are in `.ledger/process/verification-signoff.md`. This stage does not restate them. Rows, in order: R0, then one row per Requirements bullet and one per acceptance check. The reviewer runs the checks the change calls for and cites what they returned. A check that needs a person is `N/A — operator gate`. The operator's stage-8 pass is their real sign-off.

**No shortcut.** Unlike the spec review (stage 2), the implementation review is mandatory for every node. The headless reviewer catches type errors, spec-conformance gaps, and discipline violations (no `any`, no dead code).

Evaluation criteria expand to include:

- **Requirements text** — unchanged since `**Requirements confirmed:**`, or a `**Requirements amended:**` line records the change. A rewrite of Requirements to match the code, with no amendment, is a FAIL. A node that predates the confirmation line gets `N/A` on this row with that reason. This row does not re-litigate design against the goal; stage 2 already did that.
- **Spec conformance** — especially the Spec Review closures from stage 3, since those were known risk areas.
- **Build/lint/typecheck** — run them; report exit codes and bundle numbers.
- **Code discipline** — no `any`, no suppressions (especially `eslint-disable-next-line ...`), no `console.log`, no dead code.
- **Bundle delta sanity** — compare to the named baseline from stage 4.
- **Checks** — the checks named in the spec's Verification section were run, and the review cites what they returned. A check this project does not have is `N/A`.
- **Regression checks** for any shared infrastructure the node touched (e.g., DAG panel if shared types or parser logic changed).
- **Anything the implementer's report glossed over.**

### 7. Record the audit, then open the operator gate on `pass`

Same pattern as stage 3. The result and the three steps are in `.ledger/process/verification-signoff.md`. The audit table goes inside Implementation Notes as a subsection titled **Implementation Review (YYYY-MM-DD)**. Two audit tables now exist in the spec: spec review and implementation review. Both stay for provenance. The audit commit does not change status. Status stays `VERIFY`. When the disposition is `pass`, the operator gate opens. The review does not mark the node complete. `followups` stops for the operator and does not dispatch. `changes-required` is reviewed again before any status moves. A heading is not a pass.

If the implementation diverged from the spec in a way the operator approves, update the spec in the same commit. "Doc and code must agree" (CLAUDE.md) is honoured by updating whichever side drifted; silent divergence is not. An edit to Requirements in that commit records a `**Requirements amended:**` line (date and what changed). If the edit adds an outcome the confirmation did not contain, stop after the commit and re-enter at stage 2. Do not promote.

### 8. Operator verification

Read the acceptance checks, including every row marked `N/A — operator gate`. Run any check the reviewer could not run. A failure is a blocking bug; enter stage 8b.

The operator writes the outcome into the doc. Accepting it is what allows promotion to COMPLETE. Rejecting it names what is wrong and enters stage 8b. There is no task runner and no separate approval request.

#### 8b. If verification finds bugs — VERIFY → ISSUE_OPEN, loop back

Bump Status VERIFY → ISSUE_OPEN. File the discovered bugs into the spec's Open Issues with priority tags. **Commit this transition** (status bump + new Open Issues entries + parent manifest row update) as its own commit before re-entering the cycle. Pick the re-entry point:

- **Mechanical fixes inside the implementation:** re-enter at stage 4 with a brief patch task. The implementer (same or new agent) addresses the issues; a new dated subsection joins Implementation Notes documenting what was fixed.
- **Spec was wrong:** re-enter at stage 1 (revise the spec, then re-run stage 2's review pass). The original Spec Review and Implementation Review audit tables stay; the new spec revisions land alongside.

Either way the loop-back is durable in the doc: a future reader can trace exactly when ISSUE_OPEN was entered, what was found, and what was done about it. Status transitions through ISSUE_OPEN → APPROVED → IN_PROGRESS → VERIFY → COMPLETE on the second pass mirror the original promotion path.

### 9. VERIFY → COMPLETE in the worktree

Once verification passes, bump:

- Spec's Status header: VERIFY → COMPLETE (v1, YYYY-MM-DD).
- Parent manifest row: VERIFY → COMPLETE (v1).
- Spec's own sample-tree picture (if it has one): row → `[COMPLETE]`.
- **Reference-doc check** — if the node touched anything a
  `docs/_reference/` doc describes, fold the delta into this same
  commit. The check is diff-shaped and cheap: list the files this node
  touched (`git diff --name-only <base>...HEAD`), grep `docs/_reference/`
  for docs citing those paths or this node's id. No covering doc (or no
  `_reference/` dir) → nothing to do. Otherwise update the stale rows
  and set the doc's **last-verified** stamp to `git rev-parse HEAD` —
  run it *before* committing, since a doc never names the commit it
  lives in. Skipping it silently is how the reference layer rots.

Single commit in the worktree.

### 10. Merge `--no-ff` — bundle the cross-doc sync into the merge commit

**Prerequisites:** stage 6 implementation review complete, stage 7 audit committed, stage 8 operator sign-off. Do not merge a worktree that has not cleared all three.

```bash
git -C /path/to/main merge --no-ff --no-commit <worktree-branch>
```

The `--no-commit` lets you inspect the merge tree and **apply cross-doc summary updates before the merge commit lands**. With the worktree already rebased (stage 5), the merge surface is essentially the worktree's commits — minimal conflict potential.

While the merge is uncommitted, edit:

- `CLAUDE.md` round-2 panels line (or equivalent project-state summary).
- `docs/00-project.md` §14's parent-node status note.
- Sibling sample-tree pictures that show this node's status.

These files weren't touched by the worktree (they're outside its concern) and the merge doesn't flag them as conflicts. Bundling them into the merge commit gives one atomic transition: main never sits in a half-updated state with a COMPLETE node and stale top-level summaries.

Run the project's checks on the merged tree. If they pass:

```bash
git -C /path/to/main commit -m "Merge <branch>: <node-id> → COMPLETE + doc sync"
```

The merge bubble in the log now contains both the merge and the doc sync.

`--no-ff` preserves the per-step provenance (implement → review → promote) as a merge bubble. A squash flattens it; only do that if you explicitly want a linear history.

### 11. Worktree cleanup

Once merged:

- `git worktree remove -f -f <path>` (the second `-f` is needed because Claude-Code worktrees are locked while in use).
- `git branch -d <worktree-branch>` (lowercase `-d` refuses to delete if not fully merged — a safety net).

---

## Reopen mode — finishing or extending a COMPLETE node

Stages 1–11 assume a node moves through its lifecycle once. A node that has already reached COMPLETE sometimes needs more work. Stage 8b (ISSUE_OPEN) only covers loop-back *before* COMPLETE; this section covers loop-back *after*. Closing a deferred Open Issue on a COMPLETE node via the triage layer is a different entry point — see `open-issue-resolution.md` — and routes here only when the resolution type is "reopen this node."

### Classify first — finish ≠ extend

"Reopen-and-extend" almost always conflates two operations that earn different gates:

- **Finish** — completing requirements that were already in the approved spec but were deferred or only partially verified at COMPLETE (the "item 9 deferred to routine use" pattern). These already passed spec review; they need no new spec gate.
- **Extend** — adding requirements that were **never in the spec**. New scope always needs a gate. The only question is whether it gets its own node or rides a re-spec of this one.

Do not run a single blurry pass that mixes the two. New requirements that ride to COMPLETE under the node's already-granted verification have never been confronted by a review — exactly the failure stages 2 and 6 exist to prevent.

### Route F — finish only (same version)

The work closes already-specced, deferred requirements; nothing is added to the requirement set.

1. **Reopen.** Bump Status COMPLETE → IN_PROGRESS (keep the version — this is still v1's scope). Commit the transition on its own; the message names the deferred items being closed and marks it a finish-reopen. Do not edit Requirements. The confirmed text already contains this work.
2. **Scope the delta.** Add a dated **Reopen (YYYY-MM-DD) — finish** subsection to Implementation Notes listing the *delta-acceptance items*: exactly the Requirements / acceptance rows being completed this pass. This list — not the whole node — is what stage 6 review and stage 8 verification check.
3. **Re-enter at stage 4** (implementer worktree). Run stages 4–11 as normal, but stage 6 and stage 8 are scoped to the delta-acceptance list. Promote VERIFY → COMPLETE (still v1) at stage 9.

### Route V — extend, intrinsic scope (version bump)

The new scope is part of this node's identity and cannot live as a separate node (the `07-health-daemon` v1→v2 case: v2 *replaced* v1's design rather than sitting beside it).

1. **Reopen.** Bump Status COMPLETE → DRAFT. The spec is being revised, so the node re-enters at the spec gate, not the implementation gate. Commit the transition.
2. **Amend Requirements first.** Add `**Requirements amended:**` with the date and the new outcome. The operator confirms the amended text before Design changes. New scope that never passes the requirements text has not been confronted by stage 2.
3. **Supersede the spec.** Revise Design / Decisions to the new combined set. Keep the prior cycle's audit tables for provenance; add a **Supersede (YYYY-MM-DD): v1 → v2** note stating what v2 adds and *why it could not be a sibling* (that justification is the test for choosing V over N).
4. **Re-run from stage 2.** The whole node re-verifies against the combined spec — v1's requirements are **not** grandfathered out. A v2 verification covers everything the node now claims. Final Status: COMPLETE (v2, YYYY-MM-DD).

### Route N — extend, separable scope (new node)

The new scope is separable. This is not a reopen at all.

1. Leave the COMPLETE node untouched.
2. Author a sibling (`<id>.md` beside it) or child (`<id>/NN-<slug>.md`, if it decomposes the parent) with a declared dependency on the original. Run the normal forward flow from stage 1a.

Prefer this whenever the scope *can* be separated. A new node keeps each VERIFY scoped to exactly one declared requirement set — the property version-bumps erode. Route V is the exception reserved for scope that genuinely cannot be carved off.

### Decision rule

**Finish → F. Extend that can be a separate node → N. Extend that cannot → V.** When torn between V and N, choose N — a sibling node is cheaper to reason about than a node whose verification spans two requirement sets.

---

## Patterns to lean on

- **Requirements freeze before design.** Stage 1a commits Requirements at `PLANNED` and stops. The operator writes the confirmation date. Stage 1c is a fresh session that writes Design and does not edit Requirements. The session that wrote Requirements does not continue into design.

- **Lifecycle states are real, not decorative.** Every state in PRD §6.2 is set explicitly in the spec's Status header as work progresses. DRAFT → SPEC_REVIEW → APPROVED → IN_PROGRESS → VERIFY → COMPLETE is six explicit transitions, not "skip to APPROVED when you feel good." `PLANNED` is inhabited for the requirements phase, not only as a decomposition placeholder. Other agents (and future-you reading old commits) rely on the state being accurate at any point in the log.

- **Every status transition is a commit.** Each entry into DRAFT, SPEC_REVIEW, APPROVED, IN_PROGRESS, VERIFY, COMPLETE, or ISSUE_OPEN lands as its own commit in the spec doc (and the parent's children manifest row, when relevant). This gives the git log a complete audit trail of the node's lifecycle that future readers can bisect or reconstruct without parsing the doc body. The review audit is its own commit, and it does not change status. A `changes-required` result is reviewed again before the status moves. `followups` stops for the operator. Stages whose only output is a transition (stages 2, 4a, 8b, and the approve commit after a `pass`) commit just the status bump. Stages that bundle a transition with substantive work (stages 1, 4c, 9) commit the transition together with that work. Stages with no transition (5 rebase, 6 review, 8 operator verification, 11 cleanup) do not require a commit. Commits are cheap; the audit trail is durable.

- **Reviewer in clean context** (stages 2 and 6). Both reviews run in a sub-agent's fresh window. This is the self-audit mitigation from PRD §11. The same context that wrote the artifact cannot reliably check it. Clean context supplies the *who* (independence); the per-requirement **sign-off matrix** (`.ledger/process/verification-signoff.md`) supplies the *rigor* (every requirement confronted individually, with evidence — a PASS without concrete evidence is recorded as FAIL). Both halves together are the mitigation; either alone rubber-stamps. The *spec* review (stage 2) may be skipped on a small, trusted spec — the operator's call. The *implementation* review (stage 6) is non-negotiable; no shortcut applies.

- **Rebase before review** (stage 5). Eliminates the branch-divergence "deletion" artifact and surfaces merge conflicts early. Reviewer sees a clean diff; the merge in stage 10 is mechanical.

- **Audit tables as durable provenance.** Spec reviews land in a "Spec Review (YYYY-MM-DD)" section between Open Issues and Implementation Notes. Implementation reviews land in an "Implementation Review (YYYY-MM-DD)" subsection of Implementation Notes. Both stay in the doc forever — future implementing agents on related nodes will read them.

- **Apply-easy, punt-substantive, discuss-leftovers.** The audit is its own commit. A fully specified fix is applied per `.ledger/process/verification-signoff.md`, and a `changes-required` result is reviewed again before the status moves. `followups` stops for the operator. These bullets do not state which rows produce which result.

- **Worktree-per-implementation.** Every implementing agent runs in its own worktree. Worktrees can run in parallel (operator dispatches multiple at once for independent nodes), can outlive a single conversation, and isolate failed attempts from main.

- **Promotion bundles doc-and-code.** Status header, parent manifest row, sample-tree pictures, top-level summaries — all change together in one commit. Stage 3 (DRAFT→APPROVED) and stage 10 (merge + cross-doc sync) both bundle the ripple-effect edits with the primary state change. Drift in any of them is a smell.

- **Operator sign-off is the COMPLETE gate.** The reviewer does not promote the node. The operator does, after stage 8. Stage 8b is the explicit answer for "what if the human says no."

- **Finish ≠ extend on a reopen.** A COMPLETE node that needs more work is two operations wearing one phrase. Closing deferred-but-specced requirements (Route F) needs no spec gate; adding never-specced scope needs one — either a sibling node (Route N, preferred) or a re-spec'd version bump (Route V). Never let new requirements ride to COMPLETE under the prior cycle's verification. See **Reopen mode**.

---

## Known limitations

- **Parallel-worktree shared-file conflicts.** When two worktrees touch the same file, nothing coordinates them. Stage 5's rebase surfaces the conflict. Resolving it is manual. When two people implement at once, pick nodes whose files don't overlap.

- **Worktree staleness during long runs.** A worktree dispatched against main HEAD at time T can drift if main advances substantially before the implementer finishes. Stage 5's rebase pulls it back into alignment, but if main has changed the very file the implementer rewrote, the rebase can be substantial. Today: keep dispatches scoped tight so they finish in minutes, not hours.

- **Subagent turn budget vs. long-running gating probes.** A dispatched implementer's background jobs die when its own turn ends — there is no "detached" background process that outlives the subagent, unlike the operator's main session, which survives a background job and gets re-invoked on completion. Nodes whose acceptance criterion is a long simulation/benchmark can stall (verdict never lands) or force-close mid-implementation if the probe is run inside the implementer's turn. Mitigation: the stage-1 compute-heavy gating checkpoint and stage 4b's compute-heavy exception split the work — implementer wires the probe, operator runs it. Do not fix this by shrinking the probe to fit the budget.

---

## This process stays written down

An operator and a fresh-context reviewer carry every stage. A task runner, a dispatcher, and a health scanner were built for this repo and removed on 2026-11-17. Do not wait for them, and do not recreate them in order to finish a node. The shape that stays is review in a clean context, an audit trail, isolated implementation, rebase before review, and a merge that keeps that history.
