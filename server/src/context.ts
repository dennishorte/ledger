import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { validateProjectMetadata } from "@ledger/parser";
import type { ProjectMetadata, ValidationError } from "@ledger/parser";
import { assertContained } from "./pathSafety.js";
import { createRunnerForProject } from "./runner/index.js";
import type { Store, Runner } from "./runner/index.js";
import { createMcpServerAsync } from "./dispatcher/index.js";
import type { McpServerHandle } from "./dispatcher/index.js";
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
  mcp: McpServerHandle; // NEW — wired in 06-agent-dispatcher/01-mcp-server
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
  const mcp = await createMcpServerAsync({ version: SERVER_VERSION });

  return {
    projectRoot,
    docsRoot,
    project: result.metadata,
    port: opts.port,
    startedAt: new Date().toISOString(),
    store: runner.store,
    runner,
    mcp,
  };
}
