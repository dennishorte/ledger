# Viable System Model diagnosis of the framework (2026-06-06)

A structural diagnosis of the orchestration framework through Stafford Beer's
**Viable System Model** (VSM). This is **living reference, not an implementation
node**, and **not** a proposal to adopt VSM as architecture — we are not renaming
modules `S1`/`S3*` or reorganising the repo around the five systems. VSM is used
here only as a *diagnostic checklist*: it has a thin, mostly-diagnostic track
record (its flagship case, Chile's Project Cybersyn, was cut short by a coup; it
never reached mainstream management adoption; the standard academic critique is
that it is "unitary and functionalist," blind to human politics). That last
critique mostly **evaporates here** — our S1 units are LLM agents, not people with
competing worldviews, so the mechanistic frame is a fit rather than a defect. The
political/human dimension relocates to the S5 boundary (operator intent, trust,
oversight), which is exactly where we already put human-judgment machinery.

The value of the exercise is the diagnosis below, not the ontology. Severity tags
denote **viability risk**, not immediate-harm — a missing function may be entirely
by-design for v1 yet still be the binding constraint on the project's stated goal.

## The mapping

VSM claims a viable system needs five functions plus two structural invariants.
Mapped onto this framework:

| Function | Role | Where it lives | Health |
|---|---|---|---|
| **S1** Operations | Primary units that produce the product | Dispatched `claude` agents (implement / spec_draft / doc_refactor executors) | ✅ Present |
| **S2** Coordination | Damps oscillation between S1 units sharing resources | Scheduler conflict primitive — `ResourceClaim` set-intersection (`server/src/runner/conflict.ts`, §6.3) | 🟡 Present, but blind to the git index |
| **S3** Control | Resource allocation, here-and-now regulation of S1 | Runner/scheduler tick trampoline (`server/src/runner/scheduler.ts`) | ✅ Present |
| **S3\*** Audit | Sporadic *direct* inspection of S1, bypassing normal reporting | Health daemon → v2 on-demand scanner (`07-health-daemon`) | 🟢 Was miswired (v1); v2 redesign is the correct shape |
| **S4** Intelligence | Environmental scanning, adaptation, planning ("outside-and-future") | **Human operator + static PRD §14 manifest only** | 🔴 No autonomous S4 |
| **S5** Policy | Identity, ethos, arbitrates S3↔S4 | PRD (`00-project.md`), APPROVED gate, HITL gate, `CLAUDE.md` constraints | ✅ Present (human-held) |
| **Recursion** | Every viable system contains viable systems, *same structure* | Recursion-invariant doc schema (§6.1); identical lifecycle per node | 🟡 Documented; not operational below the leaf |
| **Algedonic** | Pain/alarm signal that interrupts S5, bypassing the hierarchy | Failure reasons + status_change events + SSE log stream | 🟡 Passive — logged, never pushed |

## Strengths the lens confirms

Radical candor cuts both ways; several of these are genuinely well-built.

- **The recursion-invariant doc schema is Beer-grade.** Every node carries the same
  six sections and the same DRAFT→COMPLETE lifecycle; the parent/child manifest
  *is* the recursion relation. Few real systems instantiate Beer's recursion
  theorem this cleanly.
- **S2 is real and working.** The `ResourceClaim` set-intersection is a genuine
  anti-oscillator on logical node writes. Most agent-orchestration frameworks have
  no S2 at all and suffer exactly the write-races the v1 daemon went on to prove
  are fatal.
- **The APPROVED gate is a clean S5→S1 policy constraint** — no operation begins
  without policy sanction (§10). That is precisely Beer's "S1 autonomy bounded by
  cohesion requirements."
- **The HITL gate is a deliberate variety attenuator** at the S5 boundary
  (`05-task-runner/03-hitl-gate`).

## Findings

### 1. 🔴 STRUCTURAL — No autonomous System 4 (intelligence / adaptation)

The framework has strong S1/S2/S3/S5 and **no autonomous S4**. All "what to build
next / has the external environment changed" cognition is the human operator plus
the static PRD §14 manifest. S4 exists, but it is entirely *human* and entirely
*internal-facing*: there is no component that scans the environment the agents
depend on.

Beer's prediction for an S4-deficient system is exact — it executes a plan well in
a stable environment and **fails when the environment shifts**. The project's own
incident history is the proof: the dispatch loop has repeatedly broken on
*external* drift that nothing watches for — `tsx watch` dropping `ANTHROPIC_API_KEY`
on reload (`e2e-dispatch-findings.md` §4), `claude` CLI flags needing
`--permission-mode dontAsk` + `--allowedTools` to unblock MCP in `--print --bare`
mode (`06-agent-dispatcher` stage-8), the MCP SDK's "already initialized"
single-transport behaviour (`dispatcher-hang-issue.md`). Each was caught by a human
after it broke, never anticipated.

For a project whose *thesis* is autonomous LLM orchestration, this is the headline:
**the stated ambition is gated on a function the system has not built.** This is
acceptable and correct for v1 (human-as-S4 is a deliberate scope choice), but it is
the ceiling on autonomy — the system can run a plan, it cannot re-plan itself. Any
roadmap toward "less operator-in-the-loop" is, in VSM terms, an S4-construction
roadmap whether or not it is named that.

### 2. 🟢 DIAGNOSED — System 3\* (audit) was miswired in v1; the v2 redesign is the correct shape

The health daemon is structurally the audit channel (S3\* — sporadic direct
inspection of S1). The v1 daemon failed live (`e2e-dispatch-findings.md` §2–§3) and
the model explains *why* with precision: it committed two coupled pathologies.

