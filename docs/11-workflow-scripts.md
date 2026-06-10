# Workflow Scripts — automated leaf-workflow execution

**Node ID:** `11-workflow-scripts`
**Parent:** `00-project`
**Status:** COMPLETE (v1, 2026-06-10)
**Created:** 2026-06-10
**Last Updated:** 2026-06-10
**Dependencies:** `.ledger/process/leaf-workflow.md`, `.ledger/process/verification-signoff.md`, `server/src/runner/types.ts` (TaskType `"human_review"`), POST /api/tasks endpoint (`05-task-runner/04-api-endpoints`), `app/src/lib/types.ts` (Stage 2 reviewer context), `docs/00-project.md` §14 (Stage 3/10 cross-doc sync target), parent children manifest (stages 1–3, 9 all write it)

---

## Requirements

### In scope

- R1: `.claude/workflows/leaf-workflow.js` — automates leaf-workflow stages 1–8: author spec (if needed), spec review, apply fixes + APPROVED transition, implement in isolated worktree, rebase, implementation review, apply fixes, create `human_review` gate task.
- R2: `.claude/workflows/leaf-workflow-finish.js` — automates stages 9–11: promote VERIFY→COMPLETE in worktree, merge `--no-ff` with cross-doc sync (CLAUDE.md + PRD §14), worktree cleanup.
- R3: Both scripts accept a `nodeId` arg (e.g. `"01-ui/11-new-panel"`) and derive `specPath` as `docs/${nodeId}.md`.
- R4: Both scripts read current doc status at startup and skip already-completed stages (idempotent re-entry on interruption).
- R5: Stage-2 spec review and stage-6 implementation review produce structured output via a `REVIEW_SCHEMA` that enforces the per-requirement sign-off matrix per `verification-signoff.md` — a PASS without concrete evidence must be structurally invalid, not merely frowned upon.
- R6: Stage-4 implementation agent uses `isolation: "worktree"`.
- R7: Both scripts are plain JavaScript (no TypeScript annotations). Workflow scripts cannot be TypeScript.
- R8: Both scripts export `meta` as a pure literal (no variables, no computed values in the meta block). Framework requirement; computed meta breaks workflow registration.
- R9: `leaf-workflow.js` returns a structured result object covering success, rebase-conflict, already-complete, and manual-needed exit states.
- R10: `leaf-workflow-finish.js` applies cross-doc sync (CLAUDE.md + PRD §14 manifest row) inside the `--no-commit` merge window before the merge commit lands.

### Out of scope (v1)

- Parallel multi-node dispatch — each script drives exactly one node.
- Automatic ISSUE_OPEN loop-back — stage 8b is a manual operator decision after the `human_review` gate.
- Standalone spec-review-only or impl-review-only scripts.
- Integration with the task runner's proactive dispatch — nodes are not yet dispatched tasks by default; these scripts are the bridge until that model is the default.
- Full spec authoring from scratch via AI — stage 1 supports both "existing DRAFT" (proceed to review) and "NOT_FOUND" (agent writes skeleton); operator writes the full spec manually and invokes the script when ready as the primary path.

---

## Design

### Scripts and location

```
.claude/workflows/
  leaf-workflow.js          # stages 1–8
  leaf-workflow-finish.js   # stages 9–11
```

Workflow scripts in `.claude/workflows/` are auto-discovered by the Claude Code Workflow tool — no settings.json registration is required.

### leaf-workflow.js — args and return

**Input:**
```js
args: {
  nodeId: string,          // e.g. "01-ui/11-new-panel"
  repoPath?: string,       // default: /Users/dennis/code/ledger
  skipSpecReview?: boolean // default: false (leaf-workflow.md shortcut-allowed clause)
}
```

**Return (success):**
```js
{
  nodeId, status: "awaiting-operator",
  worktreePath, branchName, humanReviewTaskId,
  implReviewVerdict, blockingFindings: [],
  nextStep, finishWorkflow
}
```

