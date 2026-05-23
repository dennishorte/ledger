import type { JSX } from "react";
import { useParams } from "react-router";
import { loadDocNodes } from "@/lib/parseDocs";
import { useDocSource } from "@/components/docs/useDocSource";
import { DocViewer } from "@/components/docs/DocViewer";

/**
 * /docs/:nodeId — single document viewer.
 *
 * Resolves the node from the build-time parse and the raw source from the
 * build-time glob, then delegates rendering to <DocViewer>.
 *
 * URL encoding: `/docs/01-ui%2F02-dag` — already established by the DAG
 * inspector's "Open document" link; useParams returns the decoded value.
 *
 * Spec: docs/01-ui/03-docs.md
 */

const allNodes = loadDocNodes();

export default function DocViewerPanel(): JSX.Element {
  const { nodeId } = useParams<{ nodeId: string }>();
  const id = nodeId ?? "";

  const node = allNodes.find((n) => n.id === id);
  const source = useDocSource(id);

  return <DocViewer node={node} source={source} />;
}
