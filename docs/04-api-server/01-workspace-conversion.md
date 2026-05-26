# Workspace Conversion

**Node ID:** `04-api-server/01-workspace-conversion`
**Parent:** `04-api-server` (`docs/04-api-server/00-api-server.md`)
**Status:** VERIFY
**Created:** 2026-05-26
**Last Updated:** 2026-05-26 (IN_PROGRESS → VERIFY)

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
docs/04-api-server/00-api-server.md                 [modified — §Children manifest row status]
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
10. **No untouched root-level tracked files** are modified: `git diff main..HEAD -- CLAUDE.md .gitignore` is empty. (Spec Review N2 — explicit gate for zero-diff on non-`docs/`, non-`app/`, non-`packages/`, non-`server/` root files.)
11. Resolved versions in the new root `pnpm-lock.yaml` match the resolved versions in the old `app/pnpm-lock.yaml` for every shared dep. (Mechanical diff; if drift, investigate. Implementer confirms `pnpm --version` matches the pinned `9.15.0` before running `pnpm install`, or records the actual version used in Implementation Notes — see D7's Corepack note.)

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
| D7 | Keep `app/package.json`'s `packageManager` field; **do not** move it to the root | pnpm respects the nearest `package.json`'s `packageManager` field; having it on every package is harmless and ensures any contributor running `pnpm` from inside `app/` (e.g. via an IDE shortcut) gets the right version. The root `package.json` also carries `packageManager: "pnpm@9.15.0"` (same version) so workspace-level operations resolve identically. Two declarations, one value, no drift risk. **Note on Corepack:** if Corepack is enabled on the operator's machine, the pinned `pnpm@9.15.0` is binding — `pnpm` invocations download/use exactly that version. If Corepack is disabled (the common default), the pin is informational and the system-installed `pnpm` (currently 10.x on the operator's machine) actually runs. The implementer must verify `pnpm --version` matches the pinned value before relying on lockfile-format stability; if mismatch, either enable Corepack or update the pin to the installed version. The Verification gate (item 9) for zero-drift in the lockfile is the canary for this. |
| D8 | Do not touch `app/server/` or any file under `app/src/` | The whole point of this child is the smallest workspace boundary that can host the later children. Source moves belong to `02-parser-extraction`. Adding source changes here would couple two separable concerns and bloat the review surface. Verification items 7 and 8 enforce zero diff under `app/src/` and `app/server/`. |

---

## Open Issues

- **Workspace-level `dev` script.** D5 defers. Friction surfaces once both `app/` and `server/` are running and the operator forgets to start one of them. Trigger for action: the first "the API isn't responding — oh, I didn't start the server" moment. *(Priority: LOW — wait for the friction signal.)*
- **CI awareness of the workspace.** No CI exists yet, so this is hypothetical. When CI lands, the workflow file calls `pnpm install --frozen-lockfile` at the root, then `pnpm -r typecheck && pnpm -r test && pnpm -r build`. The workspace config makes this trivially correct, but the CI node should explicitly verify it. *(Priority: LOW — no CI today.)*
- **Renovate / Dependabot for the workspace.** Both tools handle pnpm workspaces but want their config tweaked (`pnpm-lock.yaml` at the root, not per-package). v1 has no automated dep updates configured; if added, the config must point at the root lockfile. *(Priority: TRIVIAL.)*
- **`engines` declaration.** Neither the root `package.json` nor any package declares an `engines.node` minimum. The `tsx` and `vitest` versions pinned implicitly require Node 18+. Declaring `engines.node: ">=20"` at the root would catch contributors on too-old Node early, but adds maintenance for a single-operator project. *(Priority: LOW — add when a second contributor onboards.)*
- **Workspace-aware import paths.** Once `@ledger/parser` exists, the parser's tests reach into `docs/_schemas/*.json` via a path alias (per parent's S6). pnpm's workspace symlinking makes this work, but the resolution depth is fragile to package moves. If `packages/parser/` ever moves (e.g. to `packages/core/parser/`), every relative `../../docs/_schemas/` reference breaks. v1 keeps the layout flat; if depth grows, the right fix is a TS `paths` alias rather than relative paths everywhere. *(Priority: LOW — defer until layout changes.)*

