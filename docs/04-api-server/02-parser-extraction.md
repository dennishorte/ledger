# Parser Package Extraction

**Node ID:** `04-api-server/02-parser-extraction`
**Parent:** `04-api-server` (`docs/04-api-server.md`)
**Status:** SPEC_REVIEW
**Created:** 2026-05-26
**Last Updated:** 2026-05-26 (DRAFT → SPEC_REVIEW)

**Dependencies:** `04-api-server/01-workspace-conversion`

---

## Requirements

Extract the document-tree parsing machinery from `app/src/lib/` into a new `packages/parser/` workspace package so the upcoming `03-server-package` can consume the same validators without a brittle `app/ → server/` relative-path import. Today `app/src/lib/schema/` (from `02-schema`) holds the schema validator and `app/src/lib/project/` (from `03-project-metadata`) holds the project-metadata validator and loader; both are pure, runtime-agnostic code that the server needs verbatim. The Vite-only primitives (`import.meta.glob` and `loadDocNodes()`) **stay inside `app/`** — they are build-time machinery that only works through the Vite pipeline (parent §Spec Review S4).

This is the second foundational child of `04-api-server`. After this lands, the parser package is the single source of truth for parsing markdown docs into validated `DocNode[]` and validating `.ledger/project.json`; the server (`03-server-package`) consumes it at runtime, and `app/` consumes it at build time via thin wrappers around the same exports.

In scope for v1:

1. **A new workspace package `packages/parser/`** with its own `package.json` (name: `@ledger/parser`, `private: true`, `type: "module"`, `main: "dist/index.js"`, `types: "dist/index.d.ts"`, exports map covering the public surface), `tsconfig.json` (composite project that emits to `dist/`), `eslint.config.js` (mirrors `app/eslint.config.js` minus the React rules), and `vitest.config.ts` (Node environment, no jsdom). Declared in `pnpm-workspace.yaml` already by `01-workspace-conversion`.
2. **Move three subtrees from `app/src/lib/` into `packages/parser/src/`**:
   - `app/src/lib/schema/` → `packages/parser/src/schema/` (everything: `parseDocNode.ts`, `validateDocNode.ts`, `types.ts`, fixtures, tests).
   - `app/src/lib/project/` → `packages/parser/src/project/` (everything: `types.ts`, the validator + loader, fixtures, tests) — see the split below.
   - The pure `buildDocGraph(rawDocs)` extracted from `app/src/lib/parseDocs.ts` lands at `packages/parser/src/docs/buildDocGraph.ts` with its own tests.
3. **Split `loadProjectMetadata.ts`** into two halves: the **pure validator** (`packages/parser/src/project/validateProjectMetadata.ts`) that takes `unknown` and returns `Result<ProjectMetadata, ValidationError[]>`, and the **Vite-import wrapper** (`app/src/lib/project/loadProjectMetadata.ts`, slimmed to ~10 lines) that calls the validator on the Vite-imported JSON. Today these are co-mingled in one file; the server needs the pure validator without the Vite import.
4. **Slim `app/src/lib/parseDocs.ts`** to a thin Vite-glob wrapper around `@ledger/parser`'s `buildDocGraph`. The external API (`loadDocNodes()`, `idForPath()`, `docValidationErrorPaths`) is unchanged — every existing consumer keeps working without a single import-site edit in `app/src/components/` or `app/src/routes/`.
5. **Schema JSON resolution** for the parser package. The schema artifacts (`docs/_schemas/document-node.schema.json`, `docs/_schemas/project-metadata.schema.json`) stay in `docs/_schemas/` per PRD §9. The parser imports them via a `tsconfig.json` `paths` alias (`"@schemas/*": ["../../docs/_schemas/*"]`) — see parent §Spec Review S6. Build-time emit and runtime resolution must both work; the implementer smoke-tests with `node -e` and falls back to a `dist/_schemas/` copy step if symlink-relative JSON resolution surprises Node.
6. **All 99 pre-existing `app/` tests pass at their new locations without source modification.** This is the load-bearing invariant of the extraction. If any test fails, the extraction broke a contract — investigate before promoting. Test counts: `02-schema` added 67 tests, `03-project-metadata` added 32 tests, totaling 99; these all move into `packages/parser/` and pass under `pnpm -C packages/parser test`. The 32 tests that lived in `app/src/lib/project/loadProjectMetadata.test.ts` split: the pure-validator tests move into `packages/parser/src/project/validateProjectMetadata.test.ts`; the Vite-import-wrapper smoke tests stay in `app/` as a single thin file checking the wrapper boots cleanly.
7. **`buildDocGraph()` extraction tests.** Two new tests in `packages/parser/src/docs/buildDocGraph.test.ts` exercise the pure function against in-memory `rawDocs` fixtures (no `import.meta.glob` required), confirming that the extraction preserves the merge / manifest-row / `dependsOn` resolution behavior `loadDocNodes()` used to do inline.

