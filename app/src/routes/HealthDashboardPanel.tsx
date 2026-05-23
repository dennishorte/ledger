/**
 * HealthDashboardPanel — thin shell route for /health.
 *
 * Instantiates useHealthData() and hands results to <HealthDashboard />.
 * All data assembly lives in useHealthData; all rendering lives in the widgets.
 * Spec: docs/01-ui/06-health.md §Design > Components and files (D8)
 */

import type { JSX } from "react";
import { HealthDashboard } from "@/components/health/HealthDashboard";
import { useHealthData } from "@/components/health/useHealthData";

export default function HealthDashboardPanel(): JSX.Element {
  const data = useHealthData();
  return <HealthDashboard data={data} />;
}