- **Audit-channel-as-command.** S3\* is supposed to *observe* S1 and feed findings
  upward; the v1 daemon instead *dispatched write-agents* — it commanded S1. An
  audit function with write authority over operations is a textbook VSM pathology;
  it produced ~24 unreviewed agents racing the git index.
- **S2 bypass.** It enqueued via raw `store.createTask` (`server/src/daemon/index.ts`),
  not through the scheduler, so its work never passed the S2 conflict primitive and
  starved/oscillated (flooded when busy, inert when idle).

The **v2 redesign** (`07-health-daemon`, DRAFT 2026-06-03: on-demand scanner,
append-only findings log, **report-only, enqueues nothing**) is exactly the
VSM-correct fix — audit observes and reports, never commands. This finding is
recorded not as an open problem but because the cybernetic framing retroactively
justifies the v2 direction and names the principle to hold the line on: **S3\* must
remain observe-only; remediation is an S5/operator decision, routed through S2/S3.**

### 3. 🟡 PASSIVE ALGEDONIC CHANNEL — failures are logged, not pushed

Beer's algedonic channel exists to *interrupt* S5 when something is critically
wrong, short-circuiting the normal hierarchy. Here, the equivalent signals
(`RUNNING→FAILED` reasons, status_change events, the SSE stream) are all **pull**:
S5 (the operator) must look. The MCP stream-json telemetry work (`345dfaa`) made
runs observable, and the v2 daemon's scan is operator-triggered — but observability
is not alerting. There is currently **no path by which a critical failure interrupts
the operator.** With S3\* now correctly report-only and on-demand, the absence of a
push channel is sharper: nothing actively raises alarm. A silently-`FAILED` task
that shipped committed work (`e2e-dispatch-findings.md` §1) is the canonical case —
the harm is the delay before a human happens to look.

### 4. 🟡 REQUISITE-VARIETY BOTTLENECK — S3/S4/S5 collapsed into one human

Ashby's Law: a regulator must command at least as much variety as what it
regulates. The operator currently holds S3 (partly), all of S4, and all of S5. As
concurrent dispatch scales (high-variety S1), the human becomes the variety
ceiling. The existing attenuators are real but one-sided: the HITL gate and the S2
conflict primitive *reduce* S1 variety reaching the operator; nothing *amplifies*
the operator's variety. Two existing §11 issues are symptoms of this single
pathology — **"Self-audit problem"** (HIGH: the spec-author checks its own work — an
S3\*/S4 *independence* failure, not just a review-quality one) and
**"Parallel-worktree shared-file conflicts"** (MEDIUM, explicitly "mitigated by
current single-operator scale"). Both bite harder the moment dispatch parallelism
grows. The VSM-shaped escape is to *amplify S5* (encode more policy as automated
gates so the human adjudicates less) and *further attenuate S1* (richer automated
review before the human gate, e.g. a separate reviewer-agent persona — already
flagged under "Self-audit problem").

A concrete sub-case: **S2 is blind to the git index.** The conflict primitive
regulates logical node writes (§6.3) but not the repo-global git index lock, which
is exactly the shared resource that the v1 daemon's parallel commits raced. An S2
that doesn't model every contended resource is an incomplete anti-oscillator; the
right model (worktree isolation + land-via-`human_review` + claim the index as a
resource) is already noted in §11 but unbuilt.

### 5. 🟡 RECURSION DOCUMENTED, NOT OPERATIONAL BELOW THE LEAF

The doc tree is recursively structured, but the *machinery* (scheduler, dispatcher,
daemon) operates at a single level — it dispatches leaf agents. A dispatched agent
that itself spawns sub-work is **not modeled as its own viable system** with its own
S2 conflict primitive, S3 control, or S5 policy. This is the gap between a
*hierarchical task tree* (what the runner implements) and a *recursive viable
system* (what the doc schema promises). It connects to the open
**"Decomposition termination criteria"** issue (§11, MEDIUM): without rules for when
a node is too small to be its own viable unit, recursive decomposition produces
either unnavigable trees or sub-work that escapes coordination entirely. Today this
is latent — single-level dispatch is the actual scale — but it is the structural
debt that comes due when agents start decomposing their own tasks.

## Disposition — where these become issues of record

`_investigations/` is backing analysis only; issues of record live in the owning
node's Open Issues and the PRD §11 roll-up. Proposed homes (not yet filed):

| # | Finding | Owning node | Status |
|---|---|---|---|
| 1 | No autonomous S4 | `00-project.md` §11 (new) + §13 scope note | New — strategic, frames the autonomy roadmap |
| 2 | S3\* miswiring | `07-health-daemon` | Already addressed by v2 redesign; this doc is the rationale |
| 3 | Passive algedonic channel | `07-health-daemon` and/or `05-task-runner` | New — candidate for v2+ (push/alert on critical failure) |
| 4 | Variety bottleneck | `00-project.md` §11 ("Self-audit", "Parallel-worktree") | Existing issues; this unifies them under one cause |
| 5 | Recursion not operational | `00-project.md` §11 ("Decomposition termination criteria") | Existing issue; this names the structural form |

The single highest-leverage move the lens points at: a **read-only S4/S3\* observer
that pushes algedonic alerts to the operator** — i.e. the v2 daemon's scanner
(report-only, correct) extended with (a) a push/alert path (finding 3) and (b)
genuinely *external* scanning targets (finding 1: dependency/CLI/SDK drift), without
ever regaining write authority over S1 (the v1 mistake).
