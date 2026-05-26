# CLI Launcher — `ledger` binary

**Node ID:** `04-api-server/04-cli-launcher`
**Parent:** `04-api-server` (`docs/04-api-server/00-api-server.md`)
**Status:** COMPLETE (v1, 2026-05-26)
**Created:** 2026-05-26
**Last Updated:** 2026-05-26 (IN_PROGRESS → VERIFY)

**Dependencies:** `04-api-server/03-server-package`

---

## Requirements

Ship the **`ledger` CLI binary** — a thin wrapper around `@ledger/server`'s `createServer` + `loadProjectContext` exports that adds argument parsing, browser launch, graceful shutdown, and structured stderr error reporting. PRD §7.1 explicitly anchors this binary: `ledger /path/to/project [--port 4180] [--no-open]`. Without it, the API server is invoked via the dev-boot block (parent §D9) which works for ad-hoc development but lacks the polish of a real CLI (no `--help`, no `--port` flag, no `--no-open`, no proper stderr on misuse, no SIGINT handling).

This child is the smallest of the five. It depends entirely on `03-server-package`'s exports and adds ~80 LOC of CLI orchestration. The justification for splitting it out: the first implementer dispatch wall-clocked partly because it tried to land both the server library AND the CLI binary AND the workspace conversion in one pass. Each stays separable; the CLI lives at the top of its dependency chain and any future CLI evolution (interactive prompts, recents-chooser integration, daemon mode) lands here without disturbing the server library.

In scope for v1:

1. **`server/src/bin/ledger.ts`** — the CLI entrypoint. Argument shape: `ledger <project-path> [--port N] [--no-open] [-h|--help]`. `parseArgs` from `node:util` with `strict: true`; try/catch around the parse so unknown flags exit 2 with usage instead of throwing (parent §Spec Review S2). `Number.isInteger(port) && 0 <= port <= 65535` guard with explicit stderr on invalid `--port` or `LEDGER_PORT` env. Single `USAGE` constant so the help text is single-sourced.
2. **`bin` field in `server/package.json`** — `"bin": { "ledger": "./dist/bin/ledger.js" }`. After `pnpm install && pnpm -C server build`, pnpm symlinks the compiled `dist/bin/ledger.js` into `node_modules/.bin/ledger`, callable via `pnpm exec ledger <path>` from any workspace directory.
3. **Browser launch wrapped in try/catch** — `await open(url)` from the `open` package. On failure (headless box, no `DISPLAY` on Linux, `xdg-open` exits non-zero) the URL is already printed to stdout; a stderr line notes the browser-open failure and the server continues running (parent §Spec Review S7).
4. **Graceful SIGINT shutdown** — `process.on("SIGINT", ...)` calls the `serve()` adapter's `close()` (or equivalent), drains in-flight requests, then exits 0. No PID file, no daemonization, no `--detach`.
5. **Structured stderr on `ContextError`** — catches `ContextError` from `loadProjectContext`, formats the structured `errors: ValidationError[]` into readable lines (`<path>: <message>` per error), exits 1. Other exceptions propagate as crashes with their stack trace (the right behavior for unexpected errors).
6. **Tests via spawned subprocess** at `server/test/bin.test.ts`. Each test spawns `node dist/bin/ledger.js <args>` with `node:child_process.spawn`, captures stdout/stderr/exitCode, asserts the expected combination. Tests cover: `--help` (exit 0, usage on stderr), bare invocation (exit 2, usage), nonexistent path (exit 1, ContextError formatted), bad metadata (exit 1, ValidationError list formatted), invalid `--port` (exit 2, port-error message), `--no-open` + healthy boot (port-bound, no browser attempt — checked via opening `/api/_health` then SIGINT-ing).
7. **New dependencies in `server/package.json`** — `open@^10.0.0` as a runtime dep. `tsx` already listed as devDep by `03-server-package`. No other additions.

**Out of scope for v1:**