**Out of scope for v1:**

- **The API server.** That's `03-server-package`. This child ships the package the server will consume but does not introduce the server itself.
- **The CLI launcher** (`04-cli-launcher`) and the **UI hook migration** (`05-ui-hook-migration`). Both depend on this child but are downstream concerns.
- **`app/src/lib/parseDocs.ts` rewritten as a runtime fetcher.** The wrapper stays Vite-build-time only. The runtime fetcher path (the eventual TanStack Query in `useDocGraph`) is `05-ui-hook-migration`'s deliverable.
- **`loadDocNodes()` moved to the parser package.** Vite's `import.meta.glob` is a build-time primitive that only works in the Vite pipeline; moving it would break the build (parent §Spec Review S4 — explicit constraint). `loadDocNodes()` stays inside `app/src/lib/parseDocs.ts` as a Vite-glob wrapper that calls `buildDocGraph()`.
- **Codegen for the TS types.** `02-schema` D8 and `03-project-metadata` D9 both defer codegen via `json-schema-to-typescript`. The extracted types continue to be hand-written; drift risk does not change with the extraction. Logged as inherited Open Issue.
- **Schema artifact moves.** The two schema JSON files stay in `docs/_schemas/`. The parser imports them via the path alias; nothing moves under `docs/`.
- **Shared `ajv` instance across schema modules.** `03-project-metadata` Op-2 logged the duplication. Today the schema validator and the project-metadata validator each instantiate their own `new Ajv2020(...)`. The extraction makes consolidation easier (one `packages/parser/src/ajvInstance.ts` shared by both) but is not the goal of this node. Logged as Open Issue.
- **A second ESLint config style.** `packages/parser/eslint.config.js` reuses `app/eslint.config.js`'s rule set minus the React/JSX rules. No new linting standards.
- **Bundle-size optimization.** Tree-shaking improvements between `app/` and `@ledger/parser` are a downstream consequence; this child does not optimize for it. The browser bundle stays the same modulo the slight indirection through the workspace package.

---

## Design

### Repository layout after this child

