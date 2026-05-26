# Server Package — Hono + Routes

**Node ID:** `04-api-server/03-server-package`
**Parent:** `04-api-server` (`docs/04-api-server.md`)
**Status:** APPROVED
**Created:** 2026-05-26
**Last Updated:** 2026-05-26 (SPEC_REVIEW → APPROVED, audit applied)

**Dependencies:** `04-api-server/02-parser-extraction`

---

## Requirements

Stand up the **HTTP API server** as a new top-level workspace package `server/`. Hono framework, three read-only endpoints, a single immutable `ProjectContext` per process, path-containment enforcement on docs reads, and a Node-environment Vitest suite. This is the third foundational child of `04-api-server` — it consumes `@ledger/parser` (`02-parser-extraction`) to validate the project metadata and to project docs into `DocNode[]` / `DocumentNode`; it is in turn consumed by `04-cli-launcher` (the binary that boots it) and indirectly by `05-ui-hook-migration` (the UI hook that fetches from it).

**This child ships the server as a programmatic library** — exporting `createServer(project)` and `loadProjectContext(opts)` for tests and the CLI to call. **The `ledger` CLI binary itself is `04-cli-launcher`'s deliverable**, not this child's. The split keeps the server testable headlessly (Hono's `app.request()` against in-memory contexts) and the CLI concerns (arg parsing, browser opening, SIGINT) localised to its own node.

In scope for v1:

1. **A new workspace package `server/`** with `package.json` (name: `@ledger/server`, `private: true`, `type: "module"`, **no `bin` field yet** — that lands with `04-cli-launcher`), `tsconfig.json` (composite project, `references: [{ path: "../packages/parser" }]`), `eslint.config.js` (mirrors the parser package's config), `vitest.config.ts` (Node environment).
2. **A Hono `createServer(project: ProjectContext): Hono` factory** at `server/src/server.ts` that mounts the request logger, the project-injection middleware, and the three v1 routes. **No CORS middleware** (parent §Spec Review S1 — proxy-only contract). Returns a Hono app, does not call `.fetch` or open a port — that's the launcher's concern.
3. **`ProjectContext` interface and `loadProjectContext(opts)` loader** at `server/src/context.ts`. Reads `.ledger/project.json` from the project path via `fs/promises`, validates with `@ledger/parser`'s `validateProjectMetadata`, resolves `docsRoot`, enforces path containment, returns an immutable `ProjectContext`. Throws a structured `ContextError` (subclass of `Error` carrying a `errors: ValidationError[]` field) on failure; the CLI catches it and formats stderr.
4. **`assertContained(parent, candidate)` helper** at `server/src/pathSafety.ts`. Rejects `..` segments anywhere in the relative path, rejects absolute non-descendants, throws a `PathContainmentError` with a clear message. Closes the explicit handoff in `03-project-metadata`'s "docs path validation" Open Issue (closure note lands with `05-ui-hook-migration` per the parent's cross-cutting gate distribution).
5. **`readDocsTree(docsRoot)`** at `server/src/readDocs.ts`. Walks the docs directory via `fs/promises`, returns `Record<string, string>` keyed by `docsRoot`-relative paths to file contents. Skips dotfile-prefixed directories and `node_modules`. Defensive `assertContained` on every read. Output shape matches what `buildDocGraph` from `@ledger/parser` expects.
6. **Three v1 routes** at `server/src/routes/`:
   - `GET /api/_health` (in `health.ts`) — server-internal liveness, returns `{ ok: true, startedAt }`. Always 200 if the process is alive.
   - `GET /api/project` (in `project.ts`) — returns `{ project: ProjectMetadata, server: { projectRoot, docsRoot, port, startedAt } }`. If `.ledger/project.json` is somehow invalid at request time (operator edited mid-process), returns 500 with `{ errors: ValidationError[] }`.
   - `GET /api/docs` and `GET /api/docs/:nodeId{.+}` (in `docs.ts`) — bulk and single. Bulk returns `{ nodes: DocNode[], validation: { errorPaths: string[] } }`. Single returns `{ node: DocumentNode }`, or 404 (id doesn't resolve), or 422 (validation failure with `{ errors: ValidationError[] }`). Hono multi-segment matcher `:nodeId{.+}` is non-negotiable (parent §Spec Review N1).
7. **Vitest tests** at `server/test/`:
   - `pathSafety.test.ts` — `..` segments, absolute non-descendants, edge cases like `./docs/../foo` (rejected because the resolved candidate escapes).
   - `context.test.ts` — missing project path, missing `.ledger/project.json`, invalid metadata, valid metadata + bad `docs` field (`"../escape"`), happy path. Uses the fixture project under `server/__fixtures__/sample-project/`.
   - `health.test.ts` — `app.request("/api/_health")` returns 200 with the expected shape.
   - `project.test.ts` — `app.request("/api/project")` returns the validated metadata + server envelope.
   - `docs.test.ts` — bulk endpoint returns the full node list; single endpoint returns 200 for a valid id, 404 for a nonexistent id, 422 for an id that resolves but fails validation (use a fixture doc that's deliberately bad). Multi-segment id (`01-ui/02-dag`-shaped — but use a fixture id `subdir/leaf` to keep the fixture project independent of real `01-ui/`) tests the Hono `:nodeId{.+}` matcher.
8. **A minimal fixture project** under `server/__fixtures__/sample-project/`:
   - `.ledger/project.json` — conformant metadata.
   - `docs/00-project.md` — minimal valid root (parsed via the legacy parent-doc path per `02-schema` S2 — root + parent docs bypass schema validation by design).
   - `docs/01-leaf.md` — fully conformant leaf doc that passes `validateDocNode`.
   - `docs/02-broken.md` — leaf doc deliberately missing a required section heading, used to test the bulk endpoint's error list and the single endpoint's 422 path.
   - `docs/subdir/03-nested.md` — leaf doc inside a subdir, used to test the multi-segment `:nodeId{.+}` matcher.
9. **Dev script** in `server/package.json`: `"dev": "tsx watch src/server.ts"` — **note**: this is the library entrypoint for ad-hoc testing only (e.g. an inline `if (import.meta.url === ...) { ... }` boot block at the bottom of `server.ts` that loads the current ledger project and serves). The proper `ledger` CLI binary with arg parsing lands with `04-cli-launcher`. For the duration of this child, the dev script lets the implementer hit the live endpoints without waiting for `04-cli-launcher`.

**Out of scope for v1:**

- **The `ledger` CLI binary.** `server/src/bin/ledger.ts`, `parseArgs` arg-parsing, `open()` browser launch, SIGINT handling, the `bin` field in `package.json` — all `04-cli-launcher`'s deliverable. This child can still be exercised end-to-end via the dev script (item 9).
- **Write endpoints.** Read-only contract (parent §D7). No `POST`, `PUT`, `DELETE`. Adding write endpoints is the task runner's concern (`05-task-runner`).
- **SSE / live updates / WebSockets.** Parent §"Out of scope" — no streaming primitives in v1. The polling-via-TanStack-Query `staleTime: 30_000` UX in `05-ui-hook-migration` is adequate.
- **Document cache or file watcher.** Parent §D8 — `fs.readFile` on every request. At ~15 docs the latency is invisible; cache lands when latency becomes visible (parent Open Issues).
- **`/api/tasks*`, `/api/logs*`, `/api/dispatch*`, `/api/health/scan*`** — `05-task-runner`, `06-agent-dispatcher`, `07-health-daemon` respectively. Parent §"Out of scope" enumerates each.
- **Auth / sessions / API keys.** Parent §D4 — server binds 127.0.0.1 only; OS firewall is the perimeter. No tokens.
- **CORS.** Parent §Spec Review S1 — proxy-only contract; no `cors()` middleware. The Vite dev proxy in `05-ui-hook-migration` makes the UI requests same-origin from the browser's view.
- **Multi-project / recents chooser.** Single immutable `ProjectContext` per process (parent §D10).
- **Production packaging / bundled binary.** Source + `tsc` build; no `pkg`, no `bun build --compile`, no Docker.
- **Telemetry, structured JSON logs, metrics.** Hono's `logger()` middleware prints request lines to stdout in its default format. Add structured logging when an ops story needs it.
- **Hot reload of `app/src/` from server-side.** The server doesn't serve the UI's static assets in v1 — `app/` is still served by Vite on 4179. A future "single-port production" mode where the server mounts the UI's `dist/` is a separate concern.

---

## Design

### Repository layout after this child

```
ledger/
├── server/                                                # new
│   ├── package.json                                       # @ledger/server (no bin field yet)
│   ├── tsconfig.json                                      # composite; references packages/parser
│   ├── eslint.config.js
│   ├── vitest.config.ts                                   # Node env
│   ├── src/
│   │   ├── index.ts                                       # public surface for tests + 04-cli-launcher
│   │   ├── server.ts                                      # createServer(project) factory + dev-boot block
│   │   ├── context.ts                                     # ProjectContext + loadProjectContext + ContextError
│   │   ├── pathSafety.ts                                  # assertContained + PathContainmentError
│   │   ├── readDocs.ts                                    # fs walk → Record<path, content>
│   │   └── routes/
│   │       ├── health.ts                                  # GET /api/_health
│   │       ├── project.ts                                 # GET /api/project
│   │       └── docs.ts                                    # GET /api/docs and GET /api/docs/:nodeId{.+}
│   ├── test/
│   │   ├── pathSafety.test.ts
│   │   ├── context.test.ts
│   │   ├── health.test.ts
│   │   ├── project.test.ts
│   │   └── docs.test.ts
│   └── __fixtures__/
│       ├── sample-project/                                # main fixture — exercises all happy + leaf-error paths
│       │   ├── .ledger/project.json                        # conformant
│       │   └── docs/
│       │       ├── 00-project.md                          # minimal valid root (legacy parent-doc parse)
│       │       ├── 01-leaf.md                             # conformant leaf
│       │       ├── 02-broken.md                           # deliberately fails schema validation (422 test)
│       │       ├── subdir/
│       │       │   └── 03-nested.md                       # nested leaf for :nodeId{.+} matcher
│       │       ├── _schemas/
│       │       │   └── ignored.md                         # buildDocGraph must skip — appears nowhere in /api/docs (Spec Review S5)
│       │       └── process/
│       │           └── ignored.md                         # same skip rule (Spec Review S5)
│       └── escape-project/                                # second fixture — bad docs field test (Spec Review S4)
│           └── .ledger/project.json                        # contains `"docs": "../escape"` to fail assertContained at server start
└── packages/parser/                                       # exists (02-parser-extraction)
```

The fixture project is small and independent; the tests don't depend on the state of the real `docs/` tree.

### `server/package.json`

```json
{
  "name": "@ledger/server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint . --max-warnings=0",
    "test": "vitest run",
    "build": "tsc -b"
  },
  "dependencies": {
    "@ledger/parser": "workspace:*",
    "@hono/node-server": "^1.13.0",
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "eslint": "^9.17.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.2",
    "typescript-eslint": "^8.18.2",
    "vitest": "^4.1.7"
  }
}
```

No `bin` field (deferred to `04-cli-launcher`). `tsx` is dev-only (used for the dev script + CLI tests in `04-cli-launcher`). `@hono/node-server` is the Node adapter — Hono itself is runtime-agnostic; the adapter binds it to `node:http`.

### `server/src/index.ts` — public surface

```ts
export { createServer } from "./server";
export { loadProjectContext, ContextError } from "./context";
export { assertContained, PathContainmentError } from "./pathSafety";
export type { ProjectContext } from "./context";
```

Tests + `04-cli-launcher` import from `@ledger/server` (the root). No deep imports (`@ledger/server/src/...`).

### `server/src/server.ts`

```ts
import { Hono } from "hono";
import { logger } from "hono/logger";
import type { ProjectContext } from "./context";
import { healthRoute } from "./routes/health";
import { projectRoute } from "./routes/project";
import { docsRoute } from "./routes/docs";

export type ServerEnv = { Variables: { project: ProjectContext } };

export function createServer(project: ProjectContext) {
  const app = new Hono<ServerEnv>();
  app.use("*", logger());
  app.use("*", async (c, next) => {
    c.set("project", project);
    await next();
  });
  app.route("/api/_health", healthRoute);
  app.route("/api/project", projectRoute);
  app.route("/api/docs", docsRoute);
  return app;
}

// Dev-boot block — runs only when this file is the entry, not when imported.
// Lets the implementer hit live endpoints via `pnpm -C server dev` without
// 04-cli-launcher landing yet. The proper CLI replaces this in the next child.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { serve } = await import("@hono/node-server");
  const { loadProjectContext } = await import("./context");
  const projectPath = process.argv[2] ?? process.cwd();
  const port = Number(process.env.LEDGER_PORT ?? 4180);
  const project = await loadProjectContext({ projectPath, port });
  const app = createServer(project);
  serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
  process.stdout.write(`@ledger/server: ${project.project.name} on http://127.0.0.1:${port}/\n`);
}
```

The dev-boot block is intentionally minimal — no arg parsing, no browser open, no SIGINT handling. Those are `04-cli-launcher`'s concerns. When the launcher lands, this block can stay (it remains useful for ad-hoc testing without going through the launcher) or be deleted; that call is on the launcher child's implementer.

### `server/src/context.ts`

```ts
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { validateProjectMetadata, type ProjectMetadata, type ValidationError } from "@ledger/parser";
import { assertContained } from "./pathSafety";

export interface ProjectContext {
  projectRoot: string;
  docsRoot: string;
  project: ProjectMetadata;
  port: number;
  startedAt: string;
}

export class ContextError extends Error {
  constructor(message: string, public errors: ValidationError[] = []) {
    super(message);
    this.name = "ContextError";
  }
}

export async function loadProjectContext(opts: {
  projectPath: string;
  port: number;
}): Promise<ProjectContext> {
  const projectRoot = resolve(opts.projectPath);
  const metadataPath = resolve(projectRoot, ".ledger/project.json");

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(metadataPath, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ContextError(`missing ${metadataPath}`);
    }
    throw new ContextError(`cannot parse ${metadataPath}: ${(e as Error).message}`);
  }

  const result = validateProjectMetadata(raw);
  if (!result.ok) {
    throw new ContextError(`invalid project metadata at ${metadataPath}`, result.errors);
  }

  const docsRoot = resolve(projectRoot, result.metadata.docs);
  try {
    assertContained(projectRoot, docsRoot);
  } catch (e) {
    throw new ContextError(`docs path escapes project root: docs=${result.metadata.docs}`);
  }

  return {
    projectRoot,
    docsRoot,
    project: result.metadata,
    port: opts.port,
    startedAt: new Date().toISOString(),
  };
}
```

Three failure modes, three structured `ContextError` instances. The CLI in `04-cli-launcher` catches `ContextError` and renders stderr; uncaught errors propagate as crashes (with a clear stack trace).

### `server/src/pathSafety.ts`

```ts
import { isAbsolute, relative, resolve, sep } from "node:path";

export class PathContainmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathContainmentError";
  }
}

