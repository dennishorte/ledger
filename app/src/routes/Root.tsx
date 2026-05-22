import type { JSX } from "react";
import { AppShell } from "@/components/layout/AppShell";

/**
 * Layout route. Renders the shell, which itself renders `<Outlet />` in the
 * main content slot.
 */
export default function Root(): JSX.Element {
  return <AppShell />;
}
