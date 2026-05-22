import type { JSX } from "react";
import { History } from "lucide-react";
import { useParams } from "react-router";
import { EmptyState } from "@/components/layout/EmptyState";

export default function ReplayPanel(): JSX.Element {
  const { subtree } = useParams<{ subtree: string }>();
  return (
    <EmptyState
      icon={History}
      title={`Replay of subtree \`${subtree ?? "?"}\` — no history captured.`}
      description="Read-only step-through of document versions, task executions, and agent decisions will live here."
    />
  );
}
