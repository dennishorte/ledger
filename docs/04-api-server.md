# API Server

**Node ID:** `04-api-server`
**Parent:** project root (`docs/00-project.md`)
**Status:** SPEC_REVIEW
**Created:** 2026-05-25
**Last Updated:** 2026-05-25 (DRAFT → SPEC_REVIEW)

**Dependencies:** `02-schema`, `03-project-metadata`

---

## Requirements

Stand up the **project-scoped HTTP API** that the UI consumes for document-tree state (PRD §7, §7.1, §7.2). Today the UI reads `docs/` directly via `parseDocs.ts` at Vite build time, which means: (a) every UI rebuild re-walks the filesystem inline with the browser bundle, (b) document state is frozen at build time — edits to a doc don't surface until the dev server reloads, (c) there is no place for the eventual task runner (`05-task-runner`), dispatcher (`06-agent-dispatcher`), or health daemon (`07-health-daemon`) to publish state to the UI, and (d) the framework has no answer to "how do I point this UI at a different project's `docs/` tree" beyond rebuilding from source. This node closes those gaps with a thin HTTP server, a project-scoped CLI launcher, and a single migrated UI consumer that proves the contract end-to-end.

This is the **substrate hinge node.** `02-schema` and `03-project-metadata` ship the validated artifacts; this node ships the runtime that reads them under a project-path argument and serves them over HTTP. Subsequent backend nodes (`05-task-runner`, `06-agent-dispatcher`, `07-health-daemon`) all mount onto the server defined here.

In scope for v1:

