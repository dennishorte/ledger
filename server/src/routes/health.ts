import { Hono } from "hono";
import type { ServerEnv } from "../server.js";

export const healthRoute = new Hono<ServerEnv>()
  .get("/", (c) => {
    const project = c.get("project");
    return c.json({
      ok: true,
      startedAt: project.startedAt,
      dispatcher: {
        status: "ready" as const,
        activeSessions: project.mcp.activeSessions(),
      },
    });
  });
