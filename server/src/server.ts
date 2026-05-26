import { Hono } from "hono";
import { logger } from "hono/logger";
import type { ProjectContext } from "./context.js";
import { healthRoute } from "./routes/health.js";
import { projectRoute } from "./routes/project.js";
import { docsRoute } from "./routes/docs.js";

export type ServerEnv = { Variables: { project: ProjectContext } };

export function createServer(project: ProjectContext): Hono<ServerEnv> {
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
// Lets the implementer hit live endpoints via `pnpm -C server dev <path>` without
// 04-cli-launcher landing yet. The proper CLI replaces this in the next child.
if (import.meta.url === `file://${String(process.argv[1])}`) {
  const { serve } = await import("@hono/node-server");
  const { loadProjectContext } = await import("./context.js");
  const projectPath = process.argv[2] ?? process.cwd();
  const port = Number(process.env["LEDGER_PORT"] ?? 4180);
  const project = await loadProjectContext({ projectPath, port });
  const app = createServer(project);
  serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
  process.stdout.write(`@ledger/server: ${project.project.name} on http://127.0.0.1:${port.toString()}/\n`);
}
