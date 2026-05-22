# Markdown Rendering Pipeline

**Node ID:** `01-ui/08-markdown`
**Parent:** `01-ui`
**Status:** VERIFY
**Created:** 2026-05-22
**Last Updated:** 2026-05-22

---

## Requirements

Provide a single, project-wide React component — `<MarkdownBody>` — that renders project markdown with consistent styling, GFM support, heading anchors, and host-resolvable cross-document links. This node owns the markdown rendering pipeline; any panel that needs to display markdown consumes it.

Extracted from `01-ui/03-docs` because markdown rendering is shared infrastructure: the doc viewer is the first consumer, but the replay-mode panel will render prior versions of doc bodies, the tasks/issues panel will render markdown-bodied task notes, and the logs panel may render markdown artifacts. Encapsulating the pipeline avoids each panel re-deriving the same plugin set, component overrides, and typography.

Concrete requirements:

1. Render full GFM: tables, task lists, strikethrough, autolinks, fenced code, blockquotes, ordered/unordered lists.
2. Every `h2` and `h3` gets a slugified `id`, and a hover-revealed `#` anchor link. Deep-linking to `/foo#section-slug` scrolls to the heading.
3. **Caller-supplied link resolver.** The component accepts an optional `resolveDocLink(href: string) => string | null` prop. When the resolver returns a non-null route path, the renderer emits a React Router `<Link>` instead of a plain `<a>`. Applies to both markdown links (`[text](docs/foo.md)`) and inline code that looks like a project doc path (`` `docs/foo.md` `` — see D2).
4. External links (`http(s)://...`) render with `target="_blank" rel="noreferrer noopener"`.
5. Code fences render with monospaced styling and a subtle surface tone. **No syntax highlighting in v1** (see Open Issues).
6. All styling flows through existing cream-theme CSS variables in `globals.css`. No new tokens introduced unless a real gap exists; if a gap exists, fill it in `globals.css`, not in the component.
7. `pnpm typecheck` and `pnpm lint` continue to pass at zero output. `pnpm build` continues to succeed; bundle delta reported in Implementation Notes.

**Out of scope:**

- Doc-tree awareness, node-id resolution, parser logic. This node knows nothing about `DocNode`, `parseDocs.ts`, or `/docs/*` routes — those concerns live in the consumer.
- Syntax highlighting (shiki / rehype-highlight) — deferred.
- Math (KaTeX), mermaid diagrams, MDX, embeds. Add when a doc actually needs them.
- Editing, version history, diffs — read-only rendering only.

---

## Design

### Public surface

```ts
// src/components/markdown/MarkdownBody.tsx

export interface MarkdownBodyProps {
  /** Raw markdown source. */
  raw: string;
  /**
   * Optional resolver. When provided, the renderer calls this for every
   * `<a>` href and for every inline code value that matches the docs-path
   * shape. If it returns a non-null string, that string is used as a
   * React Router `<Link to={…}>` target; otherwise the element falls back
   * to a plain anchor (external) or plain `<code>` (inline code).
   */
  resolveDocLink?: (href: string) => string | null;
  /** Optional className applied to the root prose container. */
  className?: string;
}

export function MarkdownBody(props: MarkdownBodyProps): JSX.Element;
```

That is the entire public API. No `components`-override escape hatch is exposed; if a consumer needs a different render shape for a particular element, that's a future API extension.

### Pipeline

| Stage | Plugin | Purpose |
|---|---|---|
| remark | `remark-gfm` | GFM tables, task lists, strikethrough, autolinks |
| rehype | `rehype-slug` | Generate `id` attributes on headings from heading text |
| rehype | `rehype-autolink-headings` | Inject a hover-visible `#` link inside each heading, pointing at its own slug |

No `remark-frontmatter` — project docs encode metadata in markdown body text (`**Status:** …`), not YAML frontmatter, and metadata parsing is the consumer's job anyway.

### Component overrides

`react-markdown` accepts a `components` map. The renderer overrides:

- **`code`** (`inline === true`). If `resolveDocLink` is provided and the code text matches `/^docs\/[^\s`]+\.md$/`, call the resolver. On a non-null result, wrap in `<Link to={…}>`. On null or no resolver, render plain `<code>`. Block-level code (`pre > code`) is untouched.
- **`a`**. If the href is absolute (`http(s)://…` or `//…`), render `<a target="_blank" rel="noreferrer noopener">`. Otherwise call `resolveDocLink(href)` if provided; non-null → `<Link to={…}>`, null → plain `<a>`.
- **`h2`** and **`h3`**. Pass-through; `rehype-slug` has already set the `id`, and `rehype-autolink-headings` has injected the anchor child. Class names applied here for typography spacing.
- **`table`, `th`, `td`, `tr`, `thead`, `tbody`**. Tailwind classes for cream-theme borders, header background, cell padding.
- **`blockquote`**. Left border + muted foreground.
- **`pre`**. Background `--color-surface-sunken`, rounded, scroll-x, monospaced. No highlighter.
- **`ul`, `ol`, `li`**. Standard prose spacing; nested-list indent.
- **`img`**. Pass-through with `loading="lazy"`. No images in current docs; this is forward-looking.

