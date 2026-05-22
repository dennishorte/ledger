/**
 * TEMPORARY FIXTURE — added by 01-ui/08-markdown implementation.
 * Route: /markdown-preview
 *
 * Exercises every MarkdownBody feature for manual acceptance verification
 * per the spec's Acceptance check (08-markdown.md §Design).
 *
 * REMOVE before or during 01-ui/03-docs implementation (03-docs will
 * provide the real consumer — DocViewerPanel — at which point this route
 * is no longer needed).
 */

import type { JSX } from "react";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";

const SAMPLE = `
# Markdown Preview Fixture

A temporary page that exercises all \`<MarkdownBody>\` features.

## GFM features

### Strikethrough

~~crossed out~~ and **bold** and *italic*.

### Task list

- [x] Item one (done)
- [ ] Item two (pending)
- [ ] Item three

### Table

| Node | Status | Depends on |
|------|--------|------------|
| \`01-shell\` | COMPLETE | — |
| \`02-dag\` | COMPLETE | \`01-shell\` |
| \`08-markdown\` | VERIFY | \`01-shell\` |

### Fenced code (no syntax highlight in v1)

\`\`\`ts
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

### Blockquote

> The doc tree is the source of truth. If the code and a doc disagree,
> either the doc wins or the doc needs to be updated.

## Link behaviour

### Internal markdown link (resolver → route)

[01-shell doc](docs/01-ui/01-shell.md) — should render as a React Router Link.

### Inline-code doc path (D3 — resolver → route)

\`docs/01-ui/01-shell.md\` — should also resolve to a Link.

### External link (target="_blank")

[Anthropic](https://anthropic.com) — opens in new tab.

### Broken link (resolver returns null → plain anchor)

[broken](docs/nonexistent/nowhere.md) — falls back to \`<a>\`.

### Malformed inline code (no .md — plain code)

\`just-some-code\` — renders as plain \`<code>\`, no error.

## Headings with anchors

Hover any \`h2\` or \`h3\` heading on this page to see the \`#\` anchor.

### A third-level heading

Deep-linkable via fragment: \`#a-third-level-heading\`.
`;

/**
 * No-resolver fixture content — exercises Verification #2: every link
 * must render as a plain <a>, no exceptions, when resolveDocLink is omitted.
 */
const NO_RESOLVER_SAMPLE = `
## No-resolver mode

The component below renders the same link forms without a \`resolveDocLink\`
prop. Every link should fall through to a plain \`<a>\`; the inline-code path
should render as plain \`<code>\` (no link, no error).

- Markdown link: [01-shell doc](docs/01-ui/01-shell.md) — plain anchor.
- Inline code path: \`docs/01-ui/01-shell.md\` — plain code.
- External: [Anthropic](https://anthropic.com) — still opens in new tab.
`;

/** Simple resolver: maps known doc paths to fake routes for preview. */
function previewResolver(href: string): string | null {
  const map: Record<string, string> = {
    "docs/01-ui/01-shell.md": "/docs/01-ui/01-shell",
  };
  return map[href] ?? null;
}

export default function MarkdownPreviewPanel(): JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <MarkdownBody raw={SAMPLE} resolveDocLink={previewResolver} />
      <hr className="my-8 border-t border-[--color-border]" />
      <MarkdownBody raw={NO_RESOLVER_SAMPLE} />
    </div>
  );
}