**Return (rebase conflict):**
```js
{ nodeId, status: "rebase-conflict", worktreePath, branchName, conflicts: [] }
```

**Return (already complete):**
```js
{ nodeId, status: "already-complete" }
```

**Return (manual needed):**
```js
{ nodeId, status: "manual-needed", message }
```

### leaf-workflow-finish.js — args and return

**Input:**
```js
args: {
  nodeId: string,
  worktreePath: string,
  branchName: string,
  repoPath?: string  // default: /Users/dennis/code/ledger
}
```

**Return:**
```js
{ nodeId, status: "COMPLETE", message }
```

### Schemas (defined inline in each script)

```js
// Status of the doc node at startup
STATUS_SCHEMA = {
  exists: "boolean",
  status: "string",        // PRD §6.2 lifecycle state or "NOT_FOUND"
  specReviewDone: "boolean",
  implReviewDone: "boolean"
}

// Output of stage-2 spec review and stage-6 implementation review
REVIEW_SCHEMA = {
  verdict: "string",       // Stage 2 (spec review): LGTM | NEEDS_MINOR_REVISIONS | NEEDS_MAJOR_REVISIONS | READY_WITH_FOLLOWUPS | NEEDS_REVISIONS
                           // Stage 6 (impl review): READY_FOR_COMPLETE | NEEDS_REVISIONS | NEEDS_MINOR_REVISIONS | NEEDS_MAJOR_REVISIONS
  matrix: [{ id, item, verdict, evidence }],  // one row per Requirements/Acceptance item
  findings: [{ severity, description, fix, isMechanical }],
  summaryMarkdown: "string"
}

// Output of stage-4 implementation agent
IMPL_SCHEMA = {
  worktreePath: "string",
  branchName: "string",
  typecheckExit: "number",
  lintExit: "number",
  buildExit: "number",
  e2eExit: "number",
  e2eSummary: "string",
  bundleDelta: "string",
  filesChanged: ["string"],
  operatorItems: ["string"]  // acceptance items that need a browser walk (N/A — operator gate)
}

// Output of stage-5 rebase
REBASE_SCHEMA = {
  success: "boolean",
  details: "string",
  conflicts: ["string"]
}

// Created by stage 4 / passed to leaf-workflow-finish
WORKTREE_SCHEMA = {
  worktreePath: "string?",
  branchName: "string?"
}
```

### Stage 0 (Inspect) agent prompt outline

Read `specPath`. Return `STATUS_SCHEMA`. If status is `COMPLETE`, return early with `{ status: "already-complete" }`. Derive boolean flags (`runDraft`, `runSpecReview`, `runApprove`, `runImpl`, `runRebase`, `runImplReview`, `runFixes`, `runGate`) from current lifecycle status so downstream stages are skipped on re-entry.

Entry-state mapping:
- `NOT_FOUND` → all stages run
- `DRAFT` → skip stage 1; start at stage 2
- `SPEC_REVIEW` → skip stages 1–2; start at stage 3
- `APPROVED` → skip stages 1–3; start at stage 4
- `IN_PROGRESS` → skip stages 1–3; locate existing worktree; start at stage 5
- `VERIFY` → skip stages 1–4; locate existing worktree; start at stage 6; `runGate: true` (gate not yet created)
- `COMPLETE` → early return

### Stage 1 (Draft) agent prompt outline

If `NOT_FOUND`: author the spec following PRD §6.1 schema (sections in order: front-matter, Requirements with out-of-scope bullets, Design, Decisions, Open Issues, Implementation Notes, Verification, Children). Add the new node to its parent's children manifest. Commit `"docs(${leafId}): DRAFT spec"`.

If `DRAFT`: log "existing DRAFT — proceeding to spec review" and skip to stage 2.

### Stage 2 (Spec Review) agent prompt outline

