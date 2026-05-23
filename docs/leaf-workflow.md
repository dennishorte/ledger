# Leaf-node Implementation Workflow

**Status:** LIVING (revise when the framework's automation reshapes the procedure)
**Last Updated:** 2026-05-22

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

The stages below traverse this state machine.

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
- **Verification** — what the verifier confirms before promoting to COMPLETE.
- **Children** — None, unless decomposing further.

Tone: opinionated, terse, decision-explicit. Match the depth of `01-ui/02-dag.md` (the gold standard) and `01-ui/06-health.md` (a recent thorough DRAFT).

Add the new node to its parent's children manifest in the same commit.

### 2. Spec review — dispatch a reviewer in clean context

Spawn a Sonnet sub-agent (general-purpose, no isolation needed — read-only) and brief it:

- Pointer to the spec doc.
- Required reading: relevant PRD sections, parent doc, sibling specs as house-style benchmarks, existing types in `app/src/lib/types.ts`.
- Evaluation criteria: schema compliance, PRD coverage, dependency declaration, type additions vs existing types, MVP scoping, internal consistency, house-style alignment.
- Output shape: structured review with **Verdict** (`READY_FOR_APPROVAL` / `NEEDS_MINOR_REVISIONS` / `NEEDS_MAJOR_REVISIONS`), coverage matrix per the relevant PRD section, findings grouped by severity (Blocking / Should-fix / Nit) with concrete suggested fixes.

The reviewer runs in clean context so it can give independent judgment. This is the framework's mitigation for the self-audit problem (PRD §11). The agent that wrote the spec cannot reliably check its own work.

**Shortcut allowed:** if the spec is small, well-established, and you (the operator) trust it cold, you can skip this stage and go straight to step 4. The implementation review (step 6) is the mandatory gate, not the spec review.

### 3. Apply easy fixes; record the audit

Apply every Should-fix and Nit that is a mechanical text change. Punt anything requiring structural rewrites or substantive judgment back to the conversation for the operator's call. Add a **Spec Review (YYYY-MM-DD)** section between Open Issues and Implementation Notes with an audit table:

```markdown
| # | Finding | Resolution |
|---|---------|------------|
| S1 | ... | ... |
```

The audit table stays in the doc as durable provenance — the implementing agent in step 5 will read it to know what was already decided.

### 4. DRAFT → APPROVED

The review pass replaces the formal SPEC_REVIEW lifecycle stop. Bump the spec's Status header DRAFT → APPROVED. Update the parent's children manifest row. Update cross-doc summary lines that reference the prior state (CLAUDE.md round-2 line, PRD §14 parent status note, sibling sample-tree pictures if any). Single commit.

### 5. APPROVED → IN_PROGRESS → VERIFY (implementer in isolated worktree)

Spawn a Sonnet sub-agent with `isolation: "worktree"`. Brief it with:

- Pointer to the spec doc as source of truth.
- Specific callouts from the Spec Review audit table. Those are the highest-leverage details that the implementer would otherwise risk missing.
- Required context: spec docs of any dependencies, parent doc, CLAUDE.md, the actual source files it will touch.
- Process steps: implement → run `pnpm typecheck` / `lint` / `build` → fill Implementation Notes (deps + decisions + bundle delta + any deviations) → bump status to VERIFY in the spec + parent manifest → commit in the worktree.
- Reporting: bundle delta vs a named baseline, files changed, acceptance-check items the agent could not verify in its headless environment.

Why worktree isolation:

- Prevents conflicts when work happens in parallel with other agents or with main-branch changes.
- Gives the agent a clean directory to write tests, fixtures, and intermediate files without polluting main.
- Lets the operator inspect via `git diff main..HEAD` before merging. A merge artifact that looks like "main-only files were deleted" is usually a branch-divergence artifact — the actual merge preserves them.

### 6. Implementation review — reviewer against the worktree diff

Same pattern as step 2, but against the implementation. Sonnet sub-agent, clean context, pointed at the worktree branch. Evaluation criteria expand to include:

- **Spec conformance** — especially the Spec Review closures from step 3, since those were known risk areas.
- **Build/lint/typecheck** — run them; report exit codes and bundle numbers.
- **Code discipline** — no `any`, no suppressions (especially `eslint-disable-next-line ...`), no `console.log`, no dead code.
- **Bundle delta sanity** — compare to the named baseline from step 5.
- **Regression checks** for any shared infrastructure the node touched (e.g., DAG panel if shared types or parser logic changed).
- **Anything the implementer's report glossed over.**

### 7. Apply easy review fixes in the worktree; record the audit

Same pattern as step 3. The audit table goes inside Implementation Notes as a subsection titled **Implementation Review (YYYY-MM-DD)**. Two audit tables now exist in the spec: spec review and implementation review. Both stay for provenance.

If the implementation diverged from the spec in a way the operator approves, update the spec in the same commit. "Doc and code must agree" (CLAUDE.md) is honoured by updating whichever side drifted; silent divergence is not.

### 8. Operator manual verification

Start the worktree's dev server (the only place the work currently lives):

```bash
pnpm -C /path/to/worktree/app dev
```

Port 4179 is pinned with `strictPort: true` in `vite.config.ts`. If something else is already on 4179 (typically main's dev server from a different terminal), stop it first — `lsof -i :4179 -P -n` finds the PID; `kill <pid>` stops it.

Walk the spec's Acceptance check items in the browser. UI changes need human eyes — `typecheck` / `lint` / `build` verify *code correctness*, not *feature correctness*. The mandatory gate before COMPLETE is operator sign-off, not green checks.

### 9. VERIFY → COMPLETE in the worktree

Once verification passes, bump:

- Spec's Status header: VERIFY → COMPLETE (v1, YYYY-MM-DD).
- Parent manifest row: VERIFY → COMPLETE (v1).
- Spec's own sample-tree picture (if it has one): row → `[COMPLETE]`.

Single commit in the worktree.

### 10. Merge with `--no-ff`

```bash
git -C /path/to/main merge --no-ff --no-commit <worktree-branch>
```

The `--no-commit` lets you inspect the merge tree first. Expect conflicts only on lines both halves edited — typically the parent manifest row (main has APPROVED, worktree has VERIFY/COMPLETE; auto-merge resolves cleanly because the lifecycle progresses monotonically).

Run `pnpm typecheck` / `lint` / `build` on the merged tree before committing the merge. If they pass, finalise: `git -C /path/to/main commit -m "..."`.

`--no-ff` preserves the per-step provenance (implement → review → promote) as a merge bubble in the log. A squash flattens it; only do that if you explicitly want a linear history.

### 11. Post-merge doc sync

Cross-doc summary lines that referenced the node's prior state need updating:

- `CLAUDE.md` round-2 panels line (or equivalent project-state summary).
- `docs/00-project.md` §14's parent-node status note.
- Sibling sample-tree pictures that show this node's status.

One commit. Easy to overlook because the worktree doesn't touch these files (they're outside its concern) and the merge doesn't flag them as conflicts.

### 12. Worktree cleanup

Once merged:

- Kill any dev server still pointing at the worktree: `lsof -i :4179 -P -n` → `kill <pid>`.
- `git worktree remove -f -f <path>` (the second `-f` is needed because Claude-Code worktrees are locked while in use).
- `git branch -d <worktree-branch>` (lowercase `-d` refuses to delete if not fully merged — a safety net).

---

## Patterns to lean on

- **Reviewer in clean context** (steps 2 and 6). Both reviews run in a sub-agent's fresh window. This is the self-audit mitigation from PRD §11. The same context that wrote the artifact cannot reliably check it.

- **Audit tables as durable provenance.** Spec reviews land in a "Spec Review (YYYY-MM-DD)" section between Open Issues and Implementation Notes. Implementation reviews land in an "Implementation Review (YYYY-MM-DD)" subsection of Implementation Notes. Both stay in the doc forever — future implementing agents on related nodes will read them.

- **Apply-easy, punt-substantive, discuss-leftovers.** When a review returns N findings, apply the mechanical ones, record the full audit, surface anything needing operator judgment back to the conversation before continuing.

- **Worktree-per-implementation.** Every implementing agent runs in its own worktree. Worktrees can run in parallel (operator dispatches multiple at once for independent nodes), can outlive a single conversation, and isolate failed attempts from main.

- **Promotion bundles doc-and-code.** Status header, parent manifest row, sample-tree pictures, top-level summaries — all change together in one commit. Drift in any of them is a smell.

- **Operator sign-off is the COMPLETE gate.** Not the reviewer agent. Not the typecheck. The human walks the acceptance check in the browser.

---

## What changes when the framework is built

Most of this is hand-driven today because the orchestration substrate (PRD §7) does not exist yet. When it does:

- Step 2 (spec review) becomes a `spec_review` task that the task runner dispatches.
- Step 5 (implementation) becomes an `implement` task with declared resource claims on the node's doc + relevant source files.
- Step 6 (implementation review) becomes a `verify` task — possibly with a separate reviewer-agent persona (MetaGPT-style role specialisation, see PRD §4.1).
- Step 8 (operator manual verification) becomes a `human_review` task gate that pauses the runner and surfaces the diff for explicit approval.
- Step 11 (post-merge doc sync) is partially automated by the health daemon's staleness checks (PRD §6.4).
- Step 12 (worktree cleanup) becomes the task runner's normal lifecycle teardown.

The *shape* of the workflow — review-in-clean-context, audit-trail, isolated-implementation, merge-with-provenance — stays the same. The orchestration layer just removes the operator from the per-step driving.