export function assertContained(parent: string, candidate: string): void {
  const parentAbs = resolve(parent);
  const candidateAbs = resolve(candidate);
  const rel = relative(parentAbs, candidateAbs);
  if (rel === "" || rel === ".") return;
  if (rel.startsWith("..") || isAbsolute(rel) || rel.split(sep).includes("..")) {
    throw new PathContainmentError(
      `path escapes parent: candidate=${candidateAbs} parent=${parentAbs}`
    );
  }
}
```

Three rejection cases: relative path starts with `..` (escape), relative path becomes absolute (resolved to a different root, e.g. on Windows across drives), `..` appears anywhere in the relative segments (defensive — `node:path.relative` should never produce this for descendants but Windows + symlinks can surprise). The `rel === "" || rel === "."` short-circuit allows `assertContained(root, root)` to pass — useful for the `readDocs` walk's defensive check on the root itself.

### `server/src/readDocs.ts`

```ts
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { assertContained } from "./pathSafety";

export async function readDocsTree(docsRoot: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith(".") || e.name === "node_modules") continue;
        await walk(abs);
      } else if (e.isFile() && e.name.endsWith(".md")) {
        assertContained(docsRoot, abs);
        out[relative(docsRoot, abs)] = await readFile(abs, "utf8");
      }
    }
  }
  await walk(docsRoot);
  return out;
}
```

Dotfile-prefixed directories skipped (`.git`, `.ledger`, `.vscode`); `node_modules` skipped. Only `.md` files emitted. Keys are `docsRoot`-relative paths (matching what `import.meta.glob` in `app/` produces, so `buildDocGraph` consumes both shapes without translation).

`buildDocGraph` from `@ledger/parser` skips the `process/` and `_schemas/` subtrees internally (logic moved from old `parseDocs.ts`); `readDocsTree` does not need to know about those.

### Routes

```ts
// server/src/routes/health.ts
import { Hono } from "hono";
import type { ServerEnv } from "../server";

