-- Migration 002 — health scanner append log.
-- Applied automatically by server/src/runner/migrations/runner.ts.

CREATE TABLE IF NOT EXISTS health_scans (
  id          TEXT PRIMARY KEY,   -- UUIDv4
  scanned_at  TEXT NOT NULL,      -- ISO 8601
  findings    TEXT NOT NULL       -- JSON: HealthFinding[]
);

CREATE INDEX IF NOT EXISTS idx_health_scans_scanned_at ON health_scans(scanned_at DESC);
