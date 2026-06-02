import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { validateProjectMetadata, buildDocGraph, pathForNodeId } from "@ledger/parser";
import type { ProjectMetadata, ValidationError, TaskType, DocNode } from "@ledger/parser";
import { assertContained } from "./pathSafety.js";
import { readDocsTree } from "./readDocs.js";
import { createRunnerForProject } from "./runner/index.js";
import type { Store, Runner } from "./runner/index.js";
import { createMcpServer, createBindingRegistry, registerRunnerTools } from "./dispatcher/index.js";
import type { McpServerHandle, McpServerHandleInternal, BindingRegistry } from "./dispatcher/index.js";
import { createCancellationRegistry } from "./dispatcher/executor/cancellation.js";
import { createClaudeCodeExecutor } from "./dispatcher/executor/claudeCode.js";
import type { CancellationRegistry } from "./dispatcher/executor/cancellation.js";
import { createHealthDaemon } from "./daemon/index.js";
import type { HealthDaemonHandle } from "./daemon/index.js";
import pkg from "../package.json" with { type: "json" };

const SERVER_VERSION = pkg.version;

// The eight dispatcher task types handled by ClaudeCodeExecutor (D3).
// `satisfies readonly TaskType[]` gives exhaustiveness checking at compile time —
// a new TaskType in @ledger/parser will not cause a TS error here, but a deliberate
// check can be added if needed.
const DISPATCHER_TASK_TYPES = [
  "implement",
  "spec_review",
  "verify",
  "spec_draft",
  "reverify",
  "doc_refactor",
  "issue_triage",
  "project_status_review",
] as const satisfies readonly TaskType[];

export interface ProjectContext {
  projectRoot: string;
  docsRoot: string;
  project: ProjectMetadata;
  port: number;
  startedAt: string;
  store: Store;   // same reference as runner.store — kept for backwards compat (D12)
  runner: Runner; // wired in 05-task-runner/02-scheduler per Requirements item 9
  mcp: McpServerHandle; // wired in 06-agent-dispatcher/01-mcp-server
  binding: BindingRegistry; // wired in 06-agent-dispatcher/02-runner-tools; exposed for tests + 05-dispatch-api
  dispatchCancellation: CancellationRegistry; // wired in 06-agent-dispatcher/03-claude-code-executor; for 05-dispatch-api cancel route
  /** Parsed doc-node array loaded at context boot — used by renderPrompt / pathForNodeId (04-prompt-templates). */
  docs: readonly DocNode[];
  /** Resolve a NodeId to its source docs/ path. Wraps pathForNodeId over ctx.docs. */
  resolveDocPath: (nodeId: string) => string | undefined;
  daemon: HealthDaemonHandle; // wired in 07-health-daemon
}

export class ContextError extends Error {
  constructor(
    message: string,
    public readonly errors: ValidationError[] = [],
  ) {
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
  } catch {
    throw new ContextError(`docs path escapes project root: docs=${result.metadata.docs}`);
  }

  // Load the docs tree and build the graph once at context boot.
  // renderPrompt / pathForNodeId use this array to resolve NodeId → source path.
  const rawDocs = await readDocsTree(docsRoot);
  const { nodes: docs } = buildDocGraph(rawDocs);
  const resolveDocPath = (nodeId: string) => pathForNodeId(docs, nodeId);

  const runner = createRunnerForProject({ projectRoot });

  // createMcpServer returns the internal handle (pre-connect) so we can register tools
  // BEFORE calling _connect(). The SDK throws if registerTool is called after connect.
  const mcpInternal: McpServerHandleInternal = createMcpServer({ version: SERVER_VERSION });

  // Wire binding registry — subscribe before any inbound request can arrive
  const binding = createBindingRegistry();
  mcpInternal.onSessionInitialized((sessionId, request) => {
    const taskId = request?.headers.get("X-Ledger-Task-Id") ?? undefined;
    binding.bind(sessionId, taskId);
  });
  mcpInternal.onSessionClosed((sessionId) => {
    binding.unbind(sessionId);
  });

  // Register the five runner tools BEFORE connecting the transport (SDK ordering constraint)
  registerRunnerTools(mcpInternal.server, { store: runner.store, handle: runner.handle, binding });

  // Now connect — transport starts accepting requests
  await mcpInternal._connect();

  // Narrow to the public handle type for ProjectContext
  const mcp: McpServerHandle = mcpInternal;

  // Wire cancellation registry BEFORE creating the executor (factory reads it).
  const dispatchCancellation = createCancellationRegistry();

  // Create the health daemon early — it only needs projectRoot/docsRoot/store,
  // so it can be instantiated before the full context object is assembled.
  // start() is called after the full ctx is built (D10).
  const daemon = createHealthDaemon({ projectRoot, docsRoot, store: runner.store });

  // Assemble the full context (including daemon) before passing to ClaudeCodeExecutor,
  // so the type is satisfied and the executor closes over a complete ProjectContext.
  const ctx: ProjectContext = {
    projectRoot,
    docsRoot,
    project: result.metadata,
    port: opts.port,
    startedAt: new Date().toISOString(),
    store: runner.store,
    runner,
    mcp,
    binding,
    dispatchCancellation,
    docs,
    resolveDocPath,
    daemon,
  };

  // Register ClaudeCodeExecutor for all eight dispatcher task types (D3).
  // Same instance registered for all types — prompt dispatch is 04-prompt-templates'
  // concern; the executor is type-blind at the spawn-and-wait level.
  const claudeCodeExecutor = createClaudeCodeExecutor(ctx);
  for (const type of DISPATCHER_TASK_TYPES) {
    runner.registerExecutor(type, claudeCodeExecutor);
  }

  // Start the daemon (D10) — after full context is assembled.
  //
  // DISABLED BY DEFAULT (2026-06-01). The first end-to-end dispatch test found
  // the daemon unsafe to run unattended: it auto-dispatches unreviewed write-
  // agents that `git commit` specs and race the shared git index, and its
  // enqueued tasks starve because it writes via raw store.createTask without
  // ticking the scheduler. See docs/process/e2e-dispatch-findings.md §2-§3 and
  // docs/00-project.md §11. Re-enable explicitly with LEDGER_DAEMON_ENABLED=1
  // once the worktree-isolation + HITL-gate + runner-driven-enqueue fixes land.
  if (process.env["LEDGER_DAEMON_ENABLED"] === "1") {
    daemon.start();
  } else {
    console.log(
      "[daemon] disabled (set LEDGER_DAEMON_ENABLED=1 to enable; see docs/process/e2e-dispatch-findings.md)",
    );
  }

  return ctx;
}
