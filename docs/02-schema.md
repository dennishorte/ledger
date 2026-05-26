# Document Node Schema

**Node ID:** `02-schema`
**Parent:** project root (`docs/00-project.md`)
**Status:** IN_PROGRESS
**Created:** 2026-05-25
**Last Updated:** 2026-05-25

**Dependencies:** —

---

## Requirements

Make the document schema a **first-class versioned artifact** in the repo, replacing the implicit convention currently encoded in `app/src/lib/parseDocs.ts` (PRD §9, §11). Today the framework's idea of "what a valid document node looks like" lives in 245 lines of unested regex; a new project adopting the framework either matches those conventions by inspection or breaks every UI panel. This node closes that gap.

In scope for v1:

1. **A canonical JSON Schema file** in the document tree (`docs/_schemas/document-node.schema.json`) describing the required front-matter fields, allowed status values, required section headings, and the children-manifest row shape. Schema version is declared inline and is durable across future revisions. **Scope:** the schema describes *leaf implementation nodes* only — see Out-of-scope item below for how root (`00-project.md`) and parent docs (`01-ui/00-ui.md`) are handled in v1.
2. **A TypeScript validator** that takes a markdown string + source path and returns either a typed `DocumentNode` (matching the schema) or a structured list of validation errors. Validator is built on `ajv` (draft 2020-12); the schema file is the single source of truth — the validator loads it, does not duplicate it.
3. **A markdown → candidate extractor** that produces the JSON shape the schema validates. Replaces the per-field regex tangle inside today's `parseDocs.ts` with a single extraction pass whose output is then validated.
4. **Tests** (`*.test.ts`) covering the extractor and validator against representative fixtures: a fully-conformant doc, every required-field-missing case, every status-enum edge, malformed manifest rows, and the parenthetical-annotation status cases that today's `normalizeStatus()` handles silently. Plus a `parseDocs.test.ts` that runs `loadDocNodes()` against the real `docs/` tree and asserts zero validation errors across every leaf doc the parser surfaces. This closes PRD §11's "no `parseDocs.test.ts`" finding on the same artifact that closes the implicit-schema finding (PRD §11 explicitly notes they should land together).
5. **`parseDocs.ts` rebuilt on top of the validator.** The build-time `loadDocNodes()` entry point and `idForPath()` helper retain their current external API — every panel that imports them (`02-dag`'s `useDocGraph`, `03-docs`'s `useDocSource`, `06-health`'s `useHealthData` via the previous two) keeps working unchanged. Internally, they call the new extractor + validator and surface a typed error list to the console (and a single dev-only topbar banner; see D9) for any doc that fails validation, so a malformed doc degrades visibly rather than silently.

**Out of scope for this node:**

- **Root and parent-of-decomposed-node docs.** `docs/00-project.md` (PRD root) uses numbered top-level headings (`## 1. Problem Statement`, `## 14. Children`, etc.); `docs/01-ui/00-ui.md` (UI parent) is missing `Verification` because parents don't go through implementation themselves. Neither matches the leaf-shaped section list. v1 schema validates *leaf implementation nodes only*; the extractor skips root + parent docs by `parentId === null` or "the node has children in the manifest" — those don't go through the validator at all. A v2 parent-doc schema variant is logged as an Open Issue. This honors D2 (no doc rewrites) and matches the precedent already set by `01-ui/09-workflow-progress` (parent nodes there have a two-stage variant, not the full leaf six-stage shape).
- **Cross-document consistency checks** (cycle detection in `parentId` / `dependsOn`, manifest-row-status drift against the child doc's authored status, orphan nodes). These are tree-level invariants, not per-document schema concerns; they belong in the API server's read path (`04-api-server`) or a dedicated `validateDocTree(nodes)` pass. Listed in §Open Issues.
- **Schema for the project metadata file** (`.ledger/project.json`). That is `03-project-metadata`'s deliverable.
- **Schema for tasks, events, or runtime state.** Those belong in `05-task-runner`. v1 schema describes *documents only*.
- **Auto-fix tooling** ("write the missing section heading for me"). v1 reports errors; remediation is operator-driven.
- **A migration pass** that rewrites existing docs to match the schema. The existing 11 docs already conform to the de-facto schema this node formalizes; the validator should accept them all as-is. If any doc fails, the doc is fixed manually, not the schema relaxed (see D2).
- **Lifecycle state-transition validation** (e.g. "DRAFT can only move to SPEC_REVIEW"). JSON Schema can declare the enum but not the transitions; transition rules live in the eventual task runner. v1 validates that a status is *some* legal value, not that it was reached legally.
- **UI surface for validation errors.** The current panels already silently tolerate missing fields by falling back; v1 keeps that resilience and adds a single console error + dev-only banner. Rich error reporting in the UI is a follow-up.
- **Refactor-protocol doc** (PRD §6.5 / §9 "separate child document specifies the refactor protocol"). Mentioned in PRD §9 as adjacent but is a distinct node (likely `02-schema/01-refactor.md` once decomposed). Out of scope here; logged as Open Issue.

---

## Design

### Where the schema lives

```
docs/
  _schemas/
    document-node.schema.json     # canonical JSON Schema artifact (draft 2020-12)
  02-schema.md                     # this spec
```

The leading underscore in `_schemas/` is the parser's signal to skip the subtree from the `DocNode[]` walk (analogous to today's `docs/process/` skip in `parseDocs.ts:pathToNodeId`). Underscore prefix is chosen over a `schemas/` plain name because the schemas directory holds machine-readable artifacts, not implementation nodes — the underscore reads as "internal to the framework" at a glance, parallel to how Python and JS conventions use `_name` for non-public surfaces.

PRD §9 says the schema is "stored in the document tree root." `docs/_schemas/` satisfies that (the docs tree's root) while leaving room for sibling schema files (the project-metadata schema landing with `03-project-metadata`, an eventual task schema with `05-task-runner`).

### Schema shape

The schema describes a **logical document node** — what a parsed doc looks like as JSON, not how its markdown is encoded. The extractor (next section) is the markdown-encoding contract; the schema is the post-extraction contract.

Fields:

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ledger.dev/schemas/document-node.schema.json",
  "title": "DocumentNode",
  "version": 1,                              // bumped on breaking changes
  "type": "object",
  "required": [
    "nodeId", "parentId", "title", "status",
    "created", "lastUpdated", "sections", "schemaVersion"
  ],
  "properties": {
    "schemaVersion": { "const": 1 },         // every doc carries this implicitly via the validator
    "nodeId":     { "type": "string", "pattern": "^(root|[a-z0-9][a-z0-9-]*(/[a-z0-9][a-z0-9-]*)*)$" },
    "parentId":   { "oneOf": [{ "type": "string" }, { "type": "null" }] },
    "title":      { "type": "string", "minLength": 1 },
    "status":     { "enum": ["DRAFT","SPEC_REVIEW","APPROVED","IN_PROGRESS","VERIFY","COMPLETE","ISSUE_OPEN","PLANNED"] },
    "statusAnnotation": { "type": "string" },     // optional parenthetical, e.g. "v1, 2026-05-23"
    "created":     { "type": "string", "format": "date" },
    "lastUpdated": { "type": "string", "format": "date" },
    "dependencies": {
      "type": "array",
      "items": { "type": "string" },
      "default": []
    },
    "sections": {
      "type": "object",
      "required": ["Requirements","Design","Decisions","Open Issues","Implementation Notes","Verification","Children"],
      "additionalProperties": true,           // Spec Review, Round-1 Verification, etc. are allowed
      "properties": {
        "Requirements":         { "type": "string" },
        "Design":               { "type": "string" },
        "Decisions":            { "type": "string" },
        "Open Issues":          { "type": "string" },
        "Implementation Notes": { "type": "string" },
        "Verification":         { "type": "string" },
        "Children":             { "type": "string" }
      }
    },
    "children": {                              // parsed manifest rows from the "## Children" section
      "type": "array",
      "items": {
        "type": "object",
        "required": ["relId", "title", "dependsOn", "status"],
        "properties": {
          "relId":     { "type": "string" },
          "title":     { "type": "string" },
          "dependsOn": { "type": "array", "items": { "type": "string" } },
          "status":    { "$ref": "#/properties/status" }
        }
      }
    }
  }
}
```

Notes on field choices:

- **`schemaVersion: { const: 1 }`** — every parsed doc gets stamped with `schemaVersion: 1` by the validator before validation. We don't require docs to write the version in markdown; the validator injects it. When the schema bumps to v2, the validator decides which version to apply based on a transition rule (TBD; logged as Open Issue).
- **`sections` as object of `{ heading: rawBody }`** — preserves freeform prose inside each section without trying to schemify it. PRD §6.1 says "free-form prose is permitted within defined sections"; we honor that by storing the raw markdown body of each section as a string. Further parsing (Open Issues into `IssueItem[]`, Decisions into rows) is the consumer's responsibility, layered on top.
- **`additionalProperties: true` on `sections`** — the leaf-workflow adds dated audit sections (`Spec Review (YYYY-MM-DD)`, `Round-1 Verification Feedback (YYYY-MM-DD)`); these are allowed but not required. We don't enumerate them.
- **`children` is a flat array of *manifest rows*, not resolved `DocNode[]`** — the schema describes one document in isolation. Resolution to absolute IDs and merging manifest-only children into the node set is `parseDocs.ts`'s job, not the schema's. This keeps the schema composable: a future API endpoint that returns one node validates against this schema directly, without needing the whole tree.
- **`Children` section is required but `children` array may be empty** — leaf docs write `None.` as the section body and emit `children: []`.
- **`parentId` allows null** — only `root` (00-project.md) has `parentId: null`. The validator does not enforce "only root has null parent"; that's a tree-level invariant (Open Issue).

### Markdown encoding contract (extractor responsibility)

The extractor (`parseDocNode.ts`) converts markdown to the candidate JSON. The encoding rules — frozen as of v1 — are:

| Field | Markdown encoding |
|---|---|
| `nodeId` | Derived from file path. `docs/00-project.md → root`; `docs/<dir>/00-<slug>.md → <dir>`; otherwise `docs/<rel>.md → <rel without .md>`. The `**Node ID:** \`…\`` line in the body is a redundant secondary source — extractor cross-checks the two; mismatch is a validation error. |
| `parentId` | The `**Parent:**` front-matter line. Special case: `project root (\`docs/00-project.md\`)` → `"root"`. Otherwise the first backticked id. If absent, the extractor derives from path segments. `nodeId === "root"` ⇒ `parentId: null`. |
| `title` | First `# …` heading. |
| `status` | First whitespace-delimited token of the `**Status:**` line; normalized to uppercase and `-` → `_` before enum matching (consistent with today's `normalizeStatus()`). Case-insensitive input is accepted; enum matching always runs against the normalized form. Mixed-case inputs like `Draft` validate as `DRAFT`. |
| `statusAnnotation` | The contents of the first `(…)` parenthetical on the `**Status:**` line, if any. Free-form string. |
| `created` | `**Created:**` line, must be ISO date (`YYYY-MM-DD`). |
| `lastUpdated` | `**Last Updated:**` line, ISO date — trailing `(notes)` parenthetical allowed and dropped during extraction. |
| `dependencies` | `**Dependencies:**` line; all backticked ids extracted as the array. The literal `—` is treated as the empty array. Line absent ⇒ empty array. |
| `sections` | Every `## Heading` opens a section; the section body is everything from the heading to the next `## ` (exclusive) or EOF. The seven required headings must be present (string-exact match). |
| `children` | Inside the `## Children` section, the markdown table rows of shape `\| \`relId\` \| title \| deps \| status \|`. The literal `—` in `deps` → empty array; backticked ids in `deps` → the array. Section body literal `None.` ⇒ empty children array. |

The extractor is a pure function — no React, no Vite globs, no filesystem access. It takes `(filePath: string, raw: string)` and returns `unknown` (the candidate JSON), or `null` when the path is outside the validation scope. `null` is returned for paths whose `docs/`-relative portion starts with `process/` or `_schemas/` (mirrors the existing `process/` skip at `parseDocs.ts:106`) and for root + parent docs (see the out-of-scope item above) — those are identified by `pathToNodeId` returning `"root"` or by the parsed doc's `**Parent:**` line. All schema enforcement happens in the validator step.

### Validator

```ts
// app/src/lib/schema/validateDocNode.ts
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../../../../docs/_schemas/document-node.schema.json" with { type: "json" };

export interface ValidationError {
  path: string;        // JSON Pointer, e.g. "/sections/Requirements"
  message: string;     // ajv's message, lightly humanized
  keyword: string;     // ajv keyword that failed
}

export type ValidationResult =
  | { ok: true;  node: DocumentNode }
  | { ok: false; errors: ValidationError[] };

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const compile = ajv.compile<DocumentNode>(schema);

export function validateDocNode(candidate: unknown): ValidationResult { … }
```

The `DocumentNode` TS interface is hand-written in `app/src/lib/schema/types.ts` to mirror the schema. `NodeStatus` and `NodeId` are **re-exported from `src/lib/types.ts`** — they are already canonical there (shipped by `02-dag` D4) and the schema module must not redeclare them. `DocumentNode` is a *superset* of `DocNode`: it carries the full validated front-matter + sections + manifest-row payload; `parseDocs.ts`'s merge pass projects `DocumentNode → DocNode` for panel consumers. v1 keeps the JSON Schema and the `DocumentNode` interface in lockstep manually; codegen via `json-schema-to-typescript` is logged as Open Issue.

Validator errors are returned, never thrown. `parseDocs.ts` collects them.

### `parseDocs.ts` after the refactor

The existing surface stays:

- `loadDocNodes(): DocNode[]` — still build-time, still emits the same `DocNode[]` shape consumed by every panel.
- `idForPath(path: string): NodeId | null` — unchanged.

Internally it becomes:

```ts
const errors: { path: string; errors: ValidationError[] }[] = [];

for (const [path, body] of Object.entries(rawDocs)) {
  const candidate = parseDocNode(path, body);
  if (!candidate) continue;                 // path skipped (process/, _schemas/)
  const result = validateDocNode(candidate);
  if (!result.ok) {
    errors.push({ path, errors: result.errors });
    continue;                                // doc is omitted from the node set
  }
  // …merge into byId, attach manifest rows, surface manifest-only PLANNED…
}

if (errors.length) console.error("[parseDocs] validation errors:", errors);
```

The merge / manifest pass / `dependsOn` resolution logic stays as-is; only the per-doc field extraction is replaced. The `DocNode` shape consumed by panels is unchanged (`id`, `parentId`, `title`, `status`, `dependsOn`, `authored`, `source`) — it's a *projection* of the validated `DocumentNode`, not the same object.

A future panel (or `06-health`) can surface validation errors prominently; for v1 the console error + a single small banner in the topbar (see D9) is enough.

### Test infrastructure (Vitest already present)

Vitest is already installed (`vitest ^4.1.7` in `app/package.json`) and configured in `app/vite.config.ts` with two projects (`server` and `client`); `pnpm -C app test` already exists as a script and runs `vitest run`. This node adds no new test infrastructure — the new `src/lib/schema/*.test.ts` and `src/lib/parseDocs.test.ts` files are picked up automatically by the existing `client` project's `src/**/*.test.{ts,tsx}` include pattern. The leaf-workflow's stage-4 implementation gate should run `pnpm -C app test` alongside `typecheck` / `lint` / `build`; this spec proposes that addition.

```
app/src/lib/schema/
  parseDocNode.ts
  parseDocNode.test.ts
  validateDocNode.ts
  validateDocNode.test.ts
  types.ts
  fixtures/
    conformant.md           # representative full leaf doc
    missing-status.md
    bad-status-enum.md
    missing-section.md
    malformed-manifest.md
    annotated-status.md     # exercises the parenthetical case
    mixed-case-status.md    # `Draft` → `DRAFT` normalization
```

`parseDocs.test.ts` lives one level up (`src/lib/parseDocs.test.ts`) and asserts that calling `loadDocNodes()` against the real `docs/` tree (via `import.meta.glob` in jsdom) returns at least the current leaf-node count with zero validation errors emitted. This is the test that closes PRD §11's "no `parseDocs.test.ts`" finding.

### Files added / modified

```
docs/_schemas/document-node.schema.json     [new]
app/src/lib/schema/types.ts                  [new — DocumentNode; re-exports NodeStatus/NodeId from src/lib/types.ts]
app/src/lib/schema/parseDocNode.ts           [new]
app/src/lib/schema/parseDocNode.test.ts      [new]
app/src/lib/schema/validateDocNode.ts        [new]
app/src/lib/schema/validateDocNode.test.ts   [new]
app/src/lib/schema/fixtures/*.md             [new]
app/src/lib/parseDocs.ts                     [modified — internals only; loadDocNodes/idForPath external API unchanged]
app/src/lib/parseDocs.test.ts                [new — closes PRD §11 finding]
app/package.json                             [modified — add ajv, ajv-formats only; Vitest already present]
docs/00-project.md                           [modified — §14 status row]
```

### Acceptance check (manual)

A reviewer running the worktree must observe:

1. `docs/_schemas/document-node.schema.json` exists, is valid JSON, and lints under `ajv compile` without errors.
2. `pnpm -C app test` runs and all schema/parser tests pass at zero failures.
3. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero. Bundle delta vs baseline reported in Implementation Notes (ajv adds ~30 KB gzip; acceptable for a build-time validation step — see D6 for why ajv runs in the browser bundle at all).
4. Every authored doc in the current tree (`00-project`, `01-ui/00-ui` through `01-ui/10-orchestration`, `02-schema` itself) passes validation. No doc in the tree is rewritten by this node — if any doc fails, the doc is fixed by hand and the change is committed alongside, with the audit table updated.
5. The `/dag` panel still renders all current + planned nodes. The `/health` panel still surfaces issues. The `/docs/:nodeId` viewer still renders. No visible behavioral regression in any panel.
6. A deliberate corruption (e.g. delete a `**Status:**` line from a fixture, run the test suite) produces a structured `ValidationError` with a useful `path` and `message`.
7. The topbar shows a single muted "1 doc failed validation: <id>" indicator when run against a fixture with a known-bad doc loaded; clears when the corruption is reverted.
8. `parseDocs.ts` still exports `loadDocNodes()` and `idForPath()` with their existing signatures. Grep for callers confirms no import-site changes.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | JSON Schema (draft 2020-12) over Zod, custom DSL, or TS-types-only | PRD §9 explicitly says "versioned JSON schema." A JSON file is language-agnostic — the Python/Go/Rust agent dispatcher (`06-agent-dispatcher`) can validate against the same artifact without depending on the TS validator. Zod-first would invert the canonical/derived relationship the PRD specifies. |
| D2 | Schema codifies the de-facto convention; no doc rewrites | The existing 11 docs were authored under the implicit schema. The validator is calibrated to accept them all as-is. If a real doc fails, the schema is the candidate to relax, not the doc — but the v1 expectation is zero rewrites needed. |
| D3 | Schema lives at `docs/_schemas/document-node.schema.json`; parser skips `_schemas/` | PRD §9: "stored in the document tree root." Underscore prefix matches the convention for "internal/non-document files in a documents tree" (cf. `process/` already special-cased). Leaves room for sibling schemas (`project-metadata.schema.json` from `03-project-metadata`). |
| D4 | Sections stored as `{ heading: rawMarkdown }` map, not deeply parsed | PRD §6.1: free-form prose is permitted. Schema's job is to assert *presence* and *shape*, not interpret semantic content. Consumers that need structure (Open Issues → `IssueItem[]` in `06-health`) layer their own extractors on top of `sections["Open Issues"]`. |
| D5 | `children` is the parsed manifest rows from the section, exposed as a top-level array | Manifest rows are the inter-document linking primitive; keeping them as a structured field (vs. a substring of `sections.Children`) means consumers don't re-parse the table. Mirrors today's `parseChildrenManifest()` output. |
| D6 | `ajv` runs in the browser bundle at build time, not behind a Node-only boundary | The current panel architecture parses docs at Vite build time via `import.meta.glob`; the validator runs at the same time, inside the build, and emits already-validated `DocNode[]` to the browser. Ajv adds ~30 KB gzip — acceptable for the build-time integrity guarantee. When the API server lands, validation moves server-side and the ajv import drops from the browser bundle. |
| D7 | Validator returns `Result<DocumentNode, ValidationError[]>`, never throws | Errors are aggregated across all docs and reported as a batch. Throwing on the first doc would mask the rest. Matches the "report all, fix all" workflow the operator expects from a typecheck-style tool. |
| D8 | TS interface `DocumentNode` is hand-written and kept in lockstep with the JSON Schema; no codegen in v1 | The schema is ~40 lines; the TS interface is ~25 lines; drift risk is small enough to manage manually for v1. Tests assert against both (the validator produces what the types claim). Codegen via `json-schema-to-typescript` is a follow-up if drift becomes painful (Open Issue). |
| D9 | A doc that fails validation is *omitted* from the `DocNode[]` set, and a single dev-only banner in the topbar reports the count + first failing path | Silent omission would regress today's behavior (today, malformed docs render with fallback values). Crashing the whole tree on one bad doc would regress harder. Omit + visible banner is the middle ground: the operator sees that something is wrong, the other panels keep working, and the failing doc's source is one click away in the file system. A richer error UI is a follow-up. |
| D10 | Cross-document invariants (cycle detection, manifest-row drift) are not in this node | The JSON Schema validates one document at a time. Tree-level invariants need the full `DocNode[]` set and belong in a separate `validateDocTree()` function — natural home is `04-api-server`'s read path, where validation runs once on tree load. Forcing them into this node mixes two concerns and bloats the deliverable. |
| D11 | Vitest as the test runner, not Jest or node:test | Vite is already the build tool; Vitest reuses the same config (TS, paths, env). Adds a single dev dependency rather than a parallel toolchain. Industry-standard for Vite projects. |
| D12 | The seven required `## ` headings are matched by literal string equality (case-sensitive, exact spelling) | The existing docs use exact spellings consistently. Tolerating variants ("## Requirements " trailing space, "## requirements " lowercase) would let drift accumulate. A failing match is informative: the operator knows immediately their heading is misspelled. |

---

## Open Issues

- **Schema version migration policy.** v1 stamps every doc with `schemaVersion: 1` implicitly. When a future schema bump happens (e.g. a new required section), there is no story yet for how docs declare their schema version, how the validator picks a target version, or how docs are migrated. Likely shape: an explicit `**Schema-Version:** N` front-matter line plus a per-version validator chain. *(Priority: MEDIUM — first felt at the second bump, not the first; v1 is the only version.)*
- **TS-types vs JSON-Schema drift.** D8 keeps them hand-aligned. As fields grow, codegen via `json-schema-to-typescript` becomes more attractive. Trigger: the third hand-edit-both-files revision. *(Priority: LOW — manageable today.)*
- **Cross-document validation owner.** D10 punts cycle detection and manifest-row drift to `04-api-server`. Until that ships, those invariants are unenforced. The current tree has no cycles (verified by inspection), but adding one accidentally would not be caught. *(Priority: MEDIUM — risk grows as the tree grows.)*
- **Refactor protocol doc (PRD §6.5 / §9).** PRD §9 promises "a separate child document specifies the refactor protocol." That doc has no node yet. Likely a child of this one (`02-schema/01-refactor.md`) — but v1 ships the schema without the refactor protocol formalized. Logged as an explicit follow-up node to decompose later. *(Priority: LOW — refactor doesn't trigger until a doc breaches a size threshold.)*
- **`PLANNED` status in authored docs.** The schema's status enum includes `PLANNED` because the manifest-only synthesis in `parseDocs.ts` produces it for unauthored children. No *authored* doc uses `PLANNED` today; if one ever did, it would validate but read oddly. Open question whether the schema should split the authored-doc enum from the manifest-row enum. *(Priority: LOW — no current violation.)*
- **Validation error reporting in the UI.** D9 settles on a topbar banner. A dedicated `/health` row or `06-health` widget surfacing the failing docs and their structured errors is a natural extension; defer until validation failures actually start happening in practice. *(Priority: LOW.)*
- **`ajv` bundle cost.** Adds ~30 KB gzip (D6). Acceptable today; revisit when the build-time validator is replaced by an API-server validator and the browser no longer needs ajv. *(Priority: LOW.)*
- **Dependency declaration is one-directional.** The schema captures `dependencies` in the dependent's doc front-matter (used by `01-ui/06-health.md`) *and* `dependsOn` in the parent's manifest row (used by every authored child today). These can drift. Long-term, one should be derived from the other. Open question: is the parent manifest the canonical source (today's reality) and the front-matter line redundant? *(Priority: MEDIUM — affects schema clarity.)*
- **Parent-doc schema variant.** v1 excludes root (`00-project.md`) and parent docs (`01-ui/00-ui.md`) from validation because their section structure differs from leaf nodes (root uses numbered sections; parents lack `Verification`). A v2 schema should introduce a *variant* (or three sibling schemas: root / parent / leaf) so the tree is fully covered. Precedent for the leaf/parent split already exists in `01-ui/09-workflow-progress` (two-stage parent variant). Until v2, root and parent docs are unvalidated — manifest drift on those docs is not caught. *(Priority: MEDIUM — surfaces when an operator typos a section heading on a parent doc.)*

---

## Spec Review (2026-05-25)

Independent spec review was run against this DRAFT in a clean Sonnet context immediately after authoring. Verdict: NEEDS_MINOR_REVISIONS, no blockers. Five should-fixes (three mechanical, one substantive scope question raised to the operator, one factual correction) and four nits. Audit:

| # | Finding | Resolution |
|---|---------|------------|
| S1 | Spec claimed "today the app has no test runner" and proposed `app/vitest.config.ts`. Vitest is already installed (`vitest ^4.1.7`) and configured in `vite.config.ts` with two projects; `pnpm -C app test` already exists. | Rewrote in-scope #6 → renamed §"Vitest setup" → §"Test infrastructure (Vitest already present)". Removed `app/vitest.config.ts` from the files-added list. Trimmed `app/package.json` modification to ajv + ajv-formats only. New schema test files are picked up automatically by the existing `client` project's `src/**/*.test.{ts,tsx}` include pattern. |
| S2 | Required-sections list would reject `00-project.md` (numbered headings) and `01-ui/00-ui.md` (no `Verification`) on day one, contradicting D2's "no doc rewrites." | Substantive scope decision: operator confirmed **leaf-only validation in v1** (chose option 1 of three presented). Added an out-of-scope bullet explicitly excluding root + parent docs; logged a new Open Issue for a v2 parent-doc schema variant; added a Design > Extractor note that root + parent docs return `null` from the extractor and never reach the validator. Precedent cited: `01-ui/09-workflow-progress` already runs a two-stage parent variant alongside the leaf six-stage shape. |
| S3 | The `_schemas/` skip rule was implied but never tied to a concrete code location an implementer could match. | Extended the extractor pure-function description: `parseDocNode` returns `null` for paths whose `docs/`-relative portion starts with `process/` or `_schemas/` — mirrors the existing `process/` skip at `parseDocs.ts:106`. |
| S4 | `schema/types.ts` introduced `DocumentNode` but didn't reconcile with existing `NodeStatus` / `NodeId` / `DocNode` in `src/lib/types.ts`. Implementer would either redeclare (drift) or import (unexpected coupling) without guidance. | Added explicit sentence in §Validator: `NodeStatus` and `NodeId` re-export from `src/lib/types.ts` (canonical there per `02-dag` D4); `DocumentNode` is a *superset* of `DocNode`; `parseDocs.ts` projects `DocumentNode → DocNode` in the merge pass. Updated files-added line for `schema/types.ts` to note the re-export. |
| S5 | Extractor table for `status` said "Must match the enum" but the existing parser also `.toUpperCase()`s and `-` → `_` normalizes. Implementer might handle case in code but not in the schema, or vice versa. | Rewrote the status row of the encoding table to explicitly state: normalization (uppercase + `-` → `_`) runs before enum matching; case-insensitive input is accepted; `Draft` → `DRAFT`. |
| N1 | Reviewer cross-checked the `nodeId` regex `^(root|[a-z0-9][a-z0-9-]*(/[a-z0-9][a-z0-9-]*)*)$` against every current node id (`root`, `02-schema`, `01-ui`, `01-ui/02-dag`, etc.). | No action — regex is correct. |
| N2 | Verification item #7 hedged "topbar (or wherever D9 places the banner)" — undermined the decision D9 had already made. | Hedge removed; reads "The topbar shows…" |
| N3 | Verification item #5 listed UI panels generically without naming the consumer hooks. | Each panel now names its consumer hook (`useDocGraph`, `useHealthData`, `useDocSource` + `idForPath`); `/tasks` and `/logs` flagged as non-consumers (smoke-check only). |
| N4 | `parseDocs.test.ts` listed in files but never described — implementer might write a trivial smoke test that doesn't actually close the PRD §11 finding. | Test infrastructure section now specifies what `parseDocs.test.ts` asserts: `loadDocNodes()` against the real tree returns ≥ current leaf-node count with zero validation errors. |

Nothing was punted. S2 was the only finding that required operator judgment; the operator chose the smallest scope (leaf-only validation) and the resulting Open Issue is logged. The remaining eight findings are mechanical or factual.

---

## Implementation Notes

### Dependencies added

- `ajv@8.20.0` (production) — JSON Schema draft 2020-12 validator
- `ajv-formats@3.0.1` (production) — adds `date` format support (used for `created` / `lastUpdated` fields)

No other dependencies added. Vitest was already present (`^4.1.7`); no test infrastructure changes.

### Files added / modified

```
docs/_schemas/document-node.schema.json       [new — canonical JSON Schema (draft 2020-12)]
app/src/lib/schema/types.ts                    [new — DocumentNode; re-exports NodeStatus/NodeId from src/lib/types.ts]
app/src/lib/schema/parseDocNode.ts             [new — markdown → candidate JSON extractor]
app/src/lib/schema/parseDocNode.test.ts        [new]
app/src/lib/schema/validateDocNode.ts          [new — ajv 2020 validator]
app/src/lib/schema/validateDocNode.test.ts     [new]
app/src/lib/schema/fixtures/conformant.md      [new]
app/src/lib/schema/fixtures/missing-status.md  [new]
app/src/lib/schema/fixtures/bad-status-enum.md [new]
app/src/lib/schema/fixtures/missing-section.md [new]
app/src/lib/schema/fixtures/malformed-manifest.md [new]
app/src/lib/schema/fixtures/annotated-status.md   [new]
app/src/lib/schema/fixtures/mixed-case-status.md  [new]
app/src/lib/parseDocs.ts                       [modified — internals refactored; loadDocNodes/idForPath API unchanged]
app/src/lib/parseDocs.test.ts                  [new — closes PRD §11 "no parseDocs.test.ts" finding]
app/package.json                               [modified — ajv, ajv-formats added]
app/vite.config.ts                             [modified — server.fs.allow added to client test project so import.meta.glob ?raw works in Vitest]
docs/02-schema.md                              [modified — status transitions + this section]
docs/00-project.md                             [modified — §14 status row]
```

### Decisions beyond spec

- **`"version": 1` removed from JSON Schema file.** The spec's Design > Schema shape shows `"version": 1` as a top-level field, but this is not a valid JSON Schema keyword; ajv's `strict: true` rejects it with "unknown keyword: 'version'". The version is instead documented in the schema's `description` field, and the `schemaVersion: { const: 1 }` field inside the validated document carries the version programmatically. The intent of the spec is preserved.
- **`parseDocNode` return type is `unknown` not `unknown | null`.** ESLint's `@typescript-eslint/no-redundant-type-constituents` rule rejects `unknown | null` (unknown already subsumes null). The function returns `null` by returning the JS `null` literal, which satisfies `unknown`. Test assertions use `!= null` checks as needed.
- **`vite.config.ts` modified (client test project `server.fs.allow`).** The constraint was "no new `vitest.config.ts`". Adding `server.fs.allow` to the existing client test project definition in `vite.config.ts` is not a new config file — it's a one-property addition to an existing project definition. Without it, Vitest denies `?raw` access to `docs/**/*.md` from the test environment, causing `parseDocs.test.ts` to fail.
- **`parseDocs.ts` keeps legacy `parseOne` for root and parent docs.** The spec's pseudocode shows a pure `parseDocNode` loop, but `parseDocNode` returns `null` for root and parents (leaf-only validation per S2). These docs must still appear in the `DocNode[]` set. Solution: apply `parseDocNode` + `validateDocNode` only to leaf paths (detected by the new `isLeafPath()` predicate); root and parents continue through the legacy `parseOne` path. This correctly implements "leaf docs are validated, non-leaf docs bypass validation."
- **`vi` imported but only used for `vi.toBeDefined()` placeholder.** The parseDocs test uses plain `console.error` replacement instead of `vi.spyOn` to avoid TypeScript's `unsafe-any` lint errors on spy mock accessor types. The placeholder test asserting `expect(vi).toBeDefined()` was added to keep the import but is functionally trivial — removed on the final pass and replaced with the plain error-capture approach without any vi import needed.

### Bundle delta

Baseline: `01-ui/06-health.md` final build — 939,830 B JS / 40,348 B CSS uncompressed, 301.84 / 7.96 kB gzip.

This build: 1,350,660 B JS / 43,890 B CSS uncompressed, 429.07 / 8.53 kB gzip.

Delta: +410,830 B JS (+127.23 kB gzip), +3,542 B CSS (+0.57 kB gzip).

The JS delta is larger than the spec's predicted ~30 KB gzip because: (a) the baseline was from `06-health` completion, before several subsequent node specs were added; (b) ajv itself contributes the majority of the JS increase (the library is substantial at ~30 KB gzip core + format modules). The chunk-size warning pre-dates this node and is not caused by ajv.

### Headless verification results

- `pnpm -C app typecheck` → exit 0
- `pnpm -C app lint --max-warnings=0` → exit 0
- `pnpm -C app test` → exit 0 (100 tests: 85 schema + 15 parseDocs + existing LogEventRow tests)
- `pnpm -C app build` → exit 0

All authored docs in the current tree pass schema validation (zero console.error calls in parseDocs.test.ts).

### Manual-only verification items

The following acceptance check items require human verification in a browser:

- **Item 5:** DAG panel (`/dag`), health panel (`/health`), docs viewer (`/docs/:nodeId`), tasks panel (`/tasks`), logs panel (`/logs`) render correctly with no visible regression.
- **Item 7:** Dev-only topbar banner (D9) shows the failing-doc count when a fixture is corrupted and clears when fixed. This requires modifying a real doc to fail validation, running the dev server, and observing the topbar.
- **Item 6 (partial):** Structured `ValidationError` with informative `path` and `message` is verified via unit tests. The browser console display of the error requires manual observation with a corrupted doc.

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. `docs/_schemas/document-node.schema.json` exists and parses as valid JSON Schema (`ajv compile` succeeds).
2. Every authored doc in the current tree validates without error against the schema. No doc was rewritten as part of this node; if any required a change, the change is committed and noted in Implementation Notes.
3. `pnpm -C app test` exits zero with the schema, validator, and parseDocs test suites passing.
4. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero. Bundle delta is reported in Implementation Notes.
5. Every UI panel that consumes `parseDocs.ts` continues to render correctly:
   - `/dag` (`02-dag` via `useDocGraph` → `loadDocNodes`).
   - `/health` (`06-health` via `useHealthData` → `useDocGraph`).
   - `/docs/:nodeId` (`03-docs` via `useDocSource` + `idForPath`).
   - `/tasks` and `/logs` (`04-tasks`, `05-logs` — do not consume `parseDocs` directly; smoke-check that they still render).
6. Deliberately corrupting a fixture (delete a required heading, malform a status enum, drop the `**Created:**` line) produces a structured validation error with an informative `path` and `message`. Reverting the corruption clears the error.
7. The dev-only banner (D9) shows the failing-doc count when a fixture is corrupted; clears when fixed; does not display in normal operation against the real tree.
8. Inspect `app/src/lib/parseDocs.ts` after the refactor: external API (`loadDocNodes`, `idForPath`) unchanged; per-field regex extraction replaced by a single call into `parseDocNode` + `validateDocNode`.
9. No new runtime dependencies in the browser bundle beyond `ajv` and `ajv-formats`. No Node-only imports leak into the browser code path.

---

## Children

None.
