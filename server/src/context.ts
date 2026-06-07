import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { validateProjectMetadata, buildDocGraph, pathForNodeId } from "@ledger/parser";
import type { ProjectMetadata, ValidationError, TaskType, DocNode } from "@ledger/parser";
import { assertContained } from "./pathSafety.js";
import { readDocsTree } from "./readDocs.js";
import { createRunnerForProject } from "./runner/index.js";
import type { Store, Runner } from "./runner/index.js";
import { createMcpServer, createBindingRegistry, registerRunnerTools } from "./dispatcher/index.js";
import type { McpServerHandle, BindingRegistry } from "./dispatcher/index.js";
import { createCancellationRegistry } from "./dispatcher/executor/cancellation.js";
import { createClaudeCodeExecutor } from "./dispatcher/executor/claudeCode.js";
import type { CancellationRegistry } from "./dispatcher/executor/cancellation.js";
import { createHealthScanner } from "./scanner/index.js";
import type { HealthScannerHandle } from "./scanner/index.js";
import { createAlertChannel } from "./alerts/channel.js";
import type { AlertChannel } from "./alerts/channel.js";
import pkg from "../package.json" with { type: "json" };

const SERVER_VERSION = pkg.version;

// The dispatcher task types handled by ClaudeCodeExecutor (D3).
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
  "doc_decompose",
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
  healthScanner: HealthScannerHandle; // wired in 07-health-daemon v2
  alerts: AlertChannel; // wired in 08-alerts — algedonic push channel
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
  if (!process.env["ANTHROPIC_API_KEY"]) {
    throw new ContextError(
      "ANTHROPIC_API_KEY is not set — dispatched agents will fail. " +
      "Boot via `pnpm -C server dev <path>` (auto-loads .env) or export the key first.",
    );
  }

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

  // Wire binding registry — subscribe before any inbound request can arrive.
  const binding = createBindingRegistry();

  // Per-session MCP server: the factory creates a fresh transport + McpServer on
  // each `initialize`, so the five runner tools are registered per session via
  // this callback (replaces the old single-server pre-connect registration).
  const mcp: McpServerHandle = createMcpServer({
    version: SERVER_VERSION,
    registerTools: (server) => {
      registerRunnerTools(server, { store: runner.store, handle: runner.handle, binding });
    },
  });
  mcp.onSessionInitialized((sessionId, request) => {
    const taskId = request?.headers.get("X-Ledger-Task-Id") ?? undefined;
    binding.bind(sessionId, taskId);
  });
  mcp.onSessionClosed((sessionId) => {
    binding.unbind(sessionId);
  });

  // Wire cancellation registry BEFORE creating the executor (factory reads it).
  const dispatchCancellation = createCancellationRegistry();

  const healthScanner = createHealthScanner({
    projectRoot,
    docsRoot,
    store: runner.store,
    config: result.metadata.health,
  });

  // Algedonic alert channel (08-alerts). Created AFTER createRunnerForProject so
  // boot-time orphan recovery (RUNNING → FAILED) predates the attach — a restart
  // does not replay a burst of historical-failure alerts (Req 6). Report-only.
  const alerts = createAlertChannel({
    store: runner.store,
    webhookUrl: process.env["LEDGER_ALERT_WEBHOOK"],
  });
  alerts.attach(runner.events);

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
    healthScanner,
    alerts,
  };

  // Register ClaudeCodeExecutor for all eight dispatcher task types (D3).
  const claudeCodeExecutor = createClaudeCodeExecutor(ctx);
  for (const type of DISPATCHER_TASK_TYPES) {
    runner.registerExecutor(type, claudeCodeExecutor);
  }

  // Re-evaluate any BLOCKED/PENDING tasks left over from a previous run.
  // Executors must be registered first so the tick can actually dispatch them.
  runner.tick();

  return ctx;
}
