import type { JSX } from "react";
import { FileSearch } from "lucide-react";
import { useParams } from "react-router";
import { EmptyState } from "@/components/layout/EmptyState";

export default function DocViewerPanel(): JSX.Element {
  const { nodeId } = useParams<{ nodeId: string }>();
  return (
    <EmptyState
      icon={FileSearch}
      title={`Document \`${nodeId ?? "?"}\` not found.`}
      description="Documents will render here once the document store is online."
    />
  );
}
