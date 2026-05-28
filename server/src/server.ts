import { Hono } from "hono";
import { logger } from "hono/logger";
import type { ProjectContext } from "./context.js";
import { healthRoute } from "./routes/health.js";
import { projectRoute } from "./routes/project.js";
import { docsRoute } from "./routes/docs.js";
import { tasksRoute } from "./routes/tasks.js";
import { hitlRoute } from "./routes/hitl.js";

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
  app.route("/api/tasks", tasksRoute);
  app.route("/api/tasks", hitlRoute);
  app.route("/mcp", project.mcp.mcpRoute); // MCP server — /mcp not /api/mcp (parent D4)
  return app;
}