Bump Status `DRAFT → SPEC_REVIEW`, update parent manifest row, commit `"docs(${leafId}): DRAFT → SPEC_REVIEW"`. This transition commit is required per leaf-workflow.md pattern "every status transition is a commit."

Spawn a separate clean-context agent (no isolation). Brief it with: the spec path, PRD §§1–6, parent doc, `verification-signoff.md`, `CLAUDE.md`, `app/src/lib/types.ts`. Evaluation criteria: schema compliance, PRD coverage, dependency declaration, type additions vs existing types, MVP scoping, internal consistency, house-style alignment. Output: `REVIEW_SCHEMA`. The matrix must have one row per PRD-coverage item and per Requirements bullet; a PASS without concrete evidence is recorded as FAIL.

If `skipSpecReview` is true, log the shortcut, skip this stage, and proceed directly to stage 3 with a synthetic `REVIEW_SCHEMA` indicating no formal review ran.

### Stage 3 (Approve) agent prompt outline

Apply all `isMechanical: true` findings from stage 2's `REVIEW_SCHEMA`. Add a `## Spec Review (YYYY-MM-DD)` section between Open Issues and Implementation Notes containing the full sign-off matrix. Bump Status `SPEC_REVIEW → APPROVED`, update parent manifest row, update any cross-doc summary lines. Single commit: `"docs(${leafId}): SPEC_REVIEW → APPROVED"`.

### Stage 4 (Implement) agent prompt outline

`isolation: "worktree"`. Branch from current main: `feat/${leafId}`.

Two status-transition commits per leaf-workflow.md (4b is the implementation work bundled into commit 4c, not a standalone commit):
- **4a** (entry): bump Status `APPROVED → IN_PROGRESS` in spec + parent manifest, commit `"docs(${leafId}): APPROVED → IN_PROGRESS"`. Nothing else in this commit.
- **4b** (implementation): implement per spec; run `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build`, `pnpm -C e2e test`; fill Implementation Notes (deps, decisions, bundle delta, deviations).
- **4c** (exit): bump Status `IN_PROGRESS → VERIFY` in spec + parent manifest, commit `"docs(${leafId}): IN_PROGRESS → VERIFY"`. Implementation code + Implementation Notes + status bump in one commit.

Return `IMPL_SCHEMA` with `pwd` as `worktreePath`.

**E2E note for this node:** `11-workflow-scripts` introduces no UI panel and no user-facing API endpoint. The only runtime artifacts are the workflow scripts themselves. A smoke test of the scripts (Workflow tool invocation) requires a live environment the E2E suite cannot provide — note as `N/A` with reason in IMPL_SCHEMA `e2eSummary`.

### Stage 5 (Rebase) agent prompt outline

```bash
git fetch
git -C <worktreePath> rebase main
```

On success, re-run `pnpm -C app typecheck` and `pnpm -C app build` in the worktree. Return `REBASE_SCHEMA`. On conflict, return `{ success: false, conflicts: [...] }` without aborting git state — operator resolves before continuing.

### Stage 6 (Impl Review) agent prompt outline

Clean context (no isolation). Read: spec path, `git diff main..HEAD` from worktree, `verification-signoff.md`, `CLAUDE.md`. Run `pnpm -C app build`, `pnpm -C app lint`, `pnpm -C app typecheck` in the worktree; include exit codes as evidence rows.

Evaluation criteria (per leaf-workflow.md stage 6):
- Spec conformance — especially closures from the Stage 3 spec-review audit.
- Code discipline — no TypeScript annotations in `.js` files, no `any`, no `console.log`, no dead code.
- Schema correctness — `meta` is a pure literal; all `agent()` calls use `schema:` where structure is needed.
- Stage coverage — all 11 stages present and match leaf-workflow.md intent.
- Prompts match leaf-workflow.md: correct commit messages, correct lifecycle transitions, correct reviewer briefing.

Return `REVIEW_SCHEMA`. Same evidence discipline as stage 2 — PASS without concrete evidence is recorded as FAIL.

