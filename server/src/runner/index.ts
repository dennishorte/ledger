/**
 * Public surface for the task runner module.
 *
 * Exports the Store interface, OptimisticLockError, and the
 * createStoreForProject factory that server/src/context.ts calls.
 */

import { join } from "node:path";
import Database from "better-sqlite3";
import { applyMigrations } from "./migrations/runner.js";
import { createStore } from "./store.js";

export { OptimisticLockError } from "./store.js";
export type { Store, ListTasksFilter } from "./store.js";

export function createStoreForProject(project: { projectRoot: string }): ReturnType<typeof createStore> {
  const dbPath = join(project.projectRoot, ".ledger", "runner.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");      // safer crash recovery; ~zero cost
  db.pragma("foreign_keys = ON");       // required for ON DELETE CASCADE
  const { applied } = applyMigrations(db);
  if (applied.length > 0) {
    console.log(`runner: applied migration(s) ${applied.map(String).join(", ")}`);
  } else {
    const version = db.pragma("user_version", { simple: true }) as number;
    console.log(`runner: schema is current at user_version=${String(version)}`);
  }
  return createStore(db);
}
