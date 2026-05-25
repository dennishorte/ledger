/**
 * Golden test: every LogEvent.kind present in the sample fixture renders
 * without throwing.
 *
 * Spec: 05-logs.md §Verification item 9
 *
 * This test uses synthetic LogEvent objects (one per kind/subkind) rather than
 * re-running the server-side parser, which is covered by transcriptParse.test.ts.
 * The fixture's kinds are: reasoning/message, reasoning/thinking, tool_call,
 * tool_result (ok + error), artifact (file_written, doc_created, doc_updated,
 * version_committed), status_change, error.
 *
 * parseDocs.ts uses import.meta.glob which is not available in jsdom test
 * environments — we mock @/lib/docLink to a simple identity resolver so the
 * component tree renders without the build-time glob dependency.
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { LogEvent } from "@/lib/types";

// Mock docLink before importing LogEventRow so parseDocs.ts (which uses
// import.meta.glob) is never loaded in the test environment.
vi.mock("@/lib/docLink", () => ({
  resolveDocLink: (href: string) => `/docs/${href}`,
}));

// Also mock parseDocs since it's referenced transitively and uses import.meta.glob
vi.mock("@/lib/parseDocs", () => ({
  idForPath: () => null,
  loadDocNodes: () => [],
}));

// Import after mocking
const { LogEventRow } = await import("./LogEventRow");

// Helper: wrap in MemoryRouter since LogEventRow uses <Link>
function renderRow(event: LogEvent) {
  const { container } = render(
    <MemoryRouter>
      <LogEventRow event={event} />
    </MemoryRouter>,
  );
  return container;
}

const BASE = {
  id: "evt-001",
  taskId: "task-abc",
  at: "2026-05-24T10:00:05.000Z",
  seq: 1,
};

describe("LogEventRow golden test — all kinds render without throwing", () => {
  it("reasoning/message renders markdown body", () => {
    const event: LogEvent = {
      ...BASE,
      kind: "reasoning",
      subkind: "message",
      text: "I will read the spec first.\n\n```ts\nconst x = 1;\n```",
    };
    const container = renderRow(event);
    expect(container.firstChild).toBeTruthy();
  });

  it("reasoning/thinking renders collapsed by default", () => {
    const event: LogEvent = {
      ...BASE,
      seq: 2,
      kind: "reasoning",
      subkind: "thinking",
      text: "Let me think about the approach for the middleware.",
    };
    const container = renderRow(event);
    expect(container.textContent).toContain("~");
  });

  it("tool_call (Read) renders tool name and preview", () => {
    const event: LogEvent = {
      ...BASE,
      seq: 3,
      kind: "tool_call",
      callId: "tool_abc",
      toolName: "Read",
      arguments: JSON.stringify({ file_path: "docs/01-ui/10-orchestration.md" }),
    };
    const container = renderRow(event);
    expect(container.textContent).toContain("Read");
    expect(container.textContent).toContain("docs/01-ui/10-orchestration.md");
  });

  it("tool_call (Write) renders tool name and file path preview", () => {
    const event: LogEvent = {
      ...BASE,
      seq: 4,
      kind: "tool_call",
      callId: "tool_bcd",
      toolName: "Write",
      arguments: JSON.stringify({ file_path: "app/src/lib/types.ts", content: "// types content" }),
    };
    const container = renderRow(event);
    expect(container.textContent).toContain("Write");
  });

  it("tool_call (Bash) renders command preview", () => {
    const event: LogEvent = {
      ...BASE,
      seq: 5,
      kind: "tool_call",
      callId: "tool_bash",
      toolName: "Bash",
      arguments: JSON.stringify({ command: "pnpm -C app typecheck" }),
    };
    const container = renderRow(event);
    expect(container.textContent).toContain("Bash");
    expect(container.textContent).toContain("pnpm -C app typecheck");
  });

  it("tool_result (ok) renders status", () => {
    const event: LogEvent = {
      ...BASE,
      seq: 6,
      kind: "tool_result",
      callId: "tool_abc",
      status: "ok",
      body: "# Orchestration Data Layer\n**Status:** APPROVED\n...",
      durationMs: 150,
    };
    const container = renderRow(event);
    expect(container.textContent).toContain("ok");
    expect(container.textContent).toContain("150ms");
  });

  it("tool_result (error) renders error styling", () => {
    const event: LogEvent = {
      ...BASE,
      seq: 7,
      kind: "tool_result",
      callId: "tool_err",
      status: "error",
      body: "File not found",
    };
    const container = renderRow(event);
    expect(container.textContent).toContain("error");
  });

  it("artifact (file_written) renders + glyph and path", () => {
    const event: LogEvent = {
      ...BASE,
      seq: 8,
      kind: "artifact",
      artifactKind: "file_written",
      path: "app/src/lib/types.ts",
    };
    const container = renderRow(event);
    expect(container.textContent).toContain("+");
    expect(container.textContent).toContain("app/src/lib/types.ts");
    expect(container.textContent).toContain("file_written");
  });

  it("artifact (doc_created) renders + glyph", () => {
    const event: LogEvent = {
      ...BASE,
      seq: 9,
      kind: "artifact",
      artifactKind: "doc_created",
      path: "docs/01-ui/05-logs.md",
    };
    const container = renderRow(event);
    expect(container.textContent).toContain("+");
    expect(container.textContent).toContain("doc_created");
  });

  it("artifact (doc_updated) renders ~ glyph", () => {
    const event: LogEvent = {
      ...BASE,
      seq: 10,
      kind: "artifact",
      artifactKind: "doc_updated",
      path: "docs/01-ui/00-ui.md",
      summary: "Status bump",
    };
    const container = renderRow(event);
    expect(container.textContent).toContain("~");
    expect(container.textContent).toContain("doc_updated");
    expect(container.textContent).toContain("Status bump");
  });

  it("artifact (version_committed) renders ✓ glyph", () => {
    const event: LogEvent = {
      ...BASE,
      seq: 11,
      kind: "artifact",
      artifactKind: "version_committed",
      path: "docs/01-ui/05-logs.md",
    };
    const container = renderRow(event);
    expect(container.textContent).toContain("✓");
    expect(container.textContent).toContain("version_committed");
  });

  it("artifact with docNodeId renders a link", () => {
    const event: LogEvent = {
      ...BASE,
      seq: 12,
      kind: "artifact",
      artifactKind: "doc_created",
      path: "docs/01-ui/05-logs.md",
      docNodeId: "01-ui/05-logs",
    };
    const container = renderRow(event);
    const link = container.querySelector("a");
    expect(link).toBeTruthy();
    expect(link?.getAttribute("href")).toContain("01-ui%2F05-logs");
  });

  it("status_change renders from → to banner", () => {
    const event: LogEvent = {
      ...BASE,
      seq: 13,
      kind: "status_change",
      from: "PENDING",
      to: "RUNNING",
      reason: "Session started",
    };
    const container = renderRow(event);
    expect(container.textContent).toContain("PENDING");
    expect(container.textContent).toContain("RUNNING");
    expect(container.textContent).toContain("Session started");
  });

  it("error renders message bold in danger banner", () => {
    const event: LogEvent = {
      ...BASE,
      seq: 14,
      kind: "error",
      message: "Rate limit exceeded",
    };
    const container = renderRow(event);
    expect(container.textContent).toContain("Rate limit exceeded");
  });

  it("error with stack renders expandable", () => {
    const event: LogEvent = {
      ...BASE,
      seq: 15,
      kind: "error",
      message: "Unexpected error",
      stack: "Error: Unexpected error\n  at foo (bar.ts:1:1)",
    };
    const container = renderRow(event);
    expect(container.textContent).toContain("Unexpected error");
  });
});
