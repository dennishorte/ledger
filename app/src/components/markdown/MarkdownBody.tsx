/**
 * MarkdownBody — project-wide markdown rendering pipeline.
 *
 * Spec: docs/01-ui/08-markdown.md
 * Pipeline: remark-gfm → rehype-slug → rehype-autolink-headings
 *
 * Public surface is exactly { raw, resolveDocLink?, className? }.
 * No escape-hatch `components` prop (spec D6).
 */

import type { JSX } from "react";
import { useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { Link } from "react-router";
import { cn } from "@/lib/cn";
import styles from "./prose.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────

/** Pattern for inline-code values that look like project doc paths. */
const DOC_PATH_RE = /^docs\/[^\s`]+\.md$/;

/** Returns true if the href is absolute (http/https/protocol-relative). */
function isExternal(href: string): boolean {
  return href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("//");
}

// ── rehype-autolink-headings options ───────────────────────────────────────
// behavior: 'prepend' — inserts the anchor BEFORE the heading text.
// The anchor gets className "anchor" for the hover-reveal CSS rule.

const autolinkOptions = {
  behavior: "prepend" as const,
  properties: { className: ["anchor"], ariaHidden: true, tabIndex: -1 },
  content: { type: "text" as const, value: "#" },
};

// ── Plugin arrays (stable references — defined outside component) ──────────

// PluggableList is from "unified" (transitive dep) — use Parameters to extract
// the expected type from react-markdown's Options rather than importing unified directly.
type ReactMarkdownOptions = Parameters<typeof Markdown>[0];
type PluggableList = NonNullable<ReactMarkdownOptions["remarkPlugins"]>;

const remarkPlugins: PluggableList = [remarkGfm];
const rehypePlugins: PluggableList = [
  rehypeSlug,
  [rehypeAutolinkHeadings, autolinkOptions],
];

// ── Component ──────────────────────────────────────────────────────────────

export function MarkdownBody({
  raw,
  resolveDocLink,
  className,
}: MarkdownBodyProps): JSX.Element {
  /**
   * Build the components map. Memoised on resolveDocLink identity so
   * react-markdown doesn't re-parse the tree on every parent render.
   */
  const components = useMemo(
    () =>
      buildComponents(resolveDocLink),
    [resolveDocLink],
  );

  return (
    <div className={cn(styles.prose, className)}>
      <Markdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {raw}
      </Markdown>
    </div>
  );
}

// ── Component overrides factory ────────────────────────────────────────────

type ResolveDocLink = MarkdownBodyProps["resolveDocLink"];

function buildComponents(resolveDocLink: ResolveDocLink) {
  return {
    // ── Links ──────────────────────────────────────────────────────────────
    a({
      href,
      children,
      ...rest
    }: React.ComponentPropsWithoutRef<"a">): JSX.Element {
      const h = href ?? "";

      if (isExternal(h)) {
        return (
          <a
            {...rest}
            href={h}
            target="_blank"
            rel="noreferrer noopener"
          >
            {children}
          </a>
        );
      }

      if (resolveDocLink) {
        const route = resolveDocLink(h);
        if (route !== null) {
          return <Link to={route}>{children}</Link>;
        }
      }

      // Fallback: plain anchor (null resolver or resolver returned null)
      return (
        <a {...rest} href={h}>
          {children}
        </a>
      );
    },

    // ── Inline code (D3) ───────────────────────────────────────────────────
    // react-markdown v10 calls this component for both inline and block code.
    // Block code is detected by the presence of a language className or a
    // trailing newline in children (fenced blocks always end with \n).
    // When it's block code, we render plain <code> — the <pre> override
    // applies the block styling.
    code({
      className: codeClass,
      children,
      node: _node,
      ...rest
    }: React.ComponentPropsWithoutRef<"code"> & { node?: unknown }): JSX.Element {
      // children from react-markdown code spans is always a string primitive
      const text = typeof children === "string" ? children : "";

      // Block code: has a language class OR ends with a newline (fenced block)
      const isBlock =
        (typeof codeClass === "string" && codeClass.startsWith("language-")) ||
        text.endsWith("\n");

      if (isBlock) {
        // Pass through — <pre> override handles block-level styling
        return (
          <code className={codeClass} {...rest}>
            {children}
          </code>
        );
      }

      // Inline code: check for doc-path pattern when resolver is present
      if (resolveDocLink && DOC_PATH_RE.test(text)) {
        const route = resolveDocLink(text);
        if (route !== null) {
          return (
            <Link to={route}>
              <code className={codeClass} {...rest}>
                {children}
              </code>
            </Link>
          );
        }
      }

      // Plain inline code
      return (
        <code className={codeClass} {...rest}>
          {children}
        </code>
      );
    },

    // ── Block code wrapper ─────────────────────────────────────────────────
    // prose.module.css handles all <pre> styling; this is a pass-through.
    pre({
      children,
      ...rest
    }: React.ComponentPropsWithoutRef<"pre">): JSX.Element {
      return <pre {...rest}>{children}</pre>;
    },

    // ── Images ────────────────────────────────────────────────────────────
    img({
      src,
      alt,
      ...rest
    }: React.ComponentPropsWithoutRef<"img">): JSX.Element {
      return <img src={src} alt={alt ?? ""} loading="lazy" {...rest} />;
    },
  } as const;
}
