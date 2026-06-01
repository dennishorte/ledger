/**
 * Health daemon — periodic document-tree monitor.
 *
 * createHealthDaemon(ctx) → HealthDaemonHandle
 *
 * Runs on a fixed interval (default 5 min) and enqueues remediation tasks
 * for three classes of document problems: size, staleness, orphaned issues.
 *
 * Design: 07-health-daemon spec.
 */

import path from "node:path";
import { parseDocNode, validateDocNode } from "@ledger/parser";
import type { Store } from "../runner/store.js";
import { readDocsTree } from "../readDocs.js";
import { checkSize, checkStaleness, checkOrphans, isDuplicate } from "./monitors.js";

/**
 * Minimal context shape required by the daemon.
 * Avoids the circular dep between context.ts (which wires the daemon) and
 * daemon/index.ts (which receives context). Uses only the fields it needs.
 */
export interface DaemonContext {
  projectRoot: string;
  docsRoot: string;
  store: Store;
}

// ---------------------------------------------------------------------------
// Public types (server-internal — D8: not promoted to @ledger/parser)
// ---------------------------------------------------------------------------

export interface DaemonStatus {
  running: boolean;
  lastRunAt?: string; // ISO 8601
  nextRunAt?: string; // ISO 8601 — set at start() time; updated after each tick
  lastFindingsCount: number;
  lastFindings: DaemonFinding[];
}

export interface DaemonFinding {
  nodeId: string;
  monitor: "size" | "staleness" | "orphan";
  action: "enqueued" | "skipped_dedup";
  taskId?: string; // present when action === "enqueued"
}

export interface HealthDaemonHandle {
  start(): void;
  stop(): void;
  status(): DaemonStatus;
}

// ---------------------------------------------------------------------------
// Configuration (env vars)
// ---------------------------------------------------------------------------

function readEnvInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : defaultValue;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createHealthDaemon(ctx: DaemonContext): HealthDaemonHandle {
  const intervalMs = readEnvInt("LEDGER_DAEMON_INTERVAL_MS", 300_000);
  const sizeThresholdTokens = readEnvInt("LEDGER_DAEMON_SIZE_THRESHOLD_TOKENS", 3000);
  const stalenessGraceDays = readEnvInt("LEDGER_DAEMON_STALENESS_GRACE_DAYS", 2);
  const orphanThresholdDays = readEnvInt("LEDGER_DAEMON_ORPHAN_THRESHOLD_DAYS", 14);

  // In-memory daemon state — resets to zero on server restart (D11 / requirement)
  let running = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastRunAt: string | undefined;
  let nextRunAt: string | undefined;
  let lastFindings: DaemonFinding[] = [];
  let lastFindingsCount = 0;

  // -------------------------------------------------------------------------
  // Tick
  // -------------------------------------------------------------------------

  async function tick(): Promise<void> {
    // Update nextRunAt immediately (next tick is now + intervalMs)
    nextRunAt = new Date(Date.now() + intervalMs).toISOString();

    const findings: DaemonFinding[] = [];

    let rawDocs: Record<string, string>;
    try {
      rawDocs = await readDocsTree(ctx.docsRoot);
    } catch (err) {
      console.error("[daemon] tick: failed to read docs tree:", (err as Error).message);
      lastRunAt = new Date().toISOString();
      lastFindings = findings;
      lastFindingsCount = findings.length;
      return;
    }

    for (const [relKey, content] of Object.entries(rawDocs)) {
      // Parse the doc — skip on failure (non-blocking per spec)
      let parsed: unknown;
      try {
        parsed = parseDocNode(relKey, content);
      } catch (err) {
        console.warn(
          `[daemon] tick: parseDocNode failed for ${relKey}:`,
          (err as Error).message,
        );
        continue;
      }

      const result = validateDocNode(parsed);
      if (!result.ok) {
        // Not a valid implementation doc — skip silently
        continue;
      }

      const doc = result.node;
      const absFilePath = path.join(ctx.docsRoot, relKey);

      // ---- Size monitor ----
      const sizeInput = checkSize(doc, content, sizeThresholdTokens);
      if (sizeInput !== undefined) {
        if (isDuplicate(ctx.store, "doc_refactor", doc.nodeId)) {
          findings.push({ nodeId: doc.nodeId, monitor: "size", action: "skipped_dedup" });
        } else {
          try {
            const task = ctx.store.createTask(sizeInput);
            findings.push({
              nodeId: doc.nodeId,
              monitor: "size",
              action: "enqueued",
              taskId: task.id,
            });
          } catch (err) {
            console.error(
              `[daemon] tick: createTask(doc_refactor, ${doc.nodeId}) failed:`,
              (err as Error).message,
            );
          }
        }
      }

      // ---- Staleness monitor ----
      let stalenessInput: ReturnType<typeof checkSize> | undefined;
      try {
        stalenessInput = await checkStaleness(
          doc,
          absFilePath,
          ctx.projectRoot,
          stalenessGraceDays,
        );
      } catch (err) {
        console.warn(
          `[daemon] tick: checkStaleness failed for ${doc.nodeId}:`,
          (err as Error).message,
        );
      }

      if (stalenessInput !== undefined) {
        if (isDuplicate(ctx.store, "reverify", doc.nodeId)) {
          findings.push({
            nodeId: doc.nodeId,
            monitor: "staleness",
            action: "skipped_dedup",
          });
        } else {
          try {
            const task = ctx.store.createTask(stalenessInput);
            findings.push({
              nodeId: doc.nodeId,
              monitor: "staleness",
              action: "enqueued",
              taskId: task.id,
            });
          } catch (err) {
            console.error(
              `[daemon] tick: createTask(reverify, ${doc.nodeId}) failed:`,
              (err as Error).message,
            );
          }
        }
      }

      // ---- Orphan monitor ----
      const orphanInput = checkOrphans(doc, orphanThresholdDays);
      if (orphanInput !== undefined) {
        if (isDuplicate(ctx.store, "issue_triage", doc.nodeId)) {
          findings.push({
            nodeId: doc.nodeId,
            monitor: "orphan",
            action: "skipped_dedup",
          });
        } else {
          try {
            const task = ctx.store.createTask(orphanInput);
            findings.push({
              nodeId: doc.nodeId,
              monitor: "orphan",
              action: "enqueued",
              taskId: task.id,
            });
          } catch (err) {
            console.error(
              `[daemon] tick: createTask(issue_triage, ${doc.nodeId}) failed:`,
              (err as Error).message,
            );
          }
        }
      }
    }

    lastRunAt = new Date().toISOString();
    lastFindings = findings;
    lastFindingsCount = findings.length;
    console.log(
      `[daemon] tick complete: ${findings.length.toString()} finding(s)`,
    );
  }

  // -------------------------------------------------------------------------
  // Handle
  // -------------------------------------------------------------------------

  return {
    start(): void {
      if (running) return;
      running = true;
      // Set nextRunAt immediately so status() is defined from boot
      nextRunAt = new Date(Date.now() + intervalMs).toISOString();
      timer = setInterval(() => {
        tick().catch((err: unknown) => {
          console.error("[daemon] unhandled tick error:", (err as Error).message);
        });
      }, intervalMs);
    },

    stop(): void {
      if (!running) return;
      running = false;
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    },

    status(): DaemonStatus {
      return {
        running,
        lastRunAt,
        nextRunAt,
        lastFindingsCount,
        lastFindings,
      };
    },
  };
}