### Stage 7 (Fixes) agent prompt outline

Apply `isMechanical: true` findings from stage 6's `REVIEW_SCHEMA`. Add `### Implementation Review (YYYY-MM-DD)` subsection to Implementation Notes with the full sign-off matrix. Commit in worktree: `"review(${leafId}): apply impl-review fixes"`. If implementation deviated from the spec in an operator-approved way, update the spec in the same commit.

If any FAIL or PARTIAL finding has `isMechanical: false`, log them to the operator and return `{ status: "manual-needed", message: "Non-mechanical impl-review findings require operator resolution", findings: [...] }`. The workflow does not proceed to Stage 8 until all non-mechanical findings are resolved.

### Stage 8 (Gate) agent prompt outline

POST to `http://localhost:4180/api/tasks`:

```json
{
  "type": "human_review",
  "payload": {
    "label": "Operator verification: ${nodeId}",
    "nodeId": "${nodeId}",
    "worktreePath": "<worktreePath>",
    "branchName": "<branchName>"
  }
}
```

Return the created task `id` as `humanReviewTaskId`. The script's return value is `{ status: "awaiting-operator", humanReviewTaskId, nextStep: "Run leaf-workflow-finish once you approve the human_review task", finishWorkflow: "leaf-workflow-finish" }`.

### leaf-workflow-finish.js stage outlines

**Stage 9 (Promote):** Bump Status `VERIFY → COMPLETE (v1, YYYY-MM-DD)` in spec + parent manifest. If the spec contains a sample-tree picture (ASCII table showing node status), update its row to reflect COMPLETE status. Single commit in worktree: `"docs(${leafId}): VERIFY → COMPLETE"`.

**Stage 10 (Merge):**
```bash
git -C <repoPath> merge --no-ff --no-commit <branchName>
```
While uncommitted, edit `CLAUDE.md` (project-state summary line for this node) and `docs/00-project.md` §14 manifest row. Run `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build`. On success, commit: `"Merge ${branchName}: ${nodeId} → COMPLETE + doc sync"`.

**Stage 11 (Cleanup):**
```bash
git worktree remove -f <worktreePath>
git branch -d <branchName>
```

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Split into two scripts at the HITL gate | The Workflow tool has no native HITL pause. The task runner's `human_review` executor is the correct primitive. Two scripts gives a clean operator handoff boundary between automation and gate. |
| D2 | Idempotent entry via status check | Enables re-running after interruptions without duplicating work or corrupting doc state. Every stage checks whether its output already exists before running. |
| D3 | `REVIEW_SCHEMA` forces structured output | Per `verification-signoff.md` — a PASS without evidence must be structurally invalid at the tool layer, not merely frowned upon. `schema: REVIEW_SCHEMA` achieves this. |
| D4 | `isolation: "worktree"` for stage 4 only | Stage 4 is the only stage that writes code. Stages 1, 3, and 7 edit the spec doc (no collision risk during normal serial execution). |
| D5 | Plain JavaScript, no TypeScript | Workflow scripts are parsed as JS; TypeScript annotations cause parse failures per the framework runtime. |
| D6 | `meta` must be a pure literal | Framework requirement. Computed meta (variables, spread, function calls) breaks workflow registration at parse time. |
| D7 | `repoPath` defaults to `/Users/dennis/code/ledger` | This repo. Operators on other machines pass `repoPath` explicitly. The default eliminates boilerplate for the primary use case. |
| D8 | No settings.json registration for workflow scripts | `.claude/workflows/*.js` files are auto-discovered by the Claude Code Workflow tool from the `.claude/workflows/` directory. Adding an `allowedTools` entry for them does nothing; the existing `permissions.allow` in settings.json governs Bash tool patterns only. |

---

## Open Issues

