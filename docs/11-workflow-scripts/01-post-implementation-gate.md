# Post-Implementation Gate — optional operator pause after implementation

**Node ID:** `11-workflow-scripts/01-post-implementation-gate`
**Parent:** `11-workflow-scripts`
**Status:** VERIFY
**Created:** 2026-07-12
**Last Updated:** 2026-07-12
**Dependencies:** `.claude/workflows/leaf-workflow.js` (`11-workflow-scripts` R1, D1), `.ledger/process/leaf-workflow.md` (stages 4–5), `docs/_schemas/project-metadata.schema.json` (`workflow` block), `packages/parser/src/runner/types.ts` (`TaskType` `"human_review"`), POST `/api/tasks` (`05-task-runner/04-api-endpoints`), POST `/api/tasks/:id/reject` with OCC + rationale (`05-task-runner/03-hitl-gate`), `.claude/scripts/sync-process` (propagates the updated `leaf-workflow.md` to registered children)

---

## Requirements

### In scope

- R1: New optional `workflow.postImplementationGate` block in `.ledger/project.json`: `{ command: string, artifactPath?: string }`. `command` is templated with `{dir}` exactly like the existing `gates`/`e2eGate` fields. Absent by default — zero behavior change for any project that doesn't set it, including ledger itself.
- R2: `.claude/workflows/leaf-workflow.js` gains a new optional gate, **Post-Impl Gate**, inserted *inside* Stage 4 — after 4b (implementation) but **before** the 4c exit commit (`IN_PROGRESS → VERIFY`). It runs only when `workflow.postImplementationGate` is configured for the project. The 4c exit commit is deferred until the gate is approved — see D6.
- R3: The Post-Impl Gate runs `postImplementationGate.command` inside the implementation worktree, then POSTs a `human_review` task (same `TaskType` as the existing stage-8 gate — see D1) carrying `nodeId` via `resourceClaims` and `artifactPath`/`worktreePath`/`branchName`/`round`/`nextStep` via `reviewPayload.summary`/`reviewPayload.diffRef` (see Task payload note below — `task-input.schema.json` has no generic `input` field). `round` starts at 1 and increments each time the gate loops (R5b). The command is arbitrary — a rendered image, a generated report, a log dump, a diff summary — the gate itself has no opinion on content; it only pauses and surfaces a path.
- R4: After posting the task, the script returns early with a new result shape: `{ status: "awaiting-post-impl-approval", worktreePath, branchName, postImplReviewTaskId, artifactPath, round, nextStep, resumeCommand }`. Status in the spec doc stays `IN_PROGRESS` — the deferred 4c means the node never claims `VERIFY` on an artifact nobody has approved. It does not proceed further in the same invocation — per `11-workflow-scripts` D1, the Workflow tool has no native HITL pause, so the pause is implemented as an early return, not a blocking wait.
- R5: `leaf-workflow.js` accepts a new optional arg, `resumeAfterGate: boolean`, paired with `worktreePath`/`branchName`/`postImplReviewTaskId`/`round`. `round` must be passed back explicitly — it is not recoverable from the task itself (see Task payload note below). When true, the script queries `GET /api/tasks/:id` for `postImplReviewTaskId`'s current status and branches (see D2, D7):
  - **Approved** → perform the deferred 4c exit commit (`IN_PROGRESS → VERIFY`), then proceed to Stage 5 onward exactly as if no gate were configured.
  - **Rejected** → this is the reimplementation loop (R5b).
  - **Still pending** → return `{ status: "manual-needed", message: "postImplReviewTaskId <id> is not yet decided" }`.
- R5b: On a rejected gate task, the script reads the task's rejection rationale, dispatches a patch agent into the *same* worktree (no new branch, no isolation change — it's a continuation, not a fresh implementation) briefed with that rationale. The agent fixes the code and commits `fix(${leafId}): address post-impl gate feedback (round N)`, then the script re-runs `postImplementationGate.command`, posts a new `human_review` task for round N+1, and returns `awaiting-post-impl-approval` again. The operator re-invokes with the same `resumeAfterGate: true` shape regardless of whether they just approved or rejected — the script decides which branch to take from the task's actual verdict, not from an operator-supplied flag.
- R6: `docs/_schemas/project-metadata.schema.json` gains a `postImplementationGate` property under `workflow` (required `command`, optional `artifactPath`), following the existing `gates`/`e2eGate` validation pattern.
- R7: `.ledger/process/leaf-workflow.md` gains a documented optional section describing this gate and its position inside stage 4 (before 4c), including the reject-loop behavior, so doc and code agree per CLAUDE.md's "doc and code must agree" rule. `sync-process` must be run after landing this so worldgen's synced copy picks it up.
- R8: The feature is config-gated and off by default. This is the mechanism by which any single project (worldgen first) opts in without touching ledger's own `project.json` or any other registered child project's config.
- R9: This node's own stage-4/stage-8 acceptance checks (A2–A5) exercise the full gate → reject-loop → approve → resume path against a trivial fixture command (e.g. `echo`/write-a-dummy-file) configured in a scratch or test `project.json` — not against worldgen's real render output. The mechanism is content-agnostic by construction (D4), so nothing about implementing or verifying it depends on worldgen having a real command yet.

