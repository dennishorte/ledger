import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { assertContained } from "./pathSafety.js";

export async function readDocsTree(docsRoot: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith(".") || e.name === "node_modules") continue;
        await walk(abs);
      } else if (e.isFile() && e.name.endsWith(".md")) {
        assertContained(docsRoot, abs);
        out[relative(docsRoot, abs)] = await readFile(abs, "utf8");
      }
    }
  }
  await walk(docsRoot);
  return out;
}