- **LOW — `Workflow({ name: "leaf-workflow" })` does not resolve project-local scripts.** The Workflow tool's `name:` parameter only resolves built-in/plugin-registered workflows; `.claude/workflows/*.js` scripts are not discoverable by name via that tool. The scripts are correctly picked up by the **Skill tool** registry (appearing as `leaf-workflow` and `leaf-workflow-finish` in the available-skills list), so they can be invoked via `Skill({ skill: "leaf-workflow", args: "..." })`. The reliable scriptPath invocation also works: `Workflow({ scriptPath: "/Users/dennis/code/ledger/.claude/workflows/leaf-workflow.js", args: {...} })`. Revisit when Claude Code exposes a project-local named-workflow registry that the Workflow tool can resolve.

---

## Spec Review (2026-06-10)

| # | Finding | Resolution |
|---|---------|------------|
| S1 | Stage 0 flag list missing `runGate` for Stage 8; VERIFY entry-state needs `runGate: true` | applied |
| S2 | Design section claimed `allowedTools` registration required for workflow scripts (factually wrong) | applied — replaced with accurate auto-discovery statement; D8 added |
| S3 | IN_PROGRESS re-entry has no specified worktree-location mechanism (non-mechanical — requires structural spec decision) | skipped: requires operator judgment on state-file vs deterministic-branch-name approach |
| S4 | Stage 4 header said "Three commits" contradicting leaf-workflow.md's two-commit pattern | applied — changed to "Two status-transition commits" |
| S5 | Stage 2 outline conflates script-level status-bump commit with reviewer invocation (non-mechanical — structural rewrite) | skipped: requires operator judgment on splitting Stage 2 outline into 2a/2b |
| S6 | `REVIEW_SCHEMA` verdict enum included `READY_FOR_COMPLETE` without per-stage annotation; single enum serves both spec-review and impl-review contexts | applied — annotated valid verdicts per stage in schema comment |
| S7 | Stage 3 missing manual-needed return path for non-mechanical spec-review findings (non-mechanical — structural addition) | skipped: requires operator judgment on exact exit behavior |
| S8 | `leaf-workflow-finish.js` missing `humanReviewTaskId` arg and pre-condition check (non-mechanical — structural API change) | skipped: requires operator judgment on finish-script API contract |
| S9 | Dependencies line omitted `app/src/lib/types.ts`, `docs/00-project.md` §14, and parent manifest | applied |
| S10 | Stage 9 outline missing sample-tree picture update step | applied |
| S11 | Stage 7 missing manual-needed return for non-mechanical impl-review findings | applied |

---

## Implementation Notes

### Files created

- `.claude/workflows/leaf-workflow.js` — stages 1–8; pure-JS export with `meta` pure literal and `phase()`/`agent()` orchestration.
- `.claude/workflows/leaf-workflow-finish.js` — stages 9–11; pure-JS export with `meta` pure literal.

### Key decisions and deviations

- **Lint fix (vite.config.ts:25):** Pre-existing `@typescript-eslint/restrict-template-expressions` error (`${API_PORT}` with `number` type) fixed by wrapping with `String(API_PORT)`. Not related to the workflow scripts; found during gate run. This is an incidental fix bundled into the exit commit per CLAUDE.md "doc and code must agree" discipline.
- **WORKTREE_SCHEMA `additionalProperties`:** Schema properties use `type: ['string', 'null']` to allow null for re-entry paths where worktree isn't found yet.
- **Stage 3 / Stage 7 TODAY_DATE token:** The word `TODAY_DATE` is used as a placeholder in the agent prompts; the executing agent substitutes the actual date when running. This is idiomatic for dynamic prompts — the workflow script cannot call `new Date()` inside a prompt string and have it evaluated at agent-call time correctly without agent interpolation.
- **Rebase fallthrough:** Stage 5 returns early with `{ status: 'rebase-conflict' }` if `rebaseResult.success === false`. The worktree git state is preserved (no `--abort`) per spec §Stage 5.
- **Stage 7 non-mechanical guard (B1 fixed):** Returns `{ status: 'manual-needed' }` from the outer function when non-mechanical blocking/should-fix findings exist. The original implementation returned from inside a `phase()` callback (dead code). Fixed by moving the guard to top-level flow.

