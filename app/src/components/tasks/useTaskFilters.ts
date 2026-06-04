import { useCallback } from "react";
import { useSearchParams } from "react-router";
import type { TaskStatus, TaskType } from "@/lib/types";

export const ALL_TASK_STATUSES: TaskStatus[] = [
  "PENDING",
  "RUNNING",
  "BLOCKED",
  "AWAITING_HUMAN_REVIEW",
  "COMPLETE",
  "FAILED",
  "CANCELLED",
];

export const ALL_TASK_TYPES: TaskType[] = [
  "operator_session",
  "spec_draft",
  "spec_review",
  "implement",
  "verify",
  "reverify",
  "doc_refactor",
  "doc_decompose",
  "issue_triage",
  "human_review",
  "project_status_review",
  "agent_task",
];

export interface TaskFilters {
  statuses: TaskStatus[];
  types: TaskType[];
  query: string;
}

export interface UseTaskFiltersReturn {
  filters: TaskFilters;
  toggleStatus: (status: TaskStatus) => void;
  toggleType: (type: TaskType) => void;
  setQuery: (q: string) => void;
  clearFilters: () => void;
}

/**
 * URL-synced filter state for the Task Console.
 *
 * Encodes as: ?status=RUNNING,COMPLETE&type=implement,spec_review&q=05-logs
 *
 * Default (no params) = all statuses, all types, empty search.
 * This matches 04-tasks D6 (URL is canonical; React Router v7 useSearchParams).
 */
export function useTaskFilters(): UseTaskFiltersReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawStatus = searchParams.get("status");
  const rawType = searchParams.get("type");
  const query = searchParams.get("q") ?? "";

  const statuses: TaskStatus[] =
    rawStatus
      ? (rawStatus
          .split(",")
          .filter((s): s is TaskStatus =>
            (ALL_TASK_STATUSES as string[]).includes(s),
          ))
      : [...ALL_TASK_STATUSES];

  const types: TaskType[] =
    rawType
      ? (rawType
          .split(",")
          .filter((t): t is TaskType =>
            (ALL_TASK_TYPES as string[]).includes(t),
          ))
      : [...ALL_TASK_TYPES];

  const updateParams = useCallback(
    (update: (prev: URLSearchParams) => URLSearchParams) => {
      setSearchParams(
        (prev) => update(new URLSearchParams(prev)),
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const toggleStatus = useCallback(
    (status: TaskStatus) => {
      updateParams((prev) => {
        const rawStatusVal = prev.get("status");
        const current = rawStatusVal
          ? rawStatusVal
              .split(",")
              .filter((s): s is TaskStatus =>
                (ALL_TASK_STATUSES as string[]).includes(s),
              )
          : [...ALL_TASK_STATUSES];

        const next = current.includes(status)
          ? current.filter((s) => s !== status)
          : [...current, status];

        const next2 = new URLSearchParams(prev);
        if (next.length === ALL_TASK_STATUSES.length) {
          next2.delete("status");
        } else {
          next2.set("status", next.join(","));
        }
        return next2;
      });
    },
    [updateParams],
  );

  const toggleType = useCallback(
    (type: TaskType) => {
      updateParams((prev) => {
        const rawTypeVal = prev.get("type");
        const current = rawTypeVal
          ? rawTypeVal
              .split(",")
              .filter((t): t is TaskType =>
                (ALL_TASK_TYPES as string[]).includes(t),
              )
          : [...ALL_TASK_TYPES];

        const next = current.includes(type)
          ? current.filter((t) => t !== type)
          : [...current, type];

        const next2 = new URLSearchParams(prev);
        if (next.length === ALL_TASK_TYPES.length) {
          next2.delete("type");
        } else {
          next2.set("type", next.join(","));
        }
        return next2;
      });
    },
    [updateParams],
  );

  const setQuery = useCallback(
    (q: string) => {
      updateParams((prev) => {
        const next = new URLSearchParams(prev);
        if (q) {
          next.set("q", q);
        } else {
          next.delete("q");
        }
        return next;
      });
    },
    [updateParams],
  );

  const clearFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: false });
  }, [setSearchParams]);

  return { filters: { statuses, types, query }, toggleStatus, toggleType, setQuery, clearFilters };
}
