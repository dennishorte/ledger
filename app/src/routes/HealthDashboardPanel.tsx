import type { JSX } from "react";
import { Activity } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";

export default function HealthDashboardPanel(): JSX.Element {
  return (
    <EmptyState
      icon={Activity}
      title="Health dashboard — no signals yet."
      description="Open issues, staleness, and token-cost roll-ups will appear here."
    />
  );
}