### Out of scope (v1)

- Multiple post-implementation gates or multiple artifacts per node — one command, one artifact path, one gate (though it may loop across several rounds — see R5b).
- A dedicated UI affordance for viewing the artifact inline in the Tasks panel — the operator opens the artifact file directly, same as today's stage-8 browser walk requires no new endpoint.
- Visual diffing between rounds (e.g. highlighting what changed between round N's artifact and round N+1's) — each round regenerates the artifact fresh; the operator compares by eye if they care to.
- A round cap or escape hatch to `manual-needed` after N consecutive rejections — see Open Issues.
- A new `TaskType` enum value — reuses `human_review` with a distinguishing payload field (`artifactPath`, `round`) rather than adding e.g. `post_implementation_review` to the runner's type union.
- Any built-in notion of *what* the gate is for. This node ships one generic mechanism (run a command, pause, surface an artifact path); "visualization" is worldgen's chosen use of it, not a first-class concept in the schema or the script.
- Wiring worldgen's real render/visualization command into worldgen's own `.ledger/project.json`. That is a downstream adoption step worldgen takes *after* this node ships COMPLETE, not a deliverable of this node — this node's job is the generic mechanism, not any particular project's use of it.

---

## Design

### Config shape

```jsonc
// .ledger/project.json (worldgen)
{
  "workflow": {
    "postImplementationGate": {
      "command": "pnpm -C {dir}/ui render-preview --node {nodeId} --out {dir}/.gate/{nodeId}.png",
      "artifactPath": "{dir}/.gate/{nodeId}.png"
    }
  }
}
```

`artifactPath` is optional — if omitted, the Post-Impl Gate stage asks the agent running `command` to report the artifact path it produced (agents already return structured output via schemas elsewhere in this script, e.g. `IMPL_SCHEMA`).

### Stage flow

```
Stage 4a (entry commit: APPROVED → IN_PROGRESS) — unchanged
        │
        ▼
Stage 4b (implementation) — unchanged; no status bump yet
        │
        ▼
Post-Impl Gate — NEW, conditional on workflow.postImplementationGate being set
  round 1:
    - run postImplementationGate.command in the impl worktree
    - POST human_review task { artifactPath, round: 1 }
    - RETURN { status: "awaiting-post-impl-approval", round: 1, ... }   ← script exits here
        │
        │   operator inspects the artifact, approves or rejects the task in the Tasks panel,
        │   then re-invokes leaf-workflow.js with { resumeAfterGate: true, worktreePath,
        │   branchName, postImplReviewTaskId, round } — same shape regardless of verdict
        │   (round is echoed back from the prior return value — not recoverable from the task)
        ▼
  script queries GET /api/tasks/:id for the task's actual status:
    ├─ REJECTED → patch agent fixes the worktree using the rejection rationale,
    │             commit, re-run command, POST a new human_review task { round: N+1 },
    │             RETURN awaiting-post-impl-approval again  (loop back up)
    │
    └─ APPROVED → fall through to Stage 4c
        │
        ▼
Stage 4c (exit commit: IN_PROGRESS → VERIFY) — now deferred until gate approval, mirroring
                                                the compute-heavy exception's precedent of
                                                deferring 4c until an external verdict lands
        │
        ▼
Stage 5 (Rebase) onward — unchanged, entered either normally (no gate configured)
                           or via the resume-and-approved path above
```

No lifecycle state other than `IN_PROGRESS` is touched while the gate loops — the node never claims `VERIFY` on an artifact nobody approved, so a rejection needs no `ISSUE_OPEN` detour (that state is reserved for bugs found *after* a legitimate VERIFY, per stage 8b — this gate never reaches VERIFY until approved).

### `leaf-workflow.js` changes