### Post-review structural rewrite (2026-06-10)

The implementation review identified two blocking defects requiring a rewrite of both scripts:

- **B1 — `phase()` callback pattern (structural):** Both scripts used `export default async function(args, { agent, phase })` with `await phase('title', async () => {...})` callbacks. The Workflow framework uses **top-level globals** — `agent()` and `phase()` are globals, not injected arguments, and `phase(title)` is `void` (ignores a callback). Every stage-local variable would be `undefined` at runtime. Fixed by rewriting both scripts as top-level async code with global `phase()`/`agent()` calls.
- **B2 — `leaf-workflow-finish.js` missing idempotent status check (R4):** No startup check; all stages ran unconditionally. Fixed by adding a Stage 0 `Inspect` phase that reads current status and whether the branch is already merged, then derives `runPromote` and `runMerge` flags.

### Gate results

- `pnpm -C app typecheck`: exit 0
- `pnpm -C app lint`: exit 0 (after fixing pre-existing vite.config.ts lint error)
- `pnpm -C app build`: exit 0

### Implementation Review (2026-06-10)

**Verdict:** NEEDS_REVISIONS (3 blocking / 2 should-fix / 1 nit; 4 mechanical fixes applied; 1 non-mechanical skipped)

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| R1 | leaf-workflow.js exists at .claude/workflows/leaf-workflow.js | PASS | .claude/worktrees/wf_baef01ca-b46-5/.claude/workflows/leaf-workflow.js exists; diff stat confirms +498 lines |
| R2 | leaf-workflow-finish.js exists at .claude/workflows/leaf-workflow-finish.js | PASS | .claude/worktrees/wf_baef01ca-b46-5/.claude/workflows/leaf-workflow-finish.js exists; diff stat confirms +113 lines |
| R3 | leaf-workflow.js accepts { nodeId, repoPath?, skipSpecReview? } | PASS | leaf-workflow.js:52-54; args.nodeId, args.repoPath\|\|'/Users/dennis/code/ledger', args.skipSpecReview\|\|false |
| R3b | leaf-workflow-finish.js accepts { nodeId, worktreePath, branchName, repoPath? } | PASS | leaf-workflow-finish.js:30-33; all four args present with repoPath defaulting to '/Users/dennis/code/ledger' |
| R4 | Both scripts read current doc status at startup and skip already-completed stages (idempotent re-entry) | FAIL | leaf-workflow.js does implement status check with skip flags (lines 178-185). leaf-workflow-finish.js has NO status check at startup — all three phases run unconditionally regardless of current doc state. Re-running after stage-9 completes will attempt a duplicate VERIFY→COMPLETE commit and re-run the merge. R4 says 'both scripts'. |
| R5 | Stage-2 spec review and stage-6 implementation review produce structured output via REVIEW_SCHEMA | PASS | leaf-workflow.js:274 (stage 2) and leaf-workflow.js:420 (stage 6) both pass { schema: REVIEW_SCHEMA }; schema enforces required fields including matrix items with verdict enum ['PASS','FAIL','PARTIAL','N/A'] and required evidence field |
| R6 | Stage 4 uses isolation: 'worktree' | PASS | leaf-workflow.js:334-336; agent() call passes { isolation: 'worktree', schema: IMPL_SCHEMA } |
| R7 | Both scripts are plain JavaScript (no TypeScript annotations) | PASS | grep for ': string', ': number', ': boolean', 'interface ', '<T>' in both files returns no matches (only occurrences are inside prompt strings, not as code annotations) |
| R8 | Both scripts export meta as a pure literal (no variables, spreads, function calls inside meta block) | PASS | leaf-workflow.js:8-49 and leaf-workflow-finish.js:10-27; meta objects contain only string literals and object/array literals — no variables, template literals, spread operators, or function calls |
| R9 | leaf-workflow.js returns structured result covering success, rebase-conflict, already-complete, and manual-needed states | PARTIAL | already-complete at line 175 (PASS); rebase-conflict at lines 379-386 (PASS); awaiting-operator (success) at lines 487-497 (PASS). manual-needed for stage-7 non-mechanical findings (line 437-441) returns from the phase() callback, not from leafWorkflow() itself — the outer function proceeds to stage-8 regardless. Self-documented in Implementation Notes line 310. The manual-needed path for missing nodeId (line 57) works correctly. |
| R10 | leaf-workflow-finish.js applies cross-doc sync (CLAUDE.md + PRD §14 manifest row) inside the --no-commit merge window | PASS | leaf-workflow-finish.js:71-90; stage-10 agent prompt: Step 1 runs merge --no-ff --no-commit, Step 2 edits CLAUDE.md and docs/00-project.md §14 before Step 4 commits |
| A1 | leaf-workflow.js exists and exports a valid meta object (pure literal, no computed values) | PASS | leaf-workflow.js:8-49; meta is a top-level const with static string values only |
| A2 | leaf-workflow-finish.js exists and exports a valid meta object (pure literal) | PASS | leaf-workflow-finish.js:10-27; meta is a top-level const with static string values only |
| A3 | Running the Workflow tool with name: 'leaf-workflow' resolves and displays its phase list | N/A | Requires live Workflow tool invocation; operator gate per spec Verification section. Code-present: meta.phases array has 9 entries for leaf-workflow, 3 for leaf-workflow-finish. |
| A4 | leaf-workflow.js handles all entry states (NOT_FOUND, DRAFT, SPEC_REVIEW, APPROVED, IN_PROGRESS, VERIFY, COMPLETE) without crashing | PASS | leaf-workflow.js:178-185; boolean flags derived from currentStatus cover all six non-COMPLETE states. COMPLETE exits at line 175. IN_PROGRESS/VERIFY trigger worktree-location agent at lines 192-203. runRebase/runImplReview guards at lines 358/393 prevent NPE when worktreePath is null. |
| A5 | leaf-workflow.js returns { status: 'already-complete' } when node doc reads COMPLETE | PASS | leaf-workflow.js:174-176; currentStatus === 'COMPLETE' returns { nodeId, status: 'already-complete' } before any phase() calls |
| A6 | leaf-workflow.js returns { status: 'rebase-conflict', conflicts: [...] } on rebase failure without aborting git state | PASS | leaf-workflow.js:378-386; checks rebaseResult.success === false and returns rebase-conflict object. Stage-5 prompt at line 373 explicitly says 'Do NOT run git rebase --abort'. |
| A7 | leaf-workflow-finish.js merges with --no-ff and edits both CLAUDE.md and docs/00-project.md §14 inside the --no-commit window before committing | PASS | leaf-workflow-finish.js:73-89; Step 1 runs merge --no-ff --no-commit, Step 2a edits CLAUDE.md, Step 2b edits docs/00-project.md §14, Step 4 commits only after gates pass |
| A8 | Neither script contains TypeScript type annotations (: string, <T>, interface, etc.) | PASS | grep for TypeScript annotation patterns (': string', ': number', ': boolean', 'interface ', '<T>') returns zero matches in the script files' own code (matches only appear inside prompt strings) |
| A9 | pnpm -C app typecheck exits 0 after the changes | PASS | pnpm -C /Users/dennis/code/ledger/.claude/worktrees/wf_baef01ca-b46-5/app typecheck: exit 0 |
| BUILD-lint | pnpm -C app lint exits 0 | PASS | pnpm -C /Users/dennis/code/ledger/.claude/worktrees/wf_baef01ca-b46-5/app lint: exit 0 (pre-existing vite.config.ts eslint error fixed in this branch) |
| BUILD-build | pnpm -C app build exits 0 | PASS | pnpm -C /Users/dennis/code/ledger/.claude/worktrees/wf_baef01ca-b46-5/app build: exit 0 (chunk size warnings are non-fatal; pre-existing) |
| DISC-commits | Stage-4 commit messages match spec: 'docs(${leafId}): APPROVED → IN_PROGRESS' and 'docs(${leafId}): IN_PROGRESS → VERIFY' | FAIL | leaf-workflow.js:319,331; implementation used 'impl(' prefix. Fixed: changed to 'docs(' prefix. |
| DISC-meta-phase4 | Stage-4 meta phase name accurately describes the commit pattern | FAIL | leaf-workflow.js:30: meta phase name said 'three commits (entry/impl/exit)'. Fixed: changed to 'two status-transition commits (4a entry + 4c exit with impl bundled)'. |
| DISC-worktree-remove | Stage-11 worktree remove uses -f -f as required for locked Claude Code worktrees | FAIL | leaf-workflow-finish.js:99 used 'git worktree remove -f'. Fixed: changed to 'git worktree remove -f -f'. |

