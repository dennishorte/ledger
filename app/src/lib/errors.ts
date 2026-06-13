/**
 * Shared error classes for TanStack Query mutation hooks that call Hono API endpoints.
 *
 * Extracted from useApproveTask.ts per 06-agent-dispatcher/99-maintenance/02-round-2 item 3.
 * The class form (not interface) is preserved so consumers can use `instanceof MutationErrorBody`.
 */

/** Structured mutation error carrying the HTTP status + parsed response body.
 * Extends Error so `throw` satisfies @typescript-eslint/only-throw-error.
 */
export class MutationErrorBody extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`HTTP ${String(status)}`);
    this.status = status;
    this.body = body;
  }
}
