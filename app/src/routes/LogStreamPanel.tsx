import type { JSX } from "react";
import { ScrollText } from "lucide-react";
import { useParams } from "react-router";
import { EmptyState } from "@/components/layout/EmptyState";

export default function LogStreamPanel(): JSX.Element {
  const { taskId } = useParams<{ taskId: string }>();
  return (
    <EmptyState
      icon={ScrollText}
      title={`No logs for task \`${taskId ?? "?"}\`.`}
      description="Per-task log streams will render here."
    />
  );
}
