/**
 * useAlertStream (08-alerts) — subscribes to the app-lifetime algedonic alert
 * stream and exposes the non-dismissed alerts for the always-mounted banner.
 *
 * - Opens an EventSource on /api/alerts/stream (Vite proxies to the API).
 * - Backfills recent alerts via the browser's automatic Last-Event-ID resume
 *   (the server replays its ring buffer for seq > Last-Event-ID).
 * - Dedups by seq; tracks a per-session dismissed-seq Set so a dismissed alert
 *   never reappears on reconnect or navigation.
 *
 * Unlike useLogStream this stream has no terminal state — it lives as long as
 * the app is open — so there is no "ended"/auto-close handling.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { Alert } from "./types.js";

export interface UseAlertStreamResult {
  /** Alerts received this session, minus dismissed ones, newest last. */
  active: Alert[];
  /** Hide an alert by seq; persists for the session. */
  dismiss: (seq: number) => void;
}

export function useAlertStream(): UseAlertStreamResult {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(() => new Set());
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/alerts/stream");
    esRef.current = es;

    es.onmessage = (evt: MessageEvent<string>) => {
      try {
        const alert = JSON.parse(evt.data) as Alert;
        setAlerts((prev) => {
          if (prev.some((a) => a.seq === alert.seq)) return prev;
          return [...prev, alert];
        });
      } catch {
        // Malformed SSE frame — skip.
      }
    };

    // EventSource reconnects automatically; no manual error handling needed
    // (a dropped frame is re-backfilled via Last-Event-ID on reconnect).

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  const dismiss = useCallback((seq: number) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(seq);
      return next;
    });
  }, []);

  const active = alerts.filter((a) => !dismissed.has(a.seq));

  return { active, dismiss };
}
