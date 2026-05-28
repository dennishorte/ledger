/**
 * Public surface for the task runner module.
 *
 * Exports the Store interface, Runner interface, OptimisticLockError,
 * and the factory functions that server/src/context.ts calls.
 *
 * createStoreForProject is preserved as a one-line wrapper around
 * createRunnerForProject for backwards compat (D11). After this child
 * (04-api-endpoints), that shim returns a publishing-wrapped Store; callers
 * wanting subscriptions should migrate to createRunnerForProject and use
 * runner.events directly. (Spec Review S3.)
 */

import { join } from "node:path";
import Database from "better-sqlite3";
import { applyMigrations } from "./migrations/runner.js";
import { createStore } from "./store.js";
import type { Store } from "./store.js";
import { createRunner, recoverOrphans } from "./scheduler.js";
import type { Runner } from "./scheduler.js";
import { createEventBus, withPublishing } from "./events.js";

export { OptimisticLockError } from "./store.js";
export type { Store, ListTasksFilter } from "./store.js";
export type { Runner } from "./scheduler.js";
export type { Executor, RunnerHandle, ExecutorRegistry } from "./executors.js";
export { noopExecutor, createDefaultRegistry } from "./executors.js";
export { reasons, recoverOrphans } from "./scheduler.js";
export { conflicts } from "./conflict.js";
export type { EventBus } from "./events.js";
export { createEventBus, withPublishing } from "./events.js";

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

  const bus = createEventBus();
  const store = withPublishing(createStore(db), bus);

  const { recovered } = recoverOrphans(store);
  if (recovered > 0) {
    console.log(`runner: recovered ${String(recovered)} orphaned task(s) (RUNNING → FAILED)`);
  }

  return createRunner(store, undefined, bus);
}

// Backwards-compat shim. Return type widened to Store (was ReturnType<typeof createStore>)
// because withPublishing returns the Store interface. Callers that want subscriptions
// should migrate to createRunnerForProject and use runner.events. (Spec Review S2, S3.)
export function createStoreForProject(project: { projectRoot: string }): Store {
  return createRunnerForProject(project).store;
}