```
ledger/
├── package.json                                       # exists (01-workspace-conversion)
├── pnpm-workspace.yaml                                # exists (01-workspace-conversion)
├── pnpm-lock.yaml                                     # regenerated by pnpm install after this child
├── docs/
│   └── _schemas/
│       ├── document-node.schema.json                  # exists (02-schema); referenced via @schemas/* alias
│       └── project-metadata.schema.json               # exists (03-project-metadata); same
├── packages/
│   └── parser/                                        # new
│       ├── package.json                               # name: "@ledger/parser"
│       ├── tsconfig.json                              # composite; paths alias for @schemas/*
│       ├── eslint.config.js
│       ├── vitest.config.ts                           # Node env
│       ├── src/
│       │   ├── index.ts                               # public surface
│       │   ├── schema/
│       │   │   ├── parseDocNode.ts                    # MOVED from app/src/lib/schema/
│       │   │   ├── validateDocNode.ts                 # MOVED (uses @schemas/document-node.schema.json)
│       │   │   ├── types.ts                           # MOVED — re-exports NodeId, NodeStatus from app's src/lib/types.ts
│       │   │   │                                       # **BUT** — see D5 — re-export source becomes packages/parser/src/coreTypes.ts
│       │   │   │                                       # to avoid a parser→app dep cycle. app/src/lib/types.ts re-exports from there.
│       │   │   └── fixtures/*.md                      # MOVED
│       │   ├── project/
│       │   │   ├── validateProjectMetadata.ts         # NEW EXTRACT — pure validator, no I/O
│       │   │   ├── types.ts                           # MOVED
│       │   │   └── fixtures/*.json                    # MOVED
│       │   ├── docs/
│       │   │   ├── buildDocGraph.ts                   # NEW EXTRACT — pure function over rawDocs
│       │   │   └── types.ts                           # re-exports DocNode
│       │   └── coreTypes.ts                           # NEW — NodeId, NodeStatus (canonical home; see D5)
│       └── test/                                      # mirrors src/ structure
│           ├── schema/parseDocNode.test.ts            # MOVED
│           ├── schema/validateDocNode.test.ts         # MOVED
│           ├── project/validateProjectMetadata.test.ts  # SPLIT from loadProjectMetadata.test.ts
│           └── docs/buildDocGraph.test.ts             # NEW
└── app/
    ├── package.json                                   # modified — adds "@ledger/parser": "workspace:*"
    ├── src/
    │   ├── lib/
    │   │   ├── types.ts                               # MODIFIED — NodeId/NodeStatus now re-export from @ledger/parser
    │   │   ├── parseDocs.ts                           # SLIMMED — Vite-glob wrapper around buildDocGraph
    │   │   ├── parseDocs.test.ts                      # KEPT (tests the wrapper end-to-end against the real tree)
    │   │   ├── schema/                                # DELETED — moved to packages/parser/
    │   │   ├── project/
    │   │   │   ├── loadProjectMetadata.ts             # SLIMMED — Vite-import wrapper around validateProjectMetadata
    │   │   │   ├── loadProjectMetadata.test.ts        # SLIMMED — single smoke test of the wrapper
    │   │   │   ├── types.ts                           # DELETED — re-export through @ledger/parser
    │   │   │   └── fixtures/                          # DELETED — moved to packages/parser/
    │   └── components/                                # UNCHANGED — import sites keep using @/lib/parseDocs etc.
```

`app/src/lib/types.ts` (the `02-dag` D4 canonical home for `NodeId` and `NodeStatus`) becomes a re-export shell so existing `@/lib/types` consumers keep working. See D5.

### `packages/parser/package.json`

```json
{
  "name": "@ledger/parser",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "scripts": {
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint . --max-warnings=0",
    "test": "vitest run",
    "build": "tsc -b"
  },
  "dependencies": {
    "ajv": "^8.20.0",
    "ajv-formats": "^3.0.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "eslint": "^9.17.0",
    "typescript": "^5.7.2",
    "typescript-eslint": "^8.18.2",
    "vitest": "^4.1.7"
  }
}
```

ajv versions match `app/package.json` exactly (pnpm hoists; no duplicate install). The `exports` map declares a single entrypoint — every public surface flows through `packages/parser/src/index.ts` (no `@ledger/parser/internal/...` deep imports).

### `packages/parser/src/index.ts` — public surface

```ts
// Schema
export { parseDocNode } from "./schema/parseDocNode";
export { validateDocNode } from "./schema/validateDocNode";
export type { DocumentNode, ValidationError, ValidationResult } from "./schema/types";

// Project metadata
export { validateProjectMetadata } from "./project/validateProjectMetadata";
export type { ProjectMetadata, ProjectMetadataResult } from "./project/types";

// Docs graph
export { buildDocGraph } from "./docs/buildDocGraph";
export type { DocNode } from "./docs/types";

// Core types (canonical home — re-exported by app/src/lib/types.ts)
export type { NodeId, NodeStatus } from "./coreTypes";
```

No internal helpers leak. Every external import goes through the package root.

