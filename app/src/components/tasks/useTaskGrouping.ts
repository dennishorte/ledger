import { useMemo } from "react";
import type { Task, TaskId } from "@/lib/types";

export interface SessionGroup {
  session: Task;
  children: Task[];
}

/**
 * Groups a flat Task[] into session-rooted trees.
 *
 * Operator sessions (type === "operator_session") become group roots.
 * Tasks whose parentTaskId points to a session become its children.
 * Orphan tasks (no session parent found) are promoted as solo session groups.
 *
 * The groups are ordered newest-first by session.createdAt.
 * Within a group, children are ordered newest-first by createdAt.
 *
 * Per 04-tasks D9: grouping is a view concern; the wire format stays flat.
 */
export function useTaskGrouping(tasks: Task[]): SessionGroup[] {
  return useMemo(() => {
    const sessionMap = new Map<TaskId, Task>();
    const childrenMap = new Map<TaskId, Task[]>();

    // Pass 1: index sessions.
    for (const task of tasks) {
      if (task.type === "operator_session") {
        sessionMap.set(task.id, task);
        if (!childrenMap.has(task.id)) {
          childrenMap.set(task.id, []);
        }
      }
    }

    // Pass 2: bucket children.
    const orphans: Task[] = [];
    for (const task of tasks) {
      if (task.type === "operator_session") continue;
      const parentId = task.parentTaskId;
      if (parentId !== undefined && sessionMap.has(parentId)) {
        const bucket = childrenMap.get(parentId);
        if (bucket !== undefined) {
          bucket.push(task);
        }
      } else {
        // Promote orphans as their own session groups.
        orphans.push(task);
      }
    }

    // Build groups from real sessions.
    const groups: SessionGroup[] = [];
    for (const [sessionId, session] of sessionMap) {
      const children = (childrenMap.get(sessionId) ?? []).sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
      groups.push({ session, children });
    }

    // Append orphan tasks as solo groups (synthetic session = the task itself).
    for (const orphan of orphans) {
      groups.push({ session: orphan, children: [] });
    }

    // Sort groups newest-first by session.createdAt.
    groups.sort(
      (a, b) =>
        Date.parse(b.session.createdAt) - Date.parse(a.session.createdAt),
    );

    return groups;
  }, [tasks]);
}
