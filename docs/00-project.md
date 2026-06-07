# LLM Project Framework
 
**Status:** COMPLETE (PRD §14 manifest fully COMPLETE; `07-health-daemon` v2 shipped 2026-06-07)
**Version:** 0.5.9
**Last Updated:** 2026-06-07

**Changelog:** v0.2 — Added landscape research, build-vs-integrate recommendations, and reference projects.  
v0.3 — Revised scope: full orchestration framework is an explicit long-term goal.  
v0.4 — Collapsed the separate "Document Store" component into the git repo. §5 rewritten; §7 architecture diagram updated; §14 manifest note updated. Document version history, attribution, and rollback are now git-native (commit log, trailers, `git revert`).  
v0.5 — Reversed LangGraph adoption: task runner now built in-house in TypeScript on SQLite from Phase 1 (§5 rewritten; §7 diagram, §8.5, §8.6, §3 caveat updated). Closed the LangGraph resource-locking risk in §11 as N/A. Added four open issues from a v0.5 architecture review (implicit document schema, no framework/instance separation, transcript-ingestion coupling, missing parser tests). §14 build order shifted from UI-first to substrate-next.  
v0.5.1 — §8.6 Replay Mode marked deferred (out of v1 scope; event log primitive stays in the runner). §11 added "no project metadata file" open issue (sibling to schema artifact). §14 row updated to reflect 07-replay DEFERRED. Cross-doc sync: `01-ui/00-ui.md` manifest, `01-ui/10-orchestration.md` children pointer, `01-ui/05-logs.md` out-of-scope bullet, `CLAUDE.md` round-2 line. New Open Issues filed on `01-ui/02-dag.md` (floating parent node, transitive edges not reduced) and `01-ui/01-shell.md` ("untitled project" fallback).  
v0.5.2 — Five implicit decisions from the v0.5 architecture review made durable. New §7.1 (project scoping: one API server per project, CLI launcher takes path arg). New §7.2 (per-endpoint UI data-path migration strategy). §8.1 distinguishes Document DAG from Task DAG explicitly, with claims as the cross-graph link. §8.4 fleshes out the HITL approval surface (diff render, optimistic locking, inbox view, reject-with-feedback). §13 adds migration tooling, recents chooser, and replay-mode UI as named deferred items. §14 backend decomposition: replaced prose with manifest rows — `02-schema`, `03-project-metadata`, `04-api-server`, `05-task-runner`, `06-agent-dispatcher`, `07-health-daemon`, all PLANNED, with declared dependencies.  
v0.5.3 — `07-health-daemon` sequenced after `06-agent-dispatcher` (was parallel). Rationale: daemon-enqueued tasks have no executor until the dispatcher exists, and the runner's task API is better validated by one consumer at a time. §14 manifest row and build-order prose updated; `CLAUDE.md` next-focus line synced.  
v0.5.4 — Planned §14 manifest fully implemented: root status DRAFT → COMPLETE (all 7 children COMPLETE through `07-health-daemon`, 2026-06-01). §11 doc-hygiene pass: closed three open issues now resolved by COMPLETE nodes — implicit document schema (`02-schema`), no project metadata file (`03-project-metadata`), and missing `parseDocs.test.ts` (test exists and passes). Remaining open issues (self-audit reviewer persona, framework/instance separation, transcript-ingestion coupling, decomposition termination criteria) carried forward as the post-manifest backlog.
v0.5.5 — `07-health-daemon` v2 redesign: poll-based daemon with enqueue-remediation model replaced by an on-demand health scanner (report-only, durable append log, no write authority beyond findings). Root status COMPLETE → IN_PROGRESS. §6.4 superseded note updated. §11: two daemon-related HIGH issues dissolved. §14 manifest row updated.
v0.5.8 — `07-health-daemon` v2.1: replaced the `orphan` monitor with a priority-aware `open_issue` monitor. Operator review found `orphan` near-useless — it keyed on doc `lastUpdated` and "Open Issues non-empty", firing on the healthiest (COMPLETE, caveat-bearing) nodes and burying the one real HIGH bug among LOW/struck noise. v2.1 fires only on stable nodes carrying ≥1 unstruck HIGH/MEDIUM issue; no time component; `orphanThresholdDays` config removed. §6.4 + §14 monitor name synced; `CLAUDE.md` synced. Detail: 07-health-daemon D12 + v2.1 amendment.
v0.5.7 — Filed two strategic Open Issues into §11 from the VSM diagnosis (`docs/_investigations/vsm-diagnosis.md`): "No autonomous System 4" (HIGH — the autonomy ceiling; nothing scans the external environment the agents depend on) and "Passive algedonic channel" (MEDIUM — failures are logged, never pushed). Added VSM cross-references to the three existing issues findings 4 & 5 unify (self-audit, decomposition termination, parallel-worktree). §13 records "human-as-S4" as a deliberate v1 scope choice.
v0.5.6 — `07-health-daemon` v2 DRAFT → COMPLETE (2026-06-07). The v2 scanner had shipped to main 2026-06-06 with the doc still at DRAFT and no independent review; this reconciliation ran the missing clean-context implementation review + live verification (acceptance items 1–7, 9 confirmed; 8 code-present, not browser-walked) and landed the review-driven fixes: per-doc monitor-error isolation (hard-constraint gap), scanner test coverage (`scanner.test.ts` + `scanner.isolation.test.ts`, server suite 367 → 378), a stale schema default (3000 → 12000), and an unrelated app-build regression found en route (`doc_decompose` missing from `TaskTypeBadge`'s exhaustive switch). Root status IN_PROGRESS → COMPLETE — PRD §14 manifest fully COMPLETE. §6.4 + §14 monitor count corrected (four → three; staleness was dropped 2026-06-03). `CLAUDE.md` backend line synced.  
v0.5.9 — Closed the **"Decomposition termination criteria"** §11 issue (MEDIUM, VSM finding 5). New §6.6 states the canonical leaf/decompose rules — single-responsibility, the single-implementer recursion floor, the size floor, and a 4-level depth cap — and a new operator playbook `docs/_process/decomposition.md` documents the parent-decomposition procedure the leaf-workflow explicitly defers. The "recursion not operational below the leaf" gap is closed by the single-implementer rule: a node is a leaf exactly when its implementer needs no internal coordination.
 
---
 
## 1. Problem Statement
 
LLMs executing multi-step engineering tasks lack persistent reasoning provenance. They jump to implementation without adequate design documentation, cannot reliably audit what was done or why, and have no mechanism to detect when implementation diverges from intent. The result is systems that are difficult to debug, extend, or hand off.
 
This is a known and active problem in the field. The emerging practice of *spec-driven development* (SDD) addresses the documentation-first requirement, but no existing tool closes the full loop: none automatically verifies that implementation matches the original specification, records the decision-making process as a first-class artifact, or manages the lifecycle of issues discovered post-implementation within the document tree itself.
 
---
 
## 2. Goals
 
- Provide a structured framework in which LLM agents produce and maintain high-quality design documentation before and during implementation.
- Record all decisions, discovered issues, and their resolutions in co-located, versioned documents.
- Automate the detection of divergence between specification and implementation.
- Provide human operators with visibility and control over the agent workflow without requiring them to track state manually.
---
 
## 3. Scope and Phasing
 
This project is intended to grow into a full-purpose LLM orchestration framework. The documentation-first, spec-verified, DAG-scheduled approach described here is the foundation; general orchestration capabilities (arbitrary workflow types, pluggable agent runtimes, broad tool integrations) are explicit long-term goals, not out-of-scope items.
 
**Phase 1 (this PRD):** Document-driven software development workflows. Spec, implement, verify, manage issues — all within a governed document tree with a DAG task runner.
 
**Phase 2 (future PRD):** Generalize the task and document primitives to support non-code project types (research, data pipelines, writing). Expose the orchestration layer as a standalone runtime usable independently of the document framework.
 
**Phase 3 (future PRD):** Compete directly with LangGraph, CrewAI, and the Microsoft Agent Framework as a general-purpose orchestration substrate — differentiated by native documentation provenance and spec-verification that those frameworks lack.
 
The task runner is built in-house from Phase 1 (see §5). Earlier drafts proposed LangGraph as a Phase-1 substrate to be replaced later; that decision is reversed in v0.5 — LLM-assisted coding has collapsed the in-house build cost, the resource-claim model didn't fit LangGraph's typed-state graph cleanly, and shipping a dependency we plan to remove and re-implement inverts the cost-benefit. Building our own runner from the start makes Phase 3's competitive position coherent rather than self-contradictory.
 
**Permanent non-goals:**
 
- Not a code execution sandbox — assumes an existing environment for running generated code.
- Not a version control system — integrates with existing VCS rather than replacing it.
---
 
## 4. Landscape: Existing Work
 
### 4.1 What Already Exists
 
**Spec-driven development tooling** has become an active area since mid-2025. Key reference projects:
 
- **Kiro** (AWS, mid-2025, `kiro.dev`) — The closest commercial analog. An agentic IDE with specs (requirements → design → tasks), steering files (persistent coding standards loaded per project), and agent hooks (filesystem event triggers that fire agent tasks). Hooks auto-update documentation when source files change. Kiro is IDE-bound and does not expose its orchestration layer as a standalone runtime. *Steal: the hook pattern generalizes directly to our health daemon.*
- **SpecKit** (open source, community) — A per-feature document chain: `spec.md → plan.md → tasks.md`. Self-contained and traceable. Lacks cross-feature dependency tracking, spec amendment history, and any post-implementation sync loop. *Steal: the per-feature document chain structure maps cleanly onto our document node schema.*
- **MetaGPT** (`github.com/FoundationAgents/MetaGPT`) — Multi-agent framework that simulates a software company (PM, architect, engineer, QA roles). Takes a one-line requirement and outputs PRD, design, tasks, and code. Fixed linear pipeline with no recursive decomposition, no issue lifecycle, and no human intervention layer. Academically validated (ICLR 2024 oral, top 1.2%). *Steal: role specialization — different agent personas for spec review vs. implementation vs. verification.*
- **Claude Code + CLAUDE.md patterns** — The community has converged on structured markdown files as agent memory (CLAUDE.md, AGENTS.md). Several open-source templates exist for persistent memory and SDD workflows built on top of Claude Code's native Tasks system. *Relevant: our document tree is a formalization and generalization of this pattern.*
**LLM orchestration frameworks** (not SDD-specific but relevant to the task runner layer):
 
- **LangGraph** (`github.com/langchain-ai/langgraph`) — Models agent workflows as directed graphs with typed state. Most adopted multi-agent framework as of 2026. Key capabilities: built-in checkpointing (every state transition persisted), time-travel debugging (replay any prior checkpoint), human-in-the-loop interrupts (pause graph, await human input, resume across process restarts), and sub-graph composition (a complete graph becomes a node in a parent graph). Model-agnostic. *Evaluated and not adopted in v0.5 — see §5. Phase 3 competitive target.*
- **OpenAI Agents SDK** — Lightweight Python framework, provider-agnostic, focuses on tracing and guardrails. Less relevant to our DAG/persistence requirements.
- **Microsoft Agent Framework** (AutoGen + Semantic Kernel merged, GA Q1 2026) — Enterprise-focused, supports MCP and A2A protocols. More relevant if enterprise deployment is a future goal.
### 4.2 The Gap This Project Fills
 
No existing tool provides:
1. **Automated spec-to-implementation verification** — confirmed absent across all major coding agents as of early 2026.
2. **Issue lifecycle management co-located with design documents** — issues are appended to the relevant doc node, not filed in a separate tracker.
3. **Decision provenance recording** — the *why* of each design choice written into the document as a first-class artifact.
4. **Document health monitoring with queued remediation** — the daemon-plus-task-queue pattern for handling doc size, staleness, and orphaned issues.
5. **Recursive decomposition with cross-subtree dependency tracking** — SpecKit and Kiro operate per-feature in isolation with no mechanism for inter-feature dependency ordering.
---
 
## 5. Build vs. Integrate
 
### Task Runner: Build in-house (TypeScript + SQLite)
 
The task runner — DAG scheduling, resource locking, parallelism, HITL gates, event logging — is built natively in TypeScript on SQLite. No external orchestration substrate.
 
**Why not LangGraph (v0.4 reversal):**
 
- LLM-assisted coding has collapsed the build cost. Each capability LangGraph would have provided (checkpointing, replay, HITL interrupts, sub-graph composition) is 50–200 LOC against our specific task model.
- LangGraph is Python-first; the JS port lags. Our stack is TypeScript end-to-end. Adopting it means either a Python service (multi-language tax) or the lagging port.
- LangGraph's typed-state graph doesn't natively express arbitrary read/write claims on document nodes (§6.3). The mapping required workarounds, not fit — this was the unresolved HIGH-priority risk in v0.4's §11.
- LangChain-ecosystem APIs churn on minor versions. Pinning is a continuous maintenance cost.
- Phase 3 (§3) plans to compete with LangGraph as an orchestration substrate. Building Phase 1 on it is structurally incoherent — we would be shipping a dependency we plan to remove and re-implement.
 
**What we build:**
 
- **Tasks table** (SQLite): `id, type, status, deps[], claims{read[], write[]}, payload, assigned_agent, timestamps`.
- **Events table** (append-only): every status transition. Current state is a left-fold of events; replay is a `SELECT` over a historical range.
- **Scheduler tick**: pick the highest-priority task whose deps are met and whose write-claims don't conflict with any in-flight task. Set-intersection on claims is the conflict primitive.
- **HITL gate**: `human_review` tasks block scheduler advancement until the UI POSTs approval. Resume across process restarts is durable in the tasks table.
- **Doc-refactor guard** (§6.5): same set-intersection — refuse to schedule a refactor while any claim holds on the target node.
 
Estimate: 1000–1500 LOC of TypeScript plus tests. Same stack as the UI; no language boundary. Models §6.3 and §10 directly rather than working around someone else's primitives. This is also the code we would ship in Phase 2 regardless — no rip-and-replace step.
 
### Document Store: The repo

The document tree is the project's git repository — markdown files under `docs/`. No separate persistence layer.

Git already provides the four capabilities a custom store would have to provide: durable storage, version history, attribution (via commit trailers — we already use `Co-Authored-By:` and can extend with `Task-Id:` / `Resource-Claims:` trailers), and rollback (`git revert`). Cross-tree structured queries — e.g. "all HIGH-priority open issues across the tree" — are pure-function passes over a parsed `DocNode[]` that run in milliseconds at our scale; index later if the tree grows past a few thousand nodes. The browser reaches the repo through the API server, which is a thin transport over git operations, not a separate store.

What this leaves to be built fresh in the orchestration layer:

- **Task runner state** — tasks table rows (status, claims, deps), append-only event log, scheduler queue position.
- **Live log stream** — append-only, time-series, ephemeral (flat file + tailer is sufficient; promote to a real time-series store if scale demands).
- **Agent dispatch metadata** — which agent ran which task, exit status.
- **Health daemon's queued tasks** — lives in the task queue, not separately.

These are operational state for the orchestration substrate, not document storage. Conflating them under one "store" muddles the architecture; keeping each concern separate keeps each implementation simple.

**v0.2 noted that no existing tool has our document schema, section structure, or health-monitoring story — true, but those properties are *parsed* from the markdown body at read time, not persisted in a store. The schema is a markdown convention enforced by the agent contract (PRD §6.1), not a database constraint.**
 
### Agent Dispatch: Integrate with Claude Code (or any MCP-capable agent)
 
The framework should be agent-agnostic at the dispatch layer. Claude Code's native Tasks system and CLAUDE.md steering are a natural first integration target, but the dispatch interface should be defined as an MCP-compatible protocol so any agent runtime can be substituted.
 
---
 
## 6. Core Concepts
 
### 6.1 Document Tree
 
Projects are represented as a hierarchical tree of documents. Each node corresponds to a unit of work and owns a document with the following required sections:
 
| Section | Purpose |
|---|---|
| **Requirements** | What this unit must accomplish |
| **Design** | How it will be accomplished |
| **Decisions** | Architectural and implementation decisions with rationale |
| **Open Issues** | Discovered problems, unresolved questions |
| **Implementation Notes** | Observations during and after implementation |
| **Status** | Current lifecycle state of this node |
 
A node may be decomposed into child nodes. When decomposed, the parent retains its document and additionally holds a manifest of its children with declared inter-child dependencies.
 
### 6.2 Node Lifecycle
 
```
DRAFT → SPEC_REVIEW → APPROVED → IN_PROGRESS → VERIFY → COMPLETE
                                                       ↓
                                                  ISSUE_OPEN
                                                       ↓
                                              (back to APPROVED or DRAFT)

(any active state) → DEFERRED   (terminal; node removed from active roadmap)
```
 
An agent may not begin implementation until a node reaches `APPROVED`. Verification compares generated artifacts against the node's Requirements and Design sections. Failed verification transitions the node to `ISSUE_OPEN` and appends findings to the document.

`DEFERRED` is a terminal status — a deliberate decision that the node is out of scope for the current roadmap. It is distinct from `COMPLETE` (work done) and from `DRAFT` (work pending): it asserts that no further work is planned. The status row should record the version that deferred it and the rationale (e.g. `DEFERRED (v0.5.1) — out of v1 scope. <reason>`). A deferred node may be reactivated by transitioning back to any earlier state.
 
### 6.3 Task Queue and DAG
 
All work is expressed as tasks. Tasks have:
- A **type** (e.g., `spec_draft`, `spec_review`, `implement`, `verify`, `doc_refactor`, `issue_triage`, `human_review`)
- A set of **resource claims** (which document nodes they read/write)
- **Dependencies** on other tasks by ID
Tasks form a DAG. The task runner enforces dependency ordering, prevents conflicting resource access, and manages parallelism across independent subtrees.
 
Tasks are never executed immediately on creation. All work enters the queue first, including automated triggers from the health daemon.
 
### 6.4 Document Health Daemon
 
A background daemon monitors the document tree for:
- **Size threshold breaches** — a node's document exceeds a configurable token count
- **Staleness** — a node's implementation artifacts have changed since last verification
- **Orphaned issues** — open issues with no activity for a configurable period
On detection, the daemon enqueues an appropriate task (e.g., `doc_refactor`, `reverify`, `issue_triage`). It has no direct write access. This is a generalization of the agent hook pattern in Kiro, with metric-based triggers rather than filesystem events, and queued rather than immediate execution.

> **Superseded (2026-06-03 — v2 design).** The "enqueue a remediation task" model above caused the daemon to auto-dispatch unreviewed write-agents (see §11). v2 replaces the poll-based daemon entirely with an **on-demand health scanner**: operator triggers a scan via `POST /api/health/scan`; the scanner runs three monitors (size, open_issue, schema-invalid — staleness was dropped 2026-06-03; the `orphan` monitor was replaced 2026-06-07 by the priority-aware `open_issue` monitor, which fires on stable nodes carrying an unstruck HIGH/MEDIUM issue — see 07-health-daemon D12), appends findings to a durable `health_scans` log, and does nothing else — no task enqueue, no agent dispatch. The `doc_refactor` task type (§6.5) survives as an operator-initiated action. v2 shipped COMPLETE 2026-06-07. See `docs/07-health-daemon.md`.
 
### 6.5 Doc Refactor Protocol
 
When a document grows too large, a `doc_refactor` task:
 
1. Produces a structured summary section that remains in the main document.
2. Moves full historical detail (prior decisions, resolved issues, superseded designs) to an archived child document.
3. Updates all cross-references.
4. Retains a pointer from the main document to the archive.
Refactor tasks may not execute while any other task holds a resource claim on the same node.
 
### 6.6 Decomposition Termination Criteria
 
Decomposition is bounded from both ends. §6.4–§6.5 set the *upper* bound — a doc past the size threshold is a candidate to become a parent. This section sets the *lower* bound: when a node is a **leaf** and must not be split. Without it, recursive decomposition produces either unnavigable trees or sub-work that escapes coordination entirely (VSM diagnosis finding 5 — `docs/_investigations/vsm-diagnosis.md`).
 
A node is a **leaf — stop decomposing — when *any* of these hold:**
 
1. **Single responsibility.** You cannot name ≥2 prospective children with *non-overlapping data contracts*. If the split would force two children to write the same file or type, the boundary is wrong — the node stays whole and the contended surface gets one owner. This is the primary test.
2. **Single-implementer rule (the recursion floor).** One dispatched implementer can ship the node in a single worktree session *without itself having to dispatch sub-agents*. The instant an implementer would have to become an orchestrator, the node should have been a parent; if it would not, the node is a leaf. This is the operational form of Beer's recursion theorem — stop at the level that needs no internal coordination (S2/S3 of its own). It is the criterion that closes the "recursion documented, not operational below the leaf" gap.
3. **Size floor.** The DRAFT spec sits comfortably under the size threshold (§6.4, default 12 000 tokens) *and* the implementation is a bounded diff. A node that is already small gains nothing from a manifest but the overhead of one.
4. **Depth cap.** Nesting beyond **4 levels** (root → … → leaf) requires explicit written justification in the parent's Decisions section. The cap is a navigability guard, not a hard wall; exceeding it is usually a smell that an intermediate level does no real coordination work and should be collapsed.
 
Conversely, **decompose** only when the single-responsibility test fails *and* at least one of the size-floor / single-implementer tests also fails — i.e. the node carries ≥2 independent responsibilities *and* is too big or too coordination-heavy for one implementer. A single failing test is a nudge, not a mandate; prefer the smallest tree that satisfies the constraints. Operator procedure: `docs/_process/decomposition.md`.
 
---
 
## 7. System Architecture
 
```
┌─────────────────────────────────────────────────────┐
│                        UI                           │
│  DAG View │ Doc Viewer │ Log Stream │ Task Console  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                   API Server                        │
│       (thin transport over git + task runner        │
│           + log stream + agent dispatch)            │
└──────┬──────────────┬──────────────┬────────────────┘
       │              │              │
┌──────▼──────┐ ┌─────▼──────┐ ┌────▼───────────────┐
│  Task Queue │ │  Git Repo   │ │  Agent Dispatcher  │
│  + DAG mgr  │ │  (docs/)    │ │  (MCP interface)   │
└──────┬──────┘ └─────────────┘ └────────────────────┘
       │
┌──────▼──────────────────────────────────────────────┐
│        Task Runner (in-house, TS + SQLite)          │
│  Scheduling │ Resource locking │ Parallelism        │
│  Event log │ Replay │ HITL gates                    │
└──────┬──────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────┐
│               Health Daemon                         │
│  Size monitor │ Staleness │ Issue aging             │
└─────────────────────────────────────────────────────┘
```

The Git Repo box is not a service — it is the working tree itself. The API server reads/writes via git plumbing (or `simple-git` / equivalent) and exposes JSON over HTTP to the UI. Document version history is `git log`. Rollback is `git revert`.
 
### 7.1 Project Scoping
 
Each ledger instance is scoped to exactly one project. The API server takes a project path as its launch argument:
 
```
ledger /path/to/project
```
 
The launcher reads `.ledger/project.json` at that path for project identity (name, docs root, agent runtime), starts the API server scoped to that tree, and opens the browser. Multi-project usage is achieved by running multiple instances on different ports; the UI itself is single-project.
 
A "recents chooser" — a small SPA shown when `ledger` is launched without a path argument, listing previously-opened projects from `~/.ledger/recent.json` — is deferred (see §13). The v1 contract is: explicit path argument or error.
 
### 7.2 UI Data-Path Migration
 
The round-2 UI (`01-ui` children) currently consumes data via two bootstraps: `parseDocs.ts` reads the filesystem directly for document tree state; `01-ui/10-orchestration` parses Claude Code transcript JSONL for task and log-event state.
 
Both are transitional. As the API server lands, the UI migrates **per endpoint**: each TanStack Query hook (`useTask`, `useTaskList`, `useLogStream`, etc.) flips from its bootstrap source to the corresponding API endpoint in its own commit. This gives the API server real consumers to validate each endpoint against, and limits the blast radius of each migration step to one panel. Big-bang migration — deferring all UI changes until the API server is fully built — is explicitly rejected: it would land the API server with no validated consumers and concentrate refactor risk in a single PR.
 
---
 
## 8. UI Requirements
 
### 8.1 DAG Visualization
 
The framework exposes **two distinct graphs**. They have different structures and lifetimes; the UI renders them as separate views with cross-links.
 
- **Document DAG** — the static structure of the project. Nodes are document nodes (`docs/<path>/<id>.md`); edges are `dependsOn` and `parent` relations declared in children manifests. Node state is the lifecycle Status (§6.2). This is what `01-ui/02-dag` already renders.
- **Task DAG** — the dynamic execution structure. Nodes are task instances (`spec_draft`, `implement`, `verify`, `doc_refactor`, `issue_triage`, `human_review`); edges are task-level dependencies. Resource claims (§6.3) point from a task to one or more document nodes — they are the **link between the two graphs**. Task state is the runtime state (queued / in-flight / complete / blocked / awaiting-human).
 
Both views render with consistent visual status cues:
 
- **In flight** — animated/highlighted
- **Complete** — muted
- **Blocked** — dependency-highlighted
- **Needs human intervention** — prominent alert state
 
Cross-graph navigation:
 
- Clicking a task node jumps to its primary claimed document node.
- Clicking a document node shows "tasks that have ever claimed me" in the inspector, ordered by recency.
- Clicking a task node also opens the side panel with task details, claims, and live log output.
### 8.2 Live Agent Log Streaming
 
- Per-task log stream showing real-time agent activity.
- Distinguishes agent reasoning steps from tool calls from output artifacts.
- Accessible from the DAG node side panel.
### 8.3 Document Viewer
 
- Renders document nodes with section structure.
- Shows full version history with diffs between versions.
- Indicates which agent task produced each version.
- Displays staleness and open issue indicators inline.
### 8.4 Task Control Console
 
- Manual task injection: insert a task at a specified queue position with declared resource claims and dependencies.
- Breakpoint insertion: pause execution after a specified task completes. Supports inserting a `project_status_review` task type that produces a cross-tree summary before proceeding.
- Priority override: bump a queued task ahead of non-dependent tasks.
- **Approval gates.** When a task type is configured as `human_review` (or a task hits an approval breakpoint), the runner suspends the task and surfaces it for operator action. The approval surface:
  - Lists the task ID, type, and the document node(s) being claimed.
  - Shows the proposed change as a diff for `verify` and `implement` tasks (rendered with the same diff component used by `01-ui/03-docs`).
  - Shows the agent's reasoning summary if available.
  - Offers two actions: **approve** (runner resumes) and **reject with feedback** (a feedback string is recorded into the task's Open Issues and the task transitions to ISSUE_OPEN). Rejection without feedback is not allowed — the loop-back needs a reason for the next pass.
  - POSTs to a dedicated API endpoint with optimistic locking against the task's current status (rejects if the task has been moved by another actor mid-review).
  - The topbar surfaces a count of tasks awaiting approval; a dedicated inbox route lists them in priority order.
### 8.5 Rollback
 
- Any document node can be reverted to a prior version.
- Rollback enqueues a recovery task that re-queues all downstream tasks that depended on the reverted state.
- Rollback writes a revert event to the event log; downstream tasks are re-queued via dependency edges in the tasks table.
### 8.6 Replay Mode *(deferred — see v0.5.1 note below)*
 
- Step through the full history of a document subtree: document versions, task executions, agent decisions.
- Read-only; does not affect live state.
- Intended for post-mortem analysis.
- Would be implemented as a range `SELECT` over the event log, replayed into the UI as historical state.
 
*v0.5.1: deferred. The event log primitive remains in the task runner design (§5) — it's load-bearing for the runner regardless. The replay **UI** is deferred until a concrete post-mortem use case demands more than `git log` + the live logs panel (`01-ui/05-logs`) provide. Original rationale assumed near-free implementation via LangGraph's time-travel; without LangGraph the cost-benefit no longer justifies v1 inclusion. Revisit in a future PRD revision if demand surfaces.*
### 8.7 Project Health Dashboard
 
- Single-pane view of all open issues across the document tree.
- Staleness indicators: nodes where implementation artifacts have changed since last verification.
- Cumulative token cost by subtree.
- Dependency impact preview: given a proposed document edit or task injection, show which downstream tasks would be invalidated.
---
 
## 9. Document Schema
 
All document nodes conform to a versioned JSON schema. Free-form prose is permitted within defined sections, but section presence and metadata fields are required. This ensures any agent instance can parse and update documents consistently across sessions.
 
The schema is itself a first-class project artifact, versioned and stored in the document tree root. A separate child document specifies the refactor protocol — when and how documents are split or archived — so the refactor behavior is itself governed by the same documentation discipline as the rest of the project.
 
Document schema design should draw on the SpecKit per-feature chain structure (spec → plan → tasks) as a reference for what fields have proven useful in practice.
 
---
 
## 10. Key Constraints
 
- **No agent may begin implementation without an `APPROVED` node document.**
- **No task may execute without declared resource claims.**
- **No two tasks may hold conflicting write claims on the same node simultaneously.**
- **Doc refactor tasks may not execute while any other task has a claim on the target node.**
- **All daemon-triggered actions enter the queue; the daemon has no direct write access.**
---
 
## 11. Open Issues
 
- ~~**Health daemon auto-dispatches unreviewed write-agents that race the shared git index.**~~ — *Dissolved (2026-06-03) by the v2 redesign: `07-health-daemon` is now an on-demand scanner with no write authority beyond its own findings log — it enqueues no tasks and dispatches no agents. Note: worktree-isolation + `human_review` + git-index-claim remain the right model for operator-initiated write-agents generally. Detail: `docs/_investigations/e2e-dispatch-findings.md` §2.*
- ~~**MCP tools load intermittently in dispatched agents; failure silently corrupts task status.**~~ — **Largely resolved 2026-06-06 (`345dfaa`).** The "intermittent" binding was in fact deterministic: a single shared MCP transport served only the *first* agent per server boot (every later `initialize` got `-32600 "Server already initialized"`), so subsequent agents ran without `runner.*` tools and their clean exit was mis-reconciled to `FAILED:subprocess_exit_without_terminal_status`. Per-session transports fix the binding; stream-json telemetry forwarding means a run is no longer a black box even when a terminal call is missed. A live e2e `verify` confirmed reliable tool binding (77 events). Residual: a narrow claude-side turn-0 startup race remains — tracked as its own LOW Open Issue in `06-agent-dispatcher` ("Dispatched agent can miss MCP tools on turn 0"). Detail: `docs/_investigations/dispatcher-hang-issue.md` §Resolution + §Residual, and `docs/_investigations/e2e-dispatch-findings.md` §1. *(Was HIGH.)*
- ~~**Daemon-enqueued tasks starve.**~~ — *Dissolved (2026-06-03): v2 scanner enqueues no runner tasks — nothing to starve. Detail: `docs/_investigations/e2e-dispatch-findings.md` §3.*
- ~~**LangGraph resource-locking compatibility**~~ — *Closed (v0.5): N/A. LangGraph adoption reversed in favour of an in-house task runner (§5). The resource-claim model is now native to our own scheduler rather than mapped onto someone else's primitives.*
- **No autonomous System 4 (intelligence / adaptation).** 🔴 The framework has strong S1/S2/S3/S5 (operations, coordination, control, policy) but no autonomous component that scans the *external* environment the agents depend on — dependency/CLI/SDK drift, upstream API changes. All "what to build next / has the environment shifted" cognition is the human operator plus the static §14 manifest. The project's own incident history is the evidence: every dispatch break was external drift nothing watched for (`tsx watch` dropping `ANTHROPIC_API_KEY`; `claude` flags needing `--permission-mode dontAsk` + `--allowedTools`; the MCP single-transport behaviour), each caught by a human only after it broke. This is acceptable and deliberate for v1 (human-as-S4), but it is the ceiling on the project's stated autonomy ambition — the system can run a plan, it cannot re-plan itself. Any "less operator-in-the-loop" roadmap is an S4-construction roadmap. The highest-leverage first step is adjacent to the now-COMPLETE health scanner: extend it (report-only) with genuinely external scan targets plus a push/alert path (see the algedonic issue below), without ever regaining write authority over operations (the v1 daemon's fatal mistake). Backing analysis: `docs/_investigations/vsm-diagnosis.md` finding 1. *(Priority: HIGH — strategic; frames the autonomy roadmap, see §13.)*
- **Passive algedonic channel — failures are logged, never pushed.** 🟡 Critical failure signals (`RUNNING→FAILED` reasons, status_change events, the SSE log stream) are all *pull*: the operator must be looking. Nothing interrupts the operator when something is critically wrong. The canonical harm is a silently-`FAILED` task that already shipped committed work (`docs/_investigations/e2e-dispatch-findings.md` §1) — the damage is the delay before a human happens to look. With the health scanner now correctly report-only and on-demand, the absence of a push channel is sharper: nothing actively raises alarm. Candidate for a v2+ alert path (push on critical failure, or on a scan finding above a severity bar). Backing analysis: `docs/_investigations/vsm-diagnosis.md` finding 3. *(Priority: MEDIUM.)*
- **Self-audit problem** — The same agent writing the spec checks its own code against it. Partially mitigated by the leaf-workflow's "reviewer in clean context" pattern (`docs/_process/leaf-workflow.md` stages 2 and 6). Open: structured per-requirement sign-off format, and a separate reviewer-agent persona once the orchestration layer dispatches tasks. VSM diagnosis frames this as an S3\*/S4 *independence* failure and one half of the requisite-variety bottleneck (`docs/_investigations/vsm-diagnosis.md` finding 4). The 07-health-daemon reconciliation (2026-06-07) is a live instance — v2 shipped with no independent review until one was run after the fact. *(Priority: HIGH, blocks verification design)*
- ~~**Decomposition termination criteria**~~ — *Resolved (v0.5.9, 2026-06-07): explicit leaf/decompose rules now live in §6.6 — single-responsibility, the single-implementer recursion floor, the size floor, and a 4-level depth cap — with operator procedure in `docs/_process/decomposition.md`. The VSM "recursion not operational below the leaf" gap (finding 5) is closed by the single-implementer rule: a node is a leaf exactly when its implementer needs no internal coordination.*
- **Parallel-worktree shared-file conflicts (Phase-1 manual workflow only)** — When two implementers run in parallel worktrees and both touch the same file (`app/src/lib/types.ts` is the obvious shared surface as panel-specific types arrive), there is no automated coordination. The operator currently picks dispatches whose data contracts don't overlap, or accepts that the second-to-merge worktree will surface the conflict at rebase time (`docs/_process/leaf-workflow.md` stage 5). The eventual fix is §6.3's resource-claim model on the task DAG, which refuses to schedule conflicting writes. VSM diagnosis: the other half of the requisite-variety bottleneck (finding 4); a concrete sub-case is that S2's conflict primitive is blind to the repo-global git index — the very resource the v1 daemon's parallel commits raced. *(Priority: MEDIUM — mitigated by current single-operator scale; revisit when parallel dispatch frequency grows.)*
- ~~**Document schema is implicit in `parseDocs.ts`.**~~ — *Closed (v0.5.4): resolved by `02-schema` COMPLETE (v1). The first-class versioned schema artifact + validator now lives in `docs/_schemas/` and `@ledger/parser`; the parser is no longer the implicit source of truth.*
- ~~**No project metadata file.**~~ — *Closed (v0.5.4): resolved by `03-project-metadata` COMPLETE (v1). `.ledger/project.json` + loader provide project identity and scoping (§7.1); the topbar "untitled project" fallback is gone.*
- **No framework / instance separation.** The framework code (`app/`) lives inside the project it dashboards. A second project would have to copy the codebase. The framework story needs an install path that points a package at any `docs/` tree. *(Priority: MEDIUM — surfaces when the extensibility test is run.)*
- **Transcript ingestion couples the orchestration data layer to one agent runtime.** `01-ui/10-orchestration` parses Claude Code transcript JSONL. This is a bootstrap, not a target architecture; the eventual MCP-based dispatch (§5) emits a different shape. *(Priority: MEDIUM — revisit when the task runner ships and dispatch becomes the data source.)*
- ~~**No `parseDocs.test.ts`.**~~ — *Closed (v0.5.4): `app/src/lib/parseDocs.test.ts` exists and passes, plus the schema-backed parser tests in `packages/parser/test/schema/` (`parseDocNode`, `validateDocNode`) assert against the `02-schema` artifact directly.*
---
 
## 12. Reference Projects
 
| Project | Relevance | URL |
|---|---|---|
| **Kiro** (AWS) | Closest commercial analog; steal hook pattern and steering file concept | kiro.dev |
| **LangGraph** | Reference for capabilities (checkpointing, HITL, replay); evaluated and not adopted in v0.5 (§5). Phase 3 competitive target. | github.com/langchain-ai/langgraph |
| **MetaGPT** | Role specialization pattern for multi-agent SDD | github.com/FoundationAgents/MetaGPT |
| **SpecKit** | Per-feature document chain structure reference | github.com/arun-gupta/speckit (community gist) |
| **Claude Code Tasks** | Agent dispatch integration target | docs.anthropic.com/claude-code |
| **Microsoft Agent Framework** | Future enterprise deployment reference (AutoGen + Semantic Kernel) | github.com/microsoft/autogen |
 
---
 
## 13. Out of Scope / Future Consideration
 
- Multi-user collaboration (concurrent human editors)
- Agent selection / routing (which model handles which task type)
- Integration with external issue trackers (GitHub Issues, Jira)
- Cost budget enforcement (hard stop when token spend exceeds threshold)
- Support for non-code project types (research, writing, data pipelines)
- **Autonomous System 4 (environmental scanning / self-replanning)** — v1 deliberately keeps the human as S4: all "what to build next / has the external environment drifted" cognition is operator-held against the static §14 manifest. The framework can execute a plan but cannot re-plan itself. This is the ceiling on the stated autonomy ambition and the subject of two §11 issues (no autonomous S4; passive algedonic channel). Backing analysis: `docs/_investigations/vsm-diagnosis.md`.
- **Migration tooling** — an automated `ledger migrate /path/to/existing/project` command that scaffolds `.ledger/project.json` and an initial `docs/` tree from an existing repository's READMEs, structure, and history. Validated path: dogfood a second project manually first (operator follows a written checklist), then capture the checklist as a CLI command, then LLM-assist the scaffolding step. Premature today (no schema artifact to migrate *to* yet).
- **Recents chooser UI** — a small SPA shown when `ledger` is launched without a path argument. See §7.1 — v1 requires an explicit path argument.
- **Replay-mode UI** — see §8.6. The event log primitive stays in the runner; the replay UI itself is deferred until a concrete post-mortem use case demands more than `git log` + `01-ui/05-logs` can serve.

---

## 14. Children

This document is the root of the project's implementation tree. Per §6.1, parents hold a manifest of their children with declared dependencies.

| ID | Title | Depends on | Status |
|----|-------|------------|--------|
| `01-ui` | UI — operator-facing surface for the framework | — | APPROVED (round-2 manifest complete: shell + 02-dag + 03-docs + 04-tasks + 05-logs + 06-health + 08-markdown + 09-workflow-progress + 10-orchestration all COMPLETE; 07-replay DEFERRED in v0.5.1, out of v1 scope; `99-maintenance/01-round-1` COMPLETE v1 2026-05-26 — first batched maintenance pass; `02-dag` v1.3 2026-05-27 — dagre → ELK layout-engine migration per `01-ui/00-ui.md` D10) |
| `02-schema` | Document schema artifact (JSON Schema + validator; formalises what `parseDocs.ts` assumes today) | — | COMPLETE (v1) |
| `03-project-metadata` | Project metadata file (`.ledger/project.json`) and loader; provides project identity and scoping (§7.1) | — | COMPLETE (v1) |
| `04-api-server` | API server — project-scoped REST + SSE over git + runner; CLI launcher (§7.1); UI's per-endpoint migration target (§7.2) | `02-schema`, `03-project-metadata` | COMPLETE (v1, 2026-05-26 — decomposed into 5 sub-leaves: `01-workspace-conversion`, `02-parser-extraction`, `03-server-package`, `04-cli-launcher`, `05-ui-hook-migration` all COMPLETE) |
| `05-task-runner` | In-house task runner (tasks table, append-only event log, scheduler tick, HITL gates, resource claims; §5) | `04-api-server` | COMPLETE (v1, 2026-05-28 — all 5 children COMPLETE: `01-store-schema`, `02-scheduler`, `03-hitl-gate`, `04-api-endpoints`, `05-ui-hook-migration`) |
| `06-agent-dispatcher` | Agent dispatcher — MCP-based interface; Claude Code as first integration; transcript ingestion stays additive (D15) — full retirement deferred to a future node | `05-task-runner` | COMPLETE (v1, 2026-06-01 — 5-child manifest all COMPLETE; stage-8 live verification found and fixed 3 bugs: prompt templates used UUID instead of nodeId for doc-path resolution; `--permission-mode dontAsk` + `--allowedTools "mcp__ledger-runner__*"` required to unblock MCP tool calls in `--print --bare` mode; per-persona write grants (Edit/Write/Bash) added for implement/spec_draft/doc_refactor. Items 1–4, 6–8, 10 verified live; item 5 partial (no APPROVED leaf in current state); item 9 deferred to routine use. See parent Implementation Notes for full findings.) |
| `07-health-daemon` | Document health scanner — on-demand scan via `POST /api/health/scan`; three monitors (size, open_issue, schema-invalid); durable append log; report-only, no task enqueue (§6.4 v2) | `06-agent-dispatcher` | COMPLETE (v2.1, 2026-06-07 — on-demand scanner; v1 daemon deleted. DRAFT → COMPLETE reconciliation ran the missing clean-context review + live verification (acceptance 1–7, 9 ✅; 8 code-present) and landed review fixes: per-doc error isolation, scanner test coverage (367 → 378), schema default 3000 → 12000, and an unrelated `TaskTypeBadge`/`doc_decompose` app-build regression. v2.1 (same day) replaced the noisy `lastUpdated`-based `orphan` monitor with a priority-aware `open_issue` monitor (D12; suite → 381). v1 was complete-but-disabled 2026-06-01.) |

Build order is determined by the dependency edges above. Practical sequencing: `02-schema` and `03-project-metadata` can be drafted and implemented in parallel — they share no files. `04-api-server` waits for both. `05-task-runner` waits for the API server. `06-agent-dispatcher` follows the runner. `07-health-daemon` was sequenced after the dispatcher under the original v1 design (its enqueued `doc_refactor`/`reverify`/`issue_triage` tasks needed the dispatcher's executors). The v2 redesign dropped the enqueue model entirely — the scanner is report-only — so that coupling no longer applies; the sequencing is now just historical.

The git repo is the document store (§5) — it is not a buildable component, just the working tree. Today's `parseDocs.ts` and `01-ui/10-orchestration` transcript ingestion are bootstraps to be replaced as the substrate lands, per §7.2's per-endpoint UI migration strategy.
