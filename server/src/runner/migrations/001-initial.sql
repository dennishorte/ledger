-- Migration 001 — initial task runner schema.
-- Applied automatically by server/src/runner/migrations/runner.ts on first start.

CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY,                  -- UUIDv4, bare (no prefix) — D3
  type            TEXT NOT NULL,                     -- TaskType (validated app-side; no SQL CHECK — see Out of scope)
  status          TEXT NOT NULL,                     -- TaskStatus
  title           TEXT NOT NULL,
  source          TEXT NOT NULL,                     -- TaskSource
  parent_task_id  TEXT REFERENCES tasks(id),         -- nullable
  depends_on      TEXT NOT NULL DEFAULT '[]',        -- JSON: TaskId[]
  resource_claims TEXT NOT NULL DEFAULT '[]',        -- JSON: ResourceClaim[]
  agent           TEXT,                              -- JSON: { model, persona? } — NULL legal
  review_payload  TEXT,                              -- JSON: { summary, diffRef? } — NULL legal
  db_row_version  INTEGER NOT NULL DEFAULT 0,        -- bumped on every UPDATE (parent S4 — PRD §8.4 OCC)
  priority        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,                     -- ISO 8601
  started_at      TEXT,
  completed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_parent      ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_type_status ON tasks(type, status);
-- Composite covering index for listPendingEligible()'s ORDER BY priority DESC, created_at ASC
-- (Spec Review S1). Costs ~nothing at v1 scale; keeps the scheduler tick O(log n) at v100+.
CREATE INDEX IF NOT EXISTS idx_tasks_eligible    ON tasks(status, priority DESC, created_at ASC);

CREATE TABLE IF NOT EXISTS events (
  id        TEXT PRIMARY KEY,                        -- UUIDv4
  task_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  seq       INTEGER NOT NULL,                        -- monotonic per task, starts at 0
  at        TEXT NOT NULL,                           -- ISO 8601
  kind      TEXT NOT NULL,                           -- LogEvent.kind
  payload   TEXT NOT NULL,                           -- JSON of kind-specific fields
  UNIQUE (task_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_events_task_seq ON events(task_id, seq);

CREATE TABLE IF NOT EXISTS migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
