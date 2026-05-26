# Project Metadata Artifact

**Node ID:** `03-project-metadata`
**Parent:** project root (`docs/00-project.md`)
**Status:** SPEC_REVIEW
**Created:** 2026-05-25
**Last Updated:** 2026-05-25

**Dependencies:** —

---

## Requirements

A ledger-managed project needs a **first-class, versioned configuration file** at its root that identifies the project to the framework (PRD §7.1, §11). Today the framework has no such file: the topbar reads `"untitled project"` from a string literal (`Topbar.tsx:34`), and the not-yet-built API server (PRD §7.1: `ledger /path/to/project`) has nowhere to read project identity, docs-root location, or agent-runtime selection. This node closes that gap.

This is the **sibling deliverable to `02-schema`**. Where `02-schema` formalises the schema for an individual document node, `03-project-metadata` formalises the schema for the project-level config that scopes a ledger instance to one project (PRD §9: "stored in the document tree root", parallel artifact under `docs/_schemas/`).

In scope for v1:

1. **A canonical JSON Schema file** at `docs/_schemas/project-metadata.schema.json` (draft 2020-12) describing the required fields of `.ledger/project.json`: `schemaVersion`, `name`, `docs`, `agent`. Schema version is declared inline and is durable across future revisions. Sibling of `document-node.schema.json` (D1, D3 from `02-schema`).
2. **An authored `.ledger/project.json` at this repo root.** The first dogfooded artifact: `{ "schemaVersion": 1, "name": "Ledger", "docs": "docs", "agent": "claude-code" }`. Committed to source; not generated.
3. **A TypeScript loader + validator** (`app/src/lib/project/loadProjectMetadata.ts`) that reads `.ledger/project.json` via Vite's `import.meta.glob` (same bootstrap pattern as `parseDocs.ts`'s `import.meta.glob<string>("../../../docs/**/*.md")` at `parseDocs.ts:199`), validates against the schema using the same `ajv@8` / `ajv-formats` / draft-2020 chain installed by `02-schema`, and exports a typed `ProjectMetadata` value (or a structured error). Pure build-time validation; no Node-only imports leak into the browser bundle.
4. **Tests** (`*.test.ts`) covering the validator against fixtures: a fully-conformant config, every required-field-missing case, an unknown `agent` value, malformed JSON, and a wrong `schemaVersion`. Test infrastructure is the existing Vitest setup that `02-schema` already established — no new test runner work.
5. **Topbar consumer wired up.** Replace the hardcoded `"untitled project"` literal at `Topbar.tsx:34` with `projectMetadata.name`. Falls back to `"untitled project"` only when validation fails (and surfaces the failure in the existing dev-only validation banner introduced by `02-schema` D9). Closes the `01-ui/01-shell.md` Open Issue "Topbar shows 'untitled project' — no project metadata source".

**Out of scope for v1:**