- **Daemonization, PID file, `--detach`, log file.** Parent §"Out of scope". Operator's terminal scrollback is the log; `Ctrl-C` is the stop signal.
- **Recents chooser** when invoked without a path. PRD §7.1 commits to "explicit path argument or error" for v1; the chooser UI is deferred per PRD §13. Bare `ledger` exits 2 with usage.
- **Interactive prompts** (e.g., "no `.ledger/project.json` found — create one?"). Hand-author the file per `03-project-metadata`'s scaffolding posture. Interactive setup is deferred to a future `ledger init` subcommand.
- **`ledger migrate /path/to/existing-project`** — PRD §13 defers this.
- **`ledger init /path/to/new-project`** — same deferral.
- **Production-style binary distribution** — `pkg`, `bun build --compile`, Docker image. Parent §"Out of scope". v1 ships TS source compiled to `dist/`; `pnpm exec ledger` is the invocation.
- **`npm install -g @ledger/server`** packaging for global install. Parent Open Issues §"CLI launcher is non-isolated". The package is workspace-local and not published.
- **`--host` flag for binding non-localhost.** Parent §D4 — `127.0.0.1` only in v1; remote-access stories need auth first.
- **`--ui-port` flag.** Parent §Spec Review S1 — CORS dropped, proxy-only contract; the UI's port is the Vite dev server's, configured in `app/vite.config.ts`, irrelevant to the API server.
- **`--config` flag** to point at a non-default project-metadata file. The convention is `<project>/.ledger/project.json`; if a future use case needs an override, it's a small addition.
- **Hot-reload of the running server when `.ledger/project.json` changes.** The server re-validates per request (`03-server-package` D4), so config edits surface without restart for `/api/project`'s shape. Other context fields (`projectRoot`, `docsRoot`, `port`) are immutable for the process lifetime; changing them means restart.
- **`--quiet` / `--verbose` flags.** Hono's logger middleware is on; stdout is moderately chatty. Add log-level controls when an ops story requires them.
- **A Hono mounting of the UI's static `dist/`** so a single process serves both UI and API. Different concern; deferred. v1 keeps the two-process model.

---

## Design

### File-level diff

```
server/src/bin/
  ledger.ts                                  [new — the CLI binary]
server/test/
  bin.test.ts                                [new — subprocess tests]
server/package.json                          [modified — adds bin field + open dep]
docs/04-api-server/04-cli-launcher.md        [this spec — status transitions]
docs/04-api-server/00-api-server.md                        [modified — §Children manifest row status]
```

No source code outside `server/` is touched. The `app/` and `packages/parser/` packages are untouched.

### `server/src/bin/ledger.ts`

