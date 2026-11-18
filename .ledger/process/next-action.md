# Process: Determining What To Do Next

**Status:** LIVING
**Last Updated:** 2026-11-17 (the ladder reads the doc tree; the task runner and health scanner are gone)
**Location:** `.ledger/process/next-action.md`

## 1. Purpose

A repeatable procedure for an operator (or orchestrating agent) to determine, at any moment, the single highest-priority next action on a ledger-managed project. It walks a fixed precedence ladder — unblock the operator's own gates first, then fix what's broken, then advance the plan, then pay down maintenance debt — so that two operators running it independently converge on the same recommendation in unambiguous cases, and the genuinely ambiguous cases (which competing item wins) are surfaced explicitly rather than decided by mood. It does **not** drive the chosen node through its lifecycle; that is `leaf-workflow.md`. This process ends at a recommendation.

## 2. Inputs

Read these before deciding. Cheapest-first; stop early only if a higher rung already fires decisively (§3).

| Source | Command / path | What it yields |
|---|---|---|
| Node lifecycle table | `.claude/scripts/doc-status` | Every node's current status — the spine of the decision. Nodes are the files in `docs/_plans/` (`docs-layout.md`). |
| Living docs | markdown files at the top of `docs/` | The lasting description. Read these for what is true now; do not treat them as work waiting to be done. |
| PRD §14 manifest | `docs/00-project.md` §14 | Strategic build order + declared dependency edges. |
| PRD §11 open issues | `docs/00-project.md` §11 | Roll-up of cross-cutting issues with priority tags; HIGH/strategic items live here. |
| Per-node Open Issues | the node doc's Open Issues section | Unstruck HIGH/MEDIUM issues not yet escalated to §11. |
| Decision-blocked specs | DRAFT docs whose body says the operator must choose before the work can continue | Specs that cannot advance without an operator decision. |

## 3. Algorithm

Evaluate rungs **R0 → R6 in order**. The first rung that produces a candidate set wins; recommend from inside it and stop. Rungs are ordered by *reversibility-of-harm*: a node waiting on the operator, or a node whose current work is stuck, outranks any forward progress.

### R0 — Waiting on the operator

Look for a node at `VERIFY`.
- **≥1 present →** the recommendation is **do the operator pass** on the oldest one (`leaf-workflow` stage 8): accept it onward to COMPLETE, or reject it into stage 8b. Nothing else is more urgent.
- **0 →** descend to R1.

### R1 — Stuck in-flight work

Look for a node at `IN_PROGRESS` or `ISSUE_OPEN`, and for a node doc that is missing a required section.
- **One of those is the work currently being landed →** recommend **repair that item**: finish the implementation, or resume from the stage the doc says it is in. A doc missing a required section is always R1.
- **Else →** descend to R2.

### R2 — Decision-blocked specs (unblock yourself)

Find DRAFT nodes whose body explicitly awaits an operator decision (a path fork, a scope call) — grep DRAFT docs for "awaiting operator" / "choose before implementing" / a D0-style fork.
- **≥1 present →** recommend **make that decision**. These are the cheapest high-leverage actions on the board: a single operator choice converts a stalled node into actionable work. If several, pick by (a) PRD priority tag of the issue it resolves, then (b) §14 manifest order. Output the recommended choice *and its rationale*, not just "go decide."
- **0 →** descend to R3.

### R3 — HIGH-priority open issues (fix what the project itself flags as broken)

Collect all unstruck **HIGH** items from PRD §11 and from per-node Open Issues (a strikethrough or "addressed by" pointer = resolved, skip it).
- **≥1 actionable HIGH →** recommend the highest. "Actionable" means a node or change can be opened against it now. A HIGH that is explicitly *strategic / roadmap-framing* (e.g. §11 "no autonomous System 4") and has no scoped next node is **not** directly actionable — its actionable form is "draft the spec for its first concrete step," which is what you recommend.
- **0 actionable HIGH →** descend to R4.

### R4 — Advance the manifest (move the plan forward)