1. **An HTTP API server** as a new top-level pnpm workspace package (`server/`). Hono as the HTTP framework (D1). Runs as a Node process on a port the operator can pin via CLI flag or `LEDGER_PORT` env var; defaults to **4180** (one above the UI's 4179, deliberately adjacent so both ports cluster in the operator's `lsof` view). Exposes a small JSON-over-HTTP surface (endpoints listed below). No SSE in v1 — the only consumer that needs streaming is the eventual log endpoint, which is `05-task-runner`'s deliverable.
2. **Three v1 endpoints**, each backed by code that already exists in `app/src/lib/`:
   - `GET /api/project` — returns the loaded `.ledger/project.json` (validated against `03-project-metadata`'s schema) plus a small server-status envelope (`{ projectRoot, docsRoot, port, startedAt }`). Replaces the build-time `projectMetadata` singleton for runtime consumers.
   - `GET /api/docs` — returns the full `DocNode[]` set the UI's `useDocGraph` currently consumes from `parseDocs.ts`, plus the validation error list (the same `docValidationErrorPaths` array `Topbar.tsx` reads today, surfaced now via JSON so the dev-only banner can lift off build-time data).
   - `GET /api/docs/:nodeId` — returns the full validated `DocumentNode` (the `02-schema` superset shape, including raw section bodies and parsed manifest rows) for one node. The document-viewer panel (`03-docs`) currently slices this out of `loadDocNodes()` plus a raw-markdown re-fetch via `?raw`; this collapses both into one server-side read.
3. **A project-scoped runtime.** The server takes a project path at startup (CLI arg or `LEDGER_PROJECT_ROOT` env var), loads `.ledger/project.json` from that path, resolves `docsRoot` as `path.resolve(projectRoot, projectMetadata.docs)`, **enforces path containment** (rejects `..` segments and asserts the resolved docs path is a descendant of `projectRoot`; closes the explicit handoff in `03-project-metadata`'s Open Issues), and refuses to start on any failure with a clear stderr message. PRD §7.1's "one project per ledger instance" contract is implemented as a single immutable `ProjectContext` carried via Hono's context, not a global mutable singleton.
4. **A `ledger` CLI launcher** (`server/bin/ledger.ts` compiled to `dist/bin/ledger.js`, exposed via the workspace package's `bin` field). Argument shape: `ledger /path/to/project [--port 4180] [--no-open]`. Behavior: validates the path exists and contains `.ledger/project.json`, starts the API server, opens the browser at `http://localhost:<port>/` (using `open` package or platform-appropriate `child_process.spawn`), prints the URL to stdout. No-path invocation prints a usage message and exits 2 (matches the PRD §7.1 contract: "explicit path argument or error"). Process lifecycle is the obvious one (SIGINT → graceful shutdown, no PID file, no daemonization).
5. **One UI consumer migrated** (`useDocGraph`). Per PRD §7.2's per-endpoint migration discipline, the UI's `useDocGraph` hook flips from `loadDocNodes()` (build-time) to a TanStack Query against `GET /api/docs` (runtime). The rest of the UI (`useDocSource`, `useHealthData`, the orchestration hooks) stays on its current bootstrap — those migrate in their own follow-up commits. Per §7.2 this is **the** way the API gets validated by a real consumer; landing the server with no migrated consumer is explicitly rejected.
6. **A shared workspace package** (`packages/parser/`) extracted from `app/src/lib/` so the server can reuse the schema validator (`02-schema`), the project-metadata loader (`03-project-metadata`), the markdown extractor, and the `DocNode[]` projection without duplicating code or paying the cost of a `app/` → `server/` relative-path import. v1 extracts the minimum: `schema/` (parseDocNode, validateDocNode, types, schema JSON), `project/` (loadProjectMetadata, types), and the pure `parseDocs.ts` core (`buildDocGraph(rawDocs)` factored out of `loadDocNodes()` so the server can hand it a runtime-read map of `path → content` while the UI still calls `loadDocNodes()` with `import.meta.glob` results). The Vite-import-time fallback path in `loadProjectMetadata.ts` stays for the build-time use case but is no longer the only loader; the server adds a runtime variant that reads from `fs` against `projectRoot`.
7. **Tests** covering: endpoint-level request/response for all three endpoints (against a fixture project under `server/__fixtures__/sample-project/`), CLI launcher argument parsing (`--port`, `--no-open`, missing-path, bad-path, missing-metadata-file), path containment enforcement (a `docs` field set to `"../escape"` is rejected at server start, with the exact error path), and the migrated `useDocGraph` hook against a mocked server response. Vitest is reused from `app/`; the new `server/` package picks it up via the workspace.

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
- **Hot reload of the API server during development.** The server is small enough that restart-on-change via `tsx watch` (a one-line `dev` script) is the v1 answer. No `nodemon`, no orchestrated UI+server runner. The operator runs `pnpm -C server dev` in one terminal and `pnpm -C app dev` in another for now; a unified `pnpm dev` from the workspace root that runs both is a small polish item but not strictly in scope.
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
│   ├── 04-api-server.md                         # this spec
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
import { cors } from "hono/cors";
import type { ProjectContext } from "./context";
import { projectRoute } from "./routes/project";
import { docsRoute } from "./routes/docs";

type Env = { Variables: { project: ProjectContext } };

export function createServer(project: ProjectContext) {
  const app = new Hono<Env>();
  app.use("*", logger());
  app.use("/api/*", cors({ origin: `http://localhost:${project.uiPort ?? 4179}` }));
  app.use("*", async (c, next) => { c.set("project", project); await next(); });

  app.get("/api/_health", (c) => c.json({ ok: true, startedAt: project.startedAt }));
  app.route("/api/project", projectRoute);
  app.route("/api/docs", docsRoute);

  return app;
}
```

Why Hono: TS-first (no `@types/*` second-step), zero-config, native fetch-Request/Response so handlers are testable without an HTTP client (Hono's `app.request()` is the test surface), small bundle (~30 KB), and a credible portability story for Phase 3 if we ever move the API to a Worker/edge runtime. Fastify would be a heavier swap and its plugin model is overkill at this surface area; Express's lack of first-class TS and SSE story is the strongest argument against it; vanilla `node:http` would require us to write the routing + body-parsing layer ourselves at no real saving for a project this size.

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
  nodeId is the dotted/slashed id from parseDocs (e.g. "01-ui/02-dag", "02-schema", "root").
```

`nodeId` URL-encoding: the `/` in nested ids is URL-encoded as `%2F` in the path. Hono's router treats path segments as decoded values, so the handler receives `"01-ui/02-dag"` directly. Alternative considered: replace `/` with `--` in the URL (more reader-friendly); rejected because the UI already passes the canonical id form through its existing routes.

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
  uiPort?: number;           // if set, CORS allows it
  startedAt: string;         // ISO8601 of server start
}

export async function loadProjectContext(opts: {
  projectPath: string;
  port: number;
  uiPort?: number;
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
    uiPort: opts.uiPort,
    startedAt: new Date().toISOString(),
  };
}
```

```ts
// server/src/pathSafety.ts
import { relative, resolve, sep } from "node:path";

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

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: "string", default: process.env.LEDGER_PORT ?? "4180" },
    "ui-port": { type: "string", default: "4179" },
    "no-open": { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help || positionals.length !== 1) {
  process.stderr.write("usage: ledger <project-path> [--port N] [--ui-port N] [--no-open]\n");
  process.exit(values.help ? 0 : 2);
}

const port = Number(values.port);
const uiPort = Number(values["ui-port"]);
try {
  const project = await loadProjectContext({
    projectPath: positionals[0],
    port,
    uiPort,
  });
  const app = createServer(project);
  serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
  const url = `http://localhost:${port}/`;
  process.stdout.write(`ledger: ${project.project.name} on ${url}\n`);
  if (!values["no-open"]) await open(url);
} catch (e) {
  if (e instanceof ContextError) {
    process.stderr.write(`ledger: ${e.message}\n${formatErrors(e.errors)}\n`);
    process.exit(1);
  }
  throw e;
}
```

`@hono/node-server` is Hono's Node adapter. `open` is the cross-platform browser opener used by countless dev tools. Both are small, popular, no-frills.

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

The fallback paths matter: setting `VITE_LEDGER_API=""` (the default) makes the hook behave exactly like today, which lets the UI keep working during the transition for anyone who hasn't started the server yet. Setting `VITE_LEDGER_API=http://localhost:4180` (the value in `app/.env.development` after this node) flips it to the live API. The Vite dev proxy (`server.proxy: { "/api": "http://localhost:4180" }` in `vite.config.ts`) is the alternative wiring that avoids the env var entirely; both are fine and we use the proxy approach so production builds don't bake in a hostname. Updated final shape: `API_BASE` is `"/api"` (proxied in dev, served by the same origin in any eventual hosted deployment).

The `placeholderData` returning `loadDocNodes()` keeps the first paint instant against the build-time tree, then the query updates to the live data when it arrives. Same memoized data on the first frame, live data on the second frame — net effect is a small flicker on edits but no loading spinner on app load. Acceptable for v1; refinable later.

**Other consumers do not migrate in this node.** `useHealthData` still calls `useDocGraph` (now backed by the API), so it inherits the migration for free; the rest of `useHealthData`'s logic is unchanged. `useDocSource` (the doc-viewer panel's hook) keeps reading via Vite's `?raw` import for now — its migration to `GET /api/docs/:nodeId` is a follow-up commit, tracked as an Open Issue here so it doesn't get lost. The orchestration hooks (`useTask`, `useTaskList`, `useLogStream`) keep their transcript bootstrap; they migrate with `05-task-runner` per the build order.

### Schema reuse from `02-schema` and `03-project-metadata`

The server-side validator instance is a second `new Ajv2020(...)` constructed inside `@ledger/parser`'s server-runtime entrypoint. The browser-side validator instance still exists in the build (until the API migration is complete across all consumers and the validation is fully server-side, at which point the import drops naturally per `02-schema`'s D6 and `03-project-metadata`'s Op-2). This v1 has both instances live simultaneously — UI for the unmigrated panels (`useDocSource` etc.) and server for `/api/docs`. The bundle delta sits unchanged for the UI; the server pays a small startup cost (~10 ms) to compile its validator on boot. Logged as TRIVIAL.

The `_schemas/` directory is a **shared resource** — both the browser (still) and the server import `document-node.schema.json` and `project-metadata.schema.json` from `docs/_schemas/`. The location is correct per PRD §9 ("stored in the document tree root"); the parser package imports them by relative path (`../../../docs/_schemas/...`). The server's `tsconfig.json` allows the `resolveJsonModule` import; no copy step, no build-time codegen.

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

The fixture project under `server/__fixtures__/sample-project/` has a minimal but conformant tree: a root doc, a leaf doc, and a `.ledger/project.json` with the four required fields. Both schemas validate it cleanly. The fixture is **not** the real `ledger` project itself — it's an independent minimal tree so the tests don't break every time a real doc transitions status.

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

docs/04-api-server.md                                 [this spec]
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

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. `pnpm-workspace.yaml` exists at the repo root and lists `app`, `server`, `packages/*`. `pnpm install` at the repo root succeeds and links the workspace packages.
2. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build`, `pnpm -C app test` exit zero. The UI test count includes the new `useDocGraph.test.ts`.
3. `pnpm -C server typecheck`, `pnpm -C server lint`, `pnpm -C server build`, `pnpm -C server test` exit zero. Server test count covers all five test files listed in the Design.
4. `pnpm -C packages/parser typecheck`, `pnpm -C packages/parser lint`, `pnpm -C packages/parser test` exit zero. The moved tests still pass without modification.
5. Starting the server (`pnpm -C server dev /Users/dennis/code/ledger`) and hitting `http://127.0.0.1:4180/api/_health`, `/api/project`, `/api/docs`, `/api/docs/02-schema` returns the expected shapes (verified by the implementer's manual curl run, recorded in Implementation Notes).
6. The compiled `ledger` binary works end-to-end: `node server/dist/bin/ledger.js /Users/dennis/code/ledger` starts the server, opens the browser, prints the URL. `--no-open` suppresses the browser. `--port 4181` binds the alternative port. `--help` exits 0 with usage. Bare invocation exits 2 with usage on stderr.
7. With both servers running, the DAG panel renders the live API data: edit a doc's status header on disk, wait ≤30s, see the change appear without restarting the UI.
8. Killing the API server keeps the UI rendering (placeholder data covers the gap; no error spinner).
9. Path containment enforcement: setting `"docs": "../escape"` in `.ledger/project.json` and re-launching causes the server to exit 1 at start with a `PathContainmentError`; no port is bound. Setting `"docs": "/etc"` likewise fails.
10. `03-project-metadata.md`'s "docs path validation" Open Issue is closed in this node's commit, with a closure note pointing back at `04-api-server.md`.
11. The migrated `useDocGraph` is the only UI hook touched. `git diff main..HEAD --stat -- app/src/components` shows no other hooks modified beyond the new test file.
12. Bundle delta is reported in Implementation Notes against a named baseline (likely commit `a72c13f`, `03-project-metadata` COMPLETE). The UI bundle change is small (~1–5 KB gzip net); the server bundle is reported separately as an absolute size.
13. No new runtime dependencies beyond `hono`, `@hono/node-server`, `open` in `server/package.json`. No new runtime deps in `app/package.json` (TanStack Query is already there).
14. `CLAUDE.md` updated: "Running the app" gains a `pnpm -C server dev` line; "Hard constraints" line about the build order is synced; the round-2 / round-3 status sentence reflects the new `04-api-server` state.

---

## Children

None.
