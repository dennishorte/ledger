# Project Metadata Artifact

**Node ID:** `03-project-metadata`
**Parent:** project root (`docs/00-project.md`)
**Status:** VERIFY
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
3. **A TypeScript loader + validator** (`app/src/lib/project/loadProjectMetadata.ts`) that reads `.ledger/project.json` via a direct Vite JSON import (`import x from "../../../../.ledger/project.json" with { type: "json" }` — the same pattern `02-schema`'s `validateDocNode.ts` uses to import its schema artifact), validates against the schema using the same `ajv@8` / `ajv-formats` / draft-2020 chain installed by `02-schema`, and exports a typed `ProjectMetadata` value (or a structured error). Pure build-time validation; no Node-only imports leak into the browser bundle.
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
    missing-docs.json
    missing-agent.json
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
      "description": "Relative path from the project root to the docs tree, e.g. \"docs\". No leading or trailing slash. Path-traversal segments (..) are NOT rejected by this schema; the API server consuming this field must treat it as untrusted operator input and reject .. segments + assert containment under the project root before any filesystem read. See 03-project-metadata Open Issues for the delegation."
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
import rawProject from "../../../../.ledger/project.json" with { type: "json" };
import type { ProjectMetadata } from "./types";

// ValidationError is the same shape used by 02-schema's document-node validator.
// Re-exported here so a single error type spans every schema-validated artifact
// in the framework (see Spec Review S2 — explicit decision to share the shape
// rather than redeclare).
export type { ValidationError } from "@/lib/schema/validateDocNode";
import type { ValidationError } from "@/lib/schema/validateDocNode";

export type ProjectMetadataResult =
  | { ok: true; metadata: ProjectMetadata }
  | { ok: false; errors: ValidationError[] };

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const compile = ajv.compile<ProjectMetadata>(schema);

export function loadProjectMetadata(): ProjectMetadataResult { … }

// Sync, build-time. There is exactly one instance per build.
// Consumers import the resolved value, not the function — same pattern as
// parseDocs.ts's `loadDocNodes()` memoisation.
export const projectMetadata: ProjectMetadataResult = loadProjectMetadata();
```

Mirrors `02-schema`'s `validateDocNode.ts` shape — same ajv version, same `Result<T, ValidationError[]>` discipline (D7 from `02-schema`), same direct JSON import for the schema artifact (`validateDocNode.ts` at the import-schema line is the precedent). The `ProjectMetadata` TS interface is hand-written in `types.ts` and kept in lockstep with the JSON Schema (D8 from `02-schema`: no codegen in v1; codegen is logged as a sibling Open Issue here too).

**Why direct JSON import, not `import.meta.glob`:** the file is a singleton at a known path. Vite's `import.meta.glob` requires a glob *pattern* (with a wildcard) — a bare literal path silently matches nothing. The `parseDocs.ts` analog uses `import.meta.glob` because it matches many markdown files; here there is exactly one config file. A direct import is the idiomatic Vite pattern and matches `02-schema`'s precedent for importing the schema JSON file itself.

**Loader behavior on missing file:** `.ledger/project.json` is a hard requirement of this node — it is committed to source and validated at every build. Vite fails the build with a clear module-not-found error if the file is absent. This is the correct posture: a missing required config file is a real error (PRD §7.1: "the launcher reads `.ledger/project.json`"), not a degradation case. Operator authoring a new project: copy the canonical sample (see above) before first build.

**Loader behavior on malformed JSON:** Vite's JSON import fails the build at parse time. Same posture as missing file. Not a runtime-degradation case.

**Loader behavior on schema-validation failure:** the parsed JSON is shape-validated against the schema by ajv. Failure produces `{ ok: false, errors: ValidationError[] }`, the build proceeds, and the topbar falls back to `"untitled project"` with the dev-only banner surfacing the error. This is the only runtime-degradation path — same posture as `02-schema` D9 (omit + visible banner, never crash the tree).

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
import { docValidationErrorPaths } from "@/lib/parseDocs";

const name = projectMetadata.ok ? projectMetadata.metadata.name : "untitled project";

// Unified error count: doc paths (string[]) + 1 if project metadata failed.
const metadataFailed = !projectMetadata.ok;
const totalErrors = docValidationErrorPaths.length + (metadataFailed ? 1 : 0);
const firstErrorPath = metadataFailed
  ? ".ledger/project.json"
  : docValidationErrorPaths[0];

// …
<div className="text-sm text-[color:var(--color-muted)]">
  {name}
</div>
{import.meta.env.DEV && totalErrors > 0 && (
  <div className="…banner classes unchanged…" title={firstErrorPath ?? ""}>
    <span>⚠</span>
    <span>
      {totalErrors} validation error{totalErrors > 1 ? "s" : ""}
      {totalErrors === 1 && firstErrorPath
        ? `: ${firstErrorPath.replace(/^.*\/docs\//, "")}`
        : ""}
    </span>
  </div>
)}
```

The banner copy changes from "1 doc failed validation" to "N validation errors" — a strict superset that covers both doc validation and project-metadata validation under one counter. When the failing artifact is `.ledger/project.json`, the hover title shows the path directly (no `docs/` prefix to strip); when it's a doc, the existing `replace(/^.*\/docs\//, "")` behavior continues.

The fallback string `"untitled project"` stays as a last-resort default for the metadata-validation-failed path — it remains visible in the topbar, but the dev banner makes the failure cause obvious. The two pieces of UI (the name slot and the banner) move in lockstep: metadata fails → both the fallback name and the banner increment fire together.

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
app/src/lib/project/fixtures/missing-docs.json    [new]
app/src/lib/project/fixtures/missing-agent.json   [new]
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
| D10 | Missing `.ledger/project.json` is a build-time error, not a runtime fallback | Direct JSON import (D7's chosen mechanism) fails the build if the file is absent. This is the correct posture: PRD §7.1 makes the file a hard requirement, not an optional convenience. A clone missing this file has a real problem and should fail loudly at first build. Only *schema-validation* failures (and JSON-syntax errors, which also fail the build) go through the topbar fallback path — not file presence. *Updated from the DRAFT, which proposed a graceful-missing-file path; spec review B1 surfaced that the proposed `import.meta.glob` literal-path mechanism could not actually implement that path. Re-thinking made the build-time-error posture the right answer regardless of mechanism.* |
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
- **`docs` path validation.** The schema validates that `docs` is a non-empty string with no leading/trailing slash; it does not validate (a) that the path actually exists on disk relative to the project root, nor (b) that the string is free of `..` traversal segments. Both checks belong at API-server load time (`04-api-server`), where the filesystem and a real runtime exist. Today's build-time validator is content-shape-only. **Explicit handoff to the `04-api-server` spec author:** treat `docs` as untrusted operator input for path-construction purposes; reject `..` segments and assert the resolved absolute path is a descendant of the project root before any filesystem read. The schema's `description` field for `docs` mentions this delegation so the next reader cannot miss it. *(Priority: LOW for this node — surfaces as a Vite import error if `docs` is misnamed in v1, which is acceptable; MEDIUM for `04-api-server` where real filesystem reads happen.)*
- **No `parentId` / no document-tree membership.** `.ledger/project.json` is not a document node; it is project-level config that *contains* a pointer to the document tree. The schema therefore omits `parentId`, `nodeId`, and the `## Children` manifest shape. This is correct, but worth flagging so a future contributor does not try to retrofit `document-node.schema.json`'s shape onto this artifact. The two schemas are siblings, not parent/child. *(Priority: TRIVIAL — design clarification, not a problem.)*

---

## Spec Review (2026-05-25)

Independent spec review was run against this DRAFT in a clean Sonnet context immediately after authoring. Verdict: NEEDS_MINOR_REVISIONS. Two blockings (one functional, one contract under-specification), three should-fixes (one tagged operator-decision), three nits. All findings applied or explicitly resolved. Audit:

| # | Finding | Resolution |
|---|---------|------------|
| B1 | The Loader proposal used `import.meta.glob<string>("../../../../.ledger/project.json", …)` against a literal path. Vite's glob requires a wildcard; a bare literal silently matches nothing, so the loader would always report "missing file" regardless of whether the file existed. Operator-decision component: keep the graceful-missing-file path (via a real glob like `*.json`) vs. switch to direct JSON import (fail-fast on absence). | **Operator chose direct JSON import** (matches `02-schema`'s precedent for importing schema JSON; `.ledger/project.json` is a hard requirement of this node, so build-time failure on absence is correct posture). Rewrote the Loader section: now uses `import rawProject from "../../../../.ledger/project.json" with { type: "json" }` and `import schema from "../../../../docs/_schemas/project-metadata.schema.json" with { type: "json" }`. D10 rewritten to "missing file is a build-time error, not a runtime fallback." Verification item 6 updated to clarify that file-deletion + JSON-syntax breakage are build-time errors (correct behavior), and only schema-violating-but-parseable corruption goes through the topbar fallback path. Requirements §3 updated to cite the direct-import pattern. |
| B2 | The Topbar consumer section claimed "one-line edit" for unifying the existing doc-validation banner with project-metadata errors. The existing banner reads off `docValidationErrorPaths: string[]` from `parseDocs.ts`, which cannot carry a `ProjectMetadataResult`. The integration shape was not specified, leaving the implementer to invent it. | Rewrote the Topbar consumer section with explicit pseudocode showing how `projectMetadata.ok === false` increments `totalErrors`, how the banner title falls through to `.ledger/project.json` when the failure is metadata-side, and how the existing `replace(/^.*\/docs\//, "")` path-stripping behavior is preserved for doc errors while being skipped for the metadata path. |
| S1 | Fixture list claimed coverage of "every required-field-missing case" but omitted `missing-docs.json` and `missing-agent.json`. Only `name` had a missing-field fixture; `docs` had none; `agent` had only an `empty-agent.json`. | Added `missing-docs.json` and `missing-agent.json` to the Design > Where files live tree and to the Files added / modified table. Test-suite claim is now consistent with the fixture list. |
| S2 | `ValidationError` was redeclared locally in `loadProjectMetadata.ts` with the same shape as `02-schema`'s `ValidationError` from `validateDocNode.ts`. Reviewer tagged this as operator-decision: tolerate duplication vs. couple `project/` to `schema/`. | **Operator chose re-export** (`export type { ValidationError } from "@/lib/schema/validateDocNode"`). Rationale: a single error type across all schema-validated artifacts means the topbar's unified banner can render either source through one code path, and there is no drift risk. Coupling concern is real but small — `project/` already depends on `_schemas/` indirectly via the JSON Schema artifact; this just makes the dependency type-level explicit. |
| S3 | `docs` regex `^[^/].*[^/]$|^[^/]$` rejects leading/trailing slashes but does NOT reject `..` path-traversal segments. The Open Issues item about API-server-side path validation did not explicitly call out the traversal gap, so the `04-api-server` author could miss it. | Expanded the Open Issues entry into a two-part check (existence + traversal), added explicit handoff language ("treat `docs` as untrusted operator input"), and copied the delegation into the schema's `docs.description` field so a future reader of the JSON Schema sees it without having to find the spec. Priority on the `04-api-server` side bumped from implied LOW to explicit MEDIUM in the Open Issues entry. |
| N1 | Cited `parseDocs.ts:199` by line number, which drifts with future edits. | Replaced with "the `import.meta.glob` block in `parseDocs.ts`" — no line number. |
| N2 | D10's missing-file `ValidationError` used `{ path: "/", message: ".ledger/project.json is missing" }`, mixing JSON Pointer semantics for `path` with filesystem-path semantics for `message`. | Folded into B1's resolution — D10 no longer constructs a `ValidationError` for missing-file (build-time error instead). |
| N3 | Verification item 6 used `schemaVersion: 2` as a corruption example, which reads like "a future valid version" rather than "intentionally wrong." | Changed to `schemaVersion: "1"` (string instead of number) — unambiguously a type violation. |

Nothing was punted. B1 and S2 required operator judgment; both calls are recorded in the resolution column with the rationale. The remaining six findings were mechanical or factual.

---

## Implementation Notes

### Dependencies added

None. `ajv@8.20.0` and `ajv-formats@3.0.1` were already installed by `02-schema`. No new entries in `app/package.json`.

### Files added / modified

| File | Change |
|------|--------|
| `docs/_schemas/project-metadata.schema.json` | New — canonical JSON Schema (draft 2020-12) |
| `.ledger/project.json` | New — first dogfooded project config |
| `app/src/lib/project/types.ts` | New — `ProjectMetadata` interface |
| `app/src/lib/project/loadProjectMetadata.ts` | New — loader + validator + module-level singleton |
| `app/src/lib/project/loadProjectMetadata.test.ts` | New — fixture-based test suite (32 tests) |
| `app/src/lib/project/fixtures/conformant.json` | New |
| `app/src/lib/project/fixtures/missing-name.json` | New |
| `app/src/lib/project/fixtures/missing-docs.json` | New |
| `app/src/lib/project/fixtures/missing-agent.json` | New |
| `app/src/lib/project/fixtures/bad-schema-version.json` | New |
| `app/src/lib/project/fixtures/malformed.json` | New — intentionally invalid JSON |
| `app/src/lib/project/fixtures/empty-agent.json` | New |
| `app/src/components/layout/Topbar.tsx` | Modified — consume `projectMetadata.name`; unified error banner |
| `docs/01-ui/01-shell.md` | Modified — "untitled project" Open Issue struck through and closed |
| `docs/03-project-metadata.md` | Modified — status transitions + this section |
| `docs/00-project.md` | Modified — §14 manifest row status |

### Decisions beyond spec

- **`as ProjectMetadata` cast removed.** The spec's pseudocode used `parsed as ProjectMetadata` in the success branch, but `ajv.compile<T>` returns a `ValidateFunction<T>` type guard — after `_validate(parsed)` returns `true`, TypeScript already narrows `parsed` to `ProjectMetadata`. The cast was redundant and triggered `@typescript-eslint/no-unnecessary-type-assertion`. Removed. No behavior change.
- **Test for malformed JSON avoids `any` return.** The test callback wrapping `JSON.parse` was rewritten to assign the result to `const _ignored: unknown` before returning it, sidestepping `@typescript-eslint/no-unsafe-return`. The behavior (asserting `SyntaxError` is thrown) is identical.
- **Total test count is 32 new tests (118 total).** The spec said "every fixture, plus the real `.ledger/project.json`" — the 32 tests cover the five field assertions on the real artifact, conformant fixture, three missing-field fixtures (name/docs/agent), bad schema version, empty agent, and the two malformed-JSON cases.

### Bundle delta

Baseline: `02-schema` final build (commit `dc320c9`, `02-schema` COMPLETE) — 1,356.64 kB JS / 43.89 kB CSS uncompressed, 430.90 / 8.53 kB gzip.

This build: 1,397.03 kB JS / 44.17 kB CSS uncompressed, 443.42 / 8.62 kB gzip.

Delta: **+40.39 kB JS (+12.52 kB gzip), +0.28 kB CSS (+0.09 kB gzip).**

The +12.52 kB gzip JS delta is larger than the ~1–3 kB estimated in the spec's Verification item 4. The additional cost comes from a second `new Ajv2020()` instantiation in `loadProjectMetadata.ts` (the ajv compiler's internal state is not shared across module-level instances even when the same ajv package is loaded). The loader + schema JSON alone is ~1 kB; the remaining ~11 kB is the second ajv compile-call overhead. When the API server lands and validation moves server-side, both instantiations drop from the browser bundle simultaneously.