### `packages/parser/tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@schemas/*": ["../../docs/_schemas/*"]
    }
  },
  "include": ["src/**/*"]
}
```

The `paths` alias resolves `@schemas/document-node.schema.json` to `docs/_schemas/document-node.schema.json` at typecheck time. At Node runtime (when the compiled output runs from `dist/`), the import resolves via the same relative depth from the package root through the pnpm workspace symlink (`node_modules/@ledger/parser` → `packages/parser/`) back to the repo's `docs/_schemas/`. **Smoke-test this with `node -e "import('./packages/parser/dist/schema/validateDocNode.js').then(m => console.log(typeof m.validateDocNode))"` before promoting** — if Node refuses the symlink-relative JSON resolve, fall back to a `tsc -b` post-step that copies the two schema JSONs into `packages/parser/dist/_schemas/` and rewrites the import target.

### Splitting `loadProjectMetadata.ts`

Today (`app/src/lib/project/loadProjectMetadata.ts`):

```ts
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../../../../docs/_schemas/project-metadata.schema.json" with { type: "json" };
import rawProject from "../../../../.ledger/project.json" with { type: "json" };
import type { ProjectMetadata } from "./types";
// ... ValidationError re-export ...

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const compile = ajv.compile<ProjectMetadata>(schema);

export function validateProjectMetadata(input: unknown): ProjectMetadataResult { ... }
export function loadProjectMetadata(): ProjectMetadataResult {
  return validateProjectMetadata(rawProject);
}
export const projectMetadata: ProjectMetadataResult = loadProjectMetadata();
```

After:

```ts
// packages/parser/src/project/validateProjectMetadata.ts
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "@schemas/project-metadata.schema.json" with { type: "json" };
import type { ProjectMetadata, ProjectMetadataResult } from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const compile = ajv.compile<ProjectMetadata>(schema);

export function validateProjectMetadata(input: unknown): ProjectMetadataResult {
  if (compile(input)) return { ok: true, metadata: input };
  return { ok: false, errors: (compile.errors ?? []).map(toValidationError) };
}
```

```ts
// app/src/lib/project/loadProjectMetadata.ts
import rawProject from "../../../../.ledger/project.json" with { type: "json" };
import { validateProjectMetadata } from "@ledger/parser";
import type { ProjectMetadataResult } from "@ledger/parser";

export function loadProjectMetadata(): ProjectMetadataResult {
  return validateProjectMetadata(rawProject);
}
export const projectMetadata: ProjectMetadataResult = loadProjectMetadata();
```

The wrapper keeps the Vite-imported `.ledger/project.json` (whose path is calibrated to its `app/`-relative depth) and re-exports the singleton the topbar reads. The pure validator lives in the parser package; the server's `loadProjectContext` (in `03-server-package`) will call the same `validateProjectMetadata` with `JSON.parse(fs.readFileSync(...))` instead of the Vite import.

### Extracting `buildDocGraph()` from `parseDocs.ts`

Today `loadDocNodes()` in `app/src/lib/parseDocs.ts` does three things:
1. Calls `import.meta.glob('../../../docs/**/*.md', { eager: true, as: 'raw' })` to load every doc as a `Record<path, content>`.
2. For each entry, runs `parseDocNode` (extract candidate JSON) + `validateDocNode` (schema-validate), collecting validation errors into `docValidationErrorPaths`.
3. Merges leaf nodes with parent-manifest synthesis (PLANNED rows from parents become first-class nodes) and projects `DocumentNode → DocNode`.

The extraction:

```ts
// packages/parser/src/docs/buildDocGraph.ts
import { parseDocNode } from "../schema/parseDocNode";
import { validateDocNode } from "../schema/validateDocNode";
import type { DocNode } from "./types";

export interface BuildDocGraphResult {
  nodes: DocNode[];
  validationErrorPaths: string[];
}