export const healthRoute = new Hono<ServerEnv>().get("/", (c) => {
  const project = c.get("project");
  return c.json({ ok: true, startedAt: project.startedAt });
});
```

```ts
// server/src/routes/project.ts
import { Hono } from "hono";
import { validateProjectMetadata } from "@ledger/parser";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ServerEnv } from "../server";

export const projectRoute = new Hono<ServerEnv>().get("/", async (c) => {
  const project = c.get("project");
  // Re-validate on each request: operator may have edited .ledger/project.json since boot.
  const metadataPath = resolve(project.projectRoot, ".ledger/project.json");
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(metadataPath, "utf8"));
  } catch (e) {
    return c.json({ errors: [{ path: "/", message: (e as Error).message, keyword: "io" }] }, 500);
  }
  const result = validateProjectMetadata(raw);
  if (!result.ok) {
    return c.json({ errors: result.errors }, 500);
  }
  return c.json({
    project: result.metadata,
    server: {
      projectRoot: project.projectRoot,
      docsRoot: project.docsRoot,
      port: project.port,
      startedAt: project.startedAt,
    },
  });
});
```

The re-validate-per-request pattern catches operator edits without requiring a server restart. Cost is one `fs.readFile` + one ajv validate per `/api/project` hit; the UI calls this rarely (topbar render, on app load) so the overhead is invisible.

```ts
// server/src/routes/docs.ts
import { Hono } from "hono";
import { buildDocGraph, validateDocNode, parseDocNode, idForPath } from "@ledger/parser";
import { readDocsTree } from "../readDocs";
import type { ServerEnv } from "../server";

