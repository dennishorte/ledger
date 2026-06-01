import { Hono } from "hono";
import type { ServerEnv } from "../server.js";

export const daemonRoute = new Hono<ServerEnv>().get("/status", (c) => {
  const project = c.get("project");
  return c.json(project.daemon.status());
});
