import type { JSX } from "react";
import { FileSearch } from "lucide-react";
import { useParams } from "react-router";
import { EmptyState } from "@/components/layout/EmptyState";

export default function DocViewerPanel(): JSX.Element {
  const { nodeId } = useParams<{ nodeId: string }>();
  return (
    <EmptyState
      icon={FileSearch}
      title="Document viewer not yet shipped"
      description={`\`${nodeId ?? "?"}\` will render here once \`01-ui/03-docs\` lands.`}
    />
  );
}
