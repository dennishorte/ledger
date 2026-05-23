import type { JSX } from "react";
import { DocsTree } from "@/components/docs/DocsTree";

/**
 * /docs — hierarchical index of all project DocNodes.
 *
 * Spec: docs/01-ui/03-docs.md
 */
export default function DocsPanel(): JSX.Element {
  return <DocsTree />;
}