export const docsRoute = new Hono<ServerEnv>()
  .get("/", async (c) => {
    const project = c.get("project");
    const rawDocs = await readDocsTree(project.docsRoot);
    const { nodes, validationErrorPaths } = buildDocGraph(rawDocs);
    return c.json({ nodes, validation: { errorPaths: validationErrorPaths } });
  })
  .get("/:nodeId{.+}", async (c) => {
    const project = c.get("project");
    const nodeId = c.req.param("nodeId");
    const rawDocs = await readDocsTree(project.docsRoot);
    const entry = findRawDocForNodeId(rawDocs, nodeId);
    if (!entry) return c.json({ error: "node not found" }, 404);
    const candidate = parseDocNode(entry.path, entry.content);
    if (!candidate) return c.json({ error: "not_a_leaf" }, 404);
    const result = validateDocNode(candidate);
    if (!result.ok) return c.json({ errors: result.errors }, 422);
    return c.json({ node: result.node });
  });

function findRawDocForNodeId(
  rawDocs: Record<string, string>,
  nodeId: string,
): { path: string; content: string } | null {
  for (const [path, content] of Object.entries(rawDocs)) {
    if (idForPath(path) === nodeId) return { path, content };
  }
  return null;
}
```

The `findRawDocForNodeId` helper iterates `rawDocs` and applies `idForPath` (imported from `@ledger/parser` — single source of truth, no local reimplementation) to each key, returning the first match. `idForPath` is the forward map (path → nodeId); the lookup is just a linear scan since `rawDocs` is small (~15 entries today; well under the threshold where indexing would matter). Spec Review S1.

**Status code semantics (Spec Review S3 — operator-decision: 404 for non-leaf):**

- `200` — id resolves to a leaf and validates: returns `{ node: DocumentNode }`.
- `404 { error: "node not found" }` — id doesn't resolve to any `.md` file in the tree.
- `404 { error: "not_a_leaf" }` — id resolves to a root or parent doc, which `parseDocNode` returns `null` for by design (`02-schema` S2 — leaf-only schema validation). Distinct error code from the not-found case; same 404 status because both are "no leaf-node resource at this URL." The UI's doc-viewer panel (eventual `useDocSource` migration) can branch on the `error` field to render differently.
- `422 { errors: ValidationError[] }` — id resolves to a leaf but the leaf fails schema validation. Inherited from parent §Spec Review N2.

`idForPath` is imported from `@ledger/parser`'s public surface (cross-cutting fix landed in `02-parser-extraction`'s SF2 audit row).

### Vitest config

```ts
// server/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

No jsdom. The endpoint tests use Hono's `app.request(url)` API (returns a fetch `Response`), which works in Node without an HTTP listener.

### Endpoint test shape