- **The CLI launcher itself** (`ledger /path/to/project`). PRD §7.1 describes the launcher reading `.ledger/project.json` and starting the API server; this node ships the **artifact + schema + loader**, not the launcher. Launcher work belongs to `04-api-server` (which depends on this node per PRD §14).
- **The runtime / API-server consumer.** Same reason: this node is the bootstrap of the *artifact*, validated at build time inside the browser bundle (mirrors `02-schema`'s D6 — ajv runs in the browser bundle at build time today, will move server-side when the API lands). The API server picks up the same JSON file at the same path; it does not need a different schema.
- **Multi-project support / recents chooser UI.** PRD §13 explicitly defers the recents chooser; PRD §7.1 commits to "one project per ledger instance" for v1. No project-switcher logic, no `~/.ledger/recent.json` reader.
- **Migration tooling** (`ledger migrate /path/to/existing/project`). PRD §13 lists this as deferred. v1 expects the operator to hand-write `.ledger/project.json` for any new project — same posture as `02-schema`'s D2 (no auto-rewrites; the artifact is operator-authored).
- **Agent runtime registry.** The `agent` field is a string; v1 schema validates that it is a non-empty string and recommends `"claude-code"` as the only currently-integrated runtime, but does not enforce an enum. PRD §3 / §5 commit to MCP-based dispatch making the framework agent-agnostic; locking the enum now would invert that. Enum tightening is a follow-up once `06-agent-dispatcher` lands.
- **Project-level secrets / API keys.** `.ledger/project.json` is committed to source. Secrets go through the agent runtime's own configuration channel (e.g., `ANTHROPIC_API_KEY` env var for Claude Code); this file does not carry them.
- **A schema for tasks, events, or runtime state.** Same boundary as `02-schema`: those belong in `05-task-runner`.
- **Auto-detection or scaffolding of `.ledger/project.json`** from existing repo state. The PRD §13 deferral notes the eventual path (operator checklist → CLI command → LLM-assist); none of that ships here. Today's authoring is: operator copies the canonical sample from this spec into `.ledger/project.json` and edits the four fields.
- **Multiple `agent` runtimes per project.** v1 schema allows one `agent` string. Multi-agent projects (e.g., Claude Code for impl, a separate reviewer-agent persona for verify) are noted in PRD §11's self-audit-problem mitigation but the dispatch layer (`06-agent-dispatcher`) is where multi-runtime fans out — the metadata file just names the *default* runtime here.

---

## Design

### Where the files live

```
.ledger/
  project.json                              # authored config, committed to source
docs/
  _schemas/
    document-node.schema.json               # exists (02-schema)
    project-metadata.schema.json            # new — this node's deliverable
  03-project-metadata.md                    # this spec
app/src/lib/project/
  loadProjectMetadata.ts                    # build-time loader + validator
  loadProjectMetadata.test.ts
  types.ts                                  # ProjectMetadata interface, hand-aligned with the schema
  fixtures/
    conformant.json
    missing-name.json
    bad-schema-version.json
    malformed.json                          # not valid JSON
    empty-agent.json
```

`.ledger/` (without the underscore-prefix convention used inside `docs/_schemas/`) is the project's runtime / configuration directory at the **repo root**, not inside `docs/`. The leading dot follows the standard convention for tool config dirs (`.git/`, `.vscode/`, `.github/`). PRD §7.1 names this path explicitly: `.ledger/project.json`. The schema file for `.ledger/project.json` lives in `docs/_schemas/` — the schema *artifact* is part of the documentation tree (PRD §9), while the *config it describes* sits at the repo root where every other tool config dir lives.

### Schema shape

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ledger.dev/schemas/project-metadata.schema.json",
  "title": "ProjectMetadata",
  "description": "Top-level config for a ledger-managed project. Lives at .ledger/project.json. Schema version 1.",
  "type": "object",
  "required": ["schemaVersion", "name", "docs", "agent"],
  "additionalProperties": false,
  "properties": {
    "schemaVersion": {
      "const": 1,
      "description": "Authored explicitly by the operator; bumps on breaking schema changes."
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "description": "Human-readable project name shown in the topbar."
    },
    "docs": {
      "type": "string",
      "minLength": 1,
      "pattern": "^[^/].*[^/]$|^[^/]$",
      "description": "Relative path from the project root to the docs tree, e.g. \"docs\". No leading or trailing slash."
    },
    "agent": {
      "type": "string",
      "minLength": 1,
      "description": "Identifier of the agent runtime used to dispatch tasks. v1 recommends \"claude-code\"; no enum enforced."
    }
  }
}
```

Notes on field choices:

- **`schemaVersion` is authored explicitly, not injected.** Contrast with `02-schema`'s `document-node.schema.json` where `schemaVersion` is injected by the validator before validation (because documents don't write it in markdown). Here the file is JSON; the operator writes the field directly. This matches the precedent set by widely-deployed JSON configs (`package.json`'s engines, tsconfig's `$schema`) where the version is explicit.
- **`docs` is a relative path string, not an array.** v1 supports one docs root per project. A future multi-root variant would change the type; bumping `schemaVersion` is the migration story.
- **`agent` is a free-form string in v1.** See out-of-scope above; enum tightening lands with `06-agent-dispatcher`. The schema's `description` field recommends `"claude-code"` for v1.
- **`additionalProperties: false`** — strict rejection of unknown fields. The artifact is small enough that typos like `"agents"` should fail loudly, not silently. Future fields require a `schemaVersion` bump.
- **No `version` field at the project level.** Project version (e.g. semver) is git's job (`git describe`, tags). Adding it here invites drift with the actual VCS state.

### Canonical sample (this repo's `.ledger/project.json`)

```json
{
  "schemaVersion": 1,
  "name": "Ledger",
  "docs": "docs",
  "agent": "claude-code"
}
```

This is the file authored at this repo's root as part of this node's implementation. It is the first dogfooded artifact of the framework's own project-identity story: ledger is the first ledger-managed project.

### Loader

```ts
// app/src/lib/project/loadProjectMetadata.ts
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../../../../docs/_schemas/project-metadata.schema.json" with { type: "json" };
import type { ProjectMetadata } from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const compile = ajv.compile<ProjectMetadata>(schema);

