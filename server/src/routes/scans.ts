import { Hono } from "hono";
import type { ServerEnv } from "../server.js";

export const scansRoute = new Hono<ServerEnv>()
  .post("/scan", async (c) => {
    const project = c.get("project");
    const scan = await project.healthScanner.runScan();
    return c.json(scan, 201);
  })
  .get("/scans", (c) => {
    const project = c.get("project");
    return c.json(project.store.listScans());
  });
