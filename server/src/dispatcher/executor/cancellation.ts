/**
 * Cancellation registry — Map<TaskId, Subprocess> populated on spawn,
 * cleared on exit. 05-dispatch-api's cancel route calls
 *   ctx.dispatchCancellation.killWithEscalation(taskId, "SIGTERM")
 * to deliver the cancel signal; the registry owns the SIGKILL escalation timer.
 *
 * The registry is exposed read-only via ProjectContext.dispatchCancellation.
 * The cancel route owns the eager-DB-write side; this leaf owns the
 * subprocess-handle map. Two-leaf coupling is intentional (D9).
 *
 * SIGKILL escalation (06-agent-dispatcher/99-maintenance/01-round-1):
 *   When killWithEscalation(id, "SIGTERM") is called, a timer fires after
 *   SIGKILL_ESCALATION_MS (default 8 s). If the subprocess has not exited by
 *   then (i.e. unbind has not been called), SIGKILL is delivered and a
 *   subprocess_killed log event is emitted via the optional emitEvent callback.
 *   The timer uses unref() so it never prevents Node.js from exiting cleanly
 *   once the main work is done.
 */

import type { Subprocess } from "execa";
import type { TaskId } from "@ledger/parser";

/** Default delay from SIGTERM to SIGKILL escalation (milliseconds). */
export const SIGKILL_ESCALATION_MS = 8_000;

export type SubprocessKilledEvent = {
  kind: "subprocess_killed";
  signal: "SIGKILL";
  taskId: TaskId;
};

export interface CancellationRegistry {
  bind(taskId: TaskId, subprocess: Subprocess): void;
  unbind(taskId: TaskId): void;
  lookup(taskId: TaskId): Subprocess | undefined;
  /**
   * Send signal to the registered subprocess.
   * When signal is "SIGTERM", also arms the SIGKILL escalation timer.
   * Returns true if the subprocess was found and signalled; false otherwise.
   */
  killWithEscalation(taskId: TaskId, signal: "SIGTERM" | "SIGKILL"): boolean;
  size(): number;
}

interface RegistryEntry {
  subprocess: Subprocess;
  escalationTimer?: ReturnType<typeof setTimeout>;
}

export function createCancellationRegistry(opts?: {
  /** SIGKILL escalation delay in ms. Defaults to SIGKILL_ESCALATION_MS (8000). */
  escalationDelayMs?: number;
  /** Optional callback invoked when SIGKILL is sent via escalation. */
  emitEvent?: (taskId: TaskId, event: SubprocessKilledEvent) => void;
}): CancellationRegistry {
  const delayMs = opts?.escalationDelayMs ?? SIGKILL_ESCALATION_MS;
  const emitEvent = opts?.emitEvent;
  const map = new Map<TaskId, RegistryEntry>();

  return {
    bind(taskId, subprocess) {
      // If an existing entry has a pending timer, cancel it (rebind clears old state).
      const existing = map.get(taskId);
      if (existing?.escalationTimer !== undefined) {
        clearTimeout(existing.escalationTimer);
      }
      map.set(taskId, { subprocess });
    },

    unbind(taskId) {
      const entry = map.get(taskId);
      if (entry?.escalationTimer !== undefined) {
        clearTimeout(entry.escalationTimer);
      }
      map.delete(taskId);
    },

    lookup(taskId) {
      return map.get(taskId)?.subprocess;
    },

    killWithEscalation(taskId, signal) {
      const entry = map.get(taskId);
      if (entry === undefined) return false;

      entry.subprocess.kill(signal);

      if (signal === "SIGTERM") {
        const timer = setTimeout(() => {
          // Re-check: if unbind raced the timer, entry may be gone.
          const current = map.get(taskId);
          if (current === undefined) return;
          current.subprocess.kill("SIGKILL");
          emitEvent?.(taskId, { kind: "subprocess_killed", signal: "SIGKILL", taskId });
        }, delayMs);

        // unref: timer must not prevent Node.js from exiting once work is done.
        if (typeof timer.unref === "function") timer.unref();

        entry.escalationTimer = timer;
      }

      return true;
    },

    size() {
      return map.size;
    },
  };
}
