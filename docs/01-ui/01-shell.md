# UI Shell

**Node ID:** `01-ui/01-shell`
**Parent:** `01-ui`
**Status:** COMPLETE
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
- **Topbar shows "untitled project" — no project metadata source.** The topbar's project-name slot is hardcoded to a fallback string because nothing currently provides project identity. Needs to read from a project metadata file at the project root (e.g., `.ledger/project.json` with `name`, `docs`, `agent` fields — see PRD §11). Blocks on the metadata file's spec; UI work is a one-line fetch + render. *(Priority: MEDIUM — visible to every user on every page; fix follows the metadata-artifact node.)*

---

## Implementation Notes

### Pinned versions (declared in `app/package.json`)

| Library | Version |
|---|---|
| React | ^19.0.0 |
| React DOM | ^19.0.0 |
| React Router | ^7.1.1 |
| TanStack Query | ^5.62.7 |
| Zustand | ^5.0.2 |
| Tailwind CSS | ^4.0.0-beta.7 |
| @tailwindcss/vite | ^4.0.0-beta.7 |
| Vite | ^6.0.5 |
| TypeScript | ^5.7.2 |
| typescript-eslint | ^8.18.2 |
| ESLint | ^9.17.0 |
| lucide-react | ^0.468.0 (icons only) |
| clsx + tailwind-merge | ^2.1.1 / ^2.5.5 (for the `cn()` helper) |

pnpm pinned via `packageManager: "pnpm@9.15.0"`.

### Key implementation choices

- **shadcn primitives copied in:** only a minimal `Button` lives under `src/components/ui/`. The inspector slide uses a Tailwind `transition-[width]` rather than a Radix `Sheet` — simpler, no overlay, and the shell doc explicitly allows the plain-transition path.
- **Router**: declarative `createBrowserRouter` in `src/router.tsx`. `Root.tsx` is the layout route, renders `AppShell` which itself renders `<Outlet />`. `/` issues a `<Navigate to="/dag" replace />`.
- **Inspector**: content is `ReactNode | null` in `useShellStore`. Any descendant can call `openInspector(<...>)`. `Esc`-to-close handler attached in `AppShell` only while the inspector is open. The inner panel keeps its full width during the width transition so contents don't reflow.
- **Sidebar**: React Router `NavLink` for active-state styling; collapse persisted to `localStorage` via Zustand `persist` middleware with a `partialize` that strips `inspectorContent` (a `ReactNode` is not serializable).
- **Cream theme tokens**: declared once in `:root` in `src/styles/globals.css` using `oklch()`. Mirrored into `@theme inline` so Tailwind v4 utilities like `text-[color:var(--color-fg)]` resolve against the same source of truth. No `data-theme` attribute, no dark-mode block.
- **`src/lib/types.ts`** shipped as `export {}` per D5; first domain types (`NodeId`, `NodeStatus`, `DocNode`) arrived with `02-dag`.
- **Empty states** use a single reusable `EmptyState` component (D4). Each route renders it; `DagPanel` additionally renders an "Open inspector" debug button per the acceptance check.

### Deviations from the spec

- **`shadcn@latest init` was not run.** The init script targets dark-by-default tokens and pulls in a CSS variables registry the cream-only theme doesn't need. Cream tokens are hand-authored in `globals.css` and a minimal `Button` is copied into `src/components/ui/`. This matches the spec's intent ("pick the cream tokens manually rather than letting it install a dark token set") and avoids carrying unused infrastructure.
- **`exactOptionalPropertyTypes`** is NOT enabled. The shell-doc constraint only requires `strict` + `noUncheckedIndexedAccess`. EOPT creates real friction with React-Router prop types that accept `string | undefined` for optional fields; deferring until a follow-up node decides whether it's worth the cost.
- **Tailwind v4 beta** rather than v3. The parent doc says "Tailwind v4"; v4 stable was not yet released at scaffold time so the latest beta is pinned. Track upgrade once stable ships.

### Open follow-ups

- Replace `forwardRef` in `Button` with the React 19 ref-as-prop pattern once shadcn upstream migrates; keeping `forwardRef` now matches current shadcn templates.
- Decide on Tailwind v4 stable upgrade once released.
- Reassess `exactOptionalPropertyTypes` when API contracts arrive in subsequent nodes.

### Verification status

Automated gates run on 2026-05-22 — all clean:

- `pnpm -C app install`: 198 packages resolved, no errors.
- `pnpm -C app typecheck`: zero output.
- `pnpm -C app lint`: zero output under `--max-warnings=0`.
- `pnpm -C app build`: 1,659 modules transformed; bundle 354.60 kB JS / 14.06 kB CSS (gzip 112.23 / 3.65). No errors.
- `pnpm -C app dev`: dev server serves HTTP 200 at `localhost:5173` with the expected HTML shell (title `Ledger`, `#root` mount point, Vite client + main entry).

Status promoted to VERIFY on 2026-05-22 pending manual browser walk-through of the acceptance-check list (§Design > Acceptance check). Operator confirmed walk-through on 2026-05-22; status promoted to COMPLETE.

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. Every route in the table above resolves and renders its placeholder.
2. The full acceptance-check list under Design passes.
3. `pnpm typecheck` and `pnpm lint` exit zero with no warnings.
4. No network calls leave the app at startup (DevTools Network tab is empty besides Vite dev-server traffic).
5. `src/lib/types.ts` declared no domain types at shell verification — the shell shipped content-free, as required by D5. (Subsequent panels add types here; `02-dag` was the first.)
6. The sidebar collapse preference survives a full page reload.

---

## Children

None. This node is a leaf for now; per-panel nodes will be added as siblings under `01-ui` (e.g., `02-dag`, `03-docs`, `04-tasks`, `05-logs`, `06-health`, `07-replay`) once this is APPROVED and the data contracts in `src/lib/types.ts` start to take shape.
