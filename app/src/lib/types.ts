/**
 * Shared domain types for the UI app.
 *
 * Per 01-ui/01-shell.md (D5), this file was intentionally empty after the
 * shell node. Domain contracts now arrive with each panel that needs them.
 *
 * First contributor: 01-ui/02-dag (the DAG view renders the project's own
 * document tree). Later panels (docs, tasks, logs, health, replay) will add
 * Task, LogEvent, Issue, etc.
 */

export type NodeId = string;

export type NodeStatus =
  | "DRAFT"
  | "SPEC_REVIEW"
  | "APPROVED"
  | "IN_PROGRESS"
  | "VERIFY"
  | "COMPLETE"
  | "ISSUE_OPEN"
  | "PLANNED";

export interface DocNode {
  id: NodeId;
  parentId: NodeId | null;
  title: string;
  status: NodeStatus;
  /** Sibling node IDs this node depends on, per its parent's manifest. */
  dependsOn: NodeId[];
  /** True when an authored `docs/**.md` file backs this node. */
  authored: boolean;
  /** Glob key from `import.meta.glob`, kept for debugging/routing. */
  source?: string;
}
