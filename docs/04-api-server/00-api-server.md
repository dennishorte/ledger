# API Server

**Node ID:** `04-api-server`
**Parent:** project root (`docs/00-project.md`)
**Status:** APPROVED (decomposed 2026-05-26 — parent of five sub-leaves; see §Children)
**Created:** 2026-05-25
**Last Updated:** 2026-05-26 (decomposed into 5 children after first implementer dispatch wall-clocked out)

**Dependencies:** `02-schema`, `03-project-metadata`

---

## Requirements

Stand up the **project-scoped HTTP API** that the UI consumes for document-tree state (PRD §7, §7.1, §7.2). Today the UI reads `docs/` directly via `parseDocs.ts` at Vite build time, which means: (a) every UI rebuild re-walks the filesystem inline with the browser bundle, (b) document state is frozen at build time — edits to a doc don't surface until the dev server reloads, (c) there is no place for the eventual task runner (`05-task-runner`), dispatcher (`06-agent-dispatcher`), or health daemon (`07-health-daemon`) to publish state to the UI, and (d) the framework has no answer to "how do I point this UI at a different project's `docs/` tree" beyond rebuilding from source. This node closes those gaps with a thin HTTP server, a project-scoped CLI launcher, and a single migrated UI consumer that proves the contract end-to-end.

This is the **substrate hinge node.** `02-schema` and `03-project-metadata` ship the validated artifacts; this node ships the runtime that reads them under a project-path argument and serves them over HTTP. Subsequent backend nodes (`05-task-runner`, `06-agent-dispatcher`, `07-health-daemon`) all mount onto the server defined here.

The end-state contract — what "this node done" looks like across all children:

