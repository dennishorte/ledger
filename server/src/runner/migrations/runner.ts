/**
 * Transactional migrations runner for the task runner SQLite database.
 *
 * Reads numbered .sql files from this directory, compares against PRAGMA
 * user_version, and applies any unapplied migrations inside individual
 * transactions. PRAGMA user_version is set AFTER each successful transaction
 * (it is not transactional in SQLite — Spec Review S3).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "better-sqlite3";

// __dirname equivalent for ESM — resolve the directory of this compiled file.
function migrationsDir(): string {
  // When running from dist/, this file is at dist/runner/migrations/runner.js
  // alongside the .sql files which are copied by the build. In test with tsx,
  // import.meta.url points at the .ts source alongside the .sql files directly.
  return new URL(".", import.meta.url).pathname;
}

interface MigrationFile {
  version: number;
  sql: string;
}

function readMigrationFilesSync(dir: string): MigrationFile[] {
  const entries = readdirSync(dir);
  const files: MigrationFile[] = [];

  for (const entry of entries) {
    const match = entry.match(/^(\d{3})-[^.]+\.sql$/);
    if (!match || !match[1]) continue;
    const version = parseInt(match[1], 10);
    const sql = readFileSync(join(dir, entry), "utf8");
    files.push({ version, sql });
  }

  // Sort numerically by version number
  files.sort((a, b) => a.version - b.version);
  return files;
}

export function applyMigrations(db: Database): { applied: number[] } {
  const currentVersion = db.pragma("user_version", { simple: true }) as number;
  const files = readMigrationFilesSync(migrationsDir());
  const applied: number[] = [];

  for (const { version, sql } of files) {
    if (version <= currentVersion) continue;

    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT OR IGNORE INTO migrations(version, applied_at) VALUES (?, ?)").run(
        version,
        new Date().toISOString(),
      );
    })();

    // PRAGMA user_version is NOT transactional in SQLite — it executes immediately
    // outside any tx boundary. Setting it AFTER db.transaction() commits successfully
    // means we never advance user_version unless the migrations-table row landed.
    // (Spec Review S3.)
    db.pragma(`user_version = ${String(version)}`);
    applied.push(version);
  }

  return { applied };
}
