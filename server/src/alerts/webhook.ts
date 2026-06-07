/**
 * Outbound webhook delivery for the algedonic channel (08-alerts).
 *
 * Fire-and-forget POST of the Alert JSON to a configured URL. Per D4, delivery
 * must never block or fail the scheduler tick: a 5 s timeout bounds the request
 * and every failure is logged, never thrown.
 */

import type { Alert } from "@ledger/parser";

const WEBHOOK_TIMEOUT_MS = 5_000;

/**
 * POST the alert to `url`. Resolves on success or after logging a failure;
 * never rejects. Callers `void`-fire this — they must not await it on the
 * publish hot path.
 */
export async function postWebhook(url: string, alert: Alert): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(alert),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(
        `alerts: webhook POST to ${url} returned ${String(res.status)} for task ${alert.taskId}`,
      );
    }
  } catch (e) {
    console.warn(
      `alerts: webhook POST to ${url} failed for task ${alert.taskId}: ${(e as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
