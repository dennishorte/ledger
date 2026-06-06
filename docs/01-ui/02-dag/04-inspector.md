# DAG Node Inspector

**Node ID:** `01-ui/02-dag/04-inspector`
**Parent:** `01-ui/02-dag`
**Status:** PLANNED
**Created:** 2026-06-06
**Last Updated:** 2026-06-06
**Dependencies:** `01-ui/02-dag/01-data-source`

---

## Requirements

Own the right-hand detail surface for a selected DAG node: `NodeInspector.tsx`. It is opened by the canvas's `onNodeClick` (`03-rendering`) into the shell inspector and closed via the close button or `Esc` (the `01-shell` handler). It keeps the operator's spatial context — the graph stays visible while the detail shows alongside.

1. **Content.** Render the selected node's id, parent (as a link), status chip, title, `dependsOn` list, children list, and a **"View document"** link to `/docs/:nodeId`. Props: `{ node: DocNode; allNodes: DocNode[] }`.
2. **Host the workflow-progress section.** Render `01-ui/09-workflow-progress`'s `<WorkflowProgressSection node={node} allNodes={allNodes} />` below the metadata block. This child owns the *embedding contract* (props + placement); it does **not** own the section's derivation logic — that belongs to `09-workflow-progress`.
3. **Host the Dispatch button.** Render `06-agent-dispatcher`'s Dispatch affordance, gated on `authored ∧ status ∈ {APPROVED, VERIFY, DRAFT}`, with an inline `DispatchConfirmDialog` and inline error banner.
4. **Click → inspector, not navigate.** Clicking a node opens/updates the inspector rather than routing away; a "View document" link inside handles the navigate case. Clicking the subtree dashed interior does nothing (the canvas guards this).
5. `pnpm typecheck`, `pnpm lint`, `pnpm build` pass at zero output.

**Out of scope:** the `WorkflowProgressSection` internals (`09-workflow-progress`); the canvas/click wiring that *opens* the inspector (`03-rendering` supplies `onNodeClick` → `openInspector`); the data model (`01-data-source`); the Dispatch *backend* (`06-agent-dispatcher` — this child only renders and gates the button).

## Design

`NodeInspector` is a presentational component held in the shell store as `ReactNode` (`useShellStore.openInspector(content)`). It reads `node` + `allNodes`, derives the parent and dependent/children rows via `allNodes.filter(...)`, and composes: metadata block → `<WorkflowProgressSection>` → Dispatch button → "View document" link. Selecting a different node replaces the inspector content; `Esc` (attached in `AppShell` while the inspector is open) closes it.

The inspector is the shared cross-panel surface: `09-workflow-progress` embeds into it, `06-agent-dispatcher` added the Dispatch button, and `05-logs` has a pending "View task logs" affordance to add here (a reverse "what tasks claim this node?" query feeding a link to `/logs/:taskId`).

## Decisions

None yet. Governed by parent `01-ui/02-dag` Decision **D5** (click → inspector rather than navigate; inspector keeps spatial context).

## Open Issues

- **Inspector content-shape conflicts across panels.** This node ships a DAG-specific `NodeInspector`; Tasks/Docs ship their own. The shell store holds `ReactNode`, so there is no contract conflict today — but a future "inspector context registry" might be cleaner. *(Priority: LOW.)*
- **`05-logs` follow-up: "View task logs" affordance.** PRD §8.2's "accessible from the DAG node side panel" decomposes as: `05-logs` owns the `/logs/:taskId` URL contract; this inspector owns the link affordance. Wiring needs a reverse query over `useTaskList()` (a list when >1 matching task, a direct link when exactly 1). *(Priority: MEDIUM — PRD-coverage gap; small follow-up.)*

## Implementation Notes

None yet. (The inspector shipped in v1.0; `09-workflow-progress` embedded its section, `06-agent-dispatcher` added the Dispatch button. This child re-scopes the inspector surface as a standalone node; history is in the parent's Implementation Notes version table and git.)

## Verification

How completion will be confirmed:

1. Clicking a doc tile opens the inspector with id, parent link, status chip, title, `dependsOn`, children, and a working "View document" link to `/docs/:nodeId`; selecting another node updates the content; `Esc` closes it.
2. `<WorkflowProgressSection>` renders below the metadata block with the `{ node, allNodes }` contract.
3. The Dispatch button appears only for `authored ∧ APPROVED/VERIFY/DRAFT` nodes and opens its confirm dialog.
4. Clicking the subtree dashed interior does not open the inspector (canvas guard); the header strip does.
5. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero.

## Children

None.