```ts
#!/usr/bin/env node
import { parseArgs } from "node:util";
import { serve } from "@hono/node-server";
import open from "open";
import {
  createServer,
  loadProjectContext,
  ContextError,
  type ProjectContext,
} from "../index";

const USAGE = "usage: ledger <project-path> [--port N] [--no-open] [-h|--help]\n";

interface ParsedArgs {
  projectPath: string;
  port: number;
  open: boolean;
  help: boolean;
}

function parseCliArgs(argv: string[]): ParsedArgs {
  let positionals!: string[];
  let values!: { port: string; "no-open": boolean; help: boolean };
  try {
    ({ positionals, values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: true,
      options: {
        port: { type: "string", default: process.env.LEDGER_PORT ?? "4180" },
        "no-open": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (e) {
    process.stderr.write(`ledger: ${(e as Error).message}\n${USAGE}`);
    process.exit(2);
  }

  if (values.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  if (positionals.length !== 1) {
    process.stderr.write(USAGE);
    process.exit(2);
  }

  // After the length guard, positionals[0] is provably defined.
  // With noUncheckedIndexedAccess, TypeScript still sees `string | undefined`;
  // the non-null assertion is safe and matches the project's house idiom
  // (see leaf-workflow's "trust local invariants" pattern).
  const projectPath = positionals[0]!;

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    process.stderr.write(
      `ledger: invalid --port "${values.port}" (expected integer 0..65535)\n`
    );
    process.exit(2);
  }

  return {
    projectPath,
    port,
    open: !values["no-open"],
    help: false,
  };
}

function formatContextError(e: ContextError): string {
  const lines = [`ledger: ${e.message}`];
  for (const err of e.errors) {
    lines.push(`  ${err.path}: ${err.message}`);
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  let project: ProjectContext;
  try {
    project = await loadProjectContext({
      projectPath: args.projectPath,
      port: args.port,
    });
  } catch (e) {
    if (e instanceof ContextError) {
      process.stderr.write(formatContextError(e));
      process.exit(1);
    }
    throw e;
  }

  const app = createServer(project);
  const server = serve({ fetch: app.fetch, port: args.port, hostname: "127.0.0.1" });
  const url = `http://localhost:${args.port}/`;
  process.stdout.write(`ledger: ${project.project.name} on ${url}\n`);

  if (args.open) {
    try {
      await open(url);
    } catch (e) {
      process.stderr.write(
        `ledger: could not open browser (${(e as Error).message}); ${url} is ready\n`
      );
    }
  }

  // Graceful shutdown.
  const shutdown = () => {
    process.stdout.write("ledger: shutting down\n");
    server.close(() => process.exit(0));
    // Force-exit if drain takes longer than 5s.
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  process.stderr.write(`ledger: unexpected error: ${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
```

The shebang (`#!/usr/bin/env node`) is required for `pnpm exec ledger`-style invocation. The `tsc` build preserves it (TypeScript leaves the shebang on emitted JS when the source has one).

Three exit codes:
- **0** — clean shutdown via SIGINT or `--help`.
- **1** — runtime failure (`ContextError`, browser-open failure does NOT exit 1, an unexpected throw does).
- **2** — usage error (bad args, bad port, missing path).

### `server/package.json` additions

```diff
   "exports": { ... },
+  "bin": { "ledger": "./dist/bin/ledger.js" },
   "scripts": { ... },
   "dependencies": {
     "@ledger/parser": "workspace:*",
     "@hono/node-server": "^1.13.0",
-    "hono": "^4.6.0"
+    "hono": "^4.6.0",
+    "open": "^10.0.0"
   },
```

After `pnpm install`, the binary is callable via:
- `pnpm exec ledger <path>` from any workspace dir
- `node server/dist/bin/ledger.js <path>` (direct)
- `pnpm -C server start <path>` if a `start` script is added (optional polish)

The `pnpm exec` path is the canonical invocation in v1.

### Subprocess test shape

```ts
// server/test/bin.test.ts (excerpt)
import { describe, expect, it, beforeAll } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
const binPath = resolve(serverRoot, "dist/bin/ledger.js");
const fixturePath = resolve(serverRoot, "__fixtures__/sample-project");

beforeAll(() => {
  // Ensure the binary is built before tests run.
  const build = spawnSync("pnpm", ["-C", serverRoot, "build"], { stdio: "inherit" });
  if (build.status !== 0) throw new Error("server build failed");
});

function runSync(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [binPath, ...args], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

describe("ledger CLI", () => {
  it("prints usage on --help and exits 0", () => {
    const r = runSync(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/usage: ledger/);
  });

  it("exits 2 with usage on bare invocation", () => {
    const r = runSync([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/usage: ledger/);
  });

  it("exits 1 with formatted ContextError on nonexistent path", () => {
    const r = runSync(["/definitely/does/not/exist"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/missing.*project\.json/);
  });

  it("exits 2 with port-error on invalid --port", () => {
    const r = runSync([fixturePath, "--port", "notanumber"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/invalid --port/);
  });

  it("exits 2 with port-error on out-of-range --port", () => {
    const r = runSync([fixturePath, "--port", "99999"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/0\.\.65535/);
  });

  it("exits 2 on unknown flag", () => {
    const r = runSync([fixturePath, "--unknown-flag"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/usage: ledger/);
  });

  it("boots the server with --no-open and serves /api/_health", async () => {
    const proc = spawn(process.execPath, [binPath, fixturePath, "--port", "0", "--no-open"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const port = await new Promise<number>((res, rej) => {
        const timer = setTimeout(() => rej(new Error("boot timeout")), 5000);
        proc.stdout.on("data", (chunk: Buffer) => {
          const m = /:(\d+)\//.exec(chunk.toString());
          if (m) { clearTimeout(timer); res(Number(m[1])); }
        });
      });
      const res = await fetch(`http://127.0.0.1:${port}/api/_health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    } finally {
      proc.kill("SIGINT");
      await new Promise<void>((res) => proc.on("exit", () => res()));
    }
  });

  it("respects LEDGER_PORT env var when --port absent", async () => {
    const proc = spawn(process.execPath, [binPath, fixturePath, "--no-open"], {
      env: { ...process.env, LEDGER_PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const port = await new Promise<number>((res, rej) => {
        const timer = setTimeout(() => rej(new Error("boot timeout")), 5000);
        proc.stdout.on("data", (chunk: Buffer) => {
          const m = /:(\d+)\//.exec(chunk.toString());
          if (m) { clearTimeout(timer); res(Number(m[1])); }
        });
      });
      expect(port).toBeGreaterThan(0);
    } finally {
      proc.kill("SIGINT");
      await new Promise<void>((res) => proc.on("exit", () => res()));
    }
  });
});
```

`--port 0` lets the OS assign a free ephemeral port — the test parses the assigned port from the boot stdout line (`ledger: <name> on http://localhost:<port>/`). This avoids port collisions in parallel test runs and CI environments.

The `beforeAll` build ensures the binary exists; tests then spawn the compiled JS, not the TS source (which would require a TS loader and complicate the invocation chain).

### Acceptance check (manual)

A reviewer running the worktree must observe:

1. `server/package.json` has a `bin` field mapping `ledger` to `./dist/bin/ledger.js`, and `open` as a new dependency.
2. `pnpm install` at the repo root succeeds; `node_modules/.bin/ledger` exists and is a symlink to `server/dist/bin/ledger.js` (after `pnpm -C server build`).
3. `pnpm -C server build` succeeds and emits `server/dist/bin/ledger.js` with the shebang preserved.
4. `pnpm -C server typecheck`, `pnpm -C server lint --max-warnings=0`, `pnpm -C server test` exit zero. Test count from this child: ≥8 tests in `bin.test.ts`.
5. **End-to-end invocations work against the real ledger project:**
   - `pnpm exec ledger /Users/dennis/code/ledger --no-open --port 4180` boots the server; `curl http://127.0.0.1:4180/api/_health` returns 200; `Ctrl-C` gracefully shuts down.
   - `pnpm exec ledger /Users/dennis/code/ledger` (no `--no-open`) boots the server AND opens the browser to `http://localhost:4180/`.
   - `pnpm exec ledger /nonexistent/path` exits 1 with stderr like `ledger: missing /nonexistent/path/.ledger/project.json`.
   - `pnpm exec ledger` (no args) exits 2 with usage on stderr.
   - `pnpm exec ledger /Users/dennis/code/ledger --port notanumber` exits 2 with `invalid --port`.
   - `pnpm exec ledger --help` exits 0 with usage on stdout.