```ts
// server/test/docs.test.ts (excerpt)
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, loadProjectContext } from "../src";

const fixturePath = resolve(fileURLToPath(import.meta.url), "..", "..", "__fixtures__/sample-project");

describe("GET /api/docs", () => {
  it("returns the bulk node list with validation errors", async () => {
    const project = await loadProjectContext({ projectPath: fixturePath, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/docs");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodes.length).toBeGreaterThan(0);
    expect(body.validation.errorPaths).toContain("02-broken.md"); // the deliberately bad fixture

    // Spec Review S5: _schemas/ and process/ subtrees are skipped by buildDocGraph
    const nodeIds: string[] = body.nodes.map((n: { id: string }) => n.id);
    expect(nodeIds).not.toContain("_schemas/ignored");
    expect(nodeIds).not.toContain("process/ignored");
    // The skipped files also do NOT appear as validation errors (skip happens before validation).
    expect(body.validation.errorPaths).not.toContain("_schemas/ignored.md");
    expect(body.validation.errorPaths).not.toContain("process/ignored.md");
  });
});

describe("GET /api/docs/:nodeId{.+}", () => {
  it("returns 200 for a valid leaf", async () => {
    const project = await loadProjectContext({ projectPath: fixturePath, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/docs/01-leaf");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.node.nodeId).toBe("01-leaf");
  });

  it("returns 404 for a nonexistent id", async () => {
    const project = await loadProjectContext({ projectPath: fixturePath, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/docs/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns 422 for an id that exists but fails validation", async () => {
    const project = await loadProjectContext({ projectPath: fixturePath, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/docs/02-broken");
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("returns 404 with error: not_a_leaf for a root/parent doc (Spec Review S3)", async () => {
    const project = await loadProjectContext({ projectPath: fixturePath, port: 0 });
    const app = createServer(project);
    // 00-project is the fixture's root doc — intentionally not schema-validated per 02-schema S2
    const res = await app.request("/api/docs/00-project");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_a_leaf");
  });

  it("handles multi-segment nodeIds via the :nodeId{.+} matcher", async () => {
    const project = await loadProjectContext({ projectPath: fixturePath, port: 0 });
    const app = createServer(project);
    const res = await app.request("/api/docs/subdir/03-nested");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.node.nodeId).toBe("subdir/03-nested");
  });
});

describe("loadProjectContext path containment (Spec Review S4)", () => {
  it("rejects a docs field containing path-traversal segments", async () => {
    const escapePath = resolve(fileURLToPath(import.meta.url), "..", "..", "__fixtures__/escape-project");
    await expect(
      loadProjectContext({ projectPath: escapePath, port: 0 }),
    ).rejects.toThrowError(/path escapes/i);
  });
});
```

### Fixture project

```jsonc
// server/__fixtures__/sample-project/.ledger/project.json
{
  "schemaVersion": 1,
  "name": "Sample Project",
  "docs": "docs",
  "agent": "claude-code"
}
```

```markdown
<!-- server/__fixtures__/sample-project/docs/00-project.md -->
# Sample Project Root

**Status:** APPROVED

Minimal root doc — parsed via the legacy parent-doc path (not schema-validated per 02-schema S2).

## Children

| ID | Title | Depends on | Status |
|----|-------|------------|--------|
| `01-leaf` | A conformant leaf | — | DRAFT |
| `02-broken` | A deliberately-broken leaf | — | DRAFT |
| `subdir/03-nested` | A nested leaf | — | DRAFT |
```

```markdown
<!-- server/__fixtures__/sample-project/docs/01-leaf.md -->
# A Conformant Leaf

**Node ID:** `01-leaf`
**Parent:** project root (`docs/00-project.md`)
**Status:** DRAFT
**Created:** 2026-05-26
**Last Updated:** 2026-05-26

**Dependencies:** —

---

## Requirements

Fixture content.

## Design

Fixture content.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Be a fixture | Tests need a conformant leaf to assert against. |

## Open Issues

None.

## Implementation Notes

*(none yet — pre-implementation)*

## Verification

Fixture leaf passes `validateDocNode`.

## Children

None.
```

`02-broken.md` is identical to `01-leaf.md` minus one required heading (e.g., omit `## Decisions`); validators reject it. `subdir/03-nested.md` is identical to `01-leaf.md` with `**Node ID:** \`subdir/03-nested\``.

The `_schemas/ignored.md` and `process/ignored.md` files (Spec Review S5) exist to verify `buildDocGraph`'s skip logic runs against output from `readDocsTree` (which does not pre-skip these subtrees — that's the parser's concern). Their content is a single `# Ignored` heading; the bulk endpoint test asserts they do **not** appear in `body.nodes` and do **not** appear in `body.validation.errorPaths` (the skip happens before validation, not as a validation failure).

```jsonc
// server/__fixtures__/escape-project/.ledger/project.json (Spec Review S4)
{
  "schemaVersion": 1,
  "name": "Escape Attempt",
  "docs": "../escape",
  "agent": "claude-code"
}
```

The `escape-project` fixture exists solely to test `loadProjectContext`'s path-containment rejection. `context.test.ts` points `loadProjectContext` at this fixture's path and asserts it throws a `ContextError` whose message includes "path escapes" or "docs path escapes" (whichever phrasing the implementer picks for the wrapping `ContextError`). No second `docs/` directory is needed — the assertion fires before any docs read happens.

### Acceptance check (manual)

A reviewer running the worktree must observe:

