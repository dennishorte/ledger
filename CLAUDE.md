# Claude/agent briefing — LLM Project Framework

This repo is the implementation of an LLM project framework: a document-driven, spec-verified workflow system for orchestrating LLM-driven software engineering. The framework is being built using its own discipline — every implementation node is governed by a doc in `docs/` that tracks status, decisions, and verification through its lifecycle.

## Start here

- **`docs/00-project.md`** — project root / PRD. Read first for vision, scope, and architectural decisions. Its §14 holds the top-level children manifest.
- **`docs/01-ui/00-ui.md`** — UI parent doc. Stack decisions, project layout, conventions, and the UI children manifest (current node + planned round-2 panels).
- **`docs/process/leaf-workflow.md`** — standardised operator playbook for taking a leaf node from PLANNED through COMPLETE. Read before driving a node through its lifecycle.
- The implementation lives at **`app/`** (Vite + React + TS).

## Documentation discipline

Every node in `docs/` follows the schema laid out in PRD §6.1:

- **Required sections:** Requirements, Design, Decisions, Open Issues, Implementation Notes, Status.
- **Lifecycle (§6.2):** DRAFT → SPEC_REVIEW → APPROVED → IN_PROGRESS → VERIFY → COMPLETE (or → ISSUE_OPEN → back).
- Parents hold a children manifest with declared dependencies.
- No agent may begin implementation until a node reaches APPROVED (§10).

**To find current focus:** walk the children manifests starting at `docs/00-project.md` §14 and descend through Status fields. The most-recently-advanced leaf node tells you where work currently lives.

## Running the app

```bash
pnpm -C app install
pnpm -C app dev          # http://localhost:4179
pnpm -C app typecheck
pnpm -C app lint
pnpm -C app build
```

Dev server is pinned to **port 4179** in `app/vite.config.ts` with `strictPort: true` (chosen because the default 5173 collides with other local projects).

## Hard constraints worth not forgetting

- **Single cream theme only** — no dark mode, no `data-theme` attribute, no alternate token block.
- **React Router v7** (not TanStack Router — that was reversed for community depth; see `docs/01-ui/00-ui.md` D3).
- **TypeScript strict + `noUncheckedIndexedAccess`.** No `any`.
- **Domain types in `src/lib/types.ts` arrive panel-by-panel.** First contributor was `02-dag` (`NodeId`, `NodeStatus`, `DocNode`). Add only what your panel needs; later panels refine.
- **No mock data** at the shell level; each panel node defines its own data contract.

## Process notes

- Status transitions are tracked in the node's own doc. Update both the doc's `**Status:**` header AND the parent's children manifest when transitioning.
- Implementation Notes is where pinned versions, deviations from spec, and follow-up items belong — not the commit message.
- **`docs/process/`** holds operator playbooks and other process documentation (e.g., `leaf-workflow.md`). These docs do **not** have a `**Node ID:**`, `**Parent:**`, or lifecycle `**Status:**` — they are LIVING reference material, not implementation nodes. `parseDocs.ts` skips this subtree so process docs do not appear in the DAG. Future runbooks, glossaries, and decomposition playbooks go here too.
- Round-2 UI panels (`02-dag`, `03-docs`, `06-health`, `08-markdown`, `09-workflow-progress`, and `10-orchestration` COMPLETE; `04-tasks` + `05-logs` APPROVED for parallel-worktree dispatch; `07-replay` deferred pending doc-versioning) are designed for parallel dispatch in isolated git worktrees now that the shell is COMPLETE. `03-docs` consumes `08-markdown` via the `<MarkdownBody>` contract; `09-workflow-progress` embeds in `02-dag`'s `NodeInspector`; `04-tasks` and `05-logs` consume `10-orchestration`'s data layer; `05-logs` additionally consumes `08-markdown` for `reasoning` event bodies and the three soft color tokens that `04-tasks` introduces. See `docs/01-ui/00-ui.md` Children section.

## When in doubt

The doc tree is the source of truth. If the code and a doc disagree, either the doc wins or the doc needs to be updated to reflect a deliberate change — never silently. Decisions made in conversation that aren't in the docs are not durable; persist them.