### Components & files

```
src/components/markdown/
  MarkdownBody.tsx        // the component (above)
  prose.module.css        // typography rules tied to cream tokens, scoped to the root container class
                          // — OR inline @apply in MarkdownBody.tsx; pick one in Implementation Notes
```

A separate `DocLink` shim is not introduced as its own file — the link logic lives inside `MarkdownBody`'s `components.a` and `components.code` overrides. A shim would be premature abstraction; a single component reading two override callbacks is fine.

### Acceptance check (manual)

A reviewer runs the existing dev server, navigates to a host page that renders `<MarkdownBody raw={…} resolveDocLink={…} />` (the first such host is `01-ui/03-docs`'s `DocViewer`), and verifies:

1. GFM tables, task lists, strikethrough, fenced code all render with cream-theme styling.
2. Every `##` and `###` heading shows a hover-only `#` glyph; hovering reveals it; clicking adds the fragment to the URL.
3. A markdown link `[01-shell](docs/01-ui/01-shell.md)` becomes a React Router `<Link>` when the host supplies a resolver that maps that path. Clicking does not full-reload (Vite client connection stays open).
4. Same path inline-coded as `` `docs/01-ui/01-shell.md` `` also becomes a `<Link>`.
5. An external link `https://anthropic.com` renders with `target="_blank" rel="noreferrer noopener"`.
6. A relative link whose resolver returns `null` falls back to a plain `<a>` (and a malformed inline-code path renders as plain `<code>` — no console error, no thrown exception).
7. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` all exit zero.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Sibling under `01-ui`, not child of `01-ui/03-docs` | Markdown rendering is shared infra. Replay mode, tasks/issues, and logs are all likely consumers. Sibling placement makes the dep explicit on the DAG, lets the node be implemented in parallel with `03-docs` in its own worktree, and avoids re-extracting later when the second consumer arrives. |
| D2 | Caller-supplied `resolveDocLink` callback — no parser or `DocNode` import | Keeps this node generic. The doc-tree-specific path → id resolution lives in `03-docs` via `parseDocs.ts`. This component knows only "given an href or code string, ask the host whether it's an internal route." Tasks/logs panels will pass different resolvers, or none. |
| D3 | Inline-code path detection (`` `docs/foo.md` ``) is honored when `resolveDocLink` is supplied | The existing project docs use backtick-wrapped paths as their cross-reference idiom rather than `[text](path)` markdown links. Mechanically honoring the idiom is more valuable than asking authors to migrate. |
| D4 | `rehype-autolink-headings` with `behavior: 'prepend'`, the `#` glyph hidden by default and revealed on `:hover` of the heading | Standard docs-site pattern (Stripe, GitHub README, MDN). The prepend variant keeps the heading text flush-left in the typographic grid; the hover affordance keeps the unhovered render clean. |
| D5 | No shiki / rehype-highlight in v1 | Project docs contain ~no inline code blocks today; shiki adds ~500 KB and a build-time async loader; rehype-highlight is lighter but still unjustified. Revisit when the API spec node or a similar code-heavy doc lands. Inherited from `03-docs` D2 — the deferral moves here with the renderer. |
| D6 | No `components`-override escape hatch in `MarkdownBodyProps` | Avoid premature API surface. If a future consumer needs a different render shape, either add a targeted prop (`renderCode?: …`) or fork the component — both better than a generic open-ended `components` prop that locks us into matching `react-markdown`'s shape forever. |
| D7 | Single `<MarkdownBody>` component, no separate `<DocLink>` shim file | Two callbacks (link, code) live inside the component as inline overrides. A separate `DocLink` file would be a one-line indirection. Add the file if and when the shim grows logic. |

---

## Open Issues

- **Syntax highlighting.** Pick shiki (build-time precise, heavier) or rehype-highlight (runtime hljs, lighter, less accurate) when the first code-heavy doc lands. *(Priority: LOW.)*
- **Prose styling location: `prose.module.css` vs `@apply` inside the component.** Tailwind v4's `@apply` story is still in beta. Decide during implementation; not blocking the spec. *(Priority: TRIVIAL.)*
- **Anchor scroll offset under sticky headers.** The `03-docs` viewer plans a sticky header; in-page fragment jumps will hide the target heading behind it. Solution is `scroll-margin-top` on `h2`/`h3`, sized to the sticky header height. Implementation lands here (the rule is a property of the heading override) rather than in the consumer. *(Priority: MEDIUM — make sure this is implemented at v1, not deferred.)*
- **Tailwind `@tailwindcss/typography` vs hand-rolled prose styling.** The typography plugin is the obvious default and looks fine in most projects, but its tokens don't compose with our cream theme out of the box, and customizing it back is more code than hand-rolling. Leaning hand-rolled. Decide in Implementation Notes. *(Priority: LOW.)*
- **Bundle delta budget.** Expect +~150–250 KB raw / +~50–80 KB gzip from `react-markdown` + `remark-gfm` + `rehype-slug` + `rehype-autolink-headings`. If actual is materially higher, audit before promoting to VERIFY. *(Priority: LOW.)*

---

## Implementation Notes

**Deps installed (pnpm, 2026-05-22):**
- `react-markdown@10.1.0`
- `remark-gfm@4.0.1`
- `rehype-slug@6.0.0`
- `rehype-autolink-headings@7.1.0`

**Prose-styling decision:** CSS module (`prose.module.css`) — chosen over `@apply` because Tailwind v4's `@apply` is flagged as beta in the spec's Open Issues and behaves inconsistently. The module gives clean scoping with no runtime overhead and is consistent with the project's existing convention (no `@apply` anywhere in the codebase before this node).

**Heading anchor implementation:** `rehype-autolink-headings` with `behavior: 'prepend'`, `className: ["anchor"]`. The `.anchor` rule in `prose.module.css` sets `opacity: 0` by default, revealing to `opacity: 1` on `h2:hover`/`h3:hover` via CSS. The anchor text is `#`.

**`scroll-margin-top`:** Applied to `h2` and `h3` via CSS variable `--prose-scroll-margin-top` (default 80px). Consumers can override at any ancestor: `style={{ "--prose-scroll-margin-top": "100px" }}`.

**Inline code block detection (D3):** In react-markdown v10 the `inline` prop was removed. Block code is detected in the `code` component override via: (a) `className.startsWith("language-")` for fenced code with a language tag, or (b) `children` being a string ending in `\n` (remark always appends `\n` to fenced code content). This heuristic is correct for all cases in the project docs. Block code renders as plain `<code>` inside `<pre>` (the `pre` CSS rule handles all styling); the doc-path resolver is skipped for block code.

**PluggableList import:** `unified` is a transitive dep, not directly installed. Rather than adding it as a direct dep, the type is extracted from react-markdown's own `Options` type via: `type PluggableList = NonNullable<Parameters<typeof Markdown>[0]["remarkPlugins"]>`. This avoids a phantom import.

**Temporary fixture route:** `/markdown-preview` → `src/routes/MarkdownPreviewPanel.tsx`. Exercises all acceptance criteria: GFM table, task list, strikethrough, fenced code, blockquote, headings with anchors, internal markdown link, inline-code doc path, external link, broken link with null resolver, malformed inline code. Marked TEMPORARY in both the route file and `router.tsx`. Remove when `01-ui/03-docs` ships `DocViewerPanel`.

**Bundle delta:** +171.72 kB raw / +53.51 kB gzip (baseline 684/221 kB → 855/275 kB). Within spec estimate (+50–80 kB gzip). The pre-existing chunk size warning (>500 kB) was present before this node; no threshold bump required.

**Deviations from spec:** None. All spec decisions (D1–D7) and all requirements are implemented as described. The `h2`/`h3` MEDIUM priority scroll-margin-top is implemented via CSS variable.

---

## Verification

When this node moves to `VERIFY`, the verifier confirms:

1. The Acceptance check list (1–7) passes against a host page rendering `<MarkdownBody>`. The first host is `03-docs/DocViewer`; if `03-docs` has not yet shipped, a temporary fixture page is acceptable and removed before promotion.
2. `<MarkdownBody>` with `resolveDocLink` omitted still renders correctly — every link is a plain `<a>`, no exceptions thrown. The component is usable without the resolver.
3. Heading slug ids are stable across renders (idempotent) and match the format `rehype-slug` produces (lowercase, hyphenated, punctuation-stripped).
4. `scroll-margin-top` on `h2`/`h3` is set to a value large enough that, when a consumer has a sticky header up to ~80 px tall, fragment jumps land below it. Implementation may parameterize this via a CSS variable so consumers can tune.
5. Bundle delta is reported. Build still succeeds with the existing warning threshold or, if the threshold is bumped, that bump is recorded in Implementation Notes.
6. `pnpm -C app typecheck`, `pnpm -C app lint`, `pnpm -C app build` exit zero.

---

## Children

None.
