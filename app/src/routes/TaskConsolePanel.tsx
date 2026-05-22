import type { JSX } from "react";
import { ListTodo } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";

export default function TaskConsolePanel(): JSX.Element {
  return (
    <EmptyState
      icon={ListTodo}
      title="Task queue empty."
      description="Manual injection, breakpoints, and approval gates will live here."
    />
  );
}