6. **`app/` and `packages/parser/` are untouched.** `git diff main..HEAD -- app/ packages/parser/` is empty.
7. **`server/src/`, `server/test/`, `server/package.json` are the only changed files in this child's scope.** `git diff main..HEAD --stat -- server/` shows changes only to `src/bin/`, `test/bin.test.ts`, and `package.json`.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | `node:util.parseArgs` over `commander` / `yargs` / `mri` | Built into Node; no dep. The argument grammar is trivial enough (one positional, two flags, one `-h` alias) that a full CLI framework is unnecessary. Inherited from parent. |
| D2 | `parseArgs({ strict: true })` with try/catch around the parse call | Parent §Spec Review S2. Default `strict: true` rejects unknown flags by throwing; without the catch, an unknown flag crashes with a stack trace instead of a usage message. The catch converts the throw into a clean exit-2-with-usage. |
| D3 | Single `USAGE` constant for help text | Parent §Spec Review S2 (extracted constant). Three exit paths print usage (help, bare invocation, parseArgs failure); duplicating the string risks drift. One source of truth. |
| D4 | `Number.isInteger(port) && 0 <= port <= 65535` guard with explicit stderr | Parent §Spec Review S2. `Number(values.port)` silently produces `NaN` for non-numeric input, then `serve({ port: NaN })` fails with an obscure node-level error. The early guard names the bad value clearly. |
| D5 | `open` package for browser launch, wrapped in try/catch | Parent §Spec Review S7. `open` handles cross-platform invocation; the try/catch keeps the server running when there's no browser to open (headless CI, SSH-only boxes, Linux without `DISPLAY`). |
| D6 | `ContextError` is the only typed-error catch in the CLI | Parent §D8 logged that `ContextError` and `PathContainmentError` are typed subclasses. The CLI catches `ContextError` and formats stderr — `PathContainmentError` is wrapped inside `ContextError` by `loadProjectContext` (so the CLI sees only one error type for the "config problem" category). Other exceptions are programmer errors and propagate with their stack trace. |
| D7 | Graceful SIGINT shutdown via `server.close()` with a 5s force-exit timer | The `serve()` adapter returns a node `http.Server` whose `close()` stops accepting new connections and waits for in-flight requests to drain. The 5s timer (with `.unref()`) prevents hanging on a stuck request. `process.exit(0)` on clean drain; `process.exit(1)` on force-timer. SIGTERM gets the same handler — pnpm and most process managers send SIGTERM, so handling both keeps Ctrl-C and pnpm kill behaving identically. |
| D8 | Tests via `child_process.spawn` against compiled output, not via `tsx` against TS source | Subprocess tests should exercise the exact same invocation chain a user would run. `tsx` adds a layer (and a dep) that isn't in the production path. `beforeAll` builds the binary once so the test suite measures the real artifact. |
| D9 | `--port 0` for tests (OS-assigned free port) | Eliminates port-collision flake in parallel test runs and CI environments. The test parses the assigned port from the boot stdout line. |
| D10 | The `bin` field is added in this child, not in `03-server-package` | `03-server-package` ships the server as a library (createServer + loadProjectContext). The `bin` field implies "this package is invocable as a CLI" — which is only true once the launcher exists. Splitting keeps the abstractions clean: `@ledger/server` is a library + a binary, not a library disguised as one. |
| D11 | No `start` script in `package.json` | The canonical invocation is `pnpm exec ledger <path>` (or `node server/dist/bin/ledger.js <path>` for direct invocation). A `start` script that wraps either would invite confusion ("which one runs?"). `pnpm -C server dev <path>` is `tsx watch` for development; `pnpm exec ledger <path>` is the compiled binary for everything else. |
| D12 | Exit code 0 for `--help`, 2 for bad usage, 1 for runtime failures | Matches POSIX convention: 0 = success, 1 = generic error, 2 = misuse of shell command. `--help` is success — the user asked for help and got it. |

---

## Open Issues

