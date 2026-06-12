# Leaf-node Implementation Workflow

**Status:** LIVING (revise when the framework's automation reshapes the procedure)
**Last Updated:** 2026-05-23 (commit-per-transition rule added)

The standardised procedure for taking a leaf node (a node with no children) from PLANNED through COMPLETE under the current Phase-1 / pre-automation state of the framework. The orchestration substrate (PRD §7 — task runner, agent dispatcher, health daemon) will automate most of this when it lands. Until then, the operator drives it manually with LLM sub-agents.

Parent decomposition — writing the children manifest of a node that doesn't have one yet — is a different procedure and is not covered here.

---

## Lifecycle map

Per PRD §6.2:

```
DRAFT → SPEC_REVIEW → APPROVED → IN_PROGRESS → VERIFY → COMPLETE
                                                     ↓
                                                ISSUE_OPEN
                                                     ↓
                                            (back to APPROVED or DRAFT)
```

Every state in this diagram is set explicitly in the spec's Status header as the node progresses. The audit tables in the doc and the rows in the parent's children manifest mirror each transition. ISSUE_OPEN is entered when operator verification (stage 8) finds bugs; see stage 8b for the loop-back.

---

## Stages

### 1. DRAFT — author the spec

Create `docs/<path>/<id>.md` following the schema in PRD §6.1. Required sections in this order, matching sibling specs:

- **Front-matter:** Node ID, Parent, Status: DRAFT, Created, Last Updated, Dependencies.
- **Requirements** (with explicit out-of-scope bullets — the "what we are NOT doing in v1" list is as important as the "what we are").
- **Design** — data contract / new types, layout (ASCII wireframes where they help), components & files, interaction model, manual acceptance check.
- **Decisions** — numbered D1...Dn table, one row per choice, with rationale (the *why*, not the *what*).
- **Open Issues** — priority-tagged (HIGH / MEDIUM / LOW / TRIVIAL).
- **Implementation Notes** — empty: `*(none yet — pre-implementation)*`.
- **Verification** — what the verifier confirms before promoting to COMPLETE. For any node that introduces or changes UI panels or API endpoints, this section must name the E2E spec file(s) expected to cover the new surface and state what they assert. "Passes existing suite" is acceptable only if the node touches no new UI surface.
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
  - **4c. Exit commit (IN_PROGRESS → VERIFY).** Bump Status header IN_PROGRESS → VERIFY in spec + parent manifest, commit. This commit contains the code + Implementation Notes + status bump together — they all belong to the same "implementer finished" event.
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

---

## Known limitations

- **Parallel-worktree shared-file conflicts.** When two worktrees touch the same file (`app/src/lib/types.ts` is the obvious shared surface as panel-specific types arrive), there is no automated coordination. Stage 5's rebase surfaces the conflict, but resolving it is manual operator work and the second-to-merge worktree may need to rebase against changes it didn't anticipate. Today's mitigation: when dispatching parallel implementers, pick nodes whose data contracts don't overlap. The eventual fix is PRD §6.3's resource-claim model — the task DAG refuses to schedule conflicting writes. Tracked as an open issue in PRD §11.

- **Worktree staleness during long runs.** A worktree dispatched against main HEAD at time T can drift if main advances substantially before the implementer finishes. Stage 5's rebase pulls it back into alignment, but if main has changed the very file the implementer rewrote, the rebase can be substantial. Today: keep dispatches scoped tight so they finish in minutes, not hours.

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
