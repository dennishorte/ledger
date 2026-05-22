import type { JSX } from "react";
import { CircleSlash } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";

export default function NotFoundPanel(): JSX.Element {
  return (
    <EmptyState
      icon={CircleSlash}
      title="Route not found."
      description="The path you tried does not match any registered route."
    />
  );
}
