import { Hono } from "hono";
import { buildDocGraph, parseIssueItems } from "@ledger/parser";
import type { IssueItem } from "@ledger/parser";
import { readDocsTree, findRawDocForNodeId } from "../readDocs.js";
import type { ServerEnv } from "../server.js";

const PRIORITY_ORDER: Record<string, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
  TRIVIAL: 3,
  UNKNOWN: 4,
};

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
  })
  .get("/issues", async (c) => {
    const project = c.get("project");
    const rawDocs = await readDocsTree(project.docsRoot);
    const { nodes } = buildDocGraph(rawDocs);
    const issues: IssueItem[] = [];
    for (const node of nodes) {
      if (!node.authored) continue;
      const entry = findRawDocForNodeId(rawDocs, node.id);
      if (!entry) continue;
      issues.push(...parseIssueItems(node.id, entry.content));
    }
    issues.sort(
      (a, b) =>
        (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4),
    );
    return c.json({ issues });
  });
