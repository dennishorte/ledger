/**
 * Public surface for the task runner module.
 *
 * Exports the Store interface, Runner interface, OptimisticLockError,
 * and the factory functions that server/src/context.ts calls.
 *
 * createStoreForProject is preserved as a one-line wrapper around
 * createRunnerForProject for backwards compat (D11).
 */

import { join } from "node:path";
import Database from "better-sqlite3";
import { applyMigrations } from "./migrations/runner.js";
import { createStore } from "./store.js";
import { createRunner, recoverOrphans } from "./scheduler.js";
import type { Runner } from "./scheduler.js";

export { OptimisticLockError } from "./store.js";
export type { Store, ListTasksFilter } from "./store.js";
export type { Runner } from "./scheduler.js";
export type { Executor, RunnerHandle, ExecutorRegistry } from "./executors.js";
export { noopExecutor, createDefaultRegistry } from "./executors.js";
export { reasons, recoverOrphans } from "./scheduler.js";
export { conflicts } from "./conflict.js";

export function createRunnerForProject(project: { projectRoot: string }): Runner {
  const dbPath = join(project.projectRoot, ".ledger", "runner.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");     // safer crash recovery; ~zero cost
  db.pragma("foreign_keys = ON");      // required for ON DELETE CASCADE

  const { applied } = applyMigrations(db);
  if (applied.length > 0) {
    console.log(`runner: applied migration(s) ${applied.map(String).join(", ")}`);
  } else {
    const version = db.pragma("user_version", { simple: true }) as number;
    console.log(`runner: schema is current at user_version=${String(version)}`);
  }

  const store = createStore(db);
  const { recovered } = recoverOrphans(store);
  if (recovered > 0) {
    console.log(`runner: recovered ${String(recovered)} orphaned task(s) (RUNNING → FAILED)`);
  }

  return createRunner(store);
}

// Backwards-compat shim — context.test.ts and project-context callers that
// already destructure `store` keep working. The semantics shift slightly:
// orphan recovery now runs on every store construction (desirable). (D11)
export function createStoreForProject(project: { projectRoot: string }): ReturnType<typeof createStore> {
  return createRunnerForProject(project).store;
}