1. `server/` exists with the layout shown. `pnpm install` at the repo root succeeds; `server/node_modules/@ledger/parser` symlinks to the workspace package.
2. `pnpm -C server typecheck`, `pnpm -C server lint --max-warnings=0`, `pnpm -C server test`, `pnpm -C server build` exit zero. Test count: 5 test files, ≥15 individual tests across them.
3. `pnpm -C server dev /Users/dennis/code/ledger` (the dev-boot block) starts the server on port 4180. `curl http://127.0.0.1:4180/api/_health` returns 200 with `{ok: true, startedAt: ...}`.
4. `curl http://127.0.0.1:4180/api/project` returns the validated real project metadata.
5. `curl http://127.0.0.1:4180/api/docs | head -c 500` returns JSON with `nodes:` and `validation:` keys.
6. `curl http://127.0.0.1:4180/api/docs/02-schema` returns 200 with `{node: ...}`.
7. `curl http://127.0.0.1:4180/api/docs/01-ui/02-dag` returns 200 (multi-segment id works against the real tree).
8. `curl -i http://127.0.0.1:4180/api/docs/nonexistent` returns 404.
9. `Ctrl-C` the server. (Graceful shutdown is `04-cli-launcher`'s responsibility; the dev-boot block can exit ungracefully.)
10. **`app/` is untouched.** `git diff main..HEAD -- app/` is empty.
11. **`packages/parser/` is untouched except for the possible `idForPath` re-export** mentioned in Design. If touched, recorded in Implementation Notes.
12. **`docs/_schemas/`, `.ledger/`, and existing `docs/`** are untouched. `git diff main..HEAD -- docs/_schemas/ .ledger/ docs/00-project.md docs/02-schema.md docs/03-project-metadata.md docs/04-api-server.md docs/01-ui/` shows only the manifest-row status bump for this child.
13. Server bundle size reported in Implementation Notes (`du -sh server/dist`).

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Hono framework | Inherited from parent §D1. TS-first, native fetch-Request/Response so handlers are testable via `app.request()` without an HTTP listener, small (~30 KB), credible Phase-3 portability story. Versions pinned to `^4.6.0` for stability over the v4 minor range. |
| D2 | `createServer(project)` factory + `loadProjectContext(opts)` separately, not a single boot function | Splits the testable concerns. `createServer` is pure given a `ProjectContext` — tests inject contexts directly. `loadProjectContext` does the I/O and validation — tests exercise its failure modes separately. The CLI in `04-cli-launcher` orchestrates both. A monolithic `boot()` would conflate them. |
| D3 | `ProjectContext` constructor-injected, not a module-level singleton | Inherited from parent §D10. One server instance per project (PRD §7.1), but the constructor pattern lets tests run multiple contexts in the same process — necessary for fixture-isolated endpoint tests. |
| D4 | Re-validate `.ledger/project.json` on every `GET /api/project`, not cached | Operator may edit the metadata mid-process; the UI should reflect the change without a server restart. Cost is one `fs.readFile` + one ajv validate per call (~1 ms total); `/api/project` is called at app load and topbar render, so the overhead is invisible. Cached version would invert this trade-off in favor of negligible latency improvements. |
| D5 | `readDocsTree` reads on every `GET /api/docs` request; no cache | Inherited from parent §D8. ~15 docs × ~10 ms total is invisible. When latency becomes visible, an mtime-keyed in-memory cache is the answer (not a watcher). |
| D6 | Hono multi-segment matcher `:nodeId{.+}` for nested ids | Inherited from parent §Spec Review N1. A bare `:nodeId` matches a single URL segment; nested ids (`01-ui/02-dag`) need `{.+}`. Hono decodes the full path before passing to `c.req.param`. |
| D7 | `/api/docs/:nodeId{.+}` returns 422 on schema-validation failure, 404 on missing OR non-leaf (with distinct error codes) | Inherited from parent §Spec Review N2 for the 422 semantic. **Updated by this child's Spec Review S3:** non-leaf docs (root, parent) are intentionally not schema-validated per `02-schema` S2 — returning 422 for them would conflate "schema-invalid" with "different doc kind." 404 with `{ error: "not_a_leaf" }` distinguishes from the not-found case (`{ error: "node not found" }`) while keeping the status code semantically honest: both are "no leaf-node resource at this URL." UI's eventual `useDocSource` migration branches on the `error` field. |
| D8 | `ContextError` and `PathContainmentError` are typed `Error` subclasses, not plain strings or generic Errors | The CLI (`04-cli-launcher`) needs to catch them specifically and render stderr differently. `instanceof ContextError` lets the catch block branch cleanly. Plain strings or generic `Error` would force string-matching, which is brittle. The subclass `name` field makes them recognisable in stack traces too. |
| D9 | Dev-boot block at the bottom of `server.ts` (gated by `import.meta.url === ...`) instead of a separate dev entrypoint | Lets the implementer hit live endpoints without waiting for `04-cli-launcher` to land. The gate prevents the boot from firing when the file is imported by tests or the eventual CLI. When the CLI lands, this block stays as a reference / ad-hoc dev mode or is deleted by the next implementer; either is fine. |
| D10 | Fixture project lives under `server/__fixtures__/sample-project/`, not in a shared `__fixtures__/` workspace dir | Tests are co-located with the package that runs them. A shared fixtures dir invites cross-package coupling (server tests reaching into parser fixtures, etc.). The fixture is small (~5 files); duplicating it across packages if a future case needs it is cheaper than the abstraction cost. |
| D11 | Server tests use `app.request(url)` (Hono's in-process test client), not a real HTTP listener | No port allocation, no async waiting on server start, no cleanup. The handler is exercised exactly as it would be over HTTP — Hono's test client builds the same `Request` object the Node adapter would build. Faster, more reliable, no flake from port collisions in parallel test runs. |
| D12 | Consume `idForPath` from `@ledger/parser`'s public surface | The route handler for `/api/docs/:nodeId{.+}` needs to inverse-map a `nodeId` back to a `rawDocs` key. That logic already lives in `idForPath` (forward direction: path → nodeId); reusing it keeps the path-to-id mapping single-sourced. **Cross-cutting Spec Review resolution (this child's S2 / `02-parser-extraction`'s amendment):** `02-parser-extraction` was amended to export `idForPath` from `packages/parser/src/index.ts` (rather than this child opening a sibling-spec patch commit). This child just imports it. No conditional / no fallback path. |

---

## Open Issues

- **`/api/project` re-validation cost.** D4 reads + validates on every request. At single-operator scale this is invisible. If the topbar polls aggressively (it doesn't today, but a future panel might) the cost compounds. Cache + mtime invalidation is the natural fix; defer until measured. *(Priority: LOW.)*
- **`/api/docs` re-reads the tree on every request.** D5 / parent §D8. Same posture: visible only at scale; an mtime-keyed in-memory cache is the answer; defer until measured. *(Priority: LOW.)*
- **No graceful shutdown handling.** The dev-boot block crashes the process on `Ctrl-C` without draining in-flight requests. `04-cli-launcher` adds SIGINT handling around the `serve()` call. For this child's dev block, the ungraceful exit is fine. *(Priority: TRIVIAL — handled by next child.)*
- **No request size limits.** Hono's default body parser has no size cap. Read-only endpoints don't take bodies, so the exposure is nil today; when write endpoints arrive (with `05-task-runner`), a `bodyLimit` middleware should land alongside them. *(Priority: TRIVIAL — surface when writes land.)*
- **No structured logging.** Hono's `logger()` writes free-form text to stdout. For ops dashboards / log aggregation, structured JSON would be required. Defer until an ops story exists. *(Priority: LOW.)*
- **`error` field shape on 404 isn't typed.** `{ error: "node not found" }` is ad-hoc. A typed `APIError` envelope (`{ error: { code, message, details? } }`) would tighten the contract. Inherited from parent. *(Priority: LOW.)*
- **`assertContained` allows symlink escapes.** `node:path.relative` does not follow symlinks; a `docsRoot/symlink` that points outside the project would pass `assertContained` and then `fs.readFile` would happily read the linked target. The mitigation is `fs.realpath` on both sides before the relative check. Worth doing if the threat model ever includes hostile project metadata; today's threat model is "single-user local-only" so the operator's symlinks are trusted. *(Priority: MEDIUM — matches the originating priority on `03-project-metadata`'s "docs path validation" handoff; Spec Review N1 surfaced the under-tagging.)*
- **Dev-boot block lives in `server.ts`.** D9 makes it convenient but co-locates the entrypoint with the library factory. A purist would split them. If/when the boot block grows beyond ~20 lines, splitting is right. *(Priority: TRIVIAL.)*

---

## Spec Review (2026-05-26)

Independent spec review run in a clean Sonnet context against the DRAFT. Verdict: NEEDS_MINOR_REVISIONS, no blockers. Five should-fixes (one stub-implementation gap, one cross-spec coupling, one semantic fix, two test-coverage gaps) and three nits (one priority-tag, two minor). All findings applied. Audit:

| # | Finding | Resolution |
|---|---------|------------|
| S1 | `findRawDocForNodeId` stub body left as pseudocode comment; "mirrors `idForPath` inverted" prose was logically confused. An implementer reading the stub cold would either guess wrong or re-implement `idForPath` inline. | Replaced the stub with explicit pseudocode: linear scan over `Object.entries(rawDocs)`, apply `idForPath` to each key, return first match. Removed the "inverted" framing — `idForPath` IS the forward direction; the helper scans + matches. |
| S2 | `idForPath` not in `02-parser-extraction`'s public surface; D12's "tiny patch commit" hedging would force this child's implementer to open a sibling-spec patch ahead of their own work. Reviewer flagged as operator-decision. | **Operator chose amend `02-parser-extraction`.** That spec's audit row (cross-cutting) added `idForPath` to `packages/parser/src/index.ts`'s public surface. D12 rewritten: this child consumes `idForPath` from the parser; no conditional, no fallback path. `routes/docs.ts` imports it directly. |
| S3 | 422-on-non-leaf conflates with 422-on-validation-failure. Root/parent docs are intentionally not schema-validated (`02-schema` S2); returning 422 calls them "schema-invalid" when they're actually "different doc kind." Reviewer flagged as operator-decision: 404 with distinct code vs 422 with distinct body. | **Operator chose 404 + `{ error: "not_a_leaf" }`.** Status semantics: 200 (leaf, valid), 422 (leaf, schema-invalid), 404 (not found OR not-a-leaf, distinguished by `error` field). Updated `routes/docs.ts` snippet, D7 prose, and endpoint summary. Added test case at `docs.test.ts` asserting 404 + `error: "not_a_leaf"` for the fixture's `00-project` root. |
| S4 | "Bad `docs` field" context test mentioned but no fixture or test setup specified. Implementer would have to invent the approach. Reviewer flagged as operator-decision: second fixture vs tmpdir vs in-place mutation. | **Operator chose second fixture.** Added `server/__fixtures__/escape-project/.ledger/project.json` with `"docs": "../escape"`. No `docs/` directory needed — `assertContained` rejection fires before any docs read. Added test description in `context.test.ts` excerpt asserting the `ContextError` throws with a `path escapes` message. |
| S5 | `_schemas/` and `process/` skip logic (inside `buildDocGraph`) not exercised by the server's fixture suite. Verifying it runs correctly when called from the server's context (via `readDocsTree`'s output) is a real gap. | Added `_schemas/ignored.md` and `process/ignored.md` to the sample-project fixture. Added bulk-endpoint test assertions: `body.nodes` does NOT contain `_schemas/ignored` or `process/ignored`; `body.validation.errorPaths` does NOT contain them (skip happens before validation, not as a validation failure). |
| N1 | `assertContained` symlink-escape Open Issue tagged LOW; the originating `03-project-metadata` handoff was MEDIUM. Under-tagging. | Bumped priority from LOW to MEDIUM; added a note that the priority matches the originating handoff. |
| N2 | `validationErrorPaths` key format not explicitly stated (inferred from `readDocsTree`'s key format). | No edit — the type signature and the contract `buildDocGraph(rawDocs: Record<string, string>) → { validationErrorPaths: string[] }` makes it clear. The new fixture-skip assertions exercise this implicitly. |
| N3 | `health.ts` route reads `c.get("project")` for `startedAt`; if context middleware throws, health fails. Trivial in v1 since ProjectContext is immutable + pre-validated. | No edit — by design; the dependency is intentional. Health endpoint IS dependent on the server having a valid context; without one the server doesn't boot. |

Nothing punted. S2, S3, S4 were operator-decision; all recorded with rationale. The cross-cutting S2 amendment to `02-parser-extraction` is the visible coupling between this child's spec and its predecessor; landing the change in the predecessor keeps each child's implementation pass focused on its own scope.

---

## Implementation Notes

*(none yet — pre-implementation)*

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. `server/` exists with the layout in Design. `package.json` declares `@ledger/server`, `private: true`, `type: "module"`, deps include `@ledger/parser: "workspace:*"`, `hono: "^4.6.0"`, `@hono/node-server: "^1.13.0"`; **no `bin` field** (deferred to `04-cli-launcher`).
2. `pnpm install` at the repo root succeeds; `server/node_modules/@ledger/parser` symlinks to the workspace package.
3. **All workspace gates green:**
   - `pnpm -C server typecheck` → 0
   - `pnpm -C server lint --max-warnings=0` → 0
   - `pnpm -C server test` → 0, ≥15 tests across 5 files
   - `pnpm -C server build` → 0 (emits `dist/`)
   - All `packages/parser/` and `app/` gates still green (unchanged from `02-parser-extraction`)
   - `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` from repo root → all 0
4. **Endpoint smoke tests pass against the real ledger project:**
   - `pnpm -C server dev /Users/dennis/code/ledger` boots; `curl http://127.0.0.1:4180/api/_health` returns 200.
   - `curl http://127.0.0.1:4180/api/project` returns the validated `{ project, server }` envelope.
   - `curl http://127.0.0.1:4180/api/docs | jq '.nodes | length'` reports the current authored-doc count + manifest-only PLANNED rows (matches `loadDocNodes().length` at this commit).
   - `curl http://127.0.0.1:4180/api/docs/02-schema` returns 200 with `{ node }`.
   - `curl http://127.0.0.1:4180/api/docs/01-ui/02-dag` returns 200 (multi-segment matcher works).
   - `curl -i http://127.0.0.1:4180/api/docs/nonexistent` returns 404.
5. **Fixture-project endpoint tests pass:** `pnpm -C server test test/docs.test.ts` reports 200/404/422 paths and the multi-segment matcher all green against the fixture.
6. **Path-safety tests pass:** `pnpm -C server test test/pathSafety.test.ts` rejects `..` segments, absolute non-descendants, and edge cases like `./docs/../foo`.
7. **Context tests pass:** `pnpm -C server test test/context.test.ts` covers missing project path, missing metadata, invalid metadata, bad `docs` field (escape), happy path.
8. **`app/` is untouched.** `git diff main..HEAD -- app/` is empty.
9. **`packages/parser/` is untouched, except possibly an `idForPath` re-export added to its public surface** (D12). If touched, the diff is one line in `packages/parser/src/index.ts` and is recorded in Implementation Notes.
10. **`docs/_schemas/`, `.ledger/`, and existing `docs/` content** are untouched. `git diff main..HEAD` for those paths shows only the `04-api-server.md` §Children manifest-row status bump for this child.
11. **Server bundle size reported in Implementation Notes.** `du -sh server/dist` produces a number; recorded as an absolute baseline for later server-side additions (`05-task-runner` will grow it).
12. **Smoke test for runtime schema resolution still passes** (from `02-parser-extraction`'s acceptance item 13): `node -e "import('./packages/parser/dist/schema/validateDocNode.js').then(m => console.log(typeof m.validateDocNode))"` prints `"function"`.
13. `04-api-server.md` §Children manifest row for `03-server-package` reads the current status; final promotion to COMPLETE bumps both the spec's Status header and the parent's row in the same commit.

---

## Children

None.