- **No `--host` flag.** Parent §D4 — `127.0.0.1` only in v1. Adding `--host 0.0.0.0` later must land with an auth layer in the same node, not as a v1 quiet default. *(Priority: LOW — by-design constraint.)*
- **No daemonization story.** D7's SIGINT/SIGTERM handler is the entire process-management surface. Operators wanting a long-running ledger across terminal sessions today use `nohup` / `tmux` / `screen` / their OS's user-service tool (systemd-user, launchd). A future packaging concern (out of scope for v1) might add a `--detach` flag or a service-file generator. *(Priority: LOW.)*
- **No log file output.** Server logs go to stdout via Hono's `logger()` middleware. Redirecting to a file is the operator's shell concern (`pnpm exec ledger ... >> ~/.ledger/server.log 2>&1`). Adding `--log-file` is small but defers to ops needs. *(Priority: LOW.)*
- **`open` package portability assumptions.** D5 documents the headless fallback. On macOS and Windows `open` works reliably; on Linux it depends on `xdg-open`/`gnome-open`/`kde-open` availability. The fallback (print URL, keep running) handles all failure modes safely; the operator can still hit the URL manually. *(Priority: TRIVIAL — already mitigated.)*
- **Subprocess tests are slow** — each spawns a Node process and waits for boot. Total `bin.test.ts` runtime: ~5–10s. If the count grows past ~20, consider grouping or moving the "boot + curl" tests to a smaller fixture project. *(Priority: TRIVIAL — wait until measured pain.)*
- **No `--version` flag.** Inherited convention question. Adding `--version` that reads from `package.json` is trivial; deferred until a versioning story exists (current `0.1.0` is a placeholder for unreleased private packages). *(Priority: TRIVIAL.)*
- **CLI test environment vs CI.** Subprocess tests work locally on the developer's machine. In a future CI environment, `pnpm -C server build` must run before `pnpm -C server test` (the `beforeAll` does this, but CI configs sometimes split `build` and `test` into separate steps and miss the order). Document in CI setup when it lands. *(Priority: LOW — no CI today.)*
- **Test for SIGTERM shutdown.** D7 handles both SIGINT and SIGTERM, but the test suite only exercises SIGINT (the test sends `proc.kill("SIGINT")`). Adding a SIGTERM equivalent is one line; deferred to keep the test surface tight. *(Priority: TRIVIAL.)*
- **`localhost` vs `127.0.0.1` IPv4/v6 ambiguity in the printed URL.** The server binds `127.0.0.1` explicitly (IPv4-only), but the stdout message + `open(url)` call use `http://localhost:${port}/`. On dual-stack systems where `localhost` → `::1` (IPv6 first), the browser would try the IPv6 address and fail to reach the IPv4-only listener. macOS today resolves `localhost` → `127.0.0.1` by default so this is a non-issue locally; Linux CI environments may surface it. Tests use `127.0.0.1` directly and are unaffected. Implementation Review N1. *(Priority: LOW — surfaces on dual-stack Linux; one-line fix is to use `127.0.0.1` in the URL.)*
- **URL regex in `bin.test.ts`** matches the first `:digits/` pattern in the boot line, which would mismatch if a project's `name` ever contained `:digits/`. Current fixtures don't; low-risk. Implementation Review N3. *(Priority: TRIVIAL.)*

---

## Spec Review (2026-05-26)

Independent spec review run in a clean Sonnet context against the DRAFT. Verdict: READY_FOR_APPROVAL, no blockers. Three should-fixes (two TypeScript strictness issues, one decision-gap closure) and five nits (most no-action confirmations). Audit:

| # | Finding | Resolution |
|---|---------|------------|
| SF1 | `positionals[0]` types as `string \| undefined` under `noUncheckedIndexedAccess`; the length-guard doesn't narrow the destructured variable. Implementer would invent an idiom. | Added explicit `const projectPath = positionals[0]!` after the length guard, with a comment explaining why the non-null assertion is safe (the guard proves it). The destructured `let positionals!: string[]` uses the definite-assignment assertion since the try/catch may exit before the assignment but the catch's `process.exit(2)` makes the post-try code unreachable in that case. |
| SF2 | `help` option missing `default: false` causes return type `boolean \| undefined` mismatch with the type annotation `help: boolean`. | Added `default: false` to the `help` option. Annotation now matches; no narrowing needed. |
| SF3 | Verification item 10's "either stays or is deleted" left the dev-boot block disposition entirely to implementer judgment with no criterion. | Specified the criterion: delete the dev-boot block. The CLI binary is the canonical entrypoint; the dev-boot block was a pre-CLI workaround. Updated `server/package.json`'s `dev` script to point at `src/bin/ledger.ts` instead of `src/server.ts`. Implementer records the deletion in Implementation Notes. |
| N1 | `--help` exits 0 + writes to stdout; errors write to stderr. Asymmetry is correct POSIX convention but should be explicit so future editors don't "fix" it. | No edit — the existing CLI snippet already implements the asymmetry correctly. A code-level comment would be appropriate at implementation time; the spec doesn't need to call it out. |
| N2 | Test for `--help` asserts `r.stdout`; verified the `spawnSync` shape populates both `stdout` and `stderr`. Informational. | No edit — existing test is correct. |
| N3 | `pnpm -C serverRoot build` in `beforeAll` is single-call; complies with CLAUDE.md's "no `&&`/`;`/`||` chaining" rule. | No edit — informational confirmation. |
| N4 | `ProjectContext` import is type-only but flagged as potentially redundant given TypeScript can infer it. | No edit — explicit type annotation on `let project: ProjectContext` is preferred for readability. |
| N5 | `--port 0` test parses port from stdout via regex. Assumes `@hono/node-server` reports the actual bound port in the stdout line (not the configured `0`). Worth implementer verification. | No edit — implementer's smoke test against the real binary will surface it; if `@hono/node-server` doesn't update the port before our stdout write, the implementer adjusts (e.g. read from `server.address()` after `listen`). Logged as a runtime assumption to verify, not a spec defect. |