export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
}

export type ProjectMetadataResult =
  | { ok: true; metadata: ProjectMetadata }
  | { ok: false; errors: ValidationError[] };

// Vite eager-glob: there is exactly one .ledger/project.json at the repo root.
// Path is relative to this source file: app/src/lib/project/loadProjectMetadata.ts → ../../../../.ledger/project.json.
const raw = import.meta.glob<string>("../../../../.ledger/project.json", {
  query: "?raw",
  import: "default",
  eager: true,
});

export function loadProjectMetadata(): ProjectMetadataResult { … }

// Sync, build-time. There is exactly one instance per build.
// Consumers import the resolved value, not the function — same pattern as
// parseDocs.ts's `loadDocNodes()` memoisation.
export const projectMetadata: ProjectMetadataResult = loadProjectMetadata();
```

Mirrors `02-schema`'s `validateDocNode.ts` shape — same ajv version, same `Result<T, ValidationError[]>` discipline (D7 from `02-schema`), same build-time glob bootstrap. The `ProjectMetadata` TS interface is hand-written in `types.ts` and kept in lockstep with the JSON Schema (D8 from `02-schema`: no codegen in v1; codegen is logged as a sibling Open Issue here too).

Loader behavior on missing file: `import.meta.glob` returns an empty object when no file matches. The loader treats this as `{ ok: false, errors: [{ path: "/", message: ".ledger/project.json is missing", keyword: "required" }] }`. The build does not fail — same posture as `02-schema` D9 (omit + visible banner, never crash the tree).

Loader behavior on malformed JSON: the raw glob result is a string; `JSON.parse` failure is caught and surfaced as a single `ValidationError` with `keyword: "parse"`. Again, build does not fail.

### Topbar consumer

Today (`Topbar.tsx:34`):

```tsx
<div className="text-sm text-[color:var(--color-muted)]">
  untitled project
</div>
```

After this node:

```tsx
import { projectMetadata } from "@/lib/project/loadProjectMetadata";

const name = projectMetadata.ok ? projectMetadata.metadata.name : "untitled project";
// …
<div className="text-sm text-[color:var(--color-muted)]">
  {name}
