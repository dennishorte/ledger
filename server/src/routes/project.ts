import { Hono } from "hono";
import { validateProjectMetadata } from "@ledger/parser";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ServerEnv } from "../server.js";

export const projectRoute = new Hono<ServerEnv>().get("/", async (c) => {
  const project = c.get("project");
  const metadataPath = resolve(project.projectRoot, ".ledger/project.json");
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(metadataPath, "utf8"));
  } catch (e) {
    return c.json(
      { errors: [{ path: "/", message: (e as Error).message, keyword: "io" }] },
      500,
    );
  }
  const result = validateProjectMetadata(raw);
  if (!result.ok) {
    return c.json({ errors: result.errors }, 500);
  }
  return c.json({
    project: result.metadata,
    server: {
      projectRoot: project.projectRoot,
      docsRoot: project.docsRoot,
      port: project.port,
      startedAt: project.startedAt,
    },
  });
});