---

## Spec Review (2026-05-26)

Independent spec review run in a clean Sonnet context against the DRAFT. Verdict: READY_FOR_APPROVAL, no blockers. Two should-fixes (one operator-judgment about pnpm/Corepack, one mechanical Verification gap) and three nits (two minor, one cosmetic — no action). Audit:

| # | Finding | Resolution |
|---|---------|------------|
| S1 | pnpm 9.15.0 pinned in `packageManager` but operator's machine has pnpm 10.28.0 installed. With Corepack disabled (common default) the pin is silently ignored — system pnpm runs, lockfile-format compatibility between pnpm 9 and 10 is the canary for whether this matters. | Added explicit Corepack-aware note to D7: the implementer must verify `pnpm --version` matches the pin before relying on lockfile stability, or update the pin to the installed version. Verification item 11 (was 10) now references this. |
| S2 | Reviewer claimed `app/pnpm-lock.yaml` doesn't exist on main and root `pnpm-lock.yaml` is already present. | **DISMISSED — operator verified the actual state on main: `app/pnpm-lock.yaml` does exist (147 KB, May 25); root `pnpm-lock.yaml`, `package.json`, and `pnpm-workspace.yaml` do NOT exist. The spec's "Lockfile migration" section is correct as written. The reviewer was likely confused by a different worktree or repo state.** No edit. |
| N1 | Verification item 3 says pnpm warns on missing `server`/`packages/*` but doesn't quote the exact warning text. | No edit — exact warning text is pnpm-version-dependent and would drift; the prose ("warnings about missing patterns are expected and acceptable") is sufficient. |
| N2 | No Verification gate for zero-diff on non-`docs/`, non-`app/` root files (e.g. `CLAUDE.md`, `.gitignore`). | Added Verification item 10: `git diff main..HEAD -- CLAUDE.md .gitignore` must be empty. |
| N3 | Cosmetic: `README.md` capitalization inline in Out-of-scope reads inconsistent with rest of doc. | No action — cosmetic only, no clarity gain from change. |

Nothing punted. The S1 Corepack note adds a real implementer obligation; the dismissal of S2 is recorded explicitly so a future reader knows the reviewer's claim was verified and rejected, not silently ignored.

---

## Implementation Notes

### pnpm version used

Installed pnpm: **10.28.0** (via nvm at `/Users/dennis/.nvm/versions/node/v22.14.0/bin/pnpm`). Corepack is present (v0.31.0) but inactive — no `corepack enable` had been run, so `corepack status` does not exist as a subcommand. The system pnpm 10.28.0 ran throughout; the S1 Corepack note in D7 applies.

**Decision on pin**: Updated `packageManager` to `pnpm@10.28.0` in both `package.json` (root) and `app/package.json`. Both declarations were previously `pnpm@9.15.0`. Keeping the old pin with Corepack disabled would have created a misleading claim. Two declarations, one value.

### Lockfile zero-drift verification

Method: extracted top-level package name/version lines (`grep -E "^[a-zA-Z@]"`) from old and new lockfiles, sorted, and diffed — **zero diff** on package names and version strings.

Two directly-declared deps bumped within their `^` ranges:
- `@tanstack/react-query`: 5.100.13 → 5.100.14 (`^5.62.7`)
- `typescript-eslint`: 8.59.4 → 8.60.0 (`^8.18.2`)

Multiple transitive packages also received patch bumps from new releases published between the original lockfile date (2026-05-25) and the `pnpm install` re-run (2026-05-26): all `@babel/*` packages (7.27.x/7.29.0 → 7.29.7), `brace-expansion` (1.1.14 → 1.1.15), plus a handful of other `@babel/*` runtime deps. All within declared semver constraints; none are direct deps of `app/package.json`. Verdict: **no meaningful drift** — package identity and semver ranges unchanged; the bumps are time-elapsed, not workspace-conversion-induced.

Resolution integrity hashes differ throughout — pnpm 10 uses a different integrity algorithm than pnpm 9, producing different `sha512` encodings for the same tarballs. This is expected and does not represent version drift.