</div>
```

Validation failures are surfaced in the same dev-only banner that `02-schema` D9 introduced — `Topbar.tsx` already imports `docValidationErrorPaths` and renders the banner; this node extends the banner to also count `projectMetadata.ok === false` cases. The banner message changes from "1 doc failed validation" to a unified "N validation errors" once the project metadata is wired in (one-line edit to the existing banner copy).

The fallback string `"untitled project"` stays as a last-resort default for the "validation failed" path — it remains visible, but the dev banner makes the failure cause obvious.

### Test infrastructure

Vitest is already present and configured (established by `02-schema`); no new test runner work. Fixture-based tests live under `app/src/lib/project/fixtures/*.json` and `app/src/lib/project/loadProjectMetadata.test.ts`. The test file:

- Loads each fixture JSON (not via `import.meta.glob` — direct synchronous `JSON.parse` of fixture string content) and exercises the validator with it.
- Asserts the conformant fixture returns `{ ok: true, metadata: { … } }` with the expected fields.
- Asserts each malformed fixture returns `{ ok: false, errors: [...] }` with at least one error whose `path` or `keyword` matches the expected failure mode.
- Asserts that `projectMetadata` (the module-level singleton) is `ok: true` against the real `.ledger/project.json` written by this node — closes the equivalent of `02-schema`'s `parseDocs.test.ts` against-the-real-tree assertion (this node's analog is "the real metadata file passes validation").

### Files added / modified

```
docs/_schemas/project-metadata.schema.json       [new — canonical JSON Schema]
.ledger/project.json                              [new — first dogfooded config]
app/src/lib/project/types.ts                      [new — ProjectMetadata interface]
app/src/lib/project/loadProjectMetadata.ts        [new — loader + validator]
app/src/lib/project/loadProjectMetadata.test.ts   [new — fixture suite]
app/src/lib/project/fixtures/conformant.json      [new]
app/src/lib/project/fixtures/missing-name.json    [new]
app/src/lib/project/fixtures/bad-schema-version.json  [new]
app/src/lib/project/fixtures/malformed.json       [new — not valid JSON]
app/src/lib/project/fixtures/empty-agent.json     [new]
app/src/components/layout/Topbar.tsx              [modified — consume projectMetadata.name]
docs/03-project-metadata.md                       [this spec — status transitions]
docs/00-project.md                                [modified — §14 status row]
docs/01-ui/01-shell.md                            [modified — close "untitled project" Open Issue]
```

No new dependencies. `ajv@8.20.0` and `ajv-formats@3.0.1` are already in `app/package.json` (installed by `02-schema`).

### Acceptance check (manual)

A reviewer running the worktree must observe:

1. `.ledger/project.json` exists at the repo root, is valid JSON, and matches the canonical sample above.
2. `docs/_schemas/project-metadata.schema.json` exists, is valid JSON, and lints under `ajv compile` without errors.
3. `pnpm -C app test` runs and all `project/*.test.ts` tests pass at zero failures.
4. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero. Bundle delta vs main HEAD reported in Implementation Notes (no new deps — delta should be the loader + schema JSON, ~1–3 KB gzip).
5. The topbar shows `"Ledger"` (from `.ledger/project.json`'s `name` field) instead of `"untitled project"` on every page.
6. Deliberately corrupting `.ledger/project.json` (e.g., delete the `name` field or break the JSON syntax) produces a structured `ValidationError`, the topbar falls back to `"untitled project"`, and the dev-only validation banner reports the failure with a useful path.
7. Reverting the corruption clears the banner and restores the project name.
8. The `01-ui/01-shell.md` Open Issue "Topbar shows 'untitled project' — no project metadata source" is closed in the same node (struck through with a closure note, per the leaf-workflow's "doc and code must agree" rule).

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | JSON Schema (draft 2020-12) artifact in `docs/_schemas/project-metadata.schema.json` | Mirrors `02-schema`'s D1: PRD §9 specifies "versioned JSON schema" as the canonical artifact; co-locating with the document-node schema keeps both sibling artifacts under one directory the parser already special-cases. Language-agnostic — the API server or any other consumer in any language can validate against the same file. |
| D2 | `.ledger/project.json` at repo root, not under `docs/` | Matches PRD §7.1's explicit naming. The dot-prefix matches universal tool-config convention (`.git/`, `.vscode/`); placing it under `docs/` would imply it is a document, but it is operational config that happens to be described by a documented schema. Schema lives with the docs; instance config lives at the project root. |
| D3 | Hand-authored sample is committed to *this* repo, not generated | Dogfood discipline: ledger is the first ledger-managed project. If the framework cannot produce its own `.ledger/project.json`, the artifact has a problem. Matches `02-schema`'s D2 (no auto-rewrites). |
| D4 | Four fields in v1: `schemaVersion`, `name`, `docs`, `agent` | Minimum set to (a) identify the project to a human (`name`), (b) scope the framework to a docs tree (`docs`), (c) name a dispatch runtime (`agent`), (d) enable migration when the schema changes (`schemaVersion`). PRD §11 suggests this exact set. Anything more (description, owner, license, env-overrides) is YAGNI and can be added with a `schemaVersion` bump. |
| D5 | `agent` is a free-form string, no enum | PRD §3 / §5 commit to MCP-based dispatch making the framework agent-agnostic. Enum-locking now would invert that commitment. `06-agent-dispatcher` is where the enum tightening (if any) belongs. Open Issue logs this. |
| D6 | `additionalProperties: false` on the schema | Strict rejection of unknown fields. Typos should fail loudly. The artifact is small enough that strictness has no cost; future fields require a `schemaVersion` bump anyway. |
| D7 | Build-time validation via Vite's `import.meta.glob` (no fetch) | Mirrors `02-schema`'s D6 and `parseDocs.ts:199`. The artifact is small (~100 bytes), static, and present at build time; runtime fetch adds complexity (loading state, error UI) for no gain. When the API server lands, validation moves server-side, same migration path as `02-schema`. |
| D8 | Loader returns `Result<ProjectMetadata, ValidationError[]>`, never throws | Mirrors `02-schema`'s D7. A bad config file should degrade visibly (fallback name + dev banner), not crash the whole UI. The validator surfaces errors; the topbar decides how to render them. |
| D9 | TS interface `ProjectMetadata` is hand-written, kept in lockstep with the schema | Mirrors `02-schema`'s D8. Four fields; drift risk is small enough to manage manually for v1. Codegen is logged as a sibling Open Issue here too — same trigger (third hand-edit). |
| D10 | Missing file is a validation error, not a build failure | `import.meta.glob` returns `{}` when nothing matches. The loader treats this as `errors: [{ ".ledger/project.json is missing" }]` and the build proceeds. Rationale: a developer who clones the repo and runs `pnpm dev` before authoring `.ledger/project.json` should see the framework's normal fallback ("untitled project" + dev banner pointing at the missing file), not a cryptic Vite import error. |
| D11 | Topbar's existing dev-only validation banner (introduced by `02-schema` D9) extends to count metadata errors | Reuse the banner that already exists. Two parallel banners would be visual noise; one unified counter ("N validation errors") with the first failing path on hover is sufficient. The banner copy moves from "doc failed validation" to "validation error" — a one-line change. |
| D12 | `docs` is a relative path string in v1, not an array | One docs root per project in v1 (PRD §7.1). Multi-root is a v2 concern; bumping `schemaVersion` is the migration story. Keeping it a string keeps the consumer code (`path.join(projectRoot, projectMetadata.docs)`) trivial. |

---

## Open Issues

- **Schema version migration policy.** Same concern as `02-schema`'s same-named Open Issue. v1 hard-stamps `schemaVersion: 1`; when v2 lands, there is no story yet for the validator picking a target version or for migrating an existing `.ledger/project.json`. Likely shape: a validator chain keyed on the file's authored `schemaVersion`. *(Priority: MEDIUM — first felt at the second bump.)*
- **`agent` enum tightening.** D5 keeps `agent` free-form. Once `06-agent-dispatcher` lands the MCP-based dispatch interface and the integrated runtimes are known, the schema could tighten to an enum (`"claude-code"`, `"codex"`, `"mcp:<server-id>"`). Today's free-form posture is the right v1 trade-off; revisit when the dispatcher's runtime registry exists. *(Priority: LOW.)*
- **TS-types vs JSON-Schema drift.** D9 keeps the `ProjectMetadata` interface hand-aligned. As fields grow, codegen via `json-schema-to-typescript` becomes attractive. Trigger: third hand-edit. *(Priority: LOW.)*
- **Multi-project recents chooser.** PRD §13 defers the recents chooser UI; PRD §7.1 commits to one-project-per-instance for v1. This node ships the per-project artifact; the chooser is a follow-up that reads `~/.ledger/recent.json` (a separate, user-scoped artifact with its own schema, out of this node's scope). *(Priority: LOW — defer per PRD §13.)*
- **Migration tooling.** PRD §13's `ledger migrate /path/to/existing/project` would scaffold this file from an existing repo's READMEs and structure. v1 expects hand authoring. Validated path per PRD §13: dogfood manually first, then CLI, then LLM-assist. This node is the "dogfood manually" step. *(Priority: LOW — defer per PRD §13.)*
- **Secrets management.** `.ledger/project.json` is committed to source and therefore must not carry secrets. Today the only candidate secret is the agent's API key, and that already lives in the agent's own env (e.g. `ANTHROPIC_API_KEY` for Claude Code). If a future field needs a project-scoped secret (e.g. a custom MCP server's auth token), the right pattern is a separate `.ledger/secrets.json` excluded by gitignore, with a third schema artifact. v1 does not introduce this; logging it so future-me does not silently add a secret field to `project.json`. *(Priority: MEDIUM — comes up the first time MCP-based dispatch needs project-scoped auth.)*
- **`docs` path validation.** The schema validates that `docs` is a non-empty string with no leading/trailing slash; it does not validate that the path actually exists on disk relative to the project root. That check belongs at API-server load time (`04-api-server`), where the filesystem is available. For now, the build-time validator is content-shape-only. *(Priority: LOW — surfaces as a Vite import error if `docs` is misnamed, which is fine for v1.)*
- **No `parentId` / no document-tree membership.** `.ledger/project.json` is not a document node; it is project-level config that *contains* a pointer to the document tree. The schema therefore omits `parentId`, `nodeId`, and the `## Children` manifest shape. This is correct, but worth flagging so a future contributor does not try to retrofit `document-node.schema.json`'s shape onto this artifact. The two schemas are siblings, not parent/child. *(Priority: TRIVIAL — design clarification, not a problem.)*

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. `docs/_schemas/project-metadata.schema.json` exists and parses as valid JSON Schema (`ajv compile` succeeds).
2. `.ledger/project.json` exists at the repo root, contains exactly the four fields specified in D4, and validates against the schema.
3. `pnpm -C app test` exits zero with the new `project/*.test.ts` suite passing.
4. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero. Bundle delta is reported in Implementation Notes.
5. The topbar shows `"Ledger"` (from the metadata `name`) on every page, replacing the previous `"untitled project"` literal.
6. Deliberately corrupting `.ledger/project.json` (delete `name`, break JSON syntax, or set `schemaVersion: 2`) produces a structured `ValidationError`, the topbar falls back to `"untitled project"`, and the dev-only banner counts the failure.
7. Reverting the corruption clears the banner and restores the project name in the topbar.
8. `01-ui/01-shell.md`'s "untitled project" Open Issue is closed in this node's commit, with a closure note pointing back at `03-project-metadata`.
9. `ajv` and `ajv-formats` versions are unchanged in `app/package.json` — no new runtime dependencies added by this node.
10. No Node-only imports leak into the browser bundle; the loader is pure build-time + browser-safe (`import.meta.glob` + ajv, both already used in the browser by `02-schema`).

---

## Children

None.