- Args parsing (near the top, alongside `skipSpecReview`): add `resumeAfterGate = _args.resumeAfterGate ?? false`, plus `_args.worktreePath` / `_args.branchName` / `_args.postImplReviewTaskId` / `_args.round` (default 1) read-through when resuming.
- Read `postImplementationGate` config the same way `gateCommands`/`e2eCommand` are already read from the project's workflow block.
- New early-branch near the top: if `resumeAfterGate` is true, `GET /api/tasks/:id` for `postImplReviewTaskId` and dispatch on its status (approved → deferred-4c-then-Stage-5; rejected → patch loop below; pending → `manual-needed`), bypassing Stages 0–4b entirely (the worktree already exists).
- New gate logic inserted between 4b and 4c in the normal (non-resume) flow: guarded by `if (postImplementationGateCommand) { ... }`. Mirrors the Stage 8 Gate's `callAgent` + POST `/api/tasks` pattern, carrying `artifactPath`/`round` via `reviewPayload` (schema-conformant — see Task payload note), then returns early instead of falling through to 4c.
- Reject-loop logic (shared between the initial pass and the resume path): a `callAgent` briefed with the task's rejection rationale, working in the existing worktree (no `isolation: "worktree"` — it's a continuation of 4b, not a new dispatch), followed by re-running `postImplementationGate.command` and posting a new round's task.
- New schema, `POST_IMPL_GATE_SCHEMA`, for the agent call that runs the configured command and reports back the artifact path (when `artifactPath` isn't statically configured).

### Task payload (extends the existing stage-8 pattern)

**Corrected during implementation (see Implementation Notes):** `task-input.schema.json` has no generic `nodeId`/`input` field (`additionalProperties: false` at the top level) — a payload shaped like the original draft below would 400 against the real `POST /api/tasks` validator. The sanctioned vehicles are `resourceClaims` (structured; used here to carry `nodeId`) and, for `human_review` specifically, `reviewPayload: {summary, diffRef}`. `round` is **not** recoverable from the created task — the resume call must pass it back explicitly (see Return shapes and `resumeAfterGate` below).

```json
{
  "type": "human_review",
  "title": "Operator gate: <nodeId> post-implementation artifact ready for review (round <N>)",
  "resourceClaims": [{ "kind": "node", "nodeId": "<nodeId>", "mode": "write" }],
  "reviewPayload": {
    "summary": "Node <nodeId> (round <N>). Worktree: <worktreePath>. Branch: <branchName>. Open the artifact, then approve or reject (with a reason). Either way, resume with { resumeAfterGate: true, worktreePath, branchName, postImplReviewTaskId, round: <N> }.",
    "diffRef": "<generated artifact path>"
  }
}
```

### Return shapes (extends the existing four)

```js
// New — recurs once per round; round increments on each rejection. `round` must be passed
// back explicitly on the next resumeAfterGate call — it is not recoverable from the task.
{ status: "awaiting-post-impl-approval", worktreePath, branchName, postImplReviewTaskId, artifactPath, round, nextStep, resumeCommand }

// New — resume called before the task has an approve/reject decision recorded
{ status: "manual-needed", message: "postImplReviewTaskId <id> is not yet decided" }

// Existing, unchanged
{ status: "awaiting-operator", worktreePath, branchName, humanReviewTaskId, ... }
{ status: "rebase-conflict", worktreePath, branchName, conflicts: [] }
{ status: "already-complete" }
{ status: "manual-needed", message }
```

### Schema diff (`docs/_schemas/project-metadata.schema.json`)

Add under `properties.workflow.properties`:

```jsonc
"postImplementationGate": {
  "type": "object",
  "additionalProperties": false,
  "required": ["command"],
  "properties": {
    "command": {
      "type": "string",
      "minLength": 1,
      "description": "Shell command that generates an artifact for operator review from the implementation worktree. Use {dir} as a placeholder for the worktree path and {nodeId} for the node id. Run after Stage 4 (Implement), before Stage 5 (Rebase)."
    },
    "artifactPath": {
      "type": "string",
      "minLength": 1,
      "description": "Optional path (may use {dir}/{nodeId} placeholders) to the artifact command produces. When omitted, the agent running command reports the path it produced."
    }
  },
  "description": "Optional operator pause after implementation: runs command in the impl worktree and creates a human_review task pointing at the resulting artifact before Stage 5 (Rebase) proceeds. Absent by default — no behavior change. The artifact's nature (image, report, log) is entirely up to the configured command."
}
```

### `leaf-workflow.md` diff sketch

Insert inside the existing "### 4. APPROVED → IN_PROGRESS → VERIFY — implementer in isolated worktree" section, between the 4b (implementation) and 4c (exit commit) bullets:

```markdown
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
```

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Reuse the `human_review` `TaskType` rather than adding a new type | Additive-only payload extension (`artifactPath`); avoids a `server/src/runner/types.ts` union change and the migration/UI ripple that would follow. The Tasks panel already renders arbitrary `human_review` gates identically regardless of payload shape. |
| D2 | Resume via re-invoking the same script with `resumeAfterGate`, not a third script file | `11-workflow-scripts` D1 split into two scripts specifically because promote/merge/cleanup (stages 9–11) are a genuinely separate concern from implement/rebase/review (stages 1–8). Resuming into stage 5–8 after this gate is "the same script continuing," not a new concern — a resume-argument branch keeps `.claude/workflows/` from growing a third file for what is really one control-flow pause. |
| D3 | Config-gated via `workflow.postImplementationGate`, default-off | Not every project produces an artifact worth a human eyeballing it — ledger's own doc/code nodes don't. Gating via `project.json` keeps `leaf-workflow.js` a single shared script across every registered project (per the framework's multi-tenant design in root `CLAUDE.md`) with zero behavior change for projects that don't opt in. |
| D4 | Named generically (`postImplementationGate`, not e.g. `visualizationGate`) with no content-specific fields beyond `command`/`artifactPath` | The mechanism — run a command, pause, surface an artifact — has nothing visualization-specific about it. Naming it after worldgen's particular use (a rendered map) would misrepresent it as narrower than it is and invite a second, redundant config surface the day another project wants the same pause for a non-visual artifact (a generated report, a benchmark summary). One generic name, one generic schema shape. |
| D5 | `postImplementationGate.command` templated with `{dir}` (and `{nodeId}`) like existing `gates`/`e2eGate` | Consistency with the established config-templating convention; no new templating syntax for future readers to learn. |
| D6 | The 4c exit commit (`IN_PROGRESS → VERIFY`) is deferred until the gate is approved, rather than the gate running after 4c has already landed | Bumping to `VERIFY` before an operator has looked at the artifact would claim a verification state nobody granted, and a rejection would then need an `ISSUE_OPEN` detour that's semantically reserved for post-VERIFY findings (stage 8b). Deferring 4c mirrors the precedent already established by the compute-heavy exception (`leaf-workflow.md` §4b: "this commit does not land until the operator's probe verdict... is recorded") — an external verdict gating the exit commit is not a new idea in this script. |
| D7 | Rejection loop reuses the existing `human_review` reject endpoint (`POST /api/tasks/:id/reject`, OCC + rationale, from `05-task-runner/03-hitl-gate`) and re-invokes `leaf-workflow.js` with the same `resumeAfterGate: true` shape regardless of approve/reject — the script queries the task's actual verdict rather than requiring the operator to pass a different flag per outcome | One re-invocation shape for both outcomes is simpler for the operator to remember, and matches the existing idiom of deriving behavior from live state (Stage 0 already derives its skip flags from the doc's lifecycle Status rather than from an operator-supplied stage number). No new task-runner primitive needed — rejection-with-rationale already exists and dual-writes the reason, which is exactly what the patch agent needs as its brief. |

---

## Open Issues

- **LOW — worldgen's actual render/visualization command is not yet known.** This spec's config example (`pnpm -C {dir}/ui render-preview ...`) is a placeholder. This does **not** block implementation or verification of this node — the mechanism is content-agnostic by design (D4/D8 below), so stage 4's acceptance checks (A2–A5) exercise it with a trivial fixture command (e.g. `echo`/write-a-dummy-file). Wiring worldgen's real command into worldgen's own `.ledger/project.json` is a separate, later, worldgen-side config change that happens after this node ships — not a dependency of it.
- **LOW — pre-existing, unrelated schema gap noticed while drafting this spec.** `workflow.worktreeSetup` is documented in root `CLAUDE.md` and read by `leaf-workflow.js` Stage 4, but is absent from `project-metadata.schema.json`'s `workflow.properties`. Since `workflow` has `additionalProperties: false`, a `project.json` that sets `worktreeSetup` today would fail schema validation. Same bug class as the `baseBranch` fix in `6b1ab94`. Not this node's bug to fix — flagging for a separate maintenance pass.
- **LOW — no cap on reject-loop rounds.** A persistently-rejected gate loops indefinitely (round 2, 3, 4, ...) with no escape hatch to `manual-needed` after N consecutive rejections. Worth adding once real usage shows whether runaway loops are a practical concern; not blocking for v1 since the operator can always abandon the node manually (it just sits `IN_PROGRESS` with an open task).

---

## Spec Review (2026-07-12)

**Verdict:** NEEDS_MINOR_REVISIONS (0 blocking / 2 should-fix / 3 nit, all mechanical; all applied). Full sign-off matrix covered R1–R9, R5b, PRD §6.1/§6.2 compliance, the ISSUE_OPEN-exclusion reasoning (independently verified against `tasks` table schema, `NodeInspector.tsx`, `useTaskFilters.ts`, scanner monitors — no code path assumes one `human_review` task per node), and the compute-heavy-exception analogy (D6) — both hold up under scrutiny.

| # | Finding | Resolution |
|---|---------|------------|
| S1 | Dependencies line cited nonexistent `server/src/runner/types.ts`; omitted `05-task-runner/03-hitl-gate` (owner of `POST /:id/reject`, which D7/R5b rely on) | applied — corrected to `packages/parser/src/runner/types.ts`; added `05-task-runner/03-hitl-gate` citation |
| S2 | R7 (leaf-workflow.md doc update + `sync-process`) had no corresponding Acceptance-check item | applied — added A7 |
| S3 | Stray "Stage 4d" label in Open Issues, inconsistent with the doc's established "Post-Impl Gate" naming everywhere else | applied — reworded to "the Post-Impl Gate" |
| S4 | `round` field quoted as a string placeholder (`"<N>"`) in the illustrative JSON task payload, inconsistent with its numeric type elsewhere in the doc | applied — unquoted to `<N>` |
| S5 | *(FYI, not chargeable to this node)* parent `00-workflow-scripts.md`'s Stage-8 pseudocode uses a stale `payload:` shape that doesn't match the real `leaf-workflow.js` code | not applicable to this node — flagged for a future `11-workflow-scripts` maintenance pass |

### Post-Approval Correction (2026-07-12)

Operator caught a scoping error after APPROVED, before stage 4 dispatch: R9 and the Open Issues/Verification/runtime language wrongly framed "worldgen's real render command is unknown" as blocking this node's own implementation. It doesn't — the gate is content-agnostic by construction (D4), so this node's own stage-4/stage-8 acceptance checks exercise it with a trivial fixture command, never worldgen's real one. Corrected: R9 rewritten to state the fixture-command testing approach; a new out-of-scope bullet makes explicit that wiring worldgen's actual command into worldgen's `project.json` is a downstream adoption step, not this node's deliverable; the Open Issue's severity dropped MEDIUM → LOW and reworded to match; A2 and the expected-runtime note updated to reference the fixture command instead of worldgen's unknown one. No Requirements/Design/Decisions substance changed — this narrows an incorrect blocking dependency, it doesn't add scope, so it doesn't warrant a new spec-review cycle.

---

## Implementation Notes

### Dependencies added

None. No new npm packages; the change is confined to `.claude/workflows/leaf-workflow.js`, the JSON schema, the process doc, and parser test fixtures.

### Files changed

- `.claude/workflows/leaf-workflow.js` — args parsing gains `resumeAfterGate` / `worktreePath` / `branchName` / `postImplReviewTaskId` read-through; config section reads `workflow.postImplementationGate`; new `POST_IMPL_GATE_SCHEMA`; new `renderPostImplCmd` (adds `{nodeId}` interpolation on top of `renderCmd`'s `{dir}`/`{repo}`) and `runPostImplGate(round, wtPath, brName)` helper (runs the configured command, resolves the artifact path — either statically configured or agent-reported via `POST_IMPL_GATE_SCHEMA` — then POSTs the round's `human_review` task); new resume-after-gate branch inserted right after config/doc-path derivation and before the doc-status read, dispatching on the fetched task's status (`COMPLETE` → deferred 4c commit then falls through to Stage 5 onward via a synthetic `currentStatus = 'IN_PROGRESS'`; `FAILED` → patch agent + re-run gate + new round, returns `awaiting-post-impl-approval`; anything else → `manual-needed`); Stage 4's `fourCText` is now built conditionally (deferred-commit variant when a gate is configured, byte-identical original variant otherwise) and the post-4b/pre-4c gate-trigger block (round 1) is nested inside the `if (runImpl)` branch, returning early with `awaiting-post-impl-approval` when a gate is configured; the worktree-recovery search block (IN_PROGRESS/VERIFY re-entry) is now guarded with `&& !resumeAfterGate` since resume already supplies `worktreePath`/`branchName` directly; `meta.phases` gains a `Post-Impl Gate` entry between `Implement` and `Rebase`.
- `docs/_schemas/project-metadata.schema.json` — added `workflow.properties.postImplementationGate` (required `command`, optional `artifactPath`, both `minLength: 1`, `additionalProperties: false`) verbatim per the spec's Schema diff.
- `.ledger/process/leaf-workflow.md` — inserted the "4b½. Post-implementation gate" subsection between the 4b and 4c bullets in stage 4, per the spec's diff sketch (landed verbatim).
- `packages/parser/test/project/validateProjectMetadata.test.ts` + new fixture `packages/parser/test/project/fixtures/post-implementation-gate.json` — positive-case test that a `project.json` with `workflow.postImplementationGate.command` set validates via `validateProjectMetadata`, plus a regression assertion that the existing `conformant.json` fixture (no `postImplementationGate`) still validates. Covers A6 with real automated coverage instead of only a live Workflow-tool path.
- `app/src/lib/deriveWorkflow.ts` — incidental one-line fix, not part of this node's scope (see Deviations below).

### Decisions / deviations from spec

- **4a/4c commit-message prefix kept as `impl(...)`, not `docs(...)`.** The task briefing described the established convention as `docs(${leafId}): ...`, but the actual pre-existing Stage 4 code in `leaf-workflow.js` uses `impl(${leafId}): APPROVED → IN_PROGRESS` / `impl(${leafId}): IN_PROGRESS → VERIFY` (implementation-bearing transitions use `impl(`, distinct from the pure doc-transition commits in stages 1–3 and the parent's stage-9 promote, which do use `docs(`). Per R8/A1 (byte-for-byte identical behavior when no gate is configured), the non-gate `fourCText` branch and the new deferred-commit / gate-configured intermediate commit both keep `impl(` for consistency with the sibling case. The new reject-loop patch commit correctly uses `fix(${leafId}): address post-impl gate feedback (round N)` per R5b's literal spec.
- **Deferred 4c splits into two sub-commits when a gate is configured.** Rather than leaving Implementation Notes and code uncommitted across the early-return boundary (risky — the workflow invocation ends entirely at that point), the gate-configured path has the implementer commit code + Implementation Notes immediately after 4b (`impl(${leafId}): implementation complete, pending post-impl gate`, Status left at IN_PROGRESS), then a separate small commit later bumps only the Status header to VERIFY once the gate is approved (`impl(${leafId}): IN_PROGRESS → VERIFY`). This keeps the worktree's on-disk state always fully committed between invocations of the script, which a single "leave it dirty and resume" design would not.
- **Blocking correctness bug found and fixed post-implementation (operator-caught, not self-caught): the task payload didn't conform to the real `POST /api/tasks` schema.** The original implementation (this bullet's earlier draft, and — it turns out — the pre-existing Stage 8 Gate this node's Post-Impl Gate was modeled on) posted `{type, nodeId, title, input: {...}}`. `docs/_schemas/task-input.schema.json` has `additionalProperties: false` at the top level and no `nodeId` or `input` property at all — confirmed by compiling the schema with ajv directly against that exact payload shape (`additionalProperty "nodeId"` / `"input"` not allowed). Every `POST /api/tasks` call from either gate would have 400'd and never created a task; this was never caught because no acceptance item touching either gate has ever run against a live server (`00-workflow-scripts.md`'s A3 is explicitly "N/A — requires live Workflow tool invocation"). Fixed in both `runPostImplGate` and the pre-existing Stage 8 Gate block: `nodeId` moves into `resourceClaims: [{kind:"node", nodeId, mode:"write"}]` (a real, schema-sanctioned field); the rest (`worktreePath`, `branchName`, `artifactPath`, `round`, `nextStep`) collapses into `reviewPayload.summary` (free text for the operator to read in the Tasks panel) and `reviewPayload.diffRef` (the artifact path / worktree path — the one field explicitly meant for "the thing to look at"). Consequence: `round` is no longer recoverable from the created task at all (there is no `input` field to read it back from), so the resume call now must pass `round` back explicitly as an arg (defaulting to 1) rather than the orchestrator reading `task.input.round` — the design's D7 "derive behavior from live state" idiom still applies to the approve/reject *decision* (read live from `task.status`), just not to `round` bookkeeping, which the schema has no field for. Bundling the Stage 8 fix into this commit rather than filing it separately was an operator call: same file, same root cause, and Stage 8 was equally non-functional.
- **Incidental fix, out of this node's scope: `app/src/lib/deriveWorkflow.ts:45`.** `pnpm -C app build` (not `typecheck`, which passes — the discrepancy is `tsc -b`'s project-reference rebuild picking up the parser's freshly-built `NodeStatus` union vs. `tsc --noEmit`'s non-composite check) failed on main HEAD (confirmed via `git stash` + direct build in the primary repo, independent of this worktree) with `TS2366: Function lacks ending return statement` in `statusToRank`'s switch — the `NodeStatus` union gained a `"DEPRECATED"` member (`f3d1a57`, already on `main` before this node's work started) that the switch didn't handle. Added the missing `case "DEPRECATED": return 5` (terminal status, mirroring `DEFERRED`'s and `statusColors.ts`'s treatment). This is unrelated to `postImplementationGate` — verified pre-existing by reverting only the schema edit and re-running; the failure was identical. Bundled per the established precedent of fixing small unrelated build breaks found during gate runs (see `11-workflow-scripts`'s own vite.config.ts lint fix and the `07-health-daemon` reconciliation's `doc_decompose`/`TaskTypeBadge` fix, both documented in root `CLAUDE.md`).
- **Pre-existing, NOT fixed here (left as documented Open Issue, per this node's own spec):** `workflow.worktreeSetup` is read by `leaf-workflow.js` and set in ledger's own `.ledger/project.json`, but absent from `project-metadata.schema.json`'s `workflow.properties` (`additionalProperties: false` on `workflow`). This causes `validateProjectMetadata` to reject ledger's own real `project.json`, which in turn fails `app/src/lib/project/loadProjectMetadata.test.ts`'s module-singleton test (5 failures) and blocks the E2E `webServer` from booting (`ledger: invalid project metadata ... /workflow: must NOT have additional properties`). Confirmed pre-existing and unrelated to `postImplementationGate` (same failures reproduced with the schema edit reverted via `git stash`). This is exactly the spec's own second Open Issue — explicitly flagged there as "Not this node's bug to fix — flagging for a separate maintenance pass" — so left untouched here.

### Gate results

- `pnpm -C packages/parser build`: exit 0
- `pnpm -C packages/parser test` (via `pnpm test` fanout): 11 files / 147 tests passed, including the 2 new `workflow.postImplementationGate` cases in `validateProjectMetadata.test.ts`
- `pnpm -C server test`: 42 files passed / 1 skipped (43), 420 tests passed / 2 skipped (422), 0 failed
- `pnpm -C app typecheck`: exit 0
- `pnpm -C app lint`: exit 0
- `pnpm -C app build`: exit 0 (after the incidental `deriveWorkflow.ts` fix above; failed with exit 2 before it, both on this worktree and on unmodified `main`)
- `pnpm -C app test`: 20 files passed / 1 failed (21), 181 tests passed / 5 failed (186) — all 5 failures pre-existing in `loadProjectMetadata.test.ts`, root-caused to the `workflow.worktreeSetup` schema gap above, unrelated to this node
- `pnpm test` (full fanout, `--no-bail`): overall exit 1, driven entirely by the two pre-existing/out-of-scope issues above (app's `loadProjectMetadata` singleton test + e2e's `webServer` boot failure); every gate within this node's actual scope (parser build, parser tests, server tests, app typecheck/lint/build) is green
- E2E: `e2eExit: -1` — this node introduces no UI panel or user-facing API endpoint (same as the parent `11-workflow-scripts` node); no new Playwright tests required. (Separately, the E2E suite's `webServer` currently cannot boot at all due to the pre-existing schema gap above — unrelated to this node.)

### Implementation Review (2026-07-13)

**Verdict:** NEEDS_MINOR_REVISIONS (0 blocking / 2 should-fix / 1 nit). Independent clean-context review against the rebased `main..HEAD` diff. Reviewer independently re-derived the schema-conformance finding from scratch (did not take the Implementation Notes' claim on faith) by compiling `task-input.schema.json` with ajv against literal payload objects matching the actual `runPostImplGate`/Stage-8-Gate code — both validated true. Also independently re-ran every gate (parser build/test, server test, app typecheck/lint/build/test) with matching results, traced the non-gate control-flow path by hand to confirm byte-identical behavior when `postImplementationGate` is absent, and confirmed the `deriveWorkflow.ts` incidental fix against `NodeStatus`'s real union and `statusColors.ts`'s existing `DEFERRED` precedent.

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| R1 | `workflow.postImplementationGate` config, `{command, artifactPath?}`, `{dir}`-templated, absent-by-default | PASS | Schema diff verbatim; `postImplementationGateCommand = wf.postImplementationGate ?? null`; ledger's own `project.json` confirmed to lack the key. |
| R2 | Gate inserted inside Stage 4 after 4b, before 4c; 4c deferred until approved | PASS | `if (postImplementationGateCommand)` block sits after `implResult` processing and before Stage 5; `fourCText` branches to deferred-commit variant when configured. |
| R3 | Gate POSTs `human_review` task carrying artifact/round data | PASS (post-fix) | Corrected to `resourceClaims`/`reviewPayload` per the schema-conformance fix; requirement text now matches. |
| R4 | Early-return shape `{status:"awaiting-post-impl-approval", ...}` | PASS | Return object matches exactly, `nodeId` included consistent with sibling return shapes. |
| R5 | `resumeAfterGate` + `worktreePath`/`branchName`/`postImplReviewTaskId`/`round`; branches on live task status | PASS | Args parsed; resume branch dispatches on `gateTask.status` (COMPLETE/FAILED/else), matching real GET `/:id` response shape. |
| R5b | Reject → patch agent in same worktree, commit, re-run, new round's task, same resume shape both verdicts | PASS | Patch-agent issues no `worktree add`; commit message matches spec literally; `runPostImplGate(nextRound, ...)` posts next round. |
| R6 | Schema gains `postImplementationGate` under `workflow`, matching sibling style | PASS | `additionalProperties:false`, `required:["command"]`, both fields `minLength:1`, verbatim. |
| R7 | `leaf-workflow.md` gains 4b½ section; `sync-process` propagates it | PARTIAL → resolved | Doc section verified landed. `sync-process` correctly deferred to stage 10 (post-merge) — running it pre-merge would no-op against main's still-unmerged copy (confirmed: main's and worldgen's copies are currently byte-identical, both pre-dating 4b½). A7 reworded to reflect this is a stage-10 action item, not blocking VERIFY. |
| R8 | Config-gated, default-off, zero cross-project impact | PASS | Same evidence as R1; control-flow trace confirms non-gate path unchanged. |
| R9 | This node's own acceptance exercises a fixture command, not worldgen's real one | PASS | Fixture command (`echo`) confirmed in parser test fixture; no dependency on worldgen. |
| A1 | Gate absent → 4b straight to 4c, no behavior change | PASS | Control-flow hand-trace: `fourCText`'s non-gate branch textually identical to pre-diff 4c block; gate-trigger block skipped; only cosmetic `log()` suffix added. |
| A2–A5 | Live round-trip (create/approve/reject/pending) | N/A — operator gate | Requires a live Workflow tool invocation against a running server; code-reviewed and schema-verified, not live-exercised — correctly deferred to stage 8. |
| A6 | Schema validates new + existing `project.json` files | PARTIAL | Worldgen's real file validates. Ledger's own real file still fails on the pre-existing, already-documented `worktreeSetup` gap — confirmed pre-existing on `main`, not a regression from this diff. |
| A7 | `leaf-workflow.md` 4b½ section + sync-process | Resolved | See R7 above — reworded to correctly scope `sync-process` to stage 10. |

**Findings:**
- Should-fix (`isMechanical: true`, both applied): R3 and the "leaf-workflow.js changes" Design bullet used stale pre-fix wording describing a generic `input` field that no longer exists post-fix — rewritten to describe `resourceClaims`/`reviewPayload`.
- Should-fix (`isMechanical: true`, applied via rewording rather than executing literally): A7/R7's `sync-process` — running the script now would silently no-op (main hasn't merged this branch yet, so it has nothing new to push); corrected the acceptance check to scope this to stage 10 instead of claiming it's done or blocking on a premature run.
- Nit (`isMechanical: false`, not applied — pre-existing, inherited, out of this node's diff): the gate-creation prompt's "return the id field" wording is slightly imprecise against the real `{task:{id,...}}` response shape; low behavioral risk, inherited verbatim from the already-shipped Stage 8 pattern. Left for a future maintenance pass if that block is touched again.

### Live API round-trip verification (2026-07-13)

Beyond the ajv-level schema check (Implementation Notes above) and the reviewer's independent ajv re-derivation (Implementation Review above), the underlying task-runner contract was exercised against a **real running server** — not simulated. Booted `pnpm -C server dev /Users/dennis/code/worldgen` (ledger's own `.ledger/project.json` currently can't boot a server at all, due to the unrelated pre-existing `worktreeSetup` schema gap documented in Open Issues — worldgen's config validates cleanly and served as a stand-in test harness for the task-runner API itself, which is project-agnostic).

- `POST /api/tasks` with the exact corrected payload shape (`resourceClaims: [{kind:"node", nodeId, mode:"write"}]`, `reviewPayload: {summary, diffRef}`) → **201, task created**, `status: "AWAITING_HUMAN_REVIEW"` (task id `82b1e7c6-...`).
- `GET /api/tasks/:id` → confirmed `{task, events}` shape matches exactly what the resume branch's status-check agent expects.
- `POST /api/tasks/:id/reject` with a rationale → task transitions to `FAILED`; `GET` afterward shows an event with `kind: "error"`, `message: "rejected_with_details"`, `stack: "<the rationale text>"` — the exact shape the reject-loop's patch-agent briefing reads.
- A second task, `POST /api/tasks/:id/approve` → transitions to `COMPLETE` — the exact status the resume branch's approve path checks for.
- Server shut down cleanly afterward (`kill-port 4180`). Two harmless test tasks (one `FAILED`, one `COMPLETE`, titled "TEST post-impl-gate payload conformance...") remain in worldgen's local, gitignored `.ledger/runner.db` — not committed anywhere, safe to ignore or clear.

This closes the gap that let the original bug ship undetected in the first place (no acceptance item for either gate had ever run against a live server). What remains genuinely un-exercised is the full `leaf-workflow.js` Workflow-tool orchestration end-to-end (the actual `agent()`/`phase()` control flow calling these endpoints itself) — that's stage 8's live Workflow-tool invocation, which is the operator's own gate to run, not something to simulate here.

---

## Verification

No UI panel or API endpoint changes — reuses the existing POST `/api/tasks` endpoint and `human_review` executor. E2E: "Passes existing suite" (no new UI surface).

Acceptance checks (all require a live Workflow tool invocation — operator gate):

- A1: With `workflow.postImplementationGate` absent (ledger's own `project.json`, unchanged), `leaf-workflow.js` runs 4b straight to the 4c exit commit with no behavior change — regression check.
- A2: With `workflow.postImplementationGate.command` set to a trivial fixture command (e.g. `echo`/write-a-dummy-file — no dependency on worldgen's real render step, see R9), the script runs the command in the impl worktree after 4b, creates a `human_review` task with `artifactPath`/`round: 1` populated, and returns `status: "awaiting-post-impl-approval"` without landing the 4c exit commit.
- A3: Re-invoking with `resumeAfterGate: true` plus the returned `worktreePath`/`branchName`/`postImplReviewTaskId`, after the task is **approved**, lands the deferred 4c commit and proceeds through Stage 5–8 normally.
- A4: Re-invoking the same way after the task is **rejected** (with a rationale) dispatches a patch agent in the same worktree, produces a new commit, regenerates the artifact, and returns `awaiting-post-impl-approval` with `round: 2` and a new `postImplReviewTaskId` — the spec doc's Status stays `IN_PROGRESS` throughout (no `ISSUE_OPEN` transition).
- A5: Re-invoking while the task is still pending (no approve/reject recorded) returns `{ status: "manual-needed" }` rather than guessing.
- A6: `project-metadata.schema.json` validates a `project.json` containing `workflow.postImplementationGate` (positive case) and still validates existing unmodified `project.json` files (regression, both ledger's and worldgen's pre-change copies).
- A7: `.ledger/process/leaf-workflow.md` contains the new 4b½ section (diff-sketch content landed verbatim or near-verbatim) — verifiable now, in the worktree. The `sync-process` half of this check can only run **after this branch merges to main** — the script reads `.ledger/process/` from the main repo's own working tree regardless of invocation cwd, so running it pre-merge would diff against main's still-unmerged (pre-4b½) copy and no-op. This is a stage-10 (`leaf-workflow-finish`'s merge stage) action item, not a stage-6/7 one — tracked there, not blocking VERIFY.

Expected runtime: this node's own gate command is a trivial fixture (seconds), well under the compute-heavy gating checkpoint's ~15-minute threshold. Whatever real command a given project later configures (e.g. worldgen's render step) is that project's own concern to check against the checkpoint when it adopts this gate — not something this node's implementation or verification depends on.

---

## Children

None.