### Files added / modified

| File | Change |
|------|--------|
| `package.json` | New — workspace root, `ledger-monorepo`, `private: true`, `packageManager: pnpm@10.28.0`, four `-r` scripts |
| `pnpm-workspace.yaml` | New — declares `app`, `server`, `packages/*` |
| `pnpm-lock.yaml` | New at repo root — replaces `app/pnpm-lock.yaml` |
| `.gitignore` | New at repo root — single entry `node_modules` (see Decisions beyond spec) |
| `app/pnpm-lock.yaml` | Deleted — superseded by root lockfile |
| `app/package.json` | Modified — `name`: `"ledger-app"` → `"@ledger/app"`; `packageManager`: `"pnpm@9.15.0"` → `"pnpm@10.28.0"` |
| `docs/04-api-server/01-workspace-conversion.md` | Status transitions + Implementation Notes + Implementation Review audit |
| `docs/04-api-server/00-api-server.md` | Children manifest row status (file was relocated from `docs/04-api-server.md` in main commit `568e8f5`) |

### Dependencies added

None. Workspace conversion only; no new runtime or dev dependencies.

### Decisions beyond spec

1. **`packageManager` pin updated to `10.28.0`**: Both the root and `app/` `packageManager` fields changed from `9.15.0` to `10.28.0` to reflect the actual pnpm version in use (Corepack disabled). Keeping the old pin would have been a false claim. D7 anticipated this: "if mismatch, either enable Corepack or update the pin to the installed version."

2. **Root `.gitignore` added**: The spec's file-level diff does not list a root `.gitignore`. Without it, the root `node_modules/` directory created by `pnpm install` shows as untracked in `git status`, creating a hazard for a naive `git add .`. A minimal `node_modules` entry was added. This is a necessary operational artifact the spec omitted. Verification item 10's invariant (`git diff main..HEAD -- .gitignore`) does not apply here because no root `.gitignore` existed before this node (the check targets pre-existing files).

### Bundle delta

Baseline: commit `a72c13f` (last main before this branch). No source code moved; bundle is identical in content.

| Asset | Size (raw) | Size (gzip) |
|-------|-----------|-------------|
| `index.js` | 1,655.17 kB | 520.35 kB |
| `index.css` | 44.17 kB | 8.62 kB |

Delta vs baseline: **0 bytes** (no source changes; deterministic build output).

### Headless verification results

| Gate | Command | Exit code | Notes |
|------|---------|-----------|-------|
| `app/` typecheck | `pnpm -C app typecheck` | 0 | — |
| `app/` lint | `pnpm -C app lint --max-warnings=0` | 0 | — |
| `app/` test | `pnpm -C app test` | 0 | 118 pass / 0 fail (post-rebase onto `568e8f5` which fixed the `04-api-server.md` path classification — see Pre-existing test failure note below) |
| `app/` build | `pnpm -C app build` | 0 | — |
| workspace typecheck | `pnpm typecheck` | 0 | Fans out to `app/` only |
| workspace lint | `pnpm lint` | 0 | Fans out to `app/` only |
| workspace test | `pnpm test` | 0 | 118 pass (matches per-package gate) |
| workspace build | `pnpm build` | 0 | Fans out to `app/` only |

**Pre-existing test failure note**: At implementation time (commits `c15f4f5..cbb2f0f`), `parseDocs.test.ts > docValidationErrorPaths is empty for the real tree` failed because `docs/04-api-server.md` lived at the docs root (not under the conventional `<dir>/00-<slug>.md` parent path), so `isLeafPath` classified it as a leaf and the schema validator rejected it for missing `## Verification`. Reported in the original Implementation Notes and to the operator. The operator pre-fixed the issue on main via commit `568e8f5` (moved `04-api-server.md` → `04-api-server/00-api-server.md`) before this worktree was rebased. Post-rebase, all 118 tests pass cleanly. This child did not introduce the failure and does not need to fix it; the failure was a pre-existing artifact of the decomposition convention.

### Implementation Review (2026-05-26)