Nothing punted. SF1 and SF2 are mechanical TypeScript fixes; SF3 is a small spec-text addition closing a decision gap.

---

## Implementation Notes

**Dependencies added:**
- `open@^10.0.0` added to `server/package.json` `dependencies` (runtime dep).
- `@ledger/server: workspace:*` added to root `package.json` `dependencies` so pnpm creates `node_modules/.bin/ledger` and `pnpm exec ledger` works from any workspace directory.

**Files added / modified:**

| File | Action |
|------|--------|
| `server/src/bin/ledger.ts` | New — CLI entrypoint (~110 LOC) |
| `server/test/bin.test.ts` | New — subprocess test suite (9 tests) |
| `server/package.json` | Modified — adds `bin` field, `open` dep, `dev` script updated |
| `server/src/server.ts` | Modified — dev-boot block deleted (SF3) |
| `packages/parser/src/index.ts` | Modified — added `.js` extensions to relative imports (see below) |
| `packages/parser/src/docs/buildDocGraph.ts` | Modified — same |
| `packages/parser/src/schema/parseDocNode.ts` | Modified — same |
| `packages/parser/src/schema/validateDocNode.ts` | Modified — same |
| `packages/parser/src/project/validateProjectMetadata.ts` | Modified — same |
| `docs/04-api-server/04-cli-launcher.md` | Status transitions + this section |
| `docs/04-api-server/00-api-server.md` | Children manifest status bumps |
| `package.json` (root) | Added `@ledger/server` workspace dep for bin wiring |

**Dev-boot block deletion (SF3):** The `if (import.meta.url === ...)` block in `server/src/server.ts` was deleted. It was a pre-CLI workaround that let the implementer of `03-server-package` run `pnpm -C server dev <path>` without the launcher existing yet. With the CLI landing here, the dev script now points at `src/bin/ledger.ts` which is the correct entrypoint for both dev and production.

**Parser `.js` extension fix:** `packages/parser` used `moduleResolution: "bundler"` with extensionless relative imports in source (e.g. `from "./schema/parseDocNode"`). TypeScript's `bundler` mode emits these as-is in the output JS, which works for Vite (bundler resolves them) and for Vitest (transpiles source directly) but breaks native Node ESM resolution when the compiled binary tries to load the parser via the `@ledger/parser` workspace symlink. Since the CLI binary is run via `node dist/bin/ledger.js`, all upstream imports must be natively resolvable. Added `.js` extensions to all relative imports in the five parser source files. Parser's own tests (55), server tests (38), and app tests (69) all remain green. This fix was strictly necessary for the CLI to function; `02-parser-extraction` could not have surfaced it because Vitest hides the issue.

**Non-null assertion (SF1):** Used `eslint-disable-next-line @typescript-eslint/no-non-null-assertion` on `positionals[0]!` with an inline comment explaining the length guard. ESLint's `@typescript-eslint/no-non-null-assertion` rule would otherwise flag it.

**Lint fix — `no-confusing-void-expression`:** ESLint rule `@typescript-eslint/no-confusing-void-expression` flagged arrow-shorthand returns of `void` expressions (`() => res()`, `() => rej(...)`). Fixed by wrapping in braces (`() => { res(); }`, `() => { rej(...); }`) in `bin.test.ts`.

**Bundle delta:** `du -sh server/dist` → 108K (up from ~96K before bin landing).

**Headless verification results:**
- `pnpm -C server typecheck` → exit 0
- `pnpm -C server lint --max-warnings=0` → exit 0
- `pnpm -C server test` → exit 0 (38 tests: 29 pre-existing + 9 new)
- `pnpm -C server build` → exit 0, emits `dist/bin/ledger.js` with shebang
- `pnpm -C packages/parser typecheck` → exit 0
- `pnpm -C packages/parser lint --max-warnings=0` → exit 0
- `pnpm -C packages/parser test` → exit 0 (55 tests)
- `pnpm -C app typecheck` → exit 0
- `pnpm -C app lint --max-warnings=0` → exit 0
- `pnpm -C app build` → exit 0
- `pnpm typecheck` → exit 0 (all 3 packages)
- `pnpm lint` → exit 0 (all 3 packages)
- `pnpm test` → exit 0 (55 + 38 + 69 = 162 tests total)
- `pnpm build` → exit 0 (all 3 packages)

