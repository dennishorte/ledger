/**
 * DocViewer — sticky-header + body for a single doc node.
 *
 * Three display states:
 *   1. Authored node  → sticky header + <MarkdownBody> with doc-aware link resolver
 *   2. Manifest-only  → sticky header + inline placeholder (id, deps, declared status)
 *   3. Unknown id     → 404 EmptyState
 *
 * Spec: docs/01-ui/03-docs.md §Design > Routes & layout (/docs/:nodeId)
 *       docs/01-ui/03-docs.md §Design > Markdown rendering
 *       Decisions D8, D9, D10
 *
 * Anchor contract: rehype-slug produces `open-issues` for `## Open Issues`.
 * Do NOT rename headings or alter rehype-slug config — 06-health depends on it.
 */

import type { JSX } from "react";
import { Link } from "react-router";
import { ChevronLeft } from "lucide-react";
import type { DocNode, DocSource } from "@/lib/types";
import { resolveDocLink } from "@/lib/docLink";
import { StatusChip } from "@/components/ui/StatusChip";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import { EmptyState } from "@/components/layout/EmptyState";
import { FileSearch } from "lucide-react";

// ── Sticky header ──────────────────────────────────────────────────────────

interface ViewerHeaderProps {
  node: DocNode;
  isManifestOnly: boolean;
}

function ViewerHeader({ node, isManifestOnly }: ViewerHeaderProps): JSX.Element {
  return (
    <header
      className="sticky top-0 z-10 border-b border-[color:var(--color-border)] px-6 py-3"
      style={{ backgroundColor: "var(--color-surface-raised)" }}
    >
      {/* Back link */}
      <Link
        to="/docs"
        className="mb-2 inline-flex items-center gap-1 text-xs text-[color:var(--color-muted)] hover:text-[color:var(--color-fg)] transition-colors"
      >
        <ChevronLeft className="h-3 w-3" aria-hidden />
        Back to all documents
      </Link>

      {/* id + status row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs text-[color:var(--color-muted)]">
          {node.id}
        </span>
        <StatusChip status={node.status} />
        {isManifestOnly && (
          <span className="text-xs italic text-[color:var(--color-muted)]">
            Manifest-only — no authored doc yet
          </span>
        )}
      </div>

      {/* Title */}
      <h1 className="mt-0.5 text-base font-semibold text-[color:var(--color-fg)]">
        {node.title}
      </h1>

      {/* Meta row: parent + source */}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[color:var(--color-muted)]">
        {node.parentId !== null && (
          <span>
            parent:{" "}
            <Link
              to={`/docs/${encodeURIComponent(node.parentId)}`}
              className="text-[color:var(--color-accent)] hover:underline"
            >
              {node.parentId}
            </Link>
          </span>
        )}
        {node.source !== undefined && (
          <span className="font-mono">
            source: {node.source.replace(/.*\/docs\//, "docs/")}
          </span>
        )}
      </div>
    </header>
  );
}

// ── Manifest-only body ─────────────────────────────────────────────────────

interface ManifestBodyProps {
  node: DocNode;
}

function ManifestBody({ node }: ManifestBodyProps): JSX.Element {
  return (
    <div className="px-6 py-8 max-w-2xl">
      <p className="mb-6 text-sm text-[color:var(--color-muted)]">
        This node is declared in the parent manifest but has no authored
        document yet.
      </p>

      <table className="text-sm border-collapse w-full">
        <tbody>
          <tr className="border-b border-[color:var(--color-border)]">
            <th className="py-2 pr-4 text-left font-medium text-[color:var(--color-muted)] w-32">
              ID
            </th>
            <td className="py-2 font-mono text-xs text-[color:var(--color-fg)]">
              {node.id}
            </td>
          </tr>
          <tr className="border-b border-[color:var(--color-border)]">
            <th className="py-2 pr-4 text-left font-medium text-[color:var(--color-muted)]">
              Title
            </th>
            <td className="py-2 text-[color:var(--color-fg)]">{node.title}</td>
          </tr>
          <tr className="border-b border-[color:var(--color-border)]">
            <th className="py-2 pr-4 text-left font-medium text-[color:var(--color-muted)]">
              Status
            </th>
            <td className="py-2">
              <StatusChip status={node.status} />
            </td>
          </tr>
          {node.dependsOn.length > 0 && (
            <tr className="border-b border-[color:var(--color-border)]">
              <th className="py-2 pr-4 text-left font-medium text-[color:var(--color-muted)] align-top">
                Depends on
              </th>
              <td className="py-2">
                <ul className="space-y-1 list-none p-0 m-0">
                  {node.dependsOn.map((dep) => (
                    <li key={dep}>
                      <Link
                        to={`/docs/${encodeURIComponent(dep)}`}
                        className="font-mono text-xs text-[color:var(--color-accent)] hover:underline"
                      >
                        {dep}
                      </Link>
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          )}
          {node.parentId !== null && (
            <tr>
              <th className="py-2 pr-4 text-left font-medium text-[color:var(--color-muted)]">
                Parent
              </th>
              <td className="py-2">
                <Link
                  to={`/docs/${encodeURIComponent(node.parentId)}`}
                  className="font-mono text-xs text-[color:var(--color-accent)] hover:underline"
                >
                  {node.parentId}
                </Link>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface DocViewerProps {
  /** Resolved node metadata (undefined = unknown id → 404). */
  node: DocNode | undefined;
  /** Raw markdown payload (undefined for manifest-only or 404). */
  source: DocSource | undefined;
}

/**
 * The sticky header height for this viewer is approximately 120px with the
 * full meta row visible. If it grows taller (wrapping), anchors may slip.
 * Override `--prose-scroll-margin-top` here when the header height changes.
 */
const SCROLL_MARGIN = "120px";

export function DocViewer({ node, source }: DocViewerProps): JSX.Element {
  // ── 404 ──────────────────────────────────────────────────────────────────
  if (node === undefined) {
    return (
      <EmptyState
        icon={FileSearch}
        title="404 — document not found."
        description="This node id is not in the project doc tree."
        actions={
          <Link
            to="/docs"
            className="text-sm text-[color:var(--color-accent)] hover:underline"
          >
            Back to all documents
          </Link>
        }
      />
    );
  }

  const isManifestOnly = !node.authored;

  // ── Authored viewer ───────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ViewerHeader node={node} isManifestOnly={isManifestOnly} />

      <div className="flex-1 overflow-y-auto">
        {isManifestOnly ? (
          <ManifestBody node={node} />
        ) : source !== undefined ? (
          <div
            className="px-6 py-6 max-w-4xl"
            // Override scroll-margin-top so fragment jumps land below the
            // sticky header. Spec callout #4. (CSS property via inline style.)
            style={
              { "--prose-scroll-margin-top": SCROLL_MARGIN } as React.CSSProperties
            }
          >
            <MarkdownBody raw={source.raw} resolveDocLink={resolveDocLink} />
          </div>
        ) : (
          /* Authored node whose glob didn't resolve — shouldn't happen,
             but degrade gracefully rather than crashing. */
          <EmptyState
            icon={FileSearch}
            title="Markdown source unavailable."
            description="The doc file could not be loaded at build time."
          />
        )}
      </div>
    </div>
  );
}
