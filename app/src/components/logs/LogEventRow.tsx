/**
 * LogEventRow — discriminated-union switch over LogEvent.kind, with per-kind
 * sub-renderers colocated in this file.
 *
 * Spec: 05-logs.md §Design > Event rendering rules
 */

import type { JSX } from "react";
import { useState } from "react";
import { Link } from "react-router";
import type { LogEvent } from "@/lib/types";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import { resolveDocLink } from "@/lib/docLink";
import { TaskStatusChip } from "@/components/tasks/TaskStatusChip";
import { toolPreview } from "./toolPreview";
import { resultPreview } from "./resultPreview";

// ── Narrow reasoning event types ─────────────────────────────────────────────
// The LogEvent union has one reasoning arm with subkind: "thinking" | "message".
// We cast to these local intersections after narrowing on subkind.

type ReasoningEvent = Extract<LogEvent, { kind: "reasoning" }>;
type ReasoningThinkingEvent = ReasoningEvent & { subkind: "thinking" };
type ReasoningMessageEvent = ReasoningEvent & { subkind: "message" };

// ── Timestamp helper ────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  } catch {
    return "--:--:--";
  }
}

// ── Row shell ───────────────────────────────────────────────────────────────

interface RowShellProps {
  timestamp: string;
  glyph: string;
  glyphColor?: string;
  children: React.ReactNode;
  /** Optional background override for banner rows. */
  bannerBg?: string;
  onClick?: () => void;
  clickable?: boolean;
}