**End-to-end smoke results:**
- `pnpm exec ledger --help` → exit 0, `usage: ledger ...` on stdout ✓
- `pnpm exec ledger /nonexistent/path` → exit 1, `ledger: missing /nonexistent/path/.ledger/project.json` on stderr ✓
- `pnpm exec ledger /Users/dennis/code/ledger --port notanumber` → exit 2, `ledger: invalid --port "notanumber"...` on stderr ✓
- Boot + `/api/_health` → covered by `bin.test.ts` test 8 (boots on port 0, asserts 200 OK, SIGINT kills cleanly) ✓
- `LEDGER_PORT=0` env var → covered by `bin.test.ts` test 9 ✓

**Total test count:** 162 (55 parser + 38 server [29 pre + 9 bin] + 69 app + 0 root)

**Decisions beyond spec:**
- Root `package.json` gains `@ledger/server: workspace:*` to wire the `ledger` bin via pnpm's standard mechanism. The spec says "pnpm symlinks the compiled `dist/bin/ledger.js` into `node_modules/.bin/ledger`" — this is the required pnpm-workspace mechanism to achieve that.
- Parser `.js` extension fix: bug in `02-parser-extraction` (extensionless imports break native Node ESM). Necessary for CLI correctness; documented here rather than raising as ISSUE_OPEN since the fix is contained and verified.

### Implementation Review (2026-05-26)

Independent implementation review run in a clean Sonnet context against the worktree diff. Verdict: APPROVED for COMPLETE (with three process-required follow-ups before promotion). All 162 workspace tests pass, every SF audit closure verified, all three decisions-beyond-spec evaluated. The reviewer flagged that Decision #1 violates `01-workspace-conversion` D2 silently and Decision #2 touches a COMPLETE-on-main sibling without a backward pointer — both real process concerns that the framework's discipline guards against. Audit:

