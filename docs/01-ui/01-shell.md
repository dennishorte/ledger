# UI Shell

**Node ID:** `01-ui/01-shell`
**Parent:** `01-ui`
**Status:** APPROVED
**Created:** 2026-05-22
**Last Updated:** 2026-05-22

---

## Requirements

Deliver a runnable Vite + React + TypeScript app whose sole purpose is to prove out the layout, routing, and navigation defined in `01-ui`. No real data; no API integration; no domain logic. Each route renders an empty-state placeholder.

When an operator runs `pnpm dev` and opens the local server, they must see:

1. A **left sidebar** with entries: DAG, Documents, Tasks, Health.
2. A **top bar** with a project-name placeholder, three numeric status chips (queue depth, in-flight, open issues — rendered as `—`), and a disabled command-palette button.
3. A **main content area** that swaps based on the current route, each route showing a clearly labeled empty state.
4. A **right-hand inspector panel** that opens on demand (a debug "Open inspector" button on `/dag` is sufficient) and closes via close-button or `Esc`.
5. A **status bar** at the bottom showing the build version and a connection-status placeholder (`offline` literal for now).
6. Working navigation: clicking each sidebar entry routes to the corresponding panel; the active item is visually marked.
7. Deep-link routes for `/logs/:taskId`, `/docs/:nodeId`, and `/replay/:subtree` resolve to placeholder panels (no sidebar entry; reachable by URL).
8. `pnpm typecheck` and `pnpm lint` both exit zero.

**Out of scope for this node:**
- Any real data fetching or websocket/SSE connections.
- Any panel content beyond an empty state (no DAG rendering, no markdown rendering, no diff view, no log streaming).
- Authentication, multi-user, or persistence beyond local UI preferences.
- Any backend or API server work.

---

## Design

### Layout

```
┌────────────────────────────────────────────────────────────┐
│ Topbar: project name • status chips • cmd palette button   │
├──────────┬──────────────────────────────────┬──────────────┤
│ Sidebar  │ Main (route outlet)              │ Inspector    │
│          │                                  │ (collapsible)│
│ ▸ DAG    │                                  │              │
│ ▸ Docs   │                                  │              │
│ ▸ Tasks  │                                  │              │
│ ▸ Health │                                  │              │
│          │                                  │              │
├──────────┴──────────────────────────────────┴──────────────┤
│ Status bar: version • connection state placeholder         │
└────────────────────────────────────────────────────────────┘
```

- Sidebar: 240px expanded, 56px collapsed (icon rail).
- Topbar: 48px.
- Inspector: 360px when open, 0 when closed (inline slide, not overlay).
- Status bar: 24px.
- Main area: fills remainder; scrolls internally.

### Routes

| Path | Component | Empty-state copy |
|------|-----------|------------------|
| `/` | redirect → `/dag` | — |
| `/dag` | `DagPanel` | "No tasks yet. The DAG appears here once tasks are enqueued." |
| `/docs` | `DocsPanel` | "No document nodes yet. The document tree appears here." |
| `/docs/:nodeId` | `DocViewerPanel` | "Document `:nodeId` not found." |
| `/tasks` | `TaskConsolePanel` | "Task queue empty." |
| `/logs/:taskId` | `LogStreamPanel` | "No logs for task `:taskId`." |
| `/health` | `HealthDashboardPanel` | "Health dashboard — no signals yet." |
| `/replay/:subtree` | `ReplayPanel` | "Replay of subtree `:subtree` — no history captured." |
| `*` | `NotFoundPanel` | "Route not found." |

### Components (this node)