export function buildDocGraph(rawDocs: Record<string, string>): BuildDocGraphResult {
  // ... same merge + manifest + projection logic moved verbatim from parseDocs.ts ...
}
```

```ts
// app/src/lib/parseDocs.ts (after)
import { buildDocGraph } from "@ledger/parser";
import type { DocNode, NodeId } from "@ledger/parser";

const rawDocs = import.meta.glob<string>(
  "../../../docs/**/*.md",
  { eager: true, query: "?raw", import: "default" }
);

let _built: { nodes: DocNode[]; validationErrorPaths: string[] } | null = null;

export function loadDocNodes(): DocNode[] {
  _built ??= buildDocGraph(rawDocs);
  return _built.nodes;
}

export const docValidationErrorPaths: string[] = (() => {
  loadDocNodes(); // populate singleton
  return _built!.validationErrorPaths;
})();

export function idForPath(path: string): NodeId | null { /* unchanged */ }
```

`import.meta.glob` syntax updated to v6+ form (`query: "?raw", import: "default"`) if the current code uses the deprecated `as: "raw"` form — confirm during implementation and pick the form that matches today's `parseDocs.ts`. External signatures (`loadDocNodes`, `idForPath`, `docValidationErrorPaths`) stay identical; consumers don't notice the indirection.

### `NodeId` / `NodeStatus` canonical home (D5)

Today `app/src/lib/types.ts` is the canonical home (shipped by `02-dag` D4). The parser package needs `NodeId` and `NodeStatus` too (the validator's status enum, the `DocNode.id` field). Two options considered:

- (a) Parser re-exports from `app/src/lib/types.ts` → creates a `@ledger/parser → @ledger/app` cycle. Rejected.
- (b) Canonical home moves to `@ledger/parser`; `app/src/lib/types.ts` becomes a re-export shell.

Chose (b). `app/src/lib/types.ts` reduces to:

```ts
export type { NodeId, NodeStatus, DocNode } from "@ledger/parser";
// any app-specific types (none today; panel-specific types not added yet) stay here
```

All existing `import { ... } from "@/lib/types"` sites in `app/src/components/` keep working unchanged. The re-export is the boundary that lets the parser declare its own canonical types without breaking `02-dag`'s contract.

### Acceptance check (manual)

A reviewer running the worktree must observe:

1. `packages/parser/` exists with the layout shown above. Its `package.json` declares `@ledger/parser`, exports map covers the public surface from §"public surface", deps include `ajv@^8.20.0` and `ajv-formats@^3.0.1` at the same versions as `app/`.
2. `pnpm install` at the repo root succeeds; `app/node_modules/@ledger/parser` is a symlink to `packages/parser/`.
3. `pnpm -C packages/parser typecheck`, `pnpm -C packages/parser lint --max-warnings=0`, `pnpm -C packages/parser test`, `pnpm -C packages/parser build` all exit zero.
4. **All previously-`app/` tests pass at their new locations:**
   - `pnpm -C packages/parser test` reports a test count covering the 67 schema tests + the project-validator portion of the 32 metadata tests + 2 new `buildDocGraph` tests.
   - `pnpm -C app test` reports a test count covering whatever `app/`-only tests remain (the slimmed `loadProjectMetadata.test.ts` smoke check, `parseDocs.test.ts`, `useDocGraph.test.ts` if it exists yet, `LogEventRow.test.tsx`, etc.).
   - **Total tests across the workspace ≥ pre-extraction total (99)**. New tests on top are welcome; missing tests are a regression.
5. `pnpm -C app typecheck`, `pnpm -C app lint --max-warnings=0`, `pnpm -C app build` exit zero. Bundle delta from `app/` is within ±5 KB gzip vs `01-workspace-conversion`'s build (the indirection through `@ledger/parser` is a few extra import-line bytes, otherwise identical bytes).
6. **`app/src/lib/schema/` directory is deleted.** `git status` and `git diff main..HEAD` show the deletion. No code under `app/src/lib/schema/` remains.
7. **`app/src/lib/project/types.ts` and `fixtures/` deleted; `loadProjectMetadata.ts` slimmed to a Vite-import wrapper around `validateProjectMetadata`.** The file imports from `@ledger/parser`, no longer instantiates ajv directly.
8. **`app/src/lib/parseDocs.ts` slimmed to a Vite-glob wrapper around `buildDocGraph`.** The merge / manifest / projection logic that used to live inline is gone from this file; it lives in `packages/parser/src/docs/buildDocGraph.ts`.
9. **`app/src/lib/types.ts` becomes a re-export shell for `NodeId`, `NodeStatus`, `DocNode` from `@ledger/parser`.** Existing `@/lib/types` consumers in `app/src/components/` keep working without import-site edits.
10. **Schema artifact JSONs are untouched.** `git diff main..HEAD -- docs/_schemas/` is empty.
11. **`.ledger/project.json` is untouched.** `git diff main..HEAD -- .ledger/` is empty.
12. **The UI renders correctly.** `pnpm -C app dev` starts; `/dag`, `/health`, `/docs/02-schema`, `/tasks`, `/logs` all render with no console errors. The topbar shows `"Ledger"` (project metadata still loads correctly).
13. **Schema JSON resolves at runtime in the parser package's compiled output.** Smoke-test: `node -e "import('./packages/parser/dist/schema/validateDocNode.js').then(m => console.log(typeof m.validateDocNode))"` prints `"function"`. If it errors, the dist/_schemas/ copy fallback (see Design) is applied and re-tested.
14. **`app/server/` (the transcript bootstrap) is untouched.** `git diff main..HEAD -- app/server/ app/vite.config.ts app/tsconfig.node.json` is empty.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Extract into one package (`@ledger/parser`), not three (`@ledger/schema` + `@ledger/project` + `@ledger/docs`) | The three subtrees are cohesive — they all parse and validate the same document-tree concept and share the ajv instance. Splitting them buys nothing at this scale (no separate publish target, no different consumers) and triples the package overhead (three `package.json`s, three `tsconfig.json`s, three test configs). Revisit if a Phase-3 consumer wants only the schema validator without the docs graph. |
| D2 | `tsconfig.json` `paths` alias `@schemas/*` → `../../docs/_schemas/*` instead of relative paths in every importer | Parent §Spec Review S6. Relative paths are depth-fragile; one alias is greppable and changes in one place if `packages/parser/` ever moves. `resolveJsonModule: true` + `with { type: "json" }` resolve through the alias at build time; pnpm symlink resolves at runtime (smoke-tested per acceptance item 13). |
| D3 | Split `loadProjectMetadata.ts`: pure validator into the parser package, Vite-import wrapper stays in `app/` | Same pattern as the `parseDocs.ts` slim: the pure half (validate `unknown` against the schema) is reusable; the impure half (the Vite import of a specific JSON path) is `app/`-only. The server's `loadProjectContext` will call the same pure validator with an `fs`-read JSON instead. Eliminates the duplication that would otherwise exist between `app/` and `server/`. |
| D4 | `loadDocNodes()` and `import.meta.glob` stay in `app/src/lib/parseDocs.ts` | Parent §Spec Review S4 explicit constraint. `import.meta.glob` is a Vite-only build-time primitive; it does not work outside the Vite pipeline. The relative path inside it is calibrated to the file's `app/`-relative location. Moving it would break the build. The parser exports only the pure `buildDocGraph(rawDocs)` function; the Vite wrapper feeds it. |
| D5 | Canonical home for `NodeId` / `NodeStatus` moves to `packages/parser/src/coreTypes.ts`; `app/src/lib/types.ts` becomes a re-export shell | The parser needs these types (validator's status enum, `DocNode.id` field). Re-exporting from `app/` would create a `@ledger/parser → @ledger/app` dep cycle, which pnpm tolerates but ESLint and TS will warn on. Moving the canonical home to the parser breaks the cycle. `app/src/lib/types.ts` re-export shell preserves every existing `@/lib/types` import site in `app/src/components/`. Documented in `02-dag.md` as a follow-up. |
| D6 | Tests move with their implementations | A test that lives next to a moved implementation is the same test; moving it preserves the assertion at the new home. Splitting (e.g. keeping schema tests in `app/` while moving schema code to `packages/parser/`) would require the tests to reach across packages, which is brittle and obscures the locality. The one exception is the `loadProjectMetadata.test.ts` split (D3) — the *pure-validator portion* moves to the parser; the *Vite-import-wrapper smoke check* stays in `app/`. |
| D7 | `vitest` is a dev dependency on every package that has tests; the binary is hoisted by the workspace | Each package declares the version it uses (preventing silent version drift between packages) but pnpm's hoisting means only one copy lives in the workspace's `node_modules/.pnpm`. Matches `01-workspace-conversion` D2's "each package declares its own deps" discipline. |
| D8 | Composite tsconfig in the parser package (`composite: true`); referenced from `app/tsconfig.app.json` | Composite projects enable `tsc -b` to build the dependency graph in the right order and incremental rebuilds. `app/tsconfig.app.json` adds a `references: [{ "path": "../packages/parser" }]` entry so a top-level `pnpm typecheck` builds the parser first. Without composite, `app/` imports of `@ledger/parser` would either need a manual `pnpm -C packages/parser build` before `app/`'s typecheck, or would fall back to a slower per-file resolution. |
| D9 | Public surface gated through `packages/parser/src/index.ts` only — no deep imports | Forces the package to maintain a coherent API. Consumers can't reach `@ledger/parser/src/schema/parseDocNode` directly; everything they need flows through `index.ts`. Makes future restructuring inside `packages/parser/src/` invisible to consumers. |
| D10 | Lockfile regenerates at the root; zero version drift | Per `01-workspace-conversion` D6. The new dep entries in `packages/parser/package.json` (ajv, ajv-formats, vitest, typescript, eslint) all reuse versions already pinned by `app/`; pnpm hoists; no version moves. If pnpm install reports any version change, that's a real change to investigate before promoting. |

---

## Open Issues

- **Shared `ajv` instance.** `03-project-metadata` Op-2 logged this. After extraction, `validateDocNode` and `validateProjectMetadata` still each `new Ajv2020(...)`. Easy fix: `packages/parser/src/ajvInstance.ts` exporting a shared `export const ajv = new Ajv2020({ ... })` consumed by both validators. Saves ~11 KB gzip in `app/` and shaves a few ms off server startup. Deferred to a polish pass; the duplication zeroes naturally when the UI's last build-time validator drops with the API migration. *(Priority: LOW.)*
- **TS-types vs JSON-Schema drift.** Inherited from `02-schema` D8 and `03-project-metadata` D9. Each hand-written `DocumentNode` and `ProjectMetadata` interface mirrors its JSON Schema; codegen via `json-schema-to-typescript` is the eventual fix. Trigger: third hand-edit of either pair. *(Priority: LOW.)*
- **Schema artifact resolution fragility.** D2 picks the `paths` alias to manage relative-depth fragility. If `docs/_schemas/` ever moves (e.g. consolidates with a future `docs/schemas/` minus the underscore once parents-and-non-document-files convention firms up), every `@schemas/*` import keeps working through the alias — but the alias itself needs updating. Workspace-wide find-and-replace covers it. *(Priority: TRIVIAL.)*
- **Deep import escape hatches.** D9 forbids deep imports (`@ledger/parser/src/schema/...`). If a future consumer genuinely needs a non-public internal (unlikely), the right path is to widen the public surface in `index.ts`, not to add a second entry to the `exports` map. *(Priority: TRIVIAL — design clarification.)*
- **`buildDocGraph` performance at scale.** Today the function runs on ~15 docs in milliseconds. At 1000+ docs the merge / manifest / `dependsOn` resolution is still O(n) with hash maps; no algorithmic concern. If profiling ever shows a hot path, the right fix is a memoised parent-manifest cache, not a parallelization layer. *(Priority: LOW — wait for a real bottleneck.)*
- **`useDocGraph` and `useHealthData` still consume the build-time wrapper.** This child slims `loadDocNodes()` into a wrapper but does not change its consumers. The runtime migration to TanStack Query against `/api/docs` is `05-ui-hook-migration`. Inherited from parent. *(Priority: LOW — handled by the dependent child.)*

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. `packages/parser/` exists with `package.json`, `tsconfig.json` (composite, with `@schemas/*` paths alias), `eslint.config.js`, `vitest.config.ts` (Node env), and the `src/` + `test/` directories matching the Design layout.
2. `packages/parser/package.json` declares `@ledger/parser`, `private: true`, `type: "module"`, exports map gated through `dist/index.js` + `dist/index.d.ts`, and deps reuse `ajv@^8.20.0` + `ajv-formats@^3.0.1` (same versions as `app/`).
3. `pnpm install` at the repo root succeeds; `app/node_modules/@ledger/parser` resolves to the workspace package (symlink check).
4. **All workspace gates green:**
   - `pnpm -C packages/parser typecheck` → 0
   - `pnpm -C packages/parser lint --max-warnings=0` → 0
   - `pnpm -C packages/parser test` → 0
   - `pnpm -C packages/parser build` → 0 (emits `dist/`)
   - `pnpm -C app typecheck` → 0
   - `pnpm -C app lint --max-warnings=0` → 0
   - `pnpm -C app test` → 0
   - `pnpm -C app build` → 0
   - `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` from repo root → all 0
5. **Pre-existing test invariant:** total test count across `packages/parser/` + `app/` is ≥ pre-extraction total (99). New `buildDocGraph` tests add on top.
6. **`app/src/lib/schema/` is deleted.** `git diff main..HEAD -- app/src/lib/schema/` shows only deletions.
7. **`app/src/lib/project/` is slimmed:** `loadProjectMetadata.ts` is a ~10-line Vite-import wrapper; `types.ts` and `fixtures/` are deleted (re-exported through `@ledger/parser`).
8. **`app/src/lib/parseDocs.ts` is slimmed** to a Vite-glob wrapper around `@ledger/parser`'s `buildDocGraph`. The merge / manifest / projection logic is gone from this file.
9. **`app/src/lib/types.ts` re-exports `NodeId`, `NodeStatus`, `DocNode` from `@ledger/parser`.** No `@/lib/types` import site in `app/src/components/` was modified — `git diff main..HEAD -- app/src/components/` shows no type-import changes.
10. **Schema artifact JSONs untouched.** `git diff main..HEAD -- docs/_schemas/` is empty.
11. **`.ledger/project.json` untouched.** `git diff main..HEAD -- .ledger/` is empty.
12. **`app/server/`, `app/vite.config.ts`, `app/tsconfig.node.json` untouched.** `git diff main..HEAD -- app/server/ app/vite.config.ts app/tsconfig.node.json` is empty.
13. **Runtime schema JSON resolution works in compiled parser output.** Smoke test: `node -e "import('./packages/parser/dist/schema/validateDocNode.js').then(m => console.log(typeof m.validateDocNode))"` prints `"function"` and exits 0. If it errored, the dist/_schemas/ copy fallback is implemented and the smoke test re-passed; the fallback approach is recorded in Implementation Notes.
14. **UI renders correctly with `pnpm -C app dev`.** `/dag`, `/health`, `/docs/02-schema`, `/tasks`, `/logs` all render with no console errors. Topbar shows `"Ledger"`.
15. **Bundle delta** vs the `01-workspace-conversion`-final build: `app/` gzip JS within ±5 KB (indirection through `@ledger/parser` is a few extra import-line bytes; otherwise identical). Reported in Implementation Notes.
16. **Lockfile zero-drift** for every pre-existing dep: every resolved version in `pnpm-lock.yaml` matches the pre-extraction lockfile. New deps (`packages/parser/` ones that reuse `app/` versions) introduce no version changes for shared transitive deps.
17. `04-api-server.md` §Children manifest row for `02-parser-extraction` reads the current status; final promotion to COMPLETE bumps both this spec's Status header and the parent's row in the same commit.

---

## Children

None.
