import type { JSX } from "react";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";

export default function DocsPanel(): JSX.Element {
  return (
    <EmptyState
      icon={FileText}
      title="No document nodes yet."
      description="The document tree appears here."
    />
  );
}