- `AppShell` — root layout; composes Topbar, Sidebar, Outlet, Inspector, StatusBar.
- `Topbar` — project name placeholder, three `StatusChip`s, palette button (disabled).
- `Sidebar` — navigation list using React Router's `NavLink` for active-state styling; collapse toggle.
- `Inspector` — right-side panel; open-state and content controlled by `useShellStore`.
- `StatusBar` — version from `import.meta.env.VITE_APP_VERSION`, connection literal `offline`.
- `EmptyState` — reusable: icon slot, title, optional description. Will be reused as loading/error fallback once data arrives.
- Per-route panel components — each renders `<EmptyState />` plus, where useful, a single debug affordance (e.g., "Open inspector" button on `/dag`).

### Stores

```ts
// src/stores/shell.ts
interface ShellState {
  sidebarCollapsed: boolean;
  inspectorOpen: boolean;
  inspectorContent: ReactNode | null;
  toggleSidebar: () => void;
  openInspector: (content: ReactNode) => void;
  closeInspector: () => void;
}
```

Persist `sidebarCollapsed` to localStorage via Zustand `persist` middleware. Nothing else persists from this node.

### Styling tokens

`globals.css` defines CSS variables for `--color-surface`, `--color-fg`, `--color-muted`, `--color-accent`, `--color-danger`, `--color-warning`, `--color-success` in a single `:root` block. Cream surface is a warm off-white in the `oklch(0.97 0.015 80)` / `#FAF7F0` neighborhood with a near-black foreground and a muted ink for secondary text. No `data-theme` attribute, no alternate-theme block.

### Acceptance check (manual)

A reviewer running `pnpm dev` must be able to:

- Land on `/dag` after navigating to `/`.
- Click every sidebar entry and see the corresponding empty-state panel; active item is visually marked.
- Toggle sidebar collapse and confirm the preference survives a reload.
- Open and close the inspector on `/dag` via button and via `Esc`.
- Manually visit `/docs/foo`, `/logs/foo`, `/replay/foo`, `/nonexistent` and see the appropriate placeholders.
- Open DevTools Network tab and confirm no requests are made beyond the Vite dev server (no errant API calls).
- Confirm `pnpm typecheck` and `pnpm lint` both pass with zero output.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Inspector is part of the shell, not per-route | DAG, Tasks, and Docs all need contextual detail; centralizing avoids duplicated drawer logic across panels. |
| D2 | Sidebar collapse persisted to localStorage | Operator preference, near-zero cost with Zustand `persist`. |
| D3 | Cream theme only | Single theme; no `data-theme` attribute, no theme-switching infrastructure, no dark-mode token set. |
| D4 | Empty states are real components, not throwaway strings | Reused as loading/error fallbacks once data fetching arrives in child nodes. |
| D5 | No mock data in this node | Forces every subsequent panel node to define its own data contract instead of inheriting fixtures. |
| D6 | `Inspector` content is `ReactNode` held in the store, not a route slot | Lets any component anywhere in the tree open the inspector without route-level plumbing; appropriate trade-off for an internal operator tool. Revisit if SSR is ever introduced. |

---

## Open Issues

- **Command-palette implementation.** Stub button only here. A later node integrates `cmdk` once the command surface is defined. *(Defer.)*
- **Keyboard shortcut registry.** Only `Esc`-to-close-inspector in this node. A future node introduces a global shortcut registry. *(Defer.)*
- **Responsive behavior.** This is a desktop operator tool; mobile/tablet support is explicitly not required. Confirm with stakeholder, then close. *(Priority: LOW.)*

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. Every route in the table above resolves and renders its placeholder.
2. The full acceptance-check list under Design passes.
3. `pnpm typecheck` and `pnpm lint` exit zero with no warnings.
4. No network calls leave the app at startup (DevTools Network tab is empty besides Vite dev-server traffic).
5. `src/lib/types.ts` declares no domain types yet — the shell remains content-free, as required.
6. The sidebar collapse preference survives a full page reload.

---

## Children

None. This node is a leaf for now; per-panel nodes will be added as siblings under `01-ui` (e.g., `02-dag`, `03-docs`, `04-tasks`, `05-logs`, `06-health`, `07-replay`) once this is APPROVED and the data contracts in `src/lib/types.ts` start to take shape.
