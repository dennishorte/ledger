# Leaf-node Implementation Workflow

**Status:** LIVING (revise when the framework's automation reshapes the procedure)
**Last Updated:** 2026-07-06 (compute-heavy gating checkpoint added — split long-running probes between implementer wiring and operator/main-session execution)

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

### 1. DRAFT — author the spec

Create `docs/<path>/<id>.md` following the schema in PRD §6.1. Required sections in this order, matching sibling specs:

- **Front-matter:** Node ID, Parent, Status: DRAFT, Created, Last Updated, Dependencies. For direct children of the project root, the Parent line must be `project root (\`docs/00-project.md\`)` — not `` `00-project` `` (which extracts as a literal id that matches nothing and orphans the node).
- **Requirements** (with explicit out-of-scope bullets — the "what we are NOT doing in v1" list is as important as the "what we are").
- **Design** — data contract / new types, layout (ASCII wireframes where they help), components & files, interaction model, manual acceptance check.
- **Decisions** — numbered D1...Dn table, one row per choice, with rationale (the *why*, not the *what*).
- **Open Issues** — priority-tagged (HIGH / MEDIUM / LOW / TRIVIAL).
- **Implementation Notes** — empty: `*(none yet — pre-implementation)*`.
- **Verification** — what the verifier confirms before promoting to COMPLETE. For any node that introduces or changes UI panels or API endpoints, this section must name the E2E spec file(s) expected to cover the new surface and state what they assert. "Passes existing suite" is acceptable only if the node touches no new UI surface. If the gating deliverable is a long-running probe/simulation/benchmark, see the compute-heavy gating checkpoint below and state the expected runtime here.
- **Children** — None, unless decomposing further.

Tone: opinionated, terse, decision-explicit. Match the depth of `01-ui/02-dag.md` (the gold standard) and `01-ui/06-health.md` (a recent thorough DRAFT).

Add the new node to its parent's children manifest in the same commit.

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
- Required reading: relevant PRD sections, parent doc, sibling specs as house-style benchmarks, existing types in `app/src/lib/types.ts`.
- Evaluation criteria: schema compliance, PRD coverage, dependency declaration, type additions vs existing types, MVP scoping, internal consistency, house-style alignment.
- Output shape: the **per-requirement sign-off matrix** (`.ledger/process/verification-signoff.md`) — one row per PRD-coverage item and per Requirements bullet, each with a PASS/FAIL/PARTIAL/N/A verdict and concrete evidence. The matrix *is* the coverage matrix. Severity-grouped findings (Blocking / Should-fix / Nit) with concrete fixes are a secondary section for the non-PASS rows; the headline **Verdict** (`READY_FOR_APPROVAL` / `NEEDS_MINOR_REVISIONS` / `NEEDS_MAJOR_REVISIONS`) must be derivable from the matrix.

The reviewer runs in clean context so it can give independent judgment — the framework's mitigation for the self-audit problem (PRD §11). The agent that wrote the spec cannot reliably check its own work.

**Shortcut allowed:** if the spec is small, well-established, and you (the operator) trust it cold, skip this stage. Set Status directly to APPROVED with a note in the commit message that no formal review was run. The implementation review (stage 6) is the mandatory gate, not the spec review.

### 3. Apply easy fixes; record audit; SPEC_REVIEW → APPROVED

Apply every Should-fix and Nit that is a mechanical text change. Punt anything requiring structural rewrites or substantive judgment back to the conversation for the operator's call. Add a **Spec Review (YYYY-MM-DD)** section between Open Issues and Implementation Notes with an audit table:

```markdown
| # | Finding | Resolution |
|---|---------|------------|
| S1 | ... | ... |
```

The audit table stays in the doc as durable provenance — the implementing agent in stage 4 will read it to know what was already decided.

With the audit landed, bump Status SPEC_REVIEW → APPROVED. Update the parent's children manifest row. Update cross-doc summary lines (CLAUDE.md round-2 line, PRD §14 parent status note, sibling sample-tree pictures). Single commit covers all of these — the framework's "doc-and-code must agree" rule (CLAUDE.md) extends to "all doc tree references to a node must agree."

### 4. APPROVED → IN_PROGRESS → VERIFY — implementer in isolated worktree

Spawn a Sonnet sub-agent with `isolation: "worktree"`. Brief it with:

- Pointer to the spec doc as source of truth.
- Specific callouts from the Spec Review audit table. Those are the highest-leverage details that the implementer would otherwise risk missing.
- Required context: spec docs of any dependencies, parent doc, CLAUDE.md, the actual source files it will touch.
- Process steps — **two commits**, one per status transition:
  - **4a. Entry commit (APPROVED → IN_PROGRESS).** First action inside the worktree: bump Status header APPROVED → IN_PROGRESS in the spec and the parent manifest row, commit. Nothing else in this commit — no implementation files. Gives the git log a clean "implementer started" timestamp and makes IN_PROGRESS a real inhabited state instead of a synthetic transition.
  - **4b. Implementation.** Implement → run `pnpm typecheck` / `lint` / `build` → add or update E2E tests (see below) → fill Implementation Notes (deps + decisions + bundle delta + any deviations).
    - **Compute-heavy exception.** If the compute-heavy gating checkpoint fired at stage 1, 4b stops once the probe/harness is wired and runnable — the implementer commits the harness, not a completed run, and notes in Implementation Notes that the probe result is pending operator execution. The operator then runs the real probe from the main session (background job, re-invoked on completion) and records the verdict in Implementation Notes before 4c. Do not claim VERIFY on a probe result the implementer's own turn could not have witnessed completing — that includes a background job it kicked off and then reported "done" without waiting for.
  - **4b½. Post-implementation gate (optional, project-configured).** If the project's
    `.ledger/project.json` sets `workflow.postImplementationGate`, run its `command` inside
    the implementation worktree and create a `human_review` task pointing at the resulting
    artifact. **4c does not land until this gate is approved** — same deferral pattern as the
    compute-heavy exception above. Projects with no `postImplementationGate` configured skip
    straight to 4c; it exists because some project domains produce an artifact (a rendered
    map, a generated report) that benefits from a direct look before rebase/review proceed —
    a diff review alone doesn't substitute for eyeballing the actual output.
    - **On reject:** the task's rejection rationale briefs a patch agent working in the same
      worktree (no new branch). It commits a fix, the gate command re-runs, and a new
      `human_review` task is created for the next round. The node stays `IN_PROGRESS`
      throughout — no `ISSUE_OPEN` detour, since `VERIFY` was never claimed to begin with.
    - **On approve:** 4c proceeds as originally specified.
  - **4c. Exit commit (IN_PROGRESS → VERIFY).** Bump Status header IN_PROGRESS → VERIFY in spec + parent manifest, commit. This commit contains the code + Implementation Notes + status bump together — they all belong to the same "implementer finished" event. For a compute-heavy node, this commit does not land until the operator's probe verdict (above) is recorded.
- Reporting: bundle delta vs a named baseline, files changed, `pnpm -C e2e test` exit code and pass/skip/fail counts, acceptance-check items the agent could not verify in its headless environment.

**E2E test requirement.** Every node that introduces or modifies a UI panel or a user-facing API endpoint must ship corresponding additions to `e2e/tests/`. The minimum bar per panel is a smoke test (page loads, landmark heading visible, at least one data item renders). Interaction flows (approve/reject, dispatch, scan trigger, alert dismiss) get their own tests. Tests that require a live `ANTHROPIC_API_KEY` or real agent dispatch are out of scope for the suite — note them as `test.skip` with a reason string. Run `pnpm -C e2e test` inside the worktree before reporting done; a red suite blocks the exit commit.

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

Output shape: the **per-requirement sign-off matrix** (`.ledger/process/verification-signoff.md`) — one row per Requirements bullet *and* per Acceptance-check item, each PASS/FAIL/PARTIAL/N/A with concrete evidence (a `file:line`, a gate exit, or a named test; a PASS with no evidence is recorded as FAIL). Acceptance items that need a browser walk are `N/A — operator gate` for a headless reviewer; the operator's stage-8 pass is their real sign-off.

**No shortcut.** Unlike the spec review (stage 2), the implementation review is mandatory for every node. The operator cannot assess code correctness from a browser walk alone; the headless reviewer catches type errors, spec-conformance gaps, and discipline violations (no `any`, no dead code) that stage 8's manual walk misses.

Evaluation criteria expand to include:

- **Spec conformance** — especially the Spec Review closures from stage 3, since those were known risk areas.
- **Build/lint/typecheck** — run them; report exit codes and bundle numbers.
- **Code discipline** — no `any`, no suppressions (especially `eslint-disable-next-line ...`), no `console.log`, no dead code.
- **Bundle delta sanity** — compare to the named baseline from stage 4.
- **E2E coverage** — `pnpm -C e2e test` passes; new/modified UI surfaces have corresponding tests in `e2e/tests/`; smoke tests and interaction-flow tests are present per the spec's Verification section. A node that touches a UI panel with no E2E additions is a FAIL unless the spec explicitly justified the omission.
- **Regression checks** for any shared infrastructure the node touched (e.g., DAG panel if shared types or parser logic changed).
- **Anything the implementer's report glossed over.**

### 7. Apply easy review fixes in the worktree; record the audit

Same pattern as stage 3. The audit table goes inside Implementation Notes as a subsection titled **Implementation Review (YYYY-MM-DD)**. Two audit tables now exist in the spec: spec review and implementation review. Both stay for provenance. **Commit the audit + any code fixes as a single commit** in the worktree.

If the implementation diverged from the spec in a way the operator approves, update the spec in the same commit. "Doc and code must agree" (CLAUDE.md) is honoured by updating whichever side drifted; silent divergence is not.

### 8. Operator manual verification

**Primary gate — run the E2E suite:**

```bash
pnpm -C e2e test
```

`webServer` boots the full stack automatically (Hono API + Vite dev server) if they are not already running; `reuseExistingServer: true` reuses them if they are. All tests introduced by this node must pass. A failing E2E test is a blocking bug; enter stage 8b.

**Secondary gate — browser spot-check for surfaces the suite cannot cover:**

For acceptance-check items explicitly marked `N/A — operator gate` in the implementation review (things like first-paint aesthetics, SSE stream visible in DevTools, or flows that require a real `ANTHROPIC_API_KEY`), boot the dev server and walk them manually:

```bash
pnpm -C server dev /path/to/project   # terminal A
pnpm -C app dev                        # terminal B
```

Port 4179 is pinned with `strictPort: true`. Stop any conflicting process first (`lsof -iTCP:4179 -sTCP:LISTEN -t | xargs kill`).

The E2E suite is the primary correctness gate; the browser walk is a supplement for what automation cannot reach. If the suite passes and the spot-check finds nothing, promote to COMPLETE.

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

Run `pnpm typecheck` / `lint` / `build` on the merged + synced tree. If they pass:

```bash
git -C /path/to/main commit -m "Merge <branch>: <node-id> → COMPLETE + doc sync"
```

The merge bubble in the log now contains both the merge and the doc sync.

`--no-ff` preserves the per-step provenance (implement → review → promote) as a merge bubble. A squash flattens it; only do that if you explicitly want a linear history.

### 11. Worktree cleanup

Once merged:

- Kill any dev server still pointing at the worktree: `lsof -i :4179 -P -n` → `kill <pid>`.
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

1. **Reopen.** Bump Status COMPLETE → IN_PROGRESS (keep the version — this is still v1's scope). Commit the transition on its own; the message names the deferred items being closed and marks it a finish-reopen.
2. **Scope the delta.** Add a dated **Reopen (YYYY-MM-DD) — finish** subsection to Implementation Notes listing the *delta-acceptance items*: exactly the Requirements / acceptance rows being completed this pass. This list — not the whole node — is what stage 6 review and stage 8 verification check.
3. **Re-enter at stage 4** (implementer worktree). Run stages 4–11 as normal, but stage 6 and stage 8 are scoped to the delta-acceptance list. Promote VERIFY → COMPLETE (still v1) at stage 9.

### Route V — extend, intrinsic scope (version bump)

The new scope is part of this node's identity and cannot live as a separate node (the `07-health-daemon` v1→v2 case: v2 *replaced* v1's design rather than sitting beside it).

1. **Reopen.** Bump Status COMPLETE → DRAFT. The spec is being revised, so the node re-enters at the spec gate, not the implementation gate. Commit the transition.
2. **Supersede the spec.** Revise Requirements / Design / Decisions to the new combined set. Keep the prior cycle's audit tables for provenance; add a **Supersede (YYYY-MM-DD): v1 → v2** note stating what v2 adds and *why it could not be a sibling* (that justification is the test for choosing V over N).
3. **Re-run the full forward flow from stage 1** (or stage 2 if you trust the re-spec cold). The whole node re-verifies against the combined spec — v1's requirements are **not** grandfathered out. A v2 verification covers everything the node now claims. Final Status: COMPLETE (v2, YYYY-MM-DD).

### Route N — extend, separable scope (new node)

The new scope is separable. This is not a reopen at all.

1. Leave the COMPLETE node untouched.
2. Author a sibling (`<id>.md` beside it) or child (`<id>/NN-<slug>.md`, if it decomposes the parent) with a declared dependency on the original. Run the normal forward flow from stage 1.

Prefer this whenever the scope *can* be separated. A new node keeps each VERIFY scoped to exactly one declared requirement set — the property version-bumps erode. Route V is the exception reserved for scope that genuinely cannot be carved off.

### Decision rule

**Finish → F. Extend that can be a separate node → N. Extend that cannot → V.** When torn between V and N, choose N — a sibling node is cheaper to reason about than a node whose verification spans two requirement sets.

---

## Patterns to lean on

- **Lifecycle states are real, not decorative.** Every state in PRD §6.2 is set explicitly in the spec's Status header as work progresses. DRAFT → SPEC_REVIEW → APPROVED → IN_PROGRESS → VERIFY → COMPLETE is six explicit transitions, not "skip to APPROVED when you feel good." Other agents (and future-you reading old commits) rely on the state being accurate at any point in the log.

- **Every status transition is a commit.** Each entry into DRAFT, SPEC_REVIEW, APPROVED, IN_PROGRESS, VERIFY, COMPLETE, or ISSUE_OPEN lands as its own commit in the spec doc (and the parent's children manifest row, when relevant). This gives the git log a complete audit trail of the node's lifecycle that future readers can bisect or reconstruct without parsing the doc body. Stages whose only output is a transition (stages 2, 4a, 8b) commit just the status bump; stages that bundle a transition with substantive work (stages 1, 3, 4c, 7, 9) commit the transition together with that work. Stages with no transition (5 rebase, 6 review, 8 operator verification, 11 cleanup) do not require a commit. Commits are cheap; the audit trail is durable.

- **Reviewer in clean context** (stages 2 and 6). Both reviews run in a sub-agent's fresh window. This is the self-audit mitigation from PRD §11. The same context that wrote the artifact cannot reliably check it. Clean context supplies the *who* (independence); the per-requirement **sign-off matrix** (`.ledger/process/verification-signoff.md`) supplies the *rigor* (every requirement confronted individually, with evidence — a PASS without concrete evidence is recorded as FAIL). Both halves together are the mitigation; either alone rubber-stamps. The *spec* review (stage 2) may be skipped on a small, trusted spec — the operator's call. The *implementation* review (stage 6) is non-negotiable; no shortcut applies.

- **Rebase before review** (stage 5). Eliminates the branch-divergence "deletion" artifact and surfaces merge conflicts early. Reviewer sees a clean diff; the merge in stage 10 is mechanical.

- **Audit tables as durable provenance.** Spec reviews land in a "Spec Review (YYYY-MM-DD)" section between Open Issues and Implementation Notes. Implementation reviews land in an "Implementation Review (YYYY-MM-DD)" subsection of Implementation Notes. Both stay in the doc forever — future implementing agents on related nodes will read them.

- **Apply-easy, punt-substantive, discuss-leftovers.** When a review returns N findings, apply the mechanical ones, record the full audit, surface anything needing operator judgment back to the conversation before continuing.

- **Worktree-per-implementation.** Every implementing agent runs in its own worktree. Worktrees can run in parallel (operator dispatches multiple at once for independent nodes), can outlive a single conversation, and isolate failed attempts from main.

- **Promotion bundles doc-and-code.** Status header, parent manifest row, sample-tree pictures, top-level summaries — all change together in one commit. Stage 3 (DRAFT→APPROVED) and stage 10 (merge + cross-doc sync) both bundle the ripple-effect edits with the primary state change. Drift in any of them is a smell.

- **Operator sign-off is the COMPLETE gate.** Not the reviewer agent. Not the typecheck. The human walks the acceptance check in the browser. Stage 8b is the explicit answer for "what if the human says no."

- **Finish ≠ extend on a reopen.** A COMPLETE node that needs more work is two operations wearing one phrase. Closing deferred-but-specced requirements (Route F) needs no spec gate; adding never-specced scope needs one — either a sibling node (Route N, preferred) or a re-spec'd version bump (Route V). Never let new requirements ride to COMPLETE under the prior cycle's verification. See **Reopen mode**.

---

## Known limitations

- **Parallel-worktree shared-file conflicts.** When two worktrees touch the same file (`app/src/lib/types.ts` is the obvious shared surface as panel-specific types arrive), there is no automated coordination. Stage 5's rebase surfaces the conflict, but resolving it is manual operator work and the second-to-merge worktree may need to rebase against changes it didn't anticipate. Today's mitigation: when dispatching parallel implementers, pick nodes whose data contracts don't overlap. The eventual fix is PRD §6.3's resource-claim model — the task DAG refuses to schedule conflicting writes. Tracked as an open issue in PRD §11.

- **Worktree staleness during long runs.** A worktree dispatched against main HEAD at time T can drift if main advances substantially before the implementer finishes. Stage 5's rebase pulls it back into alignment, but if main has changed the very file the implementer rewrote, the rebase can be substantial. Today: keep dispatches scoped tight so they finish in minutes, not hours.

- **Subagent turn budget vs. long-running gating probes.** A dispatched implementer's background jobs die when its own turn ends — there is no "detached" background process that outlives the subagent, unlike the operator's main session, which survives a background job and gets re-invoked on completion. Nodes whose acceptance criterion is a long simulation/benchmark can stall (verdict never lands) or force-close mid-implementation if the probe is run inside the implementer's turn. Mitigation: the stage-1 compute-heavy gating checkpoint and stage 4b's compute-heavy exception split the work — implementer wires the probe, operator runs it. Do not fix this by shrinking the probe to fit the budget.

---

## What changes when the framework is built

Most of this is hand-driven today because the orchestration substrate (PRD §7) does not exist yet. When it does:

- Stage 2 (spec review) becomes a `spec_review` task that the task runner dispatches; SPEC_REVIEW state becomes meaningful to other queued tasks.
- Stage 4 (implementation) becomes an `implement` task with declared resource claims on the node's doc + relevant source files. Resource claims address the multi-worktree shared-file gap.
- Stage 5 (rebase) becomes implicit — the task runner schedules implementers against the current state, no drift.
- Stage 6 (implementation review) becomes a `verify` task — possibly with a separate reviewer-agent persona (MetaGPT-style role specialisation, see PRD §4.1).
- Stage 8 (operator manual verification) becomes a `human_review` task gate that pauses the runner and surfaces the diff for explicit approval. The E2E suite still runs headlessly as part of the gate; the human_review step covers the residual browser-only items.
- Stage 8b (ISSUE_OPEN loop-back) becomes an automatic task-runner transition: failed `human_review` enqueues a follow-up `implement` task with the operator's findings as input.
- Stage 10's cross-doc sync is partially automated by the health daemon's staleness checks (PRD §6.4).
- Stage 11 (worktree cleanup) becomes the task runner's normal lifecycle teardown.

The *shape* of the workflow — review-in-clean-context, audit-trail, isolated-implementation, rebase-before-review, merge-with-provenance — stays the same. The orchestration layer just removes the operator from the per-step driving.