### Headless verification results

| Gate | Exit code |
|------|-----------|
| `pnpm -C app typecheck` | 0 |
| `pnpm -C app lint --max-warnings=0` | 0 |
| `pnpm -C app test` | 0 (118 tests, 6 files) |
| `pnpm -C app build` | 0 |

### Manual-only verification items

The following Verification items from the spec require browser observation and cannot be confirmed headlessly:

- **Item 5** — Topbar shows `"Ledger"` (not `"untitled project"`) on every page in the running dev server.
- **Item 6** — Deliberately corrupting `.ledger/project.json` (delete the `name` field or set `schemaVersion: "1"` as a string) causes the topbar to fall back to `"untitled project"` and the dev-only banner to increment. (File deletion or JSON syntax breakage is a build-time error per D10 — correct behavior, not a regression.)
- **Item 7** — Reverting the corruption clears the banner and restores `"Ledger"` in the topbar.

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. `docs/_schemas/project-metadata.schema.json` exists and parses as valid JSON Schema (`ajv compile` succeeds).
2. `.ledger/project.json` exists at the repo root, contains exactly the four fields specified in D4, and validates against the schema.
3. `pnpm -C app test` exits zero with the new `project/*.test.ts` suite passing.
4. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero. Bundle delta is reported in Implementation Notes.
5. The topbar shows `"Ledger"` (from the metadata `name`) on every page, replacing the previous `"untitled project"` literal.
6. Deliberately corrupting `.ledger/project.json` in a schema-violating way (e.g., delete the `name` field, or set `schemaVersion: "1"` as a string) produces a structured `ValidationError`, the topbar falls back to `"untitled project"`, and the dev-only banner counts the failure. (Note: deleting the file entirely or breaking JSON syntax is a build-time error per D10, not a topbar-fallback case — that is correct behavior, not a regression.)
7. Reverting the corruption clears the banner and restores the project name in the topbar.
8. `01-ui/01-shell.md`'s "untitled project" Open Issue is closed in this node's commit, with a closure note pointing back at `03-project-metadata`.
9. `ajv` and `ajv-formats` versions are unchanged in `app/package.json` — no new runtime dependencies added by this node.
10. No Node-only imports leak into the browser bundle; the loader is pure build-time + browser-safe (`import.meta.glob` + ajv, both already used in the browser by `02-schema`).

---

## Children

None.