| # | Finding | Resolution |
|---|---------|------------|
| Process #1 | Decision #1 (root `package.json` adds `@ledger/server: workspace:*`) violates `01-workspace-conversion` D2 ("Root `package.json` carries no runtime dependencies, only workspace-level scripts"). Silent COMPLETE-node deviation is what the framework explicitly guards against. Operator-decision: amend D2 with a bin-wiring carve-out, OR move the dep to `app/`. | **Operator chose amend D2.** Updated `docs/04-api-server/01-workspace-conversion.md`'s D2 row with the carve-out: "Exception: packages that declare a `bin` entry may be listed at the root so pnpm wires `node_modules/.bin/<bin>` for workspace-wide invocation via `pnpm exec <bin>`." Rationale recorded in this commit's audit row — pnpm's actual semantics require the root to be the consumer; locating the dep in `app/` would be semantically wrong since the binary is workspace-wide. |
| Process #2 | Decision #2 (parser `.js` extension fix) modifies code in `02-parser-extraction` (COMPLETE on main) without a backward pointer in that node. The cross-spec workflow isn't covered explicitly by leaf-workflow; default posture: document in both nodes. | Added a "Follow-up patch (2026-05-26)" subsection to `docs/04-api-server/02-parser-extraction.md` Implementation Notes recording the bug, explaining why the original SF1 smoke-test was too narrow (loaded `validateDocNode.js` directly, whose only relative import is type-only and erased at TS emit), and noting the contained fix. |
| Process #3 | This spec's Verification item 9 reads as a hard zero-diff invariant for `packages/parser/` but Decision #2 violates it. | Rewrote item 9 to carve out the four documented changes: the parser `.js`-extension fix (5 files), the root `package.json` workspace dep, the `01-workspace-conversion.md` D2 amendment, and the `02-parser-extraction.md` backward-pointer subsection. The remaining listed paths (`app/`, `docs/_schemas/`, `.ledger/`, etc.) stay strict zero-diff. |
| S1 | (Same as Process #3 — verification gate text.) | Resolved above. |
| S2 | `--help` → stdout, errors → stderr asymmetry is correct POSIX convention but not called out in Implementation Notes. | No edit — informational nit. The CLI snippet implements the asymmetry correctly. |
| S3 | 4a and 4c commits have identical file-sets (both touch only the spec doc + manifest row). | No action — this is the prescribed leaf-workflow pattern for status-only transitions. |
| N1 | `url` variable uses `localhost` (line 106) but `serve()` binds `127.0.0.1`. On dual-stack Linux where `localhost` → `::1`, the printed URL is unreachable. macOS today is fine. | Logged as Open Issue (Priority LOW); one-line fix is to use `127.0.0.1` in the URL. Not blocking — surfaces only on Linux CI environments. |
| N2 | Workspace `pnpm test` shows "3 of 4 workspace projects" — root is skipped because it has no `test` script. | No edit — informational, correct behavior. |
| N3 | URL regex `/:(\d+)\//` in `bin.test.ts` would mismatch if a project's `name` contained `:digits/`. | Logged as Open Issue (Priority TRIVIAL); current fixtures don't trigger it. |

Re-ran gates after the three process-required edits (all doc-only — no code touched):
- `pnpm -C server typecheck` → 0
- `pnpm -C server lint --max-warnings=0` → 0
- `pnpm -C server test` → 0 (38 tests, unchanged)
- `pnpm -C app test` → 0 (69 tests, unchanged)
- `pnpm -C packages/parser test` → 0 (55 tests, unchanged)
- Workspace `pnpm test` → 0 (162 total, unchanged)

Nothing punted. Process #1 was operator-decision; the chosen amendment preserves the working `pnpm exec ledger` invocation and is honest about pnpm's semantics. The two new Open Issues (localhost-vs-127.0.0.1 + URL regex) capture the nits as durable follow-ups.

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. `server/src/bin/ledger.ts` exists, shape matches Design (shebang, `parseArgs` strict + try/catch, USAGE constant, port guard, `open()` try/catch, SIGINT + SIGTERM handlers).
2. `server/package.json` declares `bin: { ledger: "./dist/bin/ledger.js" }` and adds `open: "^10.0.0"` to `dependencies`. No other field changes.
3. `pnpm install` at the repo root succeeds.
4. `pnpm -C server build` succeeds and emits `server/dist/bin/ledger.js` with the shebang intact (first line reads `#!/usr/bin/env node`).
5. `node_modules/.bin/ledger` exists after install + build (pnpm symlinks the bin).
6. **All workspace gates green:**
   - `pnpm -C server typecheck` → 0
   - `pnpm -C server lint --max-warnings=0` → 0
   - `pnpm -C server test` → 0, **`bin.test.ts` contributes ≥8 tests**
   - `pnpm -C server build` → 0
   - All `app/` and `packages/parser/` gates still green (unchanged from `03-server-package`)
   - `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` from repo root → all 0
7. **End-to-end smoke tests against the real ledger project:**
   - `pnpm exec ledger /Users/dennis/code/ledger --no-open --port 4180` boots; `curl http://127.0.0.1:4180/api/_health` returns 200; SIGINT shuts down cleanly (server exits 0 within 5s).
   - `pnpm exec ledger /Users/dennis/code/ledger` (no `--no-open`) boots AND opens the browser (verify by watching the operator's default browser open the URL).
   - `pnpm exec ledger /nonexistent/path` exits 1; stderr contains `missing` and the metadata path.
   - `pnpm exec ledger` exits 2; stderr contains `usage: ledger`.
   - `pnpm exec ledger /Users/dennis/code/ledger --port notanumber` exits 2; stderr contains `invalid --port`.
   - `pnpm exec ledger --help` exits 0; stdout contains `usage: ledger`.
   - `LEDGER_PORT=0 pnpm exec ledger /Users/dennis/code/ledger --no-open` boots on an OS-assigned port (visible in stdout); SIGINT shuts down cleanly.
8. **Headless-environment safety (D5):** if `DISPLAY` is unset on Linux (or via `env -i pnpm exec ledger ... --port 4180` to clear env), the server still boots; stderr shows the browser-open failure message; the URL is printed; the server keeps running until SIGINT. (This may be skipped on macOS where `open` succeeds without `DISPLAY`.)
9. **`app/`, `docs/_schemas/`, `.ledger/`, existing `docs/`** are untouched **except**: (a) `packages/parser/src/**/*.ts` carries the `.js`-extension fix documented in §Implementation Notes (5 files; necessary for native Node ESM resolution of compiled CLI imports; bug from `02-parser-extraction`'s narrow smoke test); (b) root `package.json` adds `@ledger/server: workspace:*` per the Implementation Review's amendment to `01-workspace-conversion` D2 (bin-wiring carve-out); (c) `docs/04-api-server/01-workspace-conversion.md` D2 amended with the carve-out prose; (d) `docs/04-api-server/02-parser-extraction.md` Implementation Notes gains a backward-pointer subsection recording the `.js`-extension patch. `git diff main..HEAD` for `app/`, `docs/_schemas/`, `.ledger/`, `docs/00-project.md`, `docs/02-schema.md`, `docs/03-project-metadata.md`, `docs/01-ui/` is empty.
10. **The dev-boot block in `03-server-package`'s `server/src/server.ts` is deleted by this child.** Spec Review SF3: the criterion is "the CLI binary is now the canonical entrypoint; the dev-boot block was a pre-CLI workaround." Deleting it removes the dead-code-paths-with-no-tests concern and forces every invocation (including `pnpm -C server dev`) through the same `parseCliArgs` + `loadProjectContext` chain. Update `server/package.json`'s `dev` script: `"dev": "tsx watch src/bin/ledger.ts"` (was `"dev": "tsx watch src/server.ts"` per `03-server-package`'s D9). The implementer records the deletion in Implementation Notes.
11. `04-api-server/00-api-server.md` §Children manifest row for `04-cli-launcher` reads the current status; final promotion to COMPLETE bumps both the spec's Status header and the parent's row in the same commit.

---

## Children

None.
