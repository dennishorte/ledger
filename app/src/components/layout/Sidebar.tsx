import type { JSX } from "react";
import { NavLink } from "react-router";
import {
  Activity,
  FileText,
  ListTodo,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useShellStore } from "@/stores/shell";
import { cn } from "@/lib/cn";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: "/dag", label: "DAG", icon: Network },
  { to: "/docs", label: "Documents", icon: FileText },
  { to: "/tasks", label: "Tasks", icon: ListTodo },
  { to: "/health", label: "Health", icon: Activity },
];

export function Sidebar(): JSX.Element {
  const collapsed = useShellStore((s) => s.sidebarCollapsed);
  const toggle = useShellStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-[color:var(--color-border)] bg-[color:var(--color-surface-sunken)] transition-[width] duration-150 ease-out",
        collapsed ? "w-14" : "w-60",
      )}
      aria-label="Primary navigation"
    >
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
                "text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-raised)] hover:text-[color:var(--color-fg)]",
                isActive &&
                  "bg-[color:var(--color-surface-raised)] text-[color:var(--color-fg)] font-medium shadow-[inset_2px_0_0_0_var(--color-accent)]",
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon
              className="h-4 w-4 shrink-0"
              aria-hidden
              strokeWidth={1.75}
            />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-[color:var(--color-border)] p-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-raised)] hover:text-[color:var(--color-fg)]"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden strokeWidth={1.75} />
          ) : (
            <PanelLeftClose
              className="h-4 w-4"
              aria-hidden
              strokeWidth={1.75}
            />
          )}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
