# Document Node Schema

**Node ID:** `02-schema`
**Parent:** project root (`docs/00-project.md`)
**Status:** SPEC_REVIEW
**Created:** 2026-05-25
**Last Updated:** 2026-05-25

**Dependencies:** —

---

## Requirements

Make the document schema a **first-class versioned artifact** in the repo, replacing the implicit convention currently encoded in `app/src/lib/parseDocs.ts` (PRD §9, §11). Today the framework's idea of "what a valid document node looks like" lives in 245 lines of unested regex; a new project adopting the framework either matches those conventions by inspection or breaks every UI panel. This node closes that gap.

In scope for v1:

1. **A canonical JSON Schema file** in the document tree (`docs/_schemas/document-node.schema.json`) describing the required front-matter fields, allowed status values, required section headings, and the children-manifest row shape. Schema version is declared inline and is durable across future revisions.
2. **A TypeScript validator** that takes a markdown string + source path and returns either a typed `DocNode` (matching the schema) or a structured list of validation errors. Validator is built on `ajv` (draft 2020-12); the schema file is the single source of truth — the validator loads it, does not duplicate it.
3. **A markdown → candidate extractor** that produces the JSON shape the schema validates. Replaces the per-field regex tangle inside today's `parseDocs.ts` with a single extraction pass whose output is then validated.
4. **Tests** (`*.test.ts`) covering the extractor and validator against representative fixtures: a fully-conformant doc, every required-field-missing case, every status-enum edge, malformed manifest rows, and the parenthetical-annotation status cases that today's `normalizeStatus()` handles silently. This closes PRD §11's "no `parseDocs.test.ts`" finding on the same artifact that closes the implicit-schema finding (PRD §11 explicitly notes they should land together).
5. **`parseDocs.ts` rebuilt on top of the validator.** The build-time `loadDocNodes()` entry point and `idForPath()` helper retain their current external API — every panel that imports them keeps working unchanged. Internally, they call the new extractor + validator and surface a typed error list to the console (and a single panel-level banner; see D9) for any doc that fails validation, so a malformed doc degrades visibly rather than silently.
6. **Vitest installed and wired** as the test runner for `app/`. Today the app has no test runner; this node introduces it because the schema and validator are pointless without enforced tests.

**Out of scope for this node:**

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
| `status` | First whitespace-delimited token of the `**Status:**` line, uppercased, with `-` → `_`. Must match the enum. |
| `statusAnnotation` | The contents of the first `(…)` parenthetical on the `**Status:**` line, if any. Free-form string. |
| `created` | `**Created:**` line, must be ISO date (`YYYY-MM-DD`). |
| `lastUpdated` | `**Last Updated:**` line, ISO date — trailing `(notes)` parenthetical allowed and dropped during extraction. |
| `dependencies` | `**Dependencies:**` line; all backticked ids extracted as the array. The literal `—` is treated as the empty array. Line absent ⇒ empty array. |
| `sections` | Every `## Heading` opens a section; the section body is everything from the heading to the next `## ` (exclusive) or EOF. The seven required headings must be present (string-exact match). |
| `children` | Inside the `## Children` section, the markdown table rows of shape `\| \`relId\` \| title \| deps \| status \|`. The literal `—` in `deps` → empty array; backticked ids in `deps` → the array. Section body literal `None.` ⇒ empty children array. |

The extractor is a pure function — no React, no Vite globs, no filesystem access. It takes `(filePath: string, raw: string)` and returns `unknown` (the candidate JSON). All schema enforcement happens in the validator step.

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

The `DocumentNode` TS interface is hand-written in `app/src/lib/schema/types.ts` to mirror the schema. v1 keeps the schema and the TS interface in lockstep manually; codegen via `json-schema-to-typescript` is logged as Open Issue.

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

### Vitest setup

```
app/
  package.json                # add vitest, @vitest/ui, jsdom devDependencies
  vitest.config.ts            # minimal: extends vite.config.ts; environment: "node"
  src/lib/schema/
    parseDocNode.ts
    parseDocNode.test.ts
    validateDocNode.ts
    validateDocNode.test.ts
    types.ts
    fixtures/
      conformant.md           # representative full doc
      missing-status.md
      bad-status-enum.md
      missing-section.md
      malformed-manifest.md
      annotated-status.md     # exercises the parenthetical case
```

`pnpm -C app test` runs vitest in CI mode. The leaf-workflow's stage-4 implementation gate adds `pnpm -C app test` alongside `typecheck` / `lint` / `build`; this spec proposes that addition.

### Files added / modified

```
docs/_schemas/document-node.schema.json     [new]
app/src/lib/schema/types.ts                  [new]
app/src/lib/schema/parseDocNode.ts           [new]
app/src/lib/schema/parseDocNode.test.ts      [new]
app/src/lib/schema/validateDocNode.ts        [new]
app/src/lib/schema/validateDocNode.test.ts   [new]
app/src/lib/schema/fixtures/*.md             [new]
app/src/lib/parseDocs.ts                     [modified — internals only]
app/src/lib/parseDocs.test.ts                [new — closes PRD §11 finding]
app/package.json                             [modified — add ajv, ajv-formats, vitest, @vitest/ui]
app/vitest.config.ts                         [new]
app/vite.config.ts                           [modified — add `_schemas` to `server.fs.allow` if needed for json import]
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
7. The topbar (or wherever D9 places the banner — see Decisions) shows a single muted "1 doc failed validation: <id>" indicator when run against a fixture with a known-bad doc loaded; clears when the corruption is reverted.
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

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. `docs/_schemas/document-node.schema.json` exists and parses as valid JSON Schema (`ajv compile` succeeds).
2. Every authored doc in the current tree validates without error against the schema. No doc was rewritten as part of this node; if any required a change, the change is committed and noted in Implementation Notes.
3. `pnpm -C app test` exits zero with the schema, validator, and parseDocs test suites passing.
4. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero. Bundle delta is reported in Implementation Notes.
5. Every UI panel that consumes `parseDocs.ts` continues to render correctly:
   - `/dag` shows the full graph with all current + planned nodes.
   - `/health` lists open issues and stale nodes.
   - `/docs/:nodeId` renders documents.
   - `/tasks` and `/logs` continue to function (they don't consume parseDocs directly but share infra).
6. Deliberately corrupting a fixture (delete a required heading, malform a status enum, drop the `**Created:**` line) produces a structured validation error with an informative `path` and `message`. Reverting the corruption clears the error.
7. The dev-only banner (D9) shows the failing-doc count when a fixture is corrupted; clears when fixed; does not display in normal operation against the real tree.
8. Inspect `app/src/lib/parseDocs.ts` after the refactor: external API (`loadDocNodes`, `idForPath`) unchanged; per-field regex extraction replaced by a single call into `parseDocNode` + `validateDocNode`.
9. No new runtime dependencies in the browser bundle beyond `ajv` and `ajv-formats`. No Node-only imports leak into the browser code path.

---

## Children

None.
