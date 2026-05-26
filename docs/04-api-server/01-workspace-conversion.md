# Workspace Conversion

**Node ID:** `04-api-server/01-workspace-conversion`
**Parent:** `04-api-server` (`docs/04-api-server.md`)
**Status:** SPEC_REVIEW
**Created:** 2026-05-26
**Last Updated:** 2026-05-26 (DRAFT → SPEC_REVIEW)

**Dependencies:** —

---

## Requirements

Convert the repo from a single-package layout (`app/` is the only package; the repo root has no `package.json`) to a **pnpm workspace** that can host multiple packages. This is the foundational child of `04-api-server`: every later child (`02-parser-extraction`, `03-server-package`, `04-cli-launcher`, `05-ui-hook-migration`) assumes the workspace exists. This child ships the boundary — no source code moves, no new packages, no API server.

The reason for the split: `04-api-server` will introduce two new packages (`packages/parser/` and `server/`) that share dependencies with `app/` (ajv, vitest, typescript) and need to import each other. Without a workspace, every new package would carry its own `node_modules`, duplicate the shared deps, and reach across package boundaries via brittle relative paths. The workspace formalises the boundary at the foundation so later children can be focused on their own concerns rather than re-litigating the workspace shape.

In scope for v1:

1. **Root `package.json`** declaring the workspace at the repo root. Minimal: name (`ledger-monorepo` or similar — private, not published), `private: true`, `packageManager: "pnpm@9.15.0"` (matching the version already pinned in `app/package.json`), and a small set of workspace-level scripts that fan out (`pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, `pnpm -r build`). No runtime dependencies at the root.
2. **`pnpm-workspace.yaml`** at the repo root declaring three workspace globs: `app`, `server`, `packages/*`. The latter two paths don't exist yet (they land in later children); pnpm tolerates non-existent declared workspaces with a warning, not an error, and the declarations are needed up front so `02-parser-extraction` and `03-server-package` can drop their packages in without revisiting the workspace config.
3. **Rename `app/package.json`'s `name` field** from `"ledger-app"` to `"@ledger/app"`. The `@ledger/` scope is the package namespace for this workspace; later packages will be `@ledger/parser` and `@ledger/server`. No scope was reserved on npm (the packages are not published); the `@`-prefixed name is purely a local convention that keeps workspace imports unambiguous (`import x from "@ledger/parser"` reads as "the parser package," not "a possibly-globally-installed module named parser").
4. **Re-run `pnpm install` at the repo root** so pnpm produces a workspace-aware lockfile. The existing `app/pnpm-lock.yaml` gets replaced by a root-level `pnpm-lock.yaml`; `app/node_modules` is reorganised (hoisted shared deps move to root `node_modules/.pnpm`). Versions of every existing dep stay pinned; this child does not add, remove, or upgrade any dependency.
5. **Verify all existing `app/` gates still pass.** `pnpm -C app typecheck`, `pnpm -C app lint --max-warnings=0`, `pnpm -C app test`, `pnpm -C app build` exit zero with the same test counts and the same bundle output (modulo dependency-resolution path changes that don't affect the bundle bytes). The workspace conversion is invisible to existing consumers; if any gate regresses, that's a real bug — investigate before promoting.

**Out of scope for v1:**

- **New packages.** `packages/parser/` and `server/` are explicitly out of scope here. Creating them is what later children do. This child only declares that the workspace can hold them.
- **Source code moves.** Nothing under `app/src/` moves. The schema validator stays at `app/src/lib/schema/`, the project loader stays at `app/src/lib/project/`, `parseDocs.ts` stays untouched. Moving them is `02-parser-extraction`'s deliverable.
- **Dependency upgrades.** Every dep pinned in `app/package.json` stays at its current version. The lockfile regenerates but pins the same versions. If an upgrade is needed for the API server, that's the consumer node's call, not this one's.
- **Workspace-level orchestration scripts beyond `pnpm -r <gate>`.** No `concurrently`, no `npm-run-all`, no `turbo`, no `nx`. A unified `pnpm dev` that boots `app/` and `server/` in parallel is in scope for a polish pass after both packages exist; deferred per `04-api-server` Open Issues.
- **CI changes.** No GitHub Actions changes, no `package.json` `engines` declaration changes (`app/`'s pnpm version is the source of truth and already correct), no Renovate/Dependabot config. CI runs locally today; the conversion does not change that.
- **Conversion of the existing `app/server/` directory.** `app/server/` is the transcript-ingestion bootstrap for `01-ui/10-orchestration`. Its name collides with the eventual top-level `server/` package but the rename is deferred to a later cleanup (per `04-api-server` Open Issues). This child does not touch `app/server/`.
- **`.npmrc` tuning.** pnpm's defaults are correct for this workspace. No `node-linker`, no `shamefully-hoist`, no `strict-peer-dependencies` overrides. If a later child needs a specific pnpm setting, that child adds it.
- **A `README.md` at the repo root** describing the workspace. The existing `app/README.md` (Vite default) and `CLAUDE.md` cover what readers need; a workspace-level README is polish, deferrable.

---

## Design

### File-level diff

```
package.json                          [new — workspace root, no runtime deps]
pnpm-workspace.yaml                   [new — declares app, server, packages/*]
pnpm-lock.yaml                        [new at repo root — replaces app/pnpm-lock.yaml after pnpm install]
app/pnpm-lock.yaml                    [DELETED — superseded by root lockfile]
app/package.json                      [modified — name: "ledger-app" → "@ledger/app"; no other changes]
docs/04-api-server/01-workspace-conversion.md   [this spec — status transitions]
docs/04-api-server.md                 [modified — §Children manifest row status]
```

The `app/node_modules/` directory reorganises silently when `pnpm install` runs at the root — pnpm symlinks workspace packages and hoists shared transitive deps into `node_modules/.pnpm`. That is a build artifact, not a tracked file; `.gitignore` already excludes it (both `app/node_modules` and the new root `node_modules`).

### Root `package.json` shape

```json
{
  "name": "ledger-monorepo",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "build": "pnpm -r build"
  }
}
```

`-r` runs the script in every workspace package that declares it. Today that's only `app/`; once `packages/parser/` and `server/` land, they pick up the same fan-out for free. No dependencies, no devDependencies — every dep lives in its consumer package (D2).

### `pnpm-workspace.yaml` shape

```yaml
packages:
  - app
  - server
  - packages/*
```

`server` and `packages/*` resolve to nothing today; pnpm warns ("No packages found matching the workspace pattern") and proceeds. The warning disappears once `02-parser-extraction` lands `packages/parser/` and `03-server-package` lands `server/`. Declaring the patterns up front means those later children touch only their package directory, not the workspace config.

### `app/package.json` rename

The only field change:

```diff
-  "name": "ledger-app",
+  "name": "@ledger/app",
```

Nothing else moves. The `private`, `version`, `type`, `scripts`, `dependencies`, `devDependencies`, and `packageManager` fields stay identical.

Why the `@ledger/` scope: later packages (`@ledger/parser`, `@ledger/server`) form a coherent namespace under one prefix. A consumer importing `@ledger/parser` immediately knows it's a workspace-local package, not an npm-global one. The scope is **not** registered on npm — these packages are private. The `private: true` flag on each package's `package.json` is the safety net against accidental `npm publish`.

### Lockfile migration

Before:

```
app/pnpm-lock.yaml          # workspace-of-one lockfile
```

After:

```
pnpm-lock.yaml              # workspace-of-N lockfile at repo root
app/pnpm-lock.yaml          # DELETED
```

The migration is mechanical: `cd <repo-root>`, `rm app/pnpm-lock.yaml`, run `pnpm install`. pnpm generates the root lockfile, which lists `app/` as the only workspace package with content. The `package.json` fields for every transitive dep match the old lockfile exactly (no version drift) because nothing in `app/package.json`'s dep tree changes.

**Verify zero version drift:** diff the new root `pnpm-lock.yaml`'s resolved versions against the old `app/pnpm-lock.yaml`'s. Every `version:` line should match. If anything moved, that's a real change — investigate before promoting.

### Acceptance check (manual)

A reviewer running the worktree must observe:

1. Repo root contains a new `package.json` and a new `pnpm-workspace.yaml`. Neither file exists on `main` before this child.
2. `app/pnpm-lock.yaml` has been removed; a new `pnpm-lock.yaml` sits at the repo root.
3. `pnpm install` at the repo root completes without errors. Warnings about missing `server` / `packages/*` workspace patterns are expected (they don't exist yet).
4. `pnpm -C app typecheck`, `pnpm -C app lint --max-warnings=0`, `pnpm -C app test`, `pnpm -C app build` all exit zero with the same test counts and bundle sizes as before this child.
5. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` from the repo root (the new workspace-level scripts) succeed and produce identical output to the per-package equivalents (today they fan out to just `app/`; later children's packages will join the fan-out).
6. `app/package.json`'s `name` field reads `"@ledger/app"`. Every other field is unchanged.
7. No file under `app/src/` is modified. `git diff main..HEAD -- app/src/` is empty.
8. No file under `app/server/` is modified. `git diff main..HEAD -- app/server/` is empty.
9. `git diff main..HEAD -- docs/` shows only the status-transition edits to `04-api-server/01-workspace-conversion.md` and `04-api-server.md` (the children manifest row); no other doc changes.
10. Resolved versions in the new root `pnpm-lock.yaml` match the resolved versions in the old `app/pnpm-lock.yaml` for every shared dep. (Mechanical diff; if drift, investigate.)

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | pnpm workspace (not Yarn / npm workspaces / Lerna / Nx / Turbo) | pnpm is already the package manager (`app/package.json`'s `packageManager` field pins `pnpm@9.15.0`). Switching now would invert that choice for no benefit. pnpm's workspace support is first-class, has the cleanest dep-hoisting story (content-addressable store, symlinked `node_modules`), and supports `pnpm -r <script>` fan-out without an extra orchestrator. Nx / Turbo add a build cache + dependency-graph orchestration that has real benefits at scale (50+ packages, slow builds) but is overkill for a 3-package workspace with fast Vite/tsc builds. Add an orchestrator if and when measurable cache-savings appear. |
| D2 | Root `package.json` carries **no runtime dependencies**, only workspace-level scripts | Every dep lives where it's used. Hoisting deps to the root is technically possible (pnpm does it transparently for shared transitives) but declaring deps at the root invites "what owns this?" confusion — typescript at the root would be a candidate for "I'll just use this from anywhere," which breaks encapsulation. Each package declaring its own deps keeps the boundaries explicit. |
| D3 | `@ledger/` package-name scope | Three reasons: (a) groups the workspace's packages under one prefix so imports are immediately recognisable as local (`@ledger/parser` vs `parser`); (b) avoids name collisions with any unrelated npm package named `parser`, `server`, or `app`; (c) matches the convention of every JS monorepo of nontrivial size (e.g. `@tanstack/*`, `@vitejs/*`, `@radix-ui/*`). The scope is **not** registered on npm — packages are `private: true`. |
| D4 | Declare `packages/*` and `server` in `pnpm-workspace.yaml` up front, even though they don't exist yet | pnpm warns but does not error on declared-but-missing workspace dirs. Declaring them now means later children (`02-parser-extraction`, `03-server-package`) touch only their own directory; the workspace config is stable. If we deferred the declarations, every child would need to revisit `pnpm-workspace.yaml`, multiplying merge conflicts and review surface. |
| D5 | Workspace-level scripts limited to `typecheck` / `lint` / `test` / `build`, no `dev` | A workspace `dev` script needs to orchestrate two long-running processes (`app/` Vite + `server/` Hono) — that requires `concurrently` or similar, which would be the first non-pnpm orchestrator we add. Deferred per `04-api-server` Open Issues. Today the operator runs `pnpm -C app dev` and `pnpm -C server dev` in two terminals; if that friction becomes painful, a polish pass adds the unified runner. |
| D6 | Delete `app/pnpm-lock.yaml` and regenerate `pnpm-lock.yaml` at the root in the same commit | A workspace requires the lockfile at the root; pnpm does not consult per-package lockfiles in workspace mode. Leaving `app/pnpm-lock.yaml` in place would either be ignored (silent dead file) or — if a future contributor naively runs `pnpm install` inside `app/` — cause confusion. The clean answer is to remove it. The regenerated root lockfile must show zero version drift from the old lockfile (Acceptance check item 10). |
| D7 | Keep `app/package.json`'s `packageManager` field; **do not** move it to the root | pnpm respects the nearest `package.json`'s `packageManager` field; having it on every package is harmless and ensures any contributor running `pnpm` from inside `app/` (e.g. via an IDE shortcut) gets the right version. The root `package.json` also carries `packageManager: "pnpm@9.15.0"` (same version) so workspace-level operations resolve identically. Two declarations, one value, no drift risk. |
| D8 | Do not touch `app/server/` or any file under `app/src/` | The whole point of this child is the smallest workspace boundary that can host the later children. Source moves belong to `02-parser-extraction`. Adding source changes here would couple two separable concerns and bloat the review surface. Verification items 7 and 8 enforce zero diff under `app/src/` and `app/server/`. |

---

## Open Issues

- **Workspace-level `dev` script.** D5 defers. Friction surfaces once both `app/` and `server/` are running and the operator forgets to start one of them. Trigger for action: the first "the API isn't responding — oh, I didn't start the server" moment. *(Priority: LOW — wait for the friction signal.)*
- **CI awareness of the workspace.** No CI exists yet, so this is hypothetical. When CI lands, the workflow file calls `pnpm install --frozen-lockfile` at the root, then `pnpm -r typecheck && pnpm -r test && pnpm -r build`. The workspace config makes this trivially correct, but the CI node should explicitly verify it. *(Priority: LOW — no CI today.)*
- **Renovate / Dependabot for the workspace.** Both tools handle pnpm workspaces but want their config tweaked (`pnpm-lock.yaml` at the root, not per-package). v1 has no automated dep updates configured; if added, the config must point at the root lockfile. *(Priority: TRIVIAL.)*
- **`engines` declaration.** Neither the root `package.json` nor any package declares an `engines.node` minimum. The `tsx` and `vitest` versions pinned implicitly require Node 18+. Declaring `engines.node: ">=20"` at the root would catch contributors on too-old Node early, but adds maintenance for a single-operator project. *(Priority: LOW — add when a second contributor onboards.)*
- **Workspace-aware import paths.** Once `@ledger/parser` exists, the parser's tests reach into `docs/_schemas/*.json` via a path alias (per parent's S6). pnpm's workspace symlinking makes this work, but the resolution depth is fragile to package moves. If `packages/parser/` ever moves (e.g. to `packages/core/parser/`), every relative `../../docs/_schemas/` reference breaks. v1 keeps the layout flat; if depth grows, the right fix is a TS `paths` alias rather than relative paths everywhere. *(Priority: LOW — defer until layout changes.)*

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. Repo root contains a new `package.json` and a new `pnpm-workspace.yaml` matching the Design shapes. `git diff main..HEAD -- package.json pnpm-workspace.yaml` shows both as new files.
2. `app/pnpm-lock.yaml` has been deleted; a new `pnpm-lock.yaml` exists at the repo root. `git diff main..HEAD --stat` shows both transitions.
3. `pnpm install` from the repo root completes without errors (warnings about missing `server` / `packages/*` workspace patterns are expected and acceptable).
4. All `app/` gates exit zero with same test counts and identical bundle output:
   - `pnpm -C app typecheck` → 0
   - `pnpm -C app lint --max-warnings=0` → 0
   - `pnpm -C app test` → 0, **test count unchanged from main** (99 tests as of `a72c13f`)
   - `pnpm -C app build` → 0, **gzip JS / CSS sizes unchanged ±100 bytes** vs main HEAD
5. Workspace-level scripts work: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` from the repo root each succeed and produce identical results to the per-package equivalents.
6. `app/package.json`'s `name` field reads `"@ledger/app"`; no other field in `app/package.json` is modified. `git diff main..HEAD -- app/package.json` is a one-line change.
7. **Zero diff under `app/src/`**: `git diff main..HEAD -- app/src/` is empty.
8. **Zero diff under `app/server/`**: `git diff main..HEAD -- app/server/` is empty.
9. **Zero version drift in the lockfile**: every shared dep's resolved version in the new root `pnpm-lock.yaml` matches the version that was in the old `app/pnpm-lock.yaml`. Mechanical diff; if any version moved, that's a real change to investigate.
10. `04-api-server.md` §Children manifest row for `01-workspace-conversion` reads the current status; final promotion to COMPLETE bumps both the spec's Status header and the parent's row in the same commit.

---

## Children

None.
