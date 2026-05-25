# LLM Project Framework
 
**Status:** Draft  
**Version:** 0.5  
**Last Updated:** 2026-05-25  
**Changelog:** v0.2 — Added landscape research, build-vs-integrate recommendations, and reference projects.  
v0.3 — Revised scope: full orchestration framework is an explicit long-term goal.  
v0.4 — Collapsed the separate "Document Store" component into the git repo. §5 rewritten; §7 architecture diagram updated; §14 manifest note updated. Document version history, attribution, and rollback are now git-native (commit log, trailers, `git revert`).  
v0.5 — Reversed LangGraph adoption: task runner now built in-house in TypeScript on SQLite from Phase 1 (§5 rewritten; §7 diagram, §8.5, §8.6, §3 caveat updated). Closed the LangGraph resource-locking risk in §11 as N/A. Added four open issues from a v0.5 architecture review (implicit document schema, no framework/instance separation, transcript-ingestion coupling, missing parser tests). §14 build order shifted from UI-first to substrate-next.
 
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
```
 
An agent may not begin implementation until a node reaches `APPROVED`. Verification compares generated artifacts against the node's Requirements and Design sections. Failed verification transitions the node to `ISSUE_OPEN` and appends findings to the document.
 
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
 
### 6.5 Doc Refactor Protocol
 
When a document grows too large, a `doc_refactor` task:
 
1. Produces a structured summary section that remains in the main document.
2. Moves full historical detail (prior decisions, resolved issues, superseded designs) to an archived child document.
3. Updates all cross-references.
4. Retains a pointer from the main document to the archive.
Refactor tasks may not execute while any other task holds a resource claim on the same node.
 
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

The Git Repo box is not a service — it is the working tree itself. The API server reads/writes via git plumbing (or `simple-git` / equivalent) and exposes JSON over HTTP to the UI. Document version history is `git log`. Rollback is `git revert`. Replay-mode walks commit history.
 
---
 
## 8. UI Requirements
 
### 8.1 DAG Visualization
 
- Render the full task DAG with node status indicated visually:
  - **In flight** — animated/highlighted
  - **Complete** — muted
  - **Blocked** — dependency-highlighted
  - **Needs human intervention** — prominent alert state
- Each DAG node links to its associated document node.
- Clicking a task node opens a side panel with task details, resource claims, and log output.
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
- Approval gates: task types configured as `human_review` present a diff and require explicit approval before the runner proceeds.
### 8.5 Rollback
 
- Any document node can be reverted to a prior version.
- Rollback enqueues a recovery task that re-queues all downstream tasks that depended on the reverted state.
- Rollback writes a revert event to the event log; downstream tasks are re-queued via dependency edges in the tasks table.
### 8.6 Replay Mode
 
- Step through the full history of a document subtree: document versions, task executions, agent decisions.
- Read-only; does not affect live state.
- Intended for post-mortem analysis.
- Implemented as a range `SELECT` over the event log, replayed into the UI as historical state.
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
 
- ~~**LangGraph resource-locking compatibility**~~ — *Closed (v0.5): N/A. LangGraph adoption reversed in favour of an in-house task runner (§5). The resource-claim model is now native to our own scheduler rather than mapped onto someone else's primitives.*
- **Self-audit problem** — The same agent writing the spec checks its own code against it. Partially mitigated by the leaf-workflow's "reviewer in clean context" pattern (`docs/process/leaf-workflow.md` stages 2 and 6). Open: structured per-requirement sign-off format, and a separate reviewer-agent persona once the orchestration layer dispatches tasks. *(Priority: HIGH, blocks verification design)*
- **Decomposition termination criteria** — Need explicit rules for when a node is too small to decompose further (minimum task size, depth limit, complexity threshold). Without this, recursive decomposition produces unnavigable trees. *(Priority: MEDIUM)*
- **Parallel-worktree shared-file conflicts (Phase-1 manual workflow only)** — When two implementers run in parallel worktrees and both touch the same file (`app/src/lib/types.ts` is the obvious shared surface as panel-specific types arrive), there is no automated coordination. The operator currently picks dispatches whose data contracts don't overlap, or accepts that the second-to-merge worktree will surface the conflict at rebase time (`docs/process/leaf-workflow.md` stage 5). The eventual fix is §6.3's resource-claim model on the task DAG, which refuses to schedule conflicting writes. *(Priority: MEDIUM — mitigated by current single-operator scale; revisit when parallel dispatch frequency grows.)*
- **Document schema is implicit in `parseDocs.ts`.** §9 calls for a first-class versioned schema artifact in the document tree root; today it lives in a 245-line untested parser. New projects adopting the framework must match the exact section conventions or break parsing — blocks the "framework, not template" story. *(Priority: HIGH. Owner-node: document schema artifact, to be drafted as a child of this PRD.)*
- **No framework / instance separation.** The framework code (`app/`) lives inside the project it dashboards. A second project would have to copy the codebase. The framework story needs an install path that points a package at any `docs/` tree. *(Priority: MEDIUM — surfaces when the extensibility test is run.)*
- **Transcript ingestion couples the orchestration data layer to one agent runtime.** `01-ui/10-orchestration` parses Claude Code transcript JSONL. This is a bootstrap, not a target architecture; the eventual MCP-based dispatch (§5) emits a different shape. *(Priority: MEDIUM — revisit when the task runner ships and dispatch becomes the data source.)*
- **No `parseDocs.test.ts`.** The UI's entire view of the world derives from this parser; a regex regression silently invalidates every panel. *(Priority: HIGH — trivial to fix; do alongside the schema artifact node so tests assert against the schema.)*
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

---

## 14. Children

This document is the root of the project's implementation tree. Per §6.1, parents hold a manifest of their children with declared dependencies.

| ID | Title | Depends on | Status |
|----|-------|------------|--------|
| `01-ui` | UI — operator-facing surface for the framework | — | APPROVED (round-2 manifest complete: shell + 02-dag + 03-docs + 04-tasks + 05-logs + 06-health + 08-markdown + 09-workflow-progress + 10-orchestration all COMPLETE; 07-replay deferred pending doc-versioning) |

Backend components named in §7 (document schema artifact, API server, in-house task runner, agent dispatcher, health daemon) are not yet decomposed into child nodes; they will be added here as their specs are drafted. The git repo is the document store (§5) — it is not a buildable component, just the working tree.

**Build-order shift (v0.5):** earlier this PRD prioritised completing the UI tree first. With the round-2 UI manifest COMPLETE and the v0.5 architecture review surfacing an unbuilt substrate plus framework-vs-instance gaps (§11), the next focus shifts to the backend. Suggested ordering: (a) document schema artifact — unblocks parser tests, validation, and the framework-vs-template story; (b) API server — defines the real data contract `01-ui` will eventually consume; (c) in-house task runner — implements §6.3 resource claims and HITL natively; (d) agent dispatcher and health daemon follow. Today's `parseDocs.ts` and `01-ui/10-orchestration` transcript ingestion are bootstraps to be replaced as the substrate lands.
