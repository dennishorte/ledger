import type { JSX } from "react";
import { useParams } from "react-router";
import { useDocGraph } from "@/components/dag/useDocGraph";
import { useDocSource } from "@/components/docs/useDocSource";
import { DocViewer } from "@/components/docs/DocViewer";

/**
 * /docs/:nodeId — single document viewer.
 *
 * Resolves the node from the live API doc graph and the raw source from
 * GET /api/docs/:nodeId/source, then delegates rendering to <DocViewer>.
 *
 * URL encoding: `/docs/01-ui%2F02-dag` — already established by the DAG
 * inspector's "Open document" link; useParams returns the decoded value.
 *
 * Spec: docs/01-ui/03-docs.md
 */

export default function DocViewerPanel(): JSX.Element {
  const { nodeId } = useParams<{ nodeId: string }>();
  const id = nodeId ?? "";

  const nodes = useDocGraph();
  const node = nodes.find((n) => n.id === id);
  const source = useDocSource(id);

  return <DocViewer node={node} source={source} />;
}
