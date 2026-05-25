/**
 * Transcript scanner — discovers all Claude Code JSONL session files under
 * the encoded-cwd directory for this repo.
 *
 * `~/.claude/projects/<encoded-cwd>/` layout:
 *   <sessionId>.jsonl                    — main session log
 *   <sessionId>/subagents/agent-<id>.jsonl  — sub-agent transcript
 *   <sessionId>/subagents/agent-<id>.meta.json — sub-agent metadata
 *
 * `<encoded-cwd>` replaces each `/` in the absolute path with `-`.
 * This module derives it from `git rev-parse --show-toplevel` (D15), cached
 * for the process lifetime.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface SubAgentMeta {
  agentType?: string;
  worktreePath?: string;
  description?: string;
  toolUseId?: string;
}

export interface TranscriptEntry {
  kind: "session" | "subagent";
  /** Absolute path to the .jsonl file. */
  jsonlPath: string;
  /** For sessions: the sessionId. For subagents: the agent id (without `agent-` prefix). */
  id: string;
  /** For subagents: the parent sessionId. Undefined for sessions. */
  parentSessionId?: string;
  /** For subagents: parsed .meta.json content. Undefined for sessions. */
  meta?: SubAgentMeta;
}

let cachedRepoRoot: string | null = null;

/** Returns the absolute repo root path, cached. Throws outside a git repo. */
function getRepoRoot(): string {
  if (cachedRepoRoot !== null) return cachedRepoRoot;
  try {
    const result = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    cachedRepoRoot = result;
    return result;
  } catch {
    throw new Error(
      "transcriptScan: git rev-parse --show-toplevel failed — is this a git repo?",
    );
  }
}

/** Encodes an absolute path to Claude Code's encoded-cwd format: `/` → `-`. */
function encodeCwd(absPath: string): string {
  return absPath.replace(/\//g, "-");
}

/** Returns the `~/.claude/projects/<encoded-cwd>` directory for this repo. */
function getProjectDir(): string {
  const repoRoot = getRepoRoot();
  const encoded = encodeCwd(repoRoot);
  return path.join(os.homedir(), ".claude", "projects", encoded);
}

/**
 * List all transcript entries (sessions + sub-agents) for this repo.
 * Returns an empty array if the project directory doesn't exist.
 */
export function scanTranscripts(): TranscriptEntry[] {
  const projectDir = getProjectDir();
  if (!fs.existsSync(projectDir)) return [];

  const entries: TranscriptEntry[] = [];
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(projectDir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const dirent of dirents) {
    if (dirent.isFile() && dirent.name.endsWith(".jsonl")) {
      // Main session: <sessionId>.jsonl
      const sessionId = dirent.name.slice(0, -".jsonl".length);
      entries.push({
        kind: "session",
        jsonlPath: path.join(projectDir, dirent.name),
        id: sessionId,
      });
    } else if (dirent.isDirectory()) {
      // Potential session directory containing subagents/
      const sessionId = dirent.name;
      const subagentsDir = path.join(projectDir, dirent.name, "subagents");
      if (!fs.existsSync(subagentsDir)) continue;

      let subDirents: fs.Dirent[];
      try {
        subDirents = fs.readdirSync(subagentsDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const sub of subDirents) {
        if (!sub.isFile() || !sub.name.endsWith(".jsonl")) continue;
        // agent-<id>.jsonl
        const agentFile = sub.name;
        const agentId = agentFile.slice("agent-".length, -".jsonl".length);
        const jsonlPath = path.join(subagentsDir, agentFile);

        const metaPath = path.join(subagentsDir, `agent-${agentId}.meta.json`);
        let meta: SubAgentMeta | undefined;
        if (fs.existsSync(metaPath)) {
          try {
            const raw = fs.readFileSync(metaPath, "utf8");
            meta = JSON.parse(raw) as SubAgentMeta;
          } catch {
            // malformed meta — proceed without it
          }
        }

        entries.push({
          kind: "subagent",
          jsonlPath,
          id: agentId,
          parentSessionId: sessionId,
          meta,
        });
      }
    }
  }

  return entries;
}