function RowShell({
  timestamp,
  glyph,
  glyphColor,
  children,
  bannerBg,
  onClick,
  clickable,
}: RowShellProps): JSX.Element {
  return (
    <div
      className={`flex gap-2 px-4 py-1 text-xs leading-relaxed${clickable ? " cursor-pointer hover:bg-[color:var(--color-surface-sunken)]" : ""}`}
      style={bannerBg ? { backgroundColor: bannerBg } : undefined}
      onClick={onClick}
    >
      {/* Timestamp gutter */}
      <span className="w-[5.5rem] flex-shrink-0 font-mono text-[color:var(--color-faint)] select-none">
        {formatTime(timestamp)}
      </span>
      {/* Glyph */}
      <span
        className="w-4 flex-shrink-0 font-mono select-none text-center"
        style={glyphColor ? { color: glyphColor } : { color: "var(--color-muted)" }}
      >
        {glyph}
      </span>
      {/* Body */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ── CallId badge ─────────────────────────────────────────────────────────────

function CallIdBadge({ id }: { id: string }): JSX.Element {
  return (
    <span className="ml-auto pl-2 font-mono text-[10px] text-[color:var(--color-faint)] flex-shrink-0 select-none">
      {id.slice(0, 8)}
    </span>
  );
}

// ── Expand toggle chevron ────────────────────────────────────────────────────

function Chevron({ expanded }: { expanded: boolean }): JSX.Element {
  return (
    <span className="font-mono text-[color:var(--color-faint)]">
      {expanded ? "▾" : "▸"}
    </span>
  );
}

// ── Per-kind sub-renderers ───────────────────────────────────────────────────

// reasoning / message
function ReasoningMessageRow({ event }: { event: ReasoningMessageEvent }): JSX.Element {
  return (
    <RowShell timestamp={event.at} glyph="" glyphColor="var(--color-muted)">
      <div className="rounded border border-[color:var(--color-border)] px-3 py-2 bg-[color:var(--color-surface-raised)]">
        <MarkdownBody raw={event.text} resolveDocLink={resolveDocLink} />
      </div>
    </RowShell>
  );
}

// reasoning / thinking
function ReasoningThinkingRow({ event }: { event: ReasoningThinkingEvent }): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  function handleClick(): void {
    setExpanded((v) => !v);
  }

  return (
    <RowShell
      timestamp={event.at}
      glyph="~"
      glyphColor="var(--color-faint)"
      clickable
      onClick={handleClick}
    >
      <span className="flex items-start gap-1 italic text-[color:var(--color-muted)]">
        <Chevron expanded={expanded} />
        {expanded ? (
          <div className="mt-1 not-italic">
            <MarkdownBody raw={event.text} resolveDocLink={resolveDocLink} />
          </div>
        ) : (
          <span className="truncate">{event.text.split("\n")[0]}</span>
        )}
      </span>
    </RowShell>
  );
}

// tool_call
function ToolCallRow({ event }: { event: Extract<LogEvent, { kind: "tool_call" }> }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const preview = toolPreview(event.toolName, event.arguments);

  let formattedArgs = event.arguments;
  try {
    formattedArgs = JSON.stringify(JSON.parse(event.arguments), null, 2);
  } catch {
    // keep raw
  }

  function handleClick(): void {
    setExpanded((v) => !v);
  }

  return (
    <RowShell
      timestamp={event.at}
      glyph="▸"
      glyphColor="var(--color-accent)"
      clickable
      onClick={handleClick}
    >
      <div className="flex items-start gap-2">
        <span className="flex items-center gap-1 min-w-0">
          <Chevron expanded={expanded} />
          <span className="font-medium text-[color:var(--color-fg)]">{event.toolName}</span>
          {preview && (
            <span className="truncate text-[color:var(--color-muted)]">{preview}</span>
          )}
        </span>
        <CallIdBadge id={event.callId} />
      </div>
      {expanded && (
        <pre className="mt-1 overflow-x-auto rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface-sunken)] p-2 text-[11px] whitespace-pre-wrap text-[color:var(--color-fg)]">
          {formattedArgs}
        </pre>
      )}
    </RowShell>
  );
}

// tool_result
function ToolResultRow({ event }: { event: Extract<LogEvent, { kind: "tool_result" }> }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const preview = resultPreview(event.body);
  const isError = event.status === "error";

  function handleClick(): void {
    setExpanded((v) => !v);
  }

  return (
    <RowShell
      timestamp={event.at}
      glyph="◂"
      glyphColor={isError ? "var(--color-danger)" : "var(--color-success)"}
      clickable
      onClick={handleClick}
    >
      <div className="flex items-start gap-2">
        <span className="flex items-center gap-1 min-w-0">
          <Chevron expanded={expanded} />
          <span
            className="font-medium"
            style={{ color: isError ? "var(--color-danger)" : "var(--color-success)" }}
          >
            {event.status}
          </span>
          {event.durationMs !== undefined && (
            <span className="text-[color:var(--color-faint)]">
              · {String(event.durationMs)}ms
            </span>
          )}
          {preview && (
            <span className="truncate text-[color:var(--color-muted)]">· {preview}</span>
          )}
        </span>
        <CallIdBadge id={event.callId} />
      </div>
      {expanded && (
        <pre className="mt-1 overflow-x-auto rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface-sunken)] p-2 text-[11px] whitespace-pre-wrap text-[color:var(--color-fg)]">
          {event.body}
        </pre>
      )}
    </RowShell>
  );
}

// artifact
function ArtifactRow({ event }: { event: Extract<LogEvent, { kind: "artifact" }> }): JSX.Element {
  const glyph =
    event.artifactKind === "version_committed"
      ? "✓"
      : event.artifactKind === "doc_updated"
      ? "~"
      : "+";

  const pathEl = event.docNodeId ? (
    <Link
      to={`/docs/${encodeURIComponent(event.docNodeId)}`}
      className="font-mono text-[color:var(--color-accent)] hover:underline"
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {event.path}
    </Link>
  ) : (
    <span className="font-mono text-[color:var(--color-fg)]">{event.path}</span>
  );

  return (
    <RowShell
      timestamp={event.at}
      glyph={glyph}
      glyphColor="var(--color-success)"
    >
      <span className="flex flex-wrap items-center gap-1">
        artifact{" "}
        {pathEl}
        <span className="text-[color:var(--color-faint)]">
          ({event.artifactKind})
        </span>
        {event.summary && (
          <span className="text-[color:var(--color-muted)]">— {event.summary}</span>
        )}
      </span>
    </RowShell>
  );
}

function StatusChangeRow({ event }: { event: Extract<LogEvent, { kind: "status_change" }> }): JSX.Element {
  return (
    <RowShell
      timestamp={event.at}
      glyph="◆"
      glyphColor="var(--color-warning)"
      bannerBg="var(--color-warning-soft)"
    >
      <div className="flex flex-wrap items-center gap-1">
        {event.from !== undefined && (
          <>
            <TaskStatusChip status={event.from} />
            <span className="text-[color:var(--color-muted)]">→</span>
          </>
        )}
        <TaskStatusChip status={event.to} />
        {event.reason && (
          <span className="mt-0.5 w-full text-[color:var(--color-muted)]">
            {event.reason}
          </span>
        )}
      </div>
    </RowShell>
  );
}

// error
function ErrorRow({ event }: { event: Extract<LogEvent, { kind: "error" }> }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const hasStack = Boolean(event.stack);

  function handleClick(): void {
    setExpanded((v) => !v);
  }

  return (
    <RowShell
      timestamp={event.at}
      glyph="!"
      glyphColor="var(--color-danger)"
      bannerBg="var(--color-danger-soft)"
      clickable={hasStack}
      onClick={hasStack ? handleClick : undefined}
    >
      <div>
        <span className="flex items-center gap-1">
          {hasStack && <Chevron expanded={expanded} />}
          <span className="font-semibold text-[color:var(--color-danger)]">
            {event.message}
          </span>
        </span>
        {expanded && event.stack && (
          <pre className="mt-1 overflow-x-auto rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface-sunken)] p-2 text-[11px] whitespace-pre-wrap text-[color:var(--color-fg)]">
            {event.stack}
          </pre>
        )}
      </div>
    </RowShell>
  );
}

// ── Main dispatcher ──────────────────────────────────────────────────────────

interface LogEventRowProps {
  event: LogEvent;
}

export function LogEventRow({ event }: LogEventRowProps): JSX.Element {
  switch (event.kind) {
    case "reasoning":
      if (event.subkind === "thinking") {
        return <ReasoningThinkingRow event={event as ReasoningThinkingEvent} />;
      }
      return <ReasoningMessageRow event={event as ReasoningMessageEvent} />;

    case "tool_call":
      return <ToolCallRow event={event} />;

    case "tool_result":
      return <ToolResultRow event={event} />;

    case "artifact":
      return <ArtifactRow event={event} />;

    case "status_change":
      return <StatusChangeRow event={event} />;

    case "error":
      return <ErrorRow event={event} />;
  }
}
