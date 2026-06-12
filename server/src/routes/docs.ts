import { Hono } from "hono";
import { buildDocGraph, validateDocNode, parseDocNode } from "@ledger/parser";
import { readDocsTree, findRawDocForNodeId } from "../readDocs.js";
import type { ServerEnv } from "../server.js";

export const docsRoute = new Hono<ServerEnv>()
  .get("/", async (c) => {
    const project = c.get("project");
    const rawDocs = await readDocsTree(project.docsRoot);
    const { nodes, validationErrorPaths, validationErrors } = buildDocGraph(rawDocs);
    return c.json({ nodes, validation: { errorPaths: validationErrorPaths, errors: validationErrors } });
  })
  .get("/:nodeId{.+}/source", async (c) => {
    const project = c.get("project");
    const nodeId = c.req.param("nodeId");
    const rawDocs = await readDocsTree(project.docsRoot);
    const entry = findRawDocForNodeId(rawDocs, nodeId);
    if (!entry) return c.json({ error: "node not found" }, 404);
    return c.json({ id: nodeId, raw: entry.content });
  })
  .get("/:nodeId{.+}", async (c) => {
    const project = c.get("project");
    const nodeId = c.req.param("nodeId");
    const rawDocs = await readDocsTree(project.docsRoot);
    const entry = findRawDocForNodeId(rawDocs, nodeId);
    if (!entry) return c.json({ error: "node not found" }, 404);
    const candidate = parseDocNode(entry.path, entry.content);
    if (!candidate) return c.json({ error: "not_a_leaf" }, 404);
    const result = validateDocNode(candidate);
    if (!result.ok) return c.json({ errors: result.errors }, 422);
    return c.json({ node: result.node });
  });