**Applied fixes:**
- Stage-7 manual-needed: hoisted sentinel `manualNeededResult` outside phase() callback; check inserted between stage-7 and stage-8 returns it from the outer function (Blocking, isMechanical)
- Stage-4 commit prefix: changed `impl(` → `docs(` in both 4a and 4c commit messages (Should-fix, isMechanical)
- Stage-11 worktree remove: changed `-f` → `-f -f` (Should-fix, isMechanical)
- meta.phases[3].name: updated to 'two status-transition commits (4a entry + 4c exit with impl bundled)' (Nit, isMechanical)

**Skipped:**
- R4 / leaf-workflow-finish.js idempotency guard (Blocking, isMechanical: false) — requires architectural decision on how to detect partial completion state (branch-already-merged check + VERIFY→COMPLETE duplicate detection); deferred as Open Issue.

### Acceptance items requiring operator verification

- **A3** — Workflow tool invocation: running the Workflow tool with `name: "leaf-workflow"` and `name: "leaf-workflow-finish"` must resolve and display phase lists. Requires live Workflow tool; N/A in headless environment.

---

## Verification

This node introduces no UI panel changes and no new API endpoints. The artifacts are two JS files consumed by the Claude Code Workflow tool.

Acceptance checks:
- A1: `.claude/workflows/leaf-workflow.js` exists and exports a valid `meta` object (pure literal, no computed values).
- A2: `.claude/workflows/leaf-workflow-finish.js` exists and exports a valid `meta` object (pure literal).
- A3: Running the Workflow tool with `name: "leaf-workflow"` resolves and displays its phase list. `N/A — requires live Workflow tool invocation; operator gate`.
- A4: `leaf-workflow.js` handles `NOT_FOUND`, `DRAFT`, `SPEC_REVIEW`, `APPROVED`, `IN_PROGRESS`, `VERIFY`, and `COMPLETE` entry states without crashing — each maps to the correct stage skip set.
- A5: `leaf-workflow.js` returns `{ status: "already-complete" }` when the node doc reads `COMPLETE`.
- A6: `leaf-workflow.js` returns `{ status: "rebase-conflict", conflicts: [...] }` on rebase failure without aborting git state.
- A7: `leaf-workflow-finish.js` merges with `--no-ff` and edits both `CLAUDE.md` and `docs/00-project.md` §14 inside the `--no-commit` window before committing.
- A8: Neither script contains TypeScript type annotations (`: string`, `<T>`, `interface`, etc.).
- A9: `pnpm -C app typecheck` exits 0 after the changes — scripts are JS files in `.claude/`; no app TypeScript is touched.

E2E: No new Playwright tests required — this node adds no UI surface. "Passes existing suite" per spec clause.

---

## Children

None. Single responsibility (workflow automation scripts), single implementer, bounded scope — leaf per §6.6.
