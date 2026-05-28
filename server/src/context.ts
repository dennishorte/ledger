import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { validateProjectMetadata } from "@ledger/parser";
import type { ProjectMetadata, ValidationError } from "@ledger/parser";
import { assertContained } from "./pathSafety.js";
import { createRunnerForProject } from "./runner/index.js";
import type { Store, Runner } from "./runner/index.js";
import { createMcpServer, createBindingRegistry, registerRunnerTools } from "./dispatcher/index.js";
import type { McpServerHandle, McpServerHandleInternal, BindingRegistry } from "./dispatcher/index.js";
import pkg from "../package.json" with { type: "json" };

const SERVER_VERSION = pkg.version;

export interface ProjectContext {
  projectRoot: string;
  docsRoot: string;
  project: ProjectMetadata;
  port: number;
  startedAt: string;
  store: Store;   // same reference as runner.store — kept for backwards compat (D12)
  runner: Runner; // wired in 05-task-runner/02-scheduler per Requirements item 9
  mcp: McpServerHandle; // wired in 06-agent-dispatcher/01-mcp-server
  binding: BindingRegistry; // NEW — wired in 06-agent-dispatcher/02-runner-tools; exposed for tests + 05-dispatch-api
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

  return {
    projectRoot,
    docsRoot,
    project: result.metadata,
    port: opts.port,
    startedAt: new Date().toISOString(),
    store: runner.store,
    runner,
    mcp,
    binding,
  };
}