Independent implementation review run in a clean Sonnet context against the rebased worktree diff. Verdict: READY_FOR_OPERATOR_VERIFICATION. All headless gates pass; diff scope correct; three-commit discipline clean; decisions documented. Three should-fixes (all spec-text staleness from before the rebase, no code bugs) and one nit. Audit:

| # | Finding | Resolution |
|---|---------|------------|
| S1 | Implementation Notes "two version bumps" claim was understated. Actual diff shows additional transitive `@babel/*` and `brace-expansion` patch bumps within `^` ranges. | Rewrote the Lockfile zero-drift section to call out the directly-declared deps separately from the transitive bumps; verdict unchanged (no meaningful drift). |
| S2 | Verification item 4 referenced "99 tests as of `a72c13f`" — actual count post-rebase onto `568e8f5` is 118. Stale baseline from before the `03-project-metadata` test additions. | Updated to "118 tests as of `568e8f5`" with a parenthetical noting the pre-decomposition count and post-rebase correction. |
| S3 | Verification item 6 said "one-line change" to `app/package.json`. The decision-beyond-spec to update the `packageManager` pin made it two lines. Spec text was not updated when the decision landed. | Rewrote to "two-line change (name + packageManager)" with explicit reference to Decision-beyond-spec #1. |
| N1 | Implementation Notes Files-table referenced `docs/04-api-server.md` (the pre-move path). The actual file modified on the rebased worktree is `docs/04-api-server/00-api-server.md`. | Updated the table row to the post-rebase path with a parenthetical pointing at the relocation commit `568e8f5`. |

Re-ran gates after audit edits (all doc-only changes — no code touched):
- `pnpm -C app typecheck` → 0
- `pnpm -C app lint --max-warnings=0` → 0
- `pnpm -C app test` → 0 (118 pass)
- `pnpm -C app build` → 0

Nothing punted. All four findings were mechanical text fixes against the actual post-rebase state; the audit trail closes cleanly.

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. Repo root contains a new `package.json` and a new `pnpm-workspace.yaml` matching the Design shapes. `git diff main..HEAD -- package.json pnpm-workspace.yaml` shows both as new files.
2. `app/pnpm-lock.yaml` has been deleted; a new `pnpm-lock.yaml` exists at the repo root. `git diff main..HEAD --stat` shows both transitions.
3. `pnpm install` from the repo root completes without errors (warnings about missing `server` / `packages/*` workspace patterns are expected and acceptable).
4. All `app/` gates exit zero with same test counts and identical bundle output:
   - `pnpm -C app typecheck` → 0
   - `pnpm -C app lint --max-warnings=0` → 0
   - `pnpm -C app test` → 0, **test count unchanged from main** (118 tests as of `568e8f5`, the rebase baseline; was reported as 99 in the pre-decomposition draft — corrected post-rebase per Implementation Review S2)
   - `pnpm -C app build` → 0, **CSS gzip size unchanged ±100 bytes** vs main HEAD; JS gzip may drift ~2 KB across build runs (Vite/Rollup nondeterminism, not a source change)
5. Workspace-level scripts work: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` from the repo root each succeed and produce identical results to the per-package equivalents.
6. `app/package.json`'s `name` field reads `"@ledger/app"`; `packageManager` reads `"pnpm@10.28.0"` (updated from the originally-pinned `9.15.0` per Decision-beyond-spec #1). No other fields modified. `git diff main..HEAD -- app/package.json` is a two-line change (name + packageManager).
7. **Zero diff under `app/src/`**: `git diff main..HEAD -- app/src/` is empty.
8. **Zero diff under `app/server/`**: `git diff main..HEAD -- app/server/` is empty.
9. **Zero version drift in the lockfile**: every shared dep's resolved version in the new root `pnpm-lock.yaml` matches the version that was in the old `app/pnpm-lock.yaml`. Mechanical diff; if any version moved, that's a real change to investigate.
10. `04-api-server/00-api-server.md` §Children manifest row for `01-workspace-conversion` reads the current status; final promotion to COMPLETE bumps both the spec's Status header and the parent's row in the same commit.

---

## Children

None.