1. **An HTTP API server** as a new top-level pnpm workspace package (`server/`). Hono as the HTTP framework (D1). Runs as a Node process on a port the operator can pin via CLI flag or `LEDGER_PORT` env var; defaults to **4180** (one above the UI's 4179). Exposes a small JSON-over-HTTP surface (endpoints listed below). No SSE in v1 — the only consumer that needs streaming is the eventual log endpoint, which is `05-task-runner`'s deliverable.
2. **Three v1 endpoints**, each backed by extracted shared parser code:
   - `GET /api/project` — returns the loaded `.ledger/project.json` (validated against `03-project-metadata`'s schema) plus a small server-status envelope (`{ projectRoot, docsRoot, port, startedAt }`).
   - `GET /api/docs` — returns the full `DocNode[]` set with the validation-error list alongside.
   - `GET /api/docs/:nodeId` — returns the full validated `DocumentNode`; `422` on schema-validation failure with `{ errors: ValidationError[] }`; `404` only when the id doesn't resolve.
3. **A project-scoped runtime.** The server takes a project path at startup, loads `.ledger/project.json`, resolves `docsRoot`, **enforces path containment** (rejects `..` segments and asserts the resolved docs path is a descendant of `projectRoot`; closes the explicit handoff in `03-project-metadata`'s Open Issues), and refuses to start on any failure with a clear stderr message. One immutable `ProjectContext` per process; constructor-injected, no module-level singleton.
4. **A `ledger` CLI launcher** (`server/src/bin/ledger.ts` → `dist/bin/ledger.js`, exposed via the package's `bin` field). `ledger /path/to/project [--port 4180] [--no-open]`. Validates path + metadata, starts the server, opens the browser, prints the URL. Bare invocation exits 2 with usage on stderr.
5. **One UI consumer migrated** (`useDocGraph`). Per PRD §7.2's per-endpoint migration discipline, the hook flips from `loadDocNodes()` (build-time) to a TanStack Query against `GET /api/docs` (runtime), with a build-time `placeholderData` fallback so the UI keeps working without the server. The rest of the UI stays on its current bootstrap; those migrate in their own follow-up nodes.
6. **A shared workspace package** (`packages/parser/`) extracted from `app/src/lib/` so the server can reuse the schema validator (`02-schema`), the project-metadata validator (`03-project-metadata`), and a pure `buildDocGraph(rawDocs)` factored out of `parseDocs.ts`. `import.meta.glob` and `loadDocNodes()` stay inside `app/src/lib/parseDocs.ts` (Vite-only primitive).
7. **Tests** covering each workspace package — endpoint request/response, CLI argument parsing, path-containment enforcement, the migrated hook. Each workspace package owns its `vitest.config.ts`; the `vitest` binary is hoisted by the workspace.

Decomposed into five sub-leaves per §Children. Each sub-leaf delivers one of the seven items above with its own Verification gate. Reasoning recorded in §Implementation Notes (Decomposition 2026-05-26).

**Out of scope for v1:**

- **All `05-task-runner` endpoints.** No `/api/tasks`, `/api/tasks/:id`, `/api/tasks/:id/events`, no POST task-injection or approval endpoints, no SSE log stream. These are `05-task-runner`'s deliverable and depend on the tasks/events tables and scheduler that don't exist yet. The UI's `04-tasks` / `05-logs` panels stay on their current `01-ui/10-orchestration` transcript bootstrap — that migration is a follow-up after the runner lands and emits the right shape.
- **All `06-agent-dispatcher` endpoints.** No `/api/dispatch`, no MCP integration. Same reason.
- **All `07-health-daemon` endpoints.** No `/api/health/scan`, no daemon process. Same reason.
- **Authentication / authorization.** Single-user local-only tool in v1 (PRD §13: multi-user is deferred). Server binds to `127.0.0.1` only, never `0.0.0.0`, so the OS firewall is the perimeter. No tokens, no sessions, no CORS allowlist beyond the UI's own origin.
- **Multi-project support / recents chooser.** PRD §7.1 commits to one-project-per-instance for v1; PRD §13 defers the recents chooser. The server holds exactly one `ProjectContext` for its lifetime. Switching projects means killing the process and re-launching with a different path.
- **Write endpoints.** v1 is read-only. No `PUT /api/docs/:nodeId`, no `POST /api/docs/:nodeId/issues`, no edit surface. Write is `05-task-runner`'s concern (every write goes through a task with declared resource claims per PRD §10) and `06-agent-dispatcher` (the agent doing the writing); the API server in v1 does not bypass that discipline by offering a raw write path. Editing a doc means editing the file directly with a text editor, which `git status` + the existing `parseDocs.ts` cache-invalidation story handles fine at v1 scale.
- **Git integration beyond `fs.readFile`.** The server reads markdown files via `node:fs/promises`. It does *not* shell out to git, does not use `simple-git`, does not parse `git log` for version history, does not implement `git revert` for rollback (PRD §8.5). Those land with the task runner / a dedicated `git-ops` node that sits between the runner and the repo. v1's read path is `fs` only; if the file is `git checkout`'d to a different revision externally, the server sees the new content on the next request (modulo the cache below).
- **Document caching, watch, or invalidation.** v1 reads `docs/**/*.md` on every `GET /api/docs` request. At today's scale (~15 docs, ~10 ms total) this is fine. If latency becomes visible the answer is an in-memory cache keyed on `mtime`, not a file-watcher chain. Logged as an Open Issue; not built in v1.
- **OpenAPI / Swagger spec.** A typed contract between client and server is valuable but in v1 the type-sharing is direct: both `app/` and `server/` import the same `packages/parser/` types, so the contract is enforced at compile time within the workspace. An OpenAPI artifact becomes useful once non-TS consumers exist (the `06-agent-dispatcher` MCP server, possibly written in a different language) — defer until then.
- **Hot reload of the API server during development.** The server is small enough that restart-on-change via `tsx watch` is the v1 answer. The `server/package.json` `dev` script is exactly: `"dev": "tsx watch src/bin/ledger.ts"` (positional arguments and flags are appended at invocation: `pnpm -C server dev /Users/dennis/code/ledger --port 4180`). No `nodemon`, no orchestrated UI+server runner. The operator runs `pnpm -C server dev` in one terminal and `pnpm -C app dev` in another for now; a unified `pnpm dev` from the workspace root that runs both is a small polish item but not strictly in scope.
- **Production packaging.** v1 ships source + `tsc` build; the `ledger` binary runs against the compiled output. No bundled standalone binary (no `pkg`, no `bun build --compile`, no Docker image). Packaging is its own concern; revisit once a distribution story is in scope.
- **Telemetry / structured logging.** Server logs request lines to stdout in a simple format (`method path → status duration`). No JSON logs, no metrics export, no OpenTelemetry. Add when an operations story needs it.
- **Rate limiting / request size limits.** Single-user local-only — no abuse vector. Hono's default limits are fine.
- **Migration tooling / scaffolding.** PRD §13 defers `ledger migrate`. v1 expects the operator to have hand-authored `.ledger/project.json` (per `03-project-metadata`) and `docs/`.

---

## Design

### Repository layout after this node

```
ledger/                                          # repo root (now a pnpm workspace)
├── pnpm-workspace.yaml                          # new — declares app/, server/, packages/*
├── package.json                                 # new at root — workspace metadata + cross-package scripts
├── .ledger/
│   └── project.json                             # exists (03-project-metadata)
├── docs/
│   ├── _schemas/                                # exists (02-schema, 03-project-metadata)
│   ├── 00-project.md                            # exists
│   ├── 02-schema.md                             # exists
│   ├── 03-project-metadata.md                   # exists
│   ├── 04-api-server/
│   │   └── 00-api-server.md                     # this spec (parent)
│   └── 01-ui/                                   # exists
├── packages/
│   └── parser/                                  # new — shared between app/ and server/
│       ├── package.json                         # name: "@ledger/parser"
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                         # public surface
│           ├── schema/
│           │   ├── document-node.schema.json    # MOVED from docs/_schemas/ at *publish* time?
│           │   │                                  # NO — schema artifact stays in docs/_schemas/ (PRD §9).
│           │   │                                  # Parser imports it via relative path: "../../../docs/_schemas/…"
│           │   ├── parseDocNode.ts              # MOVED from app/src/lib/schema/
│           │   ├── validateDocNode.ts           # MOVED from app/src/lib/schema/
│           │   └── types.ts                     # MOVED from app/src/lib/schema/
│           ├── project/
│           │   ├── loadProjectMetadata.ts       # SPLIT — Vite-import variant stays in app/;
│           │   │                                  # runtime fs variant added here (validateProjectMetadata stays shared)
│           │   ├── validateProjectMetadata.ts   # NEW EXTRACT — pure validator, no I/O
│           │   └── types.ts                     # MOVED
│           └── docs/
│               ├── buildDocGraph.ts             # NEW EXTRACT — pure (rawDocs: Record<path,content>) → DocNode[]
│               └── types.ts                     # re-exports DocNode etc.
├── app/                                         # UI (renamed package.json name to @ledger/app)
│   ├── package.json                             # adds "@ledger/parser": "workspace:*"
│   ├── src/
│   │   ├── lib/
│   │   │   ├── parseDocs.ts                     # SLIMMED — keeps loadDocNodes() (Vite-glob wrapper around buildDocGraph)
│   │   │   ├── project/
│   │   │   │   └── loadProjectMetadata.ts       # SLIMMED — Vite-import wrapper around @ledger/parser's validator
│   │   │   └── schema/                          # DELETED — moved to packages/parser/
│   │   └── components/
│   │       └── dag/
│   │           └── useDocGraph.ts               # MIGRATED — TanStack Query against GET /api/docs (with build-time fallback when API_BASE is unset)
│   └── vite.config.ts                           # adds dev-proxy: /api → http://localhost:4180
├── server/                                      # new package
│   ├── package.json                             # name: "@ledger/server", bin: { ledger: "./dist/bin/ledger.js" }
│   ├── tsconfig.json
│   ├── vitest.config.ts                         # workspace-aware (Node env, no jsdom)
│   ├── src/
│   │   ├── index.ts                             # public createServer() entry (for tests)
│   │   ├── context.ts                           # ProjectContext type + load()
│   │   ├── pathSafety.ts                        # assertContained(projectRoot, candidate) helper
│   │   ├── readDocs.ts                          # fs walk → Record<relativePath, content>
│   │   ├── routes/
│   │   │   ├── project.ts                       # GET /api/project
│   │   │   ├── docs.ts                          # GET /api/docs, GET /api/docs/:nodeId
│   │   │   └── health.ts                        # GET /api/_health (server-internal liveness, not the daemon)
│   │   ├── server.ts                            # Hono app factory; mounts routes + request logger
│   │   └── bin/
│   │       └── ledger.ts                        # CLI launcher; calls createServer() + open browser
│   ├── test/
│   │   ├── project.test.ts                      # endpoint tests (Hono testClient pattern)
│   │   ├── docs.test.ts
│   │   ├── pathSafety.test.ts                   # `..` segment + non-descendant rejection
│   │   ├── context.test.ts                      # missing path / missing metadata / invalid metadata
│   │   └── bin.test.ts                          # arg parsing (subprocess-spawned)
│   └── __fixtures__/
│       └── sample-project/
│           ├── .ledger/project.json             # conformant fixture
│           └── docs/
│               ├── 00-project.md                # minimal valid root
│               └── 01-leaf.md                   # one conformant leaf
└── pnpm-lock.yaml                               # regenerated by pnpm install at the workspace root
```

The pnpm workspace migration is mechanical but touches every existing package boundary, so the file movement matters: `app/src/lib/schema/` and `app/src/lib/project/` (most of them) move into `packages/parser/src/`, and `app/src/lib/parseDocs.ts` is rewritten as a thin Vite-glob wrapper around `@ledger/parser`'s `buildDocGraph`. The `app/server/` directory (the existing transcript-bootstrap code under that name) is **unrelated and stays put** — it's the data layer for `01-ui/10-orchestration` and gets retired separately when `06-agent-dispatcher` lands.

### HTTP framework: Hono

Hono (D1) is a TypeScript-first, fetch-style HTTP framework. The chosen shape:

```ts
// server/src/server.ts
import { Hono } from "hono";
import { logger } from "hono/logger";
import type { ProjectContext } from "./context";
import { projectRoute } from "./routes/project";
import { docsRoute } from "./routes/docs";

type Env = { Variables: { project: ProjectContext } };

export function createServer(project: ProjectContext) {
  const app = new Hono<Env>();
  app.use("*", logger());
  app.use("*", async (c, next) => { c.set("project", project); await next(); });

  app.get("/api/_health", (c) => c.json({ ok: true, startedAt: project.startedAt }));
  app.route("/api/project", projectRoute);
  app.route("/api/docs", docsRoute);

  return app;
}
```

No CORS middleware: the UI reaches the API via Vite's dev proxy (`server.proxy: { "/api": "http://127.0.0.1:4180" }`), so every request is same-origin from the browser's perspective and CORS is never exercised. Production deployments serve the UI and API from the same origin (the UI's static build is served *by* the API server in a follow-up node, but v1 keeps them separate processes joined by the dev proxy). If a future cross-origin need surfaces, the right answer is `cors()` *plus* an auth layer landed in the same node — not a v1 default. (Spec Review S1 — operator-decision: proxy-only contract.)

Rationale for Hono lives in D1.

### Endpoints in v1

```
GET /api/_health
  → 200 { ok: true, startedAt: ISO8601 }
  Server-internal liveness probe. Always 200 if the process is up.
  (Not the health-daemon's surface — that's 07-health-daemon.)

GET /api/project
  → 200 {
      project: { schemaVersion, name, docs, agent },     // the validated .ledger/project.json
      server: { projectRoot, docsRoot, port, startedAt } // runtime envelope
    }
  → 500 (with structured body) if the metadata file fails validation after
    server start (e.g. operator edited it mid-process). The body shape mirrors
    @ledger/parser's ValidationError[].

GET /api/docs
  → 200 {
      nodes: DocNode[],                                  // the projection useDocGraph consumes
      validation: { errorPaths: string[] }                // for the topbar banner
    }
  Reads the docs tree from disk on every call (v1; cache is a follow-up).

GET /api/docs/:nodeId
  → 200 { node: DocumentNode }                            // the full schema-validated shape
  → 404 if nodeId does not resolve to a tracked file
  → 422 if the requested node exists but fails schema validation
        (body: { errors: ValidationError[] })
  nodeId is the dotted/slashed id from parseDocs (e.g. "01-ui/02-dag", "02-schema", "root").
```

The asymmetry is deliberate (Spec Review N2): `/api/docs` is a tree-survey endpoint that must succeed even with a few broken nodes (it carries the error list alongside the good ones for the topbar banner); `/api/docs/:nodeId` is a single-resource lookup where a validation failure is the answer, not a footnote. The 422 carries the structured `ValidationError[]` so the doc-viewer panel (eventual migration of `useDocSource`) can render the failure inline.

`nodeId` URL-encoding: the `/` in nested ids is URL-encoded as `%2F` in the path. Hono's router treats path segments as decoded values, but a bare `:nodeId` parameter only matches a single segment — the route must be declared with a multi-segment constraint: `app.get('/:nodeId{.+}', ...)`. With that constraint, the handler receives `"01-ui/02-dag"` directly via `c.req.param('nodeId')`. Alternative considered: replace `/` with `--` in the URL (more reader-friendly); rejected because the UI already passes the canonical id form through its existing routes. (Spec Review N1.)

### Project scoping and path safety

The server's runtime identity is a single `ProjectContext`:

```ts
// server/src/context.ts
import { resolve, relative, isAbsolute } from "node:path";
import { assertContained } from "./pathSafety";

export interface ProjectContext {
  projectRoot: string;       // absolute
  docsRoot: string;          // absolute, asserted descendant of projectRoot
  project: ProjectMetadata;  // the validated .ledger/project.json
  port: number;
  startedAt: string;         // ISO8601 of server start
}

export async function loadProjectContext(opts: {
  projectPath: string;
  port: number;
}): Promise<ProjectContext> {
  const projectRoot = resolve(opts.projectPath);
  const metadataPath = resolve(projectRoot, ".ledger/project.json");
  const raw = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  const result = validateProjectMetadata(raw);  // from @ledger/parser
  if (!result.ok) throw new ContextError("invalid project metadata", result.errors);

  const docsRoot = resolve(projectRoot, result.metadata.docs);
  assertContained(projectRoot, docsRoot);       // closes 03-project-metadata Open Issue

  return {
    projectRoot,
    docsRoot,
    project: result.metadata,
    port: opts.port,
    startedAt: new Date().toISOString(),
  };
}
```

```ts
// server/src/pathSafety.ts
import { isAbsolute, relative, resolve, sep } from "node:path";

export class PathContainmentError extends Error {}

export function assertContained(parent: string, candidate: string): void {
  const parentAbs = resolve(parent);
  const candidateAbs = resolve(candidate);
  const rel = relative(parentAbs, candidateAbs);
  if (rel.startsWith("..") || isAbsolute(rel) || rel.split(sep).includes("..")) {
    throw new PathContainmentError(
      `path escapes project root: candidate=${candidateAbs} parent=${parentAbs}`
    );
  }
}
```

Path containment is asserted at server start, not per request: `docsRoot` is computed once from `projectMetadata.docs` and stored in the immutable `ProjectContext`. Any subsequent `fs.readFile` uses `resolve(docsRoot, relativePath)` and re-asserts containment of the result against `docsRoot` (defense-in-depth — the relative path comes from the parsed `DocNode` and is trusted, but it costs nothing to check). If `assertContained` ever throws at request time, the response is 500 with `code: "path_escape"`; the operator gets a stderr line naming the offending path.

This closes the explicit handoff documented in `03-project-metadata.md` Open Issues ("`docs` path validation" — "MEDIUM for `04-api-server` where real filesystem reads happen").

### Reading the docs tree

```ts
// server/src/readDocs.ts
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { assertContained } from "./pathSafety";

export async function readDocsTree(docsRoot: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith(".") || e.name === "node_modules") continue;  // skip dotfiles + node_modules
        await walk(abs);
      } else if (e.isFile() && e.name.endsWith(".md")) {
        assertContained(docsRoot, abs);
        const rel = relative(docsRoot, abs);
        out[rel] = await readFile(abs, "utf8");
      }
    }
  }
  await walk(docsRoot);
  return out;
}
```

The walk skips dotfile-prefixed directories (which catches `.git/`, `.ledger/`, and any future hidden state) and `node_modules` defensively. The `process/` and `_schemas/` skips that `parseDocs.ts` already applies live inside `@ledger/parser`'s `buildDocGraph`, not in the read step — the read step pulls everything markdown-shaped and the parser decides what's a tracked node.

`buildDocGraph(rawDocs)` is the extracted pure function. Today's `loadDocNodes()` in `app/src/lib/parseDocs.ts` is `buildDocGraph(import.meta.glob(...))` wrapped in `useMemo` cache. The server's `GET /api/docs` is `buildDocGraph(await readDocsTree(docsRoot))` without the memo. Same function, different input source.

### CLI launcher

```ts
// server/src/bin/ledger.ts
#!/usr/bin/env node
import { parseArgs } from "node:util";
import { serve } from "@hono/node-server";
import open from "open";
import { createServer } from "../server";
import { loadProjectContext, ContextError } from "../context";

const USAGE = "usage: ledger <project-path> [--port N] [--no-open]\n";

let positionals: string[];
let values: { port: string; "no-open": boolean; help: boolean };
try {
  ({ positionals, values } = parseArgs({
    strict: true,
    allowPositionals: true,
    options: {
      port: { type: "string", default: process.env.LEDGER_PORT ?? "4180" },
      "no-open": { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  }));
} catch (e) {
  process.stderr.write(`ledger: ${(e as Error).message}\n${USAGE}`);
  process.exit(2);
}

if (values.help || positionals.length !== 1) {
  process.stderr.write(USAGE);
  process.exit(values.help ? 0 : 2);
}

const port = Number(values.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  process.stderr.write(`ledger: invalid --port "${values.port}" (expected integer 0..65535)\n`);
  process.exit(2);
}

try {
  const project = await loadProjectContext({ projectPath: positionals[0], port });
  const app = createServer(project);
  serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
  const url = `http://localhost:${port}/`;
  process.stdout.write(`ledger: ${project.project.name} on ${url}\n`);
  if (!values["no-open"]) {
    try { await open(url); } catch (e) {
      // Headless environment (no DISPLAY on Linux, etc.). The URL is already printed.
      process.stderr.write(`ledger: could not open browser (${(e as Error).message}); ${url} is ready\n`);
    }
  }
} catch (e) {
  if (e instanceof ContextError) {
    process.stderr.write(`ledger: ${e.message}\n${formatErrors(e.errors)}\n`);
    process.exit(1);
  }
  throw e;
}
```

`@hono/node-server` is Hono's Node adapter. `open` is the cross-platform browser opener used by countless dev tools. Both are small, popular, no-frills. The `open()` call is wrapped in try/catch so headless environments (CI, SSH-only boxes, Linux without `DISPLAY`) get a printed-URL fallback instead of an unhandled rejection — Spec Review S7.

Process management is intentionally absent: no daemonization, no PID file, no `--detach`, no log file (logs go to stdout/stderr and the operator's terminal scrollback handles them). `Ctrl-C` sends SIGINT; the Hono server stops accepting new connections, drains in-flight requests, and the process exits. Re-launching is `^C` then `↑↵` in the same terminal. v1 is single-operator; complicated process plumbing is YAGNI.

### UI consumer migration: `useDocGraph`

Today:

```ts
// app/src/components/dag/useDocGraph.ts (before)
export function useDocGraph(): DocNode[] {
  return useMemo(() => loadDocNodes(), []);
}
```

After:

```ts
// app/src/components/dag/useDocGraph.ts (after)
import { useQuery } from "@tanstack/react-query";
import { loadDocNodes } from "@/lib/parseDocs";
import type { DocNode } from "@/lib/types";

const API_BASE = import.meta.env.VITE_LEDGER_API ?? "";

export function useDocGraph(): DocNode[] {
  const { data } = useQuery({
    queryKey: ["docs"],
    queryFn: async (): Promise<DocNode[]> => {
      if (!API_BASE) return loadDocNodes();           // build-time fallback (no server configured)
      const res = await fetch(`${API_BASE}/api/docs`);
      if (!res.ok) throw new Error(`/api/docs returned ${res.status}`);
      const json = await res.json() as { nodes: DocNode[] };
      return json.nodes;
    },
    staleTime: 30_000,
    placeholderData: () => loadDocNodes(),            // suspense-free first paint via build-time data
  });
  return data ?? [];
}
```

`API_BASE` is `"/api"` — the Vite dev proxy (`server.proxy: { "/api": "http://127.0.0.1:4180" }` in `vite.config.ts`) makes the request same-origin from the browser's view, so the URL is hostname-free and production builds carry no baked-in API host. The env-var alternative (`VITE_LEDGER_API=http://localhost:4180`) was rejected for that reason.

The `placeholderData` returning `loadDocNodes()` keeps the first paint instant against the build-time tree, then the query updates to the live data when it arrives. Same memoized data on the first frame, live data on the second frame — net effect is a small flicker on edits but no loading spinner on app load. `loadDocNodes()` is module-singleton-cached (`parseDocs.ts:_built`) so the repeated calls TanStack Query triggers via `placeholderData` on every render are free. Acceptable for v1; refinable later.

**Where `import.meta.glob` lives after the workspace split (Spec Review S4):** `loadDocNodes()` and its `import.meta.glob('../../../docs/**/*.md', { eager: true, as: 'raw' })` call **stay inside `app/src/lib/parseDocs.ts`** — the relative path is calibrated to that file's location in the repo, and Vite's glob is a build-time primitive that only runs through Vite's pipeline (not Node's). `@ledger/parser` exports only the pure `buildDocGraph(rawDocs: Record<string, string>): DocNode[]` function (and the schema/project validators). `app/`'s `parseDocs.ts` becomes a 5-line wrapper: `import.meta.glob(...)` to produce `rawDocs`, then `return buildDocGraph(rawDocs)`. The server's `readDocsTree(docsRoot)` produces the same `Record<string, string>` shape from `fs` and feeds it to the same `buildDocGraph()`.

**Other consumers do not migrate in this node.** `useHealthData` still calls `useDocGraph` (now backed by the API), so it inherits the migration for free; the rest of `useHealthData`'s logic is unchanged. `useDocSource` (the doc-viewer panel's hook) keeps reading via Vite's `?raw` import for now — its migration to `GET /api/docs/:nodeId` is a follow-up commit, tracked as an Open Issue here so it doesn't get lost. The orchestration hooks (`useTask`, `useTaskList`, `useLogStream`) keep their transcript bootstrap; they migrate with `05-task-runner` per the build order.

### Schema reuse from `02-schema` and `03-project-metadata`

The server-side validator instance is a second `new Ajv2020(...)` constructed inside `@ledger/parser`'s server-runtime entrypoint. The browser-side validator instance still exists in the build (until the API migration is complete across all consumers and the validation is fully server-side, at which point the import drops naturally per `02-schema`'s D6 and `03-project-metadata`'s Op-2). This v1 has both instances live simultaneously — UI for the unmigrated panels (`useDocSource` etc.) and server for `/api/docs`. The bundle delta sits unchanged for the UI; the server pays a small startup cost (~10 ms) to compile its validator on boot. Logged as TRIVIAL.

The `_schemas/` directory is a **shared resource** — both the browser (still) and the server import `document-node.schema.json` and `project-metadata.schema.json` from `docs/_schemas/`. The location is correct per PRD §9 ("stored in the document tree root"); the parser package references them through a `tsconfig.json` `paths` alias so the depth of the relative path is greppable and changes only in one place:

```jsonc
// packages/parser/tsconfig.json
{
  "compilerOptions": {
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@schemas/*": ["../../docs/_schemas/*"]
    }
  }
}
```

Validators then `import schema from "@schemas/document-node.schema.json" with { type: "json" }`.

**Runtime resolution.** The server runs against compiled output (`server/dist/bin/ledger.js` invokes compiled `packages/parser/dist/...`). The `with { type: "json" }` import compiles to a Node-runtime `import` against the JSON path. With pnpm's workspace symlink, `node_modules/@ledger/parser` is a link to `packages/parser/`, which resolves `../../docs/_schemas/*.json` correctly back to the repo's `docs/_schemas/` tree. The implementer must smoke-test this with `node packages/parser/dist/.../validateDocNode.js` before finalizing — if symlink-relative resolution surprises Node, the fallback is to copy the schema JSONs into `packages/parser/dist/_schemas/` as a `tsc -b`-adjacent step. (Spec Review S6: pin the runtime-resolution story; the smoke test is on the stage-4 implementer's checklist.)

### Test infrastructure

The new `server/` package gets its own `vitest.config.ts` (Node environment, no jsdom — the existing `app/vite.config.ts` has the jsdom client project + the node server project; that pattern doesn't carry over because the new `server/` is a standalone package with no Vite). `pnpm -C server test` runs `vitest run` against `server/test/**/*.test.ts`.

Endpoint tests use Hono's `app.request()` API directly — no HTTP listener needed:

```ts
// server/test/docs.test.ts (excerpt)
const project = await loadProjectContext({ projectPath: fixturePath, port: 0 });
const app = createServer(project);
const res = await app.request("/api/docs");
expect(res.status).toBe(200);
const body = await res.json();
expect(body.nodes.length).toBeGreaterThan(0);
```

CLI tests use `node:child_process.spawn` against the compiled `dist/bin/ledger.js`:

```ts
// server/test/bin.test.ts (excerpt)
const proc = spawn(process.execPath, ["dist/bin/ledger.js", "--help"], { cwd: serverRoot });
const { stderr, code } = await collect(proc);
expect(code).toBe(0);
expect(stderr).toMatch(/usage: ledger/);
```

The fixture project under `server/__fixtures__/sample-project/` has a minimal but conformant tree: a root doc (`00-project.md`, parsed via the legacy parent-doc path per `02-schema`'s S2 leaf-only-validation decision — root + parent docs bypass schema validation by design), a leaf doc (`01-leaf.md`, validated against `document-node.schema.json`), and a `.ledger/project.json` (validated against `project-metadata.schema.json`). The fixture is **not** the real `ledger` project itself — it's an independent minimal tree so the tests don't break every time a real doc transitions status. (Spec Review N5: only the leaf doc and the metadata file are validated; the root parses via the legacy path.)

The migrated `useDocGraph` hook gets a test in `app/src/components/dag/useDocGraph.test.ts` that mocks `fetch` and asserts the query shape — same pattern as the existing `LogEventRow.test.tsx` test setup.

### Files added / modified

```
pnpm-workspace.yaml                                  [new — workspace declaration]
package.json                                         [new at repo root — workspace metadata + scripts]
packages/parser/package.json                         [new — @ledger/parser]
packages/parser/tsconfig.json                        [new]
packages/parser/src/index.ts                         [new — public surface]
packages/parser/src/schema/parseDocNode.ts           [MOVED from app/src/lib/schema/]
packages/parser/src/schema/validateDocNode.ts        [MOVED from app/src/lib/schema/]
packages/parser/src/schema/types.ts                  [MOVED from app/src/lib/schema/]
packages/parser/src/project/validateProjectMetadata.ts  [new — extracted from loadProjectMetadata]
packages/parser/src/project/types.ts                 [MOVED from app/src/lib/project/]
packages/parser/src/docs/buildDocGraph.ts            [new — extracted from app/src/lib/parseDocs.ts]
packages/parser/src/docs/types.ts                    [new — re-exports]
packages/parser/test/*.test.ts                       [MOVED — schema + project + docs tests]
packages/parser/__fixtures__/*                        [MOVED from app/src/lib/{schema,project}/fixtures/]

server/package.json                                   [new — @ledger/server, bin: { ledger }]
server/tsconfig.json                                  [new]
server/vitest.config.ts                               [new]
server/src/server.ts                                  [new — Hono app factory]
server/src/context.ts                                 [new — ProjectContext + loadProjectContext]
server/src/pathSafety.ts                              [new — assertContained helper]
server/src/readDocs.ts                                [new — fs walk]
server/src/routes/project.ts                          [new]
server/src/routes/docs.ts                             [new]
server/src/index.ts                                   [new — re-exports for tests]
server/src/bin/ledger.ts                              [new — CLI launcher]
server/test/project.test.ts                           [new]
server/test/docs.test.ts                              [new]
server/test/pathSafety.test.ts                        [new]
server/test/context.test.ts                           [new]
server/test/bin.test.ts                               [new]
server/__fixtures__/sample-project/.ledger/project.json    [new]
server/__fixtures__/sample-project/docs/00-project.md      [new]
server/__fixtures__/sample-project/docs/01-leaf.md         [new]

app/package.json                                      [modified — renamed to @ledger/app, adds @ledger/parser dep]
app/src/lib/parseDocs.ts                              [modified — slimmed; now wraps @ledger/parser buildDocGraph with import.meta.glob]
app/src/lib/project/loadProjectMetadata.ts            [modified — slimmed; wraps @ledger/parser validateProjectMetadata]
app/src/lib/schema/                                   [DELETED — moved to packages/parser/]
app/src/lib/project/fixtures/                         [DELETED — moved to packages/parser/]
app/src/components/dag/useDocGraph.ts                 [modified — TanStack Query against /api/docs with build-time fallback]
app/src/components/dag/useDocGraph.test.ts            [new — mocked-fetch hook test]
app/vite.config.ts                                    [modified — server.proxy: /api → 127.0.0.1:4180]

docs/04-api-server/00-api-server.md                   [this spec (parent)]
docs/00-project.md                                    [modified — §14 status row]
docs/03-project-metadata.md                           [modified — close "docs path validation" Open Issue handoff]
CLAUDE.md                                             [modified — "Running the app" section adds `pnpm -C server dev`; build order line updated]
```

New runtime dependencies (in `server/package.json`):

- `hono@^4` — HTTP framework
- `@hono/node-server@^1` — Node adapter
- `open@^10` — cross-platform browser opener

New dev dependencies (in `server/package.json`):

- `tsx@^4` — TS runner for `pnpm -C server dev`
- `vitest@^4.1.7` — already in `app/`, but `server/` gets its own dev dep entry under the workspace

The `@ledger/parser` package re-uses `ajv@^8` and `ajv-formats@^3` already installed by `02-schema`; the workspace hoists them.

### Acceptance check (manual)

A reviewer running the worktree must observe:

1. `pnpm install` at the repo root succeeds; `pnpm-workspace.yaml` includes `app`, `server`, `packages/*`.
2. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build`, `pnpm -C app test` exit zero.
3. `pnpm -C server typecheck`, `pnpm -C server lint`, `pnpm -C server build`, `pnpm -C server test` exit zero.
4. `pnpm -C packages/parser typecheck`, `pnpm -C packages/parser test` exit zero.
5. `pnpm -C server dev /Users/dennis/code/ledger` starts the API server on port 4180; `http://127.0.0.1:4180/api/_health` returns `{ ok: true, ... }`; `GET /api/project` returns the validated metadata; `GET /api/docs` returns the full `DocNode[]` shape with one entry per current authored doc plus the manifest-only PLANNED rows.
6. `node /Users/dennis/code/ledger/server/dist/bin/ledger.js /Users/dennis/code/ledger` (or `pnpm -C server build && ledger /Users/dennis/code/ledger` from a workspace-aware shell) starts the server and opens the browser at `http://localhost:4180/`.
7. With both `pnpm -C server dev` and `pnpm -C app dev` running, opening `http://localhost:4179/` shows the DAG panel rendering the live data — confirmed by editing a doc's `**Status:**` header on disk, waiting up to 30s (TanStack staleTime), and seeing the new status surface in the DAG without restarting the UI dev server.
8. Killing the API server (`Ctrl-C` in the server terminal) causes the DAG panel to fall back to its build-time data (no error spinner; the placeholder data covers the gap).
9. `ledger` invoked with no path prints a usage message to stderr and exits 2.
10. `ledger /nonexistent/path` exits 1 with a clear stderr message naming the missing path or missing `.ledger/project.json`.
11. Editing `.ledger/project.json` to set `"docs": "../escape"` and re-launching `ledger` fails at start with a `PathContainmentError` naming the resolved path; the server does not bind a port.
12. The `03-project-metadata` "docs path validation" Open Issue is closed in the same node (struck through with a closure note pointing here).
13. `useDocGraph`'s migration is the only UI hook touched; `useDocSource`, `useHealthData`, `useTask`, `useLogStream` all read their data the same way they did before this node.
14. Bundle delta of `app/` (vs main HEAD before this node) is small — the schema/parser code moved out of `app/` and into the parser package, which the app still imports, so the UI bundle changes by roughly the TanStack Query refactor of `useDocGraph` (~1 KB gzip net). The server bundle is reported separately.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Hono as the HTTP framework | TS-first (no `@types/*`), zero-config, native fetch-Request/Response so handlers are testable via `app.request()` without an HTTP listener. Small (~30 KB). Credible Phase-3 portability story for Workers/edge runtimes. Fastify's plugin model is overkill at v1 surface area; Express's lack of first-class TS and SSE story is the strongest argument against it; vanilla `node:http` saves nothing at this size. |
| D2 | New top-level `server/` package + new top-level `packages/parser/` package; repo becomes a pnpm workspace | The UI and the API server share the schema validator, the project-metadata loader, the markdown extractor, and the `DocNode[]` projection. Without a shared package, the server reaches into `../app/src/lib/...` via relative paths — a coupling that gets brittle as the boundary moves. The pnpm workspace formalises the boundary, gives the UI and the server independent `package.json`s (with their own deps), and prepares the ground for `05-task-runner` (likely its own workspace package). The migration is mechanical but disruptive — it touches every existing import; doing it at this hinge node is cheaper than doing it later when more code has accumulated. |
| D3 | Default port 4180; `--port` CLI flag and `LEDGER_PORT` env var to override; UI dev port stays 4179 | Adjacent ports cluster cleanly in `lsof`. 4180 is unclaimed by any popular dev tool. The pin via `--port` is for the rare operator running two ledger instances; CI tests use port 0 to let the OS assign. The UI's `vite.config.ts` proxy points `/api/*` at `127.0.0.1:4180`, so the env var only matters if the operator overrides the port. |
| D4 | Server binds to `127.0.0.1` only, never `0.0.0.0` | Single-user local-only tool (PRD §13: multi-user deferred). The OS firewall is the perimeter. No tokens, no sessions, no API keys in v1. If a future remote-access story matters, the right answer is `ledger --host 0.0.0.0` *plus* an auth layer landed in the same node — not a v1 default that ships unauthenticated remote access. |
| D5 | Three v1 endpoints (`/api/_health`, `/api/project`, `/api/docs`, `/api/docs/:nodeId`); no task / log / dispatcher / health-daemon endpoints | PRD §7.2 commits to per-endpoint migration. v1 ships exactly enough to (a) validate the project-scoping contract end-to-end and (b) migrate one UI consumer (`useDocGraph`). Task/log endpoints depend on data structures (`05-task-runner`'s tables) that don't exist yet — defining their wire shape now without a backing implementation invites churn. Same for the dispatcher and daemon. |
| D6 | One UI consumer migrates in this node: `useDocGraph` | PRD §7.2's per-endpoint migration discipline says each consumer flips in its own commit, both to limit blast radius and to validate the endpoint with a real consumer. `useDocGraph` is the right first one because (a) it's the most-used hook (DagCanvas + DocsTree + useHealthData all consume it transitively), (b) its data contract is already abstracted behind the `loadDocNodes()` indirection from `02-schema`, so the migration is a one-line replacement, and (c) it exercises the `/api/docs` endpoint which is the largest of the three. `useDocSource` and the orchestration hooks migrate in follow-up commits — logged as Open Issues. |
| D7 | Read endpoints only in v1; no write surface | Every write goes through a task with declared resource claims per PRD §10. Adding a raw write path here would bypass that discipline. Editing docs at v1 scale is "open the file in a text editor" — perfectly fine for a single operator. Write endpoints arrive with `05-task-runner` where the resource-claim invariant has a real enforcer. |
| D8 | Read `docs/**/*.md` from `fs` on every request; no cache, no watcher | At ~15 docs × ~10 ms total the latency is invisible. A file-watcher (chokidar, fs.watch) adds a moving piece for no measurable benefit. When the docs tree grows past a few hundred files and request latency becomes visible, an mtime-keyed in-memory cache is the answer — not a watcher. Logged as Open Issue. |
| D9 | Path containment enforced at `ProjectContext` load + defensively per request | The `docs` field is operator-authored config (per `03-project-metadata`'s schema). Asserting at load time refuses to start the server on a malformed config; asserting per request catches the case where a `DocNode`'s `source` path somehow goes wrong (shouldn't happen, but the check is free). Closes `03-project-metadata`'s explicit handoff. |
| D10 | Project scoping via constructor injection (`createServer(project)`), not a module-level singleton | One server instance per project is the v1 contract (PRD §7.1). A singleton would prevent in-process tests from running two contexts in parallel (which the test suite needs for fixture-isolated endpoint tests). The constructor pattern is also the right shape if a future v2 hosts multiple projects in one server process. |
| D11 | CLI launcher in this node, not deferred | PRD §7.1 explicitly anchors `ledger <path>` to "the launcher reads `.ledger/project.json`, starts the API server, opens the browser." Shipping the API server without the launcher leaves the project-scoping story half-finished. The launcher is ~30 LOC; deferring it would require a follow-up node for trivial polish work. |
| D12 | `app/server/` (existing transcript bootstrap) is **not** touched by this node | That directory is named "server" but it's actually the build-time data layer for `01-ui/10-orchestration` — parsing Claude Code transcript JSONL into the orchestration data hooks. It is unrelated to the new HTTP server and gets retired separately when `06-agent-dispatcher` lands and the dispatch metadata moves to a real data source. v1 of this node keeps the names confusingly co-resident; rename is a follow-up cleanup. |
| D13 | TanStack Query against `/api/docs`, with build-time fallback when API is unreachable | The UI must keep working without the server running — both for the transition period and for the `pnpm -C app build` static-render case. `placeholderData: () => loadDocNodes()` returns the build-time tree on first paint; the query refetches and updates when the server responds. No spinner on app load. If the fetch fails the placeholder data persists; the UI degrades visibly only if both the build-time data and the server are bad. |
| D14 | Schema artifacts (`docs/_schemas/*.json`) stay where they are (PRD §9); the parser package imports them by relative path | PRD §9 commits to "stored in the document tree root." Copying them into `packages/parser/src/schemas/` would create a drift surface. The TS `resolveJsonModule` + relative import is supported in every modern TS toolchain. |
| D15 | No OpenAPI / Swagger artifact in v1 | The contract is enforced at compile time across the workspace — both `app/` and `server/` depend on `@ledger/parser` for shared types. An OpenAPI doc becomes valuable when a non-TS consumer exists (likely `06-agent-dispatcher`'s MCP server, possibly in a different language). Defer until then. |

---

## Open Issues

- **Remaining UI consumers not migrated in this node.** `useDocSource` (doc-viewer panel `03-docs`), `useHealthData` (uses `useDocGraph` transitively so already inherits the migration for its primary data, but has separate code paths), `useTask`/`useTaskList`/`useLogStream` (orchestration hooks). Each migrates in its own follow-up commit per the per-endpoint discipline. The orchestration hooks specifically wait on `05-task-runner` because the API shape they migrate *to* depends on what the runner emits. *(Priority: MEDIUM — multi-commit follow-up; tracked here so it doesn't get lost.)*
- **Document cache invalidation.** v1 reads from `fs` on every request. At today's scale this is fine; at 100+ docs or many concurrent UI tabs, request latency becomes visible. Right answer is an mtime-keyed in-memory cache, not a file-watcher. *(Priority: LOW — surfaces when latency becomes visible.)*
- **No SSE / live updates.** A long-running ledger session sees stale data until TanStack Query's `staleTime` (30s) elapses or the user refocuses the tab. Live updates need a push channel — SSE is the natural answer, but the only consumer that needs it (the log stream) is `05-task-runner`'s deliverable. Defer until then. *(Priority: LOW — the polling-via-staleTime UX is adequate for v1.)*
- **Server-validator vs UI-validator duplication.** During the migration period both the browser bundle and the server compile their own ajv instances. The browser instance drops naturally as more UI consumers migrate (a tab that only renders DAG data needs no client-side validator); the duplication zeroes out when the last unmigrated consumer (`useDocSource`) flips. *(Priority: TRIVIAL — temporary, self-resolving.)*
- **`app/server/` directory shares a name with the new top-level `server/`.** Today's `app/server/` is the transcript-ingestion bootstrap for `01-ui/10-orchestration`; the new `server/` is the HTTP API. Confusing naming. Rename (likely `app/src/lib/transcript/` for the bootstrap) is mechanical but disruptive; defer to the cleanup pass that retires the transcript bootstrap entirely when `06-agent-dispatcher` lands. *(Priority: LOW.)*
- **No request schema for write endpoints (because there are none).** When write endpoints land with `05-task-runner`, request bodies need their own JSON Schema validation — likely a fourth schema artifact `docs/_schemas/api-request.schema.json`. Logged as a delegation to that node. *(Priority: LOW for this node — surfaces when writes are added.)*
- **CORS allow-list is one origin.** v1 allows only the UI's dev origin (`http://localhost:<ui-port>`). A second UI instance, or a curl from a different origin, is rejected. Fine for single-user local-only; revisit if the test harness needs cross-origin requests. *(Priority: TRIVIAL.)*
- **No request-level structured error type.** Errors are JSON `{ error: string, code?: string }` shaped ad-hoc in each handler. A typed `APIError` class with consistent serialization would tighten the contract. Acceptable to defer until enough endpoints exist to amortise the abstraction cost. *(Priority: LOW.)*
- **No unified `pnpm dev` from the workspace root.** Operator runs `pnpm -C server dev` and `pnpm -C app dev` in two terminals. A workspace-level `dev` script (concurrently, npm-run-all, or a small node runner) is polish; deferred. *(Priority: TRIVIAL.)*
- **CLI launcher is non-isolated from npm-installed globals.** `npm install -g @ledger/server` would put `ledger` on the PATH but the package is workspace-local and not published. v1 expects `pnpm -C server build && node server/dist/bin/ledger.js <path>` or a workspace-aware `pnpm exec ledger <path>`. Publishing the CLI is a packaging concern, deferred. *(Priority: LOW.)*
- **`docs` field absolute-path edge case.** D9's `assertContained` resolves both sides absolutely, so an absolute-path `"docs": "/etc"` value resolves cleanly and then `assertContained` rejects it (the resolved path is not a descendant of `projectRoot`). But the rejection message says "path escapes project root" which is technically true but reads oddly. Cosmetic; can be improved by a separate "absolute paths not allowed" check up front. *(Priority: TRIVIAL.)*

---

## Spec Review (2026-05-25)

Independent spec review was run against this DRAFT in a clean Sonnet context immediately after authoring. Verdict: NEEDS_MINOR_REVISIONS, no blockers. Nine should-fixes (eight mechanical, one operator-decision) and seven nits (five mechanical, two no-action stylistic confirmations). Coverage matrix returned by the reviewer marked every PRD §7 / §7.1 / §7.2 commitment as Addressed; one item (git plumbing) flagged as Partial-by-deferral with explicit handoff. All findings applied or explicitly resolved. Audit:

| # | Finding | Resolution |
|---|---------|------------|
| S1 | CORS-and-Vite-proxy posture internally inconsistent: server factory sets `cors({ origin: ui-port })` but UI consumer migration commits to proxy-only `API_BASE = "/api"`. `--ui-port` flag and `uiPort` field on `ProjectContext` become dead weight under the proxy contract. Reviewer flagged as operator-decision. | **Operator chose drop-CORS + drop-uiPort (proxy-only contract).** Rewrote §"HTTP framework: Hono" to remove the `cors` middleware import and the `app.use("/api/*", cors(...))` line. Removed `uiPort?` from the `ProjectContext` interface and from `loadProjectContext`'s opts. Removed `--ui-port` from the CLI launcher's `parseArgs` options and from the usage string. Added a paragraph below the Hono code block explaining why CORS is absent (proxy makes everything same-origin from the browser's view; future cross-origin need must land with auth). |
| S2 | CLI launcher's `parseArgs` has unhandled-throw risk on unknown options; `Number(values.port)` silently produces `NaN` for non-numeric `LEDGER_PORT` env values. | Rewrote the CLI snippet: wrapped `parseArgs` in try/catch with a usage-message stderr + exit 2; added `Number.isInteger(port) && port >= 0 && port <= 65535` guard with an explicit stderr message naming the invalid value; explicit `strict: true` in `parseArgs` options. Extracted `USAGE` constant so usage text is single-sourced. |
| S3 | Requirements §7 said "Vitest is reused from `app/`; the new `server/` package picks it up via the workspace" but Design §"Test infrastructure" says `server/` gets its own `vitest.config.ts`. Contradiction. | Rewrote Requirements §7 to say each workspace package owns its `vitest.config.ts` (`app/` keeps its existing config; `server/` and `packages/parser/` add Node-env configs); only the binary is hoisted by the workspace. Matches the Design block now. |
| S4 | `placeholderData: () => loadDocNodes()` referenced `@/lib/parseDocs`'s `loadDocNodes`, but the file-list moves `parseDocs.ts` content into `@ledger/parser`. Implementer could plausibly try to move `loadDocNodes()` itself into the parser package, which would break `import.meta.glob` (Vite-only primitive, relative-path-calibrated to `app/src/lib/`). | Added explicit paragraph to §"UI consumer migration": `import.meta.glob('../../../docs/**/*.md', ...)` and `loadDocNodes()` **stay inside `app/src/lib/parseDocs.ts`**; `@ledger/parser` exports only the pure `buildDocGraph(rawDocs)` function. The server's `readDocsTree(docsRoot)` produces the same `Record<string, string>` shape from `fs` and feeds it to the same `buildDocGraph()`. Added Spec Review citation. |
| S5 | `app/server/` shares a name with the new top-level `server/` and is actively imported from `vite.config.ts:6` and `tsconfig.node.json:23`. Open Issue understated the coupling. No Verification gate ensures the node doesn't accidentally rewrite that directory. | Added Verification items 11a (`git diff` of `app/server/`, `app/vite.config.ts`, `app/tsconfig.node.json` must be empty) and 11b (all 99 pre-existing `app/` tests still pass without source changes). Open Issue text stays as-is; the rename is still deferred to the post-`06-agent-dispatcher` cleanup. |
| S6 | Schema relative-path import depth was wrong (`"../../../docs/_schemas/..."` should be `"../../../../docs/_schemas/..."` from `packages/parser/src/schema/`); runtime resolution at `node dist/bin/ledger.js` time was not pinned. | Replaced the relative-path approach with a `tsconfig.json` `paths` alias (`"@schemas/*": ["../../docs/_schemas/*"]`) in `packages/parser/tsconfig.json`, depth-calibrated from the parser package root rather than per-file. Pinned runtime story: pnpm workspace symlink makes `../../docs/_schemas/` resolve from the parser's `dist/` correctly; implementer smoke-tests with `node -e` before finalizing; fallback is a copy step into `packages/parser/dist/_schemas/`. |
| S7 | `await open(url)` rejects on headless Linux (no `DISPLAY`, `xdg-open` warns + exits non-zero). | Wrapped `await open(url)` in try/catch; on failure the URL is already printed to stdout and a stderr line notes the browser-open failure. Server keeps running. |
| S8 | Hono CORS fallback origin when `uiPort` is unset reads `http://localhost:4179` even if no UI is configured. | Resolved by S1 — CORS middleware removed entirely. |
| S9 | `pathSafety.ts` snippet used `isAbsolute(rel)` but did not import `isAbsolute` from `node:path`. | Added `isAbsolute` to the `import { ... } from "node:path"` line. |
| N1 | Spec claimed Hono's `:nodeId` parameter receives `"01-ui/02-dag"` directly, but a bare `:nodeId` matches a single segment; the multi-segment form needs `:nodeId{.+}`. | Updated §"Endpoints in v1" paragraph to specify `app.get('/:nodeId{.+}', ...)` and to mention `c.req.param('nodeId')` returns the full decoded path. |
| N2 | `/api/docs` carries a `validation: { errorPaths }` envelope; `/api/docs/:nodeId` was 404-on-validation-failure with no envelope. Asymmetry was undocumented. | Made the asymmetry deliberate: `/api/docs/:nodeId` returns `422` on validation failure with `{ errors: ValidationError[] }`; 404 only when the id doesn't resolve to a tracked file. Added explanatory paragraph: bulk endpoint is a tree survey (carries errors alongside data); single-resource lookup treats validation failure as the answer. |
| N3 | `placeholderData: () => loadDocNodes()` re-runs on every render; spec didn't note that `loadDocNodes()` is module-singleton-cached so the calls are free. | Added one sentence to §"UI consumer migration" noting the `_built` singleton cache. |
| N4 | `tsx watch` referenced but the exact `dev` script line was missing. | Added: `"dev": "tsx watch src/bin/ledger.ts"` (positional args appended at invocation). |
| N5 | "Both schemas validate it cleanly" in §"Test infrastructure" was inaccurate: per `02-schema` S2, root + parent docs bypass schema validation entirely; only the leaf doc and the metadata file get schema-validated. | Reworded the fixture-project paragraph: root parses via the legacy parent-doc path; only `01-leaf.md` and `.ledger/project.json` are schema-validated. Cited Spec Review N5. |
| N6 | Decisions table format matches sibling specs. | No action — confirmation finding. |
| N7 | `Last Updated` parenthetical matches the leaf-workflow stage-2 commit convention. | No action — confirmation finding. |

The "Why Hono" paragraph that duplicated D1's rationale was also dropped during the S1 rewrite, matching sibling specs' convention of keeping rationale only in the Decisions table (reviewer's house-style alignment note).

Nothing was punted. S1 was the only operator-decision finding; the chosen resolution (drop CORS + drop uiPort) is recorded above. Reviewer's Confidence note flagged three unverified claims (Hono "~30 KB", `~10 ms` for fs-reading 15 docs, the workspace migration's effect on every existing test import) — the bundle size and timing are estimates that the stage-4 implementer will replace with measured values in Implementation Notes; the test-import claim is now a Verification gate (item 11b).

---

## Implementation Notes

### Decomposition (2026-05-26)

The original spec was authored as a leaf node and APPROVED 2026-05-25. The first stage-4 implementer dispatch (Sonnet sub-agent, worktree-isolated, briefed against the APPROVED spec + Spec Review audit) ran ~115 minutes and ~50 tool uses before its socket connection dropped. Only commit 4a (`APPROVED → IN_PROGRESS`) had landed; the worktree carried partial uncommitted work — root `package.json`, `pnpm-workspace.yaml`, `packages/parser/` scaffolded with 6 extracted source files (schema + project + docs/types). No tests, no `buildDocGraph` extraction, no `app/` slim-down, no `server/` package, no UI hook migration, no Implementation Notes. Estimated ~10–15% of total work.

Operator call: the spec packed five distinct work streams (workspace conversion + parser extraction + server build + CLI launcher + UI hook migration) into one implementation pass. Even without the socket drop, that scope strained a single Sonnet pass; the failure mode was a useful signal. Decomposed into the five sub-leaves per §Children below. Each child is one focused implementation pass against a child spec inheriting this parent's Design, Decisions, and Open Issues.

This is the framework's first data point for PRD §11's "decomposition termination criteria" Open Issue — what "too large for one pass" looks like in practice. The empirical heuristic from this case: a leaf whose Verification gate enumerates more than ~10 items, or whose Design touches more than 3 cross-cutting workspace boundaries, likely needs decomposition.

Status was reverted `IN_PROGRESS → APPROVED` (decomposed) in the same commit that landed this decomposition. The failed worktree (`worktree-agent-a15c4310feed361b7`) is parked, not pruned — the partial extraction it produced is a useful reference for the `02-parser-extraction` child's implementer, who can either resume it or restart with the smaller scoped brief.

The Spec Review (2026-05-25) audit table stays in this parent as durable provenance; every finding it resolved still applies, and each child spec cites the parent for the architectural decisions it inherits (CORS-dropped contract, Hono route shape, `:nodeId{.+}` matcher, 422-vs-404 semantics, path-containment posture, `import.meta.glob` stays in `app/`, etc.).

---

## Children

| ID | Title | Depends on | Status |
|----|-------|------------|--------|
| `01-workspace-conversion` | Convert repo to pnpm workspace — root `package.json` + `pnpm-workspace.yaml` declaring `app`, `server`, `packages/*`; rename `app` package to `@ledger/app`; no source code moves | — | COMPLETE (v1) |
| `02-parser-extraction` | New `packages/parser/` package containing the schema validator (`02-schema`), the project-metadata validator (`03-project-metadata`'s pure half), `buildDocGraph(rawDocs)` extracted from `parseDocs.ts`, types, tests, and fixtures; slim `app/src/lib/{schema,project,parseDocs}` to thin Vite-glob/import wrappers around the new package | `01-workspace-conversion` | COMPLETE (v1) |
| `03-server-package` | New top-level `server/` package: Hono app, `ProjectContext` + `loadProjectContext`, `pathSafety`, `readDocs`, three v1 routes (`/api/_health`, `/api/project`, `/api/docs`, `/api/docs/:nodeId{.+}`), Vitest config (Node env), endpoint + path-safety + context tests, fixture project under `__fixtures__/sample-project/` | `02-parser-extraction` | IN_PROGRESS |
| `04-cli-launcher` | `ledger` CLI binary at `server/src/bin/ledger.ts` exposed via the package's `bin` field; `parseArgs` strict + try/catch + `Number.isInteger` port guard; headless-safe `open(url)` wrap; SIGINT graceful shutdown; CLI tests via spawned subprocess | `03-server-package` | APPROVED |
| `05-ui-hook-migration` | Migrate `useDocGraph` to TanStack Query against `/api/docs` with `placeholderData: () => loadDocNodes()` build-time fallback; add Vite dev proxy `server.proxy: { "/api": "http://127.0.0.1:4180" }`; add mocked-fetch hook test; close `03-project-metadata`'s "docs path validation" Open Issue with a pointer here | `03-server-package` | APPROVED |

Build order is determined by the dependency edges above. Sequential dispatch: each child waits on its predecessor. `04-cli-launcher` and `05-ui-hook-migration` could in principle run in parallel after `03-server-package` lands (they share no files), but for the manual workflow today the operator is single-threaded so they'll serialize.

Out-of-scope items from the parent's Requirements (write endpoints, task/log/dispatcher/daemon endpoints, auth, multi-project, OpenAPI, hot reload, packaging) apply to every child — none of them reintroduce a deferred concern. Each child spec cites this parent's Decisions table for architectural inheritance rather than restating.

The end-to-end Acceptance check that originally lived in this parent's Verification section is distributed across the children: each child's Verification gate covers the items it produces, plus the final child (`05-ui-hook-migration`) carries the cross-cutting end-to-end gates (live DAG re-render on doc edit, server-down placeholder fallback, `03-project-metadata` Open Issue closure, `CLAUDE.md` doc sync).