Walk PRD §14 top-to-bottom for the first node not COMPLETE/DEFERRED, then verify its **dependency edges are all COMPLETE** (unblocked).
- **An unblocked, non-COMPLETE manifest node exists →** recommend driving it via the lifecycle stage it's currently in:
  - PLANNED with `**Requirements confirmed:**` missing or `unconfirmed` → `leaf-workflow` stage 1a (write or finish requirements). Do not design.
  - PLANNED with `**Requirements confirmed:**` dated → stage 1c (design, in a fresh session). The decomposition checkpoint runs after that design exists.
  - DRAFT → `leaf-workflow` stage 2 (spec review). *(But if it's decision-blocked, R2 already caught it.)*
  - APPROVED → stage 4 (implement). *(Exclude `Node Kind: maintenance-container` docs — APPROVED is their permanent steady state, never a "next action.")*
  - SPEC_REVIEW / VERIFY → resume the corresponding stage. *(VERIFY usually caught at R1.)*
  - Status `—` / non-existent but listed → stage 1a (requirements only).
- **Tie-break** between two equally-unblocked nodes: lower §14 row wins (it is earlier in declared build order); if same row depth, the one with more downstream dependents wins (unblocks more).
- **All manifest nodes COMPLETE/DEFERRED →** descend to R5.

### R5 — Maintenance debt (pay down accumulated nits)

Read the unstruck **MEDIUM/LOW/TRIVIAL** Open Issues across COMPLETE siblings, and notice a doc that has grown too large to work in (`doc-size-resolution.md`).
- **A subtree has ≥2 batchable items from ≥2 siblings →** recommend **instigate a maintenance round** on that subtree (`maintenance-round.md`), naming the subtree. One round per subtree; pick the subtree with the largest round-sized backlog.
- **A doc is too large to work in →** recommend resolving that doc (`doc-size-resolution.md`) — but only if no R0–R4 item fired. Size impairs readability, not correctness.
- **No round-sized backlog →** descend to R6.

### R6 — Strategic / no-pending-work

If R0–R5 all empty, the executable plan is exhausted. Recommend the highest-priority **strategic** §11 item's first concrete step (typically the §11 HIGH that R3 classified as non-directly-actionable). This is the rung where "what should the project even build next" — true System-4 / re-planning work — surfaces. Output it as "draft a decision-enabling spec for X," not as implementation.

## 4. Output

A single recommendation object:

```
RECOMMENDATION
  Action:     <verb-first imperative — e.g. "Do the operator pass on 15-review-decisions">
  Target:     <node id / task id / subtree>
  Rung:       <R0–R6, the rung that fired>
  Next step:  <which playbook + stage to run, e.g. leaf-workflow stage 4>
  Rationale:  <why this beats everything below it; cite the rung's win condition>
  Contenders: <only if the winning rung had >1 candidate — list the rejected
               ones with the one-line tie-break reason each>
```

If a rung produced exactly one candidate, `Contenders` is omitted — that is the deterministic case. If a rung produced several and the tie-break was a genuine judgment call (equal priority, equal manifest depth, no dependent-count difference), say so explicitly and present the top two for the operator to choose. Surfacing the ambiguity *is* the correct output; do not fabricate a tiebreaker.

## 5. Worked example (project state, 2026-06-16)

This example was written when a task runner and a health scanner existed. The rungs above are the current procedure. The walk below is history, kept so the shape of a recommendation is visible.

**Inputs gathered:**
- `doc-status`: all §14 nodes COMPLETE except `09-transcript-decouple` (**DRAFT**). Stray in-flight: `11-workflow-scripts/99-maintenance/01-portability` (**VERIFY**). Four `99-maintenance/00-maintenance` containers sit APPROVED (steady state).
- `/api/tasks`: COMPLETE 19, **AWAITING_HUMAN_REVIEW 1** (`d8faa4ac`, type `human_review`), FAILED 115, CANCELLED 76 (the FAILED/CANCELLED bulk is historical dispatch-experiment noise).
- Health scan (latest 2026-06-16T20:31Z): 19 findings — 12 `size`, 7 `open_issue`, **0 `schema-invalid`**.
- §11: one HIGH, strategic — "No autonomous System 4." One MEDIUM actionable — transcript coupling, specced as `09-transcript-decouple` awaiting path approval.

**Rung walk:**

- **R0 — fires.** One `AWAITING_HUMAN_REVIEW` task (`d8faa4ac`). A paused human gate holds the runner and everything queued behind it; it outranks every forward item. **Stop here.**

(Rungs below shown to demonstrate the ladder, *not* evaluated because R0 won:)
- R1 would be empty of genuine live breakage — the VERIFY node is a routine pending operator gate, not a stall, and `schema-invalid` count is 0; the 115 FAILED are historical.
- R2 would fire on `09-transcript-decouple` (DRAFT, D0 path fork awaiting operator approval — recommend: approve **path B**, the adapter boundary, per its own D1 recommendation).
- R4 would fire on `09-transcript-decouple` again (only non-COMPLETE manifest node; deps `06`/`10-orchestration` both COMPLETE → unblocked).
- R5 would fire: 12 size + 7 open_issue findings across the `01-ui` and `04-api-server` subtrees easily clear the ≥2-items-from-≥2-siblings bar — a maintenance round is warranted.
- R6 holds the standing strategic item: feed external (dependency/CLI/SDK drift) scan targets into the COMPLETE `08-alerts` push path — the first concrete System-4 step.

**Output:**

```
RECOMMENDATION
  Action:     Resolve the awaiting human-review gate (approve or reject)
  Target:     task d8faa4ac-416e-4613-b7d1-1968655b4491 (human_review)
  Rung:       R0 — operator-gating task present
  Next step:  POST /api/tasks/d8faa4ac.../approve|reject after reviewing its diff
              (leaf-workflow stage 8 if it backs a node verification)
  Rationale:  A paused human_review task holds the runner and blocks any follow-up
              work behind it; clearing the human bottleneck precedes all forward
              progress. No schema-invalid findings, so no R1 override.
  Contenders: none at R0 (single gate). Next-down once cleared: R2 — approve
              path B on 09-transcript-decouple, which is also the R4 manifest front.
```

The R0 case is fully deterministic — single gate, no tie-break. The interesting judgment lives one rung down, and the process names it (`09-transcript-decouple` is both the R2 decision *and* the R4 manifest front — same node, so no conflict; approve path B, then drive it via `leaf-workflow` from DRAFT).

> **Note:** `11-workflow-scripts/99-maintenance/01-portability` is sitting in **VERIFY** with an open `human_review` task likely attached — that single gate (R0) and that single VERIFY node (R1) are plausibly the same work item. Confirm whether task `d8faa4ac` is the gate for that node before approving blind; if so, clearing it also lands the only stray in-flight node, collapsing R0 and R1 into one action.
