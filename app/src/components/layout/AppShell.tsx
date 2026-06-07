import { useEffect, type JSX } from "react";
import { Outlet } from "react-router";
import { Topbar } from "./Topbar";
import { Sidebar } from "./Sidebar";
import { Inspector } from "./Inspector";
import { StatusBar } from "./StatusBar";
import { AlertBanner } from "./AlertBanner";
import { useShellStore } from "@/stores/shell";

/**
 * Root application shell.
 *
 * Owns the global keydown handler that closes the inspector on `Esc`.
 * Per 01-shell.md, the inspector is part of the shell (not per-route), and any
 * descendant can open it via `useShellStore.openInspector`.
 */
export function AppShell(): JSX.Element {
  const closeInspector = useShellStore((s) => s.closeInspector);
  const inspectorOpen = useShellStore((s) => s.inspectorOpen);

  useEffect(() => {
    if (!inspectorOpen) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") closeInspector();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [inspectorOpen, closeInspector]);

  return (
    <div className="flex h-full w-full flex-col bg-[color:var(--color-surface)] text-[color:var(--color-fg)]">
      <AlertBanner />
      <Topbar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-auto">
          <Outlet />
        </main>
        <Inspector />
      </div>
      <StatusBar />
    </div>
  );
}
