/**
 * Synchronous typed Store API for the task runner.
 *
 * Wraps a better-sqlite3 Database with prepared statements cached at
 * constructor time. Every write method runs in a transaction. Callers
 * always receive canonical Task / LogEvent shapes — no raw SQL rows escape.
 *
 * See spec §Store API surface and parent D9 (sync API contract).
 */

import type { Database } from "better-sqlite3";
import type {
  Task,
  TaskId,
  TaskStatus,
  TaskType,
  TaskInput,
  LogEvent,
  TaskSource,
  ResourceClaim,
  ReviewPayload,
} from "@ledger/parser";
import { newTaskId, newEventId } from "./ids.js";

// ---------------------------------------------------------------------------
// Public error class (spec §Store API surface)
// ---------------------------------------------------------------------------

export class OptimisticLockError extends Error {
  constructor(
    public taskId: TaskId,
    public expected: number,
    public actual: number,
  ) {
    super(
      `task ${taskId}: dbRowVersion mismatch (expected ${String(expected)}, actual ${String(actual)})`,
    );
    this.name = "OptimisticLockError";
  }
}

// ---------------------------------------------------------------------------
// Internal row types — wire representation in SQLite
// ---------------------------------------------------------------------------

interface RawTaskRow {
  id: string;
  type: string;
  status: string;
  title: string;
  source: string;
  parent_task_id: string | null;
  depends_on: string; // JSON
  resource_claims: string; // JSON
  agent: string | null; // JSON
  review_payload: string | null; // JSON
  db_row_version: number;
  priority: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface RawEventRow {
  id: string;
  task_id: string;
  seq: number;
  at: string;
  kind: string;
  payload: string; // JSON
}

interface RawStatusRow {
  status: string;
}

// ---------------------------------------------------------------------------
// Row ↔ domain object converters
// ---------------------------------------------------------------------------

function rowToTask(row: RawTaskRow): Task {
  return {
    id: row.id,
    type: row.type as TaskType,
    status: row.status as TaskStatus,
    title: row.title,
    source: row.source as TaskSource,
    parentTaskId: row.parent_task_id ?? undefined,
    dependsOn: JSON.parse(row.depends_on) as TaskId[],
    resourceClaims: JSON.parse(row.resource_claims) as ResourceClaim[],
    agent:
      row.agent !== null
        ? (JSON.parse(row.agent) as { model: string; persona?: string })
        : undefined,
    reviewPayload:
      row.review_payload !== null
        ? (JSON.parse(row.review_payload) as {
            summary: string;
            diffRef?: string;
          })
        : undefined,
    dbRowVersion: row.db_row_version,
    priority: row.priority,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    // transcriptPath is absent for runner-emitted tasks
  };
}

function rowToEvent(row: RawEventRow): LogEvent {
  const payload = JSON.parse(row.payload) as Record<string, unknown>;
  return {
    id: row.id,
    taskId: row.task_id,
    seq: row.seq,
    at: row.at,
    kind: row.kind,
    ...payload,
  } as LogEvent;
}

// ---------------------------------------------------------------------------
// Public Store interface
// ---------------------------------------------------------------------------

export interface ListTasksFilter {
  status?: TaskStatus[];
  type?: TaskType[];
  parent?: TaskId;
}

export interface Store {
  createTask(input: TaskInput): Task;
  updateTaskStatus(
    id: TaskId,
    transition: { from: TaskStatus; to: TaskStatus; reason?: string },
    expectedDbRowVersion?: number,
  ): Task;
  appendEvent(
    taskId: TaskId,
    event: Omit<LogEvent, "id" | "taskId" | "seq" | "at">,
  ): LogEvent;
  loadTask(id: TaskId): Task | undefined;
  getStatus(id: TaskId): TaskStatus | undefined;
  listTasks(filter?: ListTasksFilter): Task[];
  listPendingEligible(): Task[];
  getEvents(
    taskId: TaskId,
    opts?: { afterSeq?: number; limit?: number },
  ): LogEvent[];
  /**
   * UPDATE tasks SET review_payload = ? WHERE id = ?.
   * Caller (runner.await_human_review tool) follows with handle.awaitHumanReview(id)
   * for the actual status transition. No transaction here — the transition's
   * status_change append is the durability boundary.
   * Throws if the task does not exist.
   */
  updateReviewPayload(taskId: TaskId, reviewPayload: ReviewPayload): void;
  close(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createStore(db: Database): Store {
  // Prepared statements cached at construction time
  const stmtInsertTask = db.prepare<
    [
      string, // id
      string, // type
      string, // status
      string, // title
      string, // source
      string | null, // parent_task_id
      string, // depends_on
      string, // resource_claims
      string | null, // agent
      string | null, // review_payload
      number, // priority
      string, // created_at
    ]
  >(
    `INSERT INTO tasks (id, type, status, title, source, parent_task_id,
       depends_on, resource_claims, agent, review_payload, priority, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const stmtInsertEvent = db.prepare<
    [string, string, number, string, string, string]
  >(
    `INSERT INTO events (id, task_id, seq, at, kind, payload) VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const stmtNextSeq = db.prepare<[string]>(
    `SELECT COALESCE(MAX(seq), -1) + 1 AS next_seq FROM events WHERE task_id = ?`,
  );

  const stmtLoadTask = db.prepare<[string]>(
    `SELECT * FROM tasks WHERE id = ?`,
  );

  const stmtGetStatus = db.prepare<[string]>(
    `SELECT status FROM tasks WHERE id = ?`,
  );

  const stmtListPendingEligible = db.prepare(
    `SELECT * FROM tasks WHERE status IN ('PENDING', 'BLOCKED')
     ORDER BY priority DESC, created_at ASC`,
  );

  const stmtGetEvents = db.prepare<[string]>(
    `SELECT * FROM events WHERE task_id = ? ORDER BY seq ASC`,
  );

  const stmtGetEventsAfterSeq = db.prepare<[string, number]>(
    `SELECT * FROM events WHERE task_id = ? AND seq > ? ORDER BY seq ASC`,
  );

  const stmtGetEventsAfterSeqWithLimit = db.prepare<[string, number, number]>(
    `SELECT * FROM events WHERE task_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?`,
  );

  const stmtGetEventsWithLimit = db.prepare<[string, number]>(
    `SELECT * FROM events WHERE task_id = ? ORDER BY seq ASC LIMIT ?`,
  );

  const stmtUpdateTaskStatus = db.prepare<
    [
      string, // status
      string | null, // started_at
      string | null, // completed_at
      string, // id
    ]
  >(
    `UPDATE tasks SET status = ?, started_at = COALESCE(started_at, ?),
     completed_at = ?, db_row_version = db_row_version + 1
     WHERE id = ?`,
  );

  const stmtGetDbRowVersion = db.prepare<[string]>(
    `SELECT db_row_version FROM tasks WHERE id = ?`,
  );

  const stmtUpdateReviewPayload = db.prepare<[string, string]>(
    `UPDATE tasks SET review_payload = ? WHERE id = ?`,
  );

  // ---------------------------------------------------------------------------
  // Helper: write a log event row inside an existing transaction
  // ---------------------------------------------------------------------------

  function writeEventInTx(
    taskId: TaskId,
    event: Omit<LogEvent, "id" | "taskId" | "seq" | "at">,
  ): LogEvent {
    const seqRow = stmtNextSeq.get(taskId) as { next_seq: number };
    const seq = seqRow.next_seq;
    const id = newEventId();
    const at = new Date().toISOString();

    // Extract kind + remaining payload fields
    const { kind, ...rest } = event as { kind: string } & Record<
      string,
      unknown
    >;
    const payload = JSON.stringify(rest);

    stmtInsertEvent.run(id, taskId, seq, at, kind, payload);

    return {
      id,
      taskId,
      seq,
      at,
      kind,
      ...rest,
    } as LogEvent;
  }

  // ---------------------------------------------------------------------------
  // Store methods
  // ---------------------------------------------------------------------------

  function createTask(input: TaskInput): Task {
    const id = newTaskId();
    const now = new Date().toISOString();
    const source = input.source ?? "operator_injected";
    const dependsOn = input.dependsOn ?? [];
    const resourceClaims = input.resourceClaims ?? [];
    const priority = input.priority ?? 0;

    const txCreate = db.transaction(() => {
      stmtInsertTask.run(
        id,
        input.type,
        "PENDING",
        input.title,
        source,
        input.parentTaskId ?? null,
        JSON.stringify(dependsOn),
        JSON.stringify(resourceClaims),
        input.agent !== undefined ? JSON.stringify(input.agent) : null,
        input.reviewPayload !== undefined
          ? JSON.stringify(input.reviewPayload)
          : null,
        priority,
        now,
      );

      // Seq-0 creation event: status_change with to=PENDING, from absent (S4)
      writeEventInTx(id, {
        kind: "status_change",
        to: "PENDING",
      } as Omit<LogEvent, "id" | "taskId" | "seq" | "at">);
    });

    txCreate();

    const row = stmtLoadTask.get(id) as RawTaskRow;
    return rowToTask(row);
  }

  function updateTaskStatus(
    id: TaskId,
    transition: { from: TaskStatus; to: TaskStatus; reason?: string },
    expectedDbRowVersion?: number,
  ): Task {
    const txUpdate = db.transaction(() => {
      // Check optimistic lock if requested
      if (expectedDbRowVersion !== undefined) {
        const versionRow = stmtGetDbRowVersion.get(id) as
          | { db_row_version: number }
          | undefined;
        if (!versionRow) {
          throw new Error(`task ${id}: not found`);
        }
        if (versionRow.db_row_version !== expectedDbRowVersion) {
          throw new OptimisticLockError(
            id,
            expectedDbRowVersion,
            versionRow.db_row_version,
          );
        }
      }

      const now = new Date().toISOString();
      const isStarting = transition.to === "RUNNING";
      const isTerminal =
        transition.to === "COMPLETE" ||
        transition.to === "FAILED" ||
        transition.to === "CANCELLED";

      stmtUpdateTaskStatus.run(
        transition.to,
        isStarting ? now : null, // started_at: COALESCE keeps existing value
        isTerminal ? now : null, // completed_at: set when terminal
        id,
      );

      // Append status_change event
      const eventData: Record<string, unknown> = {
        kind: "status_change",
        from: transition.from,
        to: transition.to,
      };
      if (transition.reason !== undefined) {
        eventData["reason"] = transition.reason;
      }

      writeEventInTx(
        id,
        eventData as Omit<LogEvent, "id" | "taskId" | "seq" | "at">,
      );
    });

    txUpdate();

    const row = stmtLoadTask.get(id) as RawTaskRow;
    return rowToTask(row);
  }

  function appendEvent(
    taskId: TaskId,
    event: Omit<LogEvent, "id" | "taskId" | "seq" | "at">,
  ): LogEvent {
    let result!: LogEvent;
    const txAppend = db.transaction(() => {
      result = writeEventInTx(taskId, event);
    });
    txAppend();
    return result;
  }

  function loadTask(id: TaskId): Task | undefined {
    const row = stmtLoadTask.get(id) as RawTaskRow | undefined;
    if (!row) return undefined;
    return rowToTask(row);
  }

  function getStatus(id: TaskId): TaskStatus | undefined {
    const row = stmtGetStatus.get(id) as RawStatusRow | undefined;
    if (!row) return undefined;
    return row.status as TaskStatus;
  }

  function listTasks(filter?: ListTasksFilter): Task[] {
    // Build query dynamically based on filter
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.status && filter.status.length > 0) {
      const placeholders = filter.status.map(() => "?").join(", ");
      conditions.push(`status IN (${placeholders})`);
      params.push(...filter.status);
    }

    if (filter?.type && filter.type.length > 0) {
      const placeholders = filter.type.map(() => "?").join(", ");
      conditions.push(`type IN (${placeholders})`);
      params.push(...filter.type);
    }

    if (filter?.parent !== undefined) {
      conditions.push("parent_task_id = ?");
      params.push(filter.parent);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const stmt = db.prepare(
      `SELECT * FROM tasks ${where} ORDER BY created_at DESC`,
    );
    const rows = stmt.all(params) as RawTaskRow[];
    return rows.map(rowToTask);
  }

  function listPendingEligible(): Task[] {
    const rows = stmtListPendingEligible.all() as RawTaskRow[];
    return rows.map(rowToTask);
  }

  function getEvents(
    taskId: TaskId,
    opts?: { afterSeq?: number; limit?: number },
  ): LogEvent[] {
    let rows: RawEventRow[];

    if (opts?.afterSeq !== undefined && opts.limit !== undefined) {
      rows = stmtGetEventsAfterSeqWithLimit.all(
        taskId,
        opts.afterSeq,
        opts.limit,
      ) as RawEventRow[];
    } else if (opts?.afterSeq !== undefined) {
      rows = stmtGetEventsAfterSeq.all(taskId, opts.afterSeq) as RawEventRow[];
    } else if (opts?.limit !== undefined) {
      rows = stmtGetEventsWithLimit.all(taskId, opts.limit) as RawEventRow[];
    } else {
      rows = stmtGetEvents.all(taskId) as RawEventRow[];
    }

    return rows.map(rowToEvent);
  }

  function updateReviewPayload(taskId: TaskId, reviewPayload: ReviewPayload): void {
    const json = JSON.stringify(reviewPayload);
    const info = stmtUpdateReviewPayload.run(json, taskId);
    if (info.changes === 0) {
      throw new Error(`updateReviewPayload: task not found: ${taskId}`);
    }
  }

  function close(): void {
    db.close();
  }

  return {
    createTask,
    updateTaskStatus,
    appendEvent,
    loadTask,
    getStatus,
    listTasks,
    listPendingEligible,
    getEvents,
    updateReviewPayload,
    close,
  };
}
