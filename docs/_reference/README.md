# docs/_reference — current-state reference docs

**What this is:** a curated layer describing the system as it exists today —
module maps, data contracts, invariants, entry points. Tables and claims, not
narrative.

**What it is not:** history. The node docs (`docs/NN-*`) are the append-only
audit trail — decisions, review findings, abandoned directions. Do not
retroactively clean them, and do not copy them here. `docs/_investigations/`
is point-in-time analysis backing an Open Issue. This folder is present tense
only, rewritten when reality changes. [`13-reference-layer`](../13-reference-layer.md).

These files are framework-internal. Any `docs/` path with an `_`-prefixed
directory segment is skipped by the parser (`packages/parser/src/schema/parseDocNode.ts`,
`packages/parser/src/docs/buildDocGraph.ts`),
so nothing here appears in the document graph or carries a lifecycle status.

## Index

| Doc | Subsystem | Owns |
|---|---|---|
| [`parser.md`](parser.md) | `@ledger/parser` | Doc schema, doc graph, shared domain types |
| [`api-server.md`](api-server.md) | `@ledger/server` HTTP + CLI | Routes, boot, `ProjectContext` |
| [`task-runner.md`](task-runner.md) | SQLite runner | Tasks, events, scheduler, human review |
| [`dispatcher.md`](dispatcher.md) | Agent dispatch | MCP tools, `claude` subprocess, prompts |
| [`health-scanner.md`](health-scanner.md) | On-demand scanner | Size, open-issue, schema-invalid findings |
| [`workflow.md`](workflow.md) | Operator playbooks + scripts | Leaf workflow stages, `project.json` `workflow` block |

## Rules

1. One doc per subsystem, structured: module map / entry points / data
   contracts / state surfaces / invariants / active migration.
2. Every non-obvious claim cites its owning node id or a source file, so a
   promoting node can grep this directory for the paths or the id it touched.
3. Prefer generated tables over hand-written lists. Each doc records the
   command that regenerates its tables. Line counts are `wc -l` at the
   **Last verified** commit and will drift; regenerate rather than editing
   them by hand.
4. Each doc carries a **Last verified** commit: `git rev-parse HEAD` run
   immediately before the update is committed. A doc never names the commit
   it lives in. Updates do not ride merge commits; if one must, stamp
   `git rev-parse MERGE_HEAD`.
5. Creating a doc is opt-in and needs no approval. Leaf-workflow stage 9
   checks whether a promoting node's diff touched anything a doc here cites,
   and folds a stale-section fix into the promotion commit. A maintenance
   round treats a doc whose cited files changed after its stamp as punch-list
   material (`git log <stamp>..HEAD -- <cited paths>`).
