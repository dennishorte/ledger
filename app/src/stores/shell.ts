import type { ReactNode } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ShellState {
  sidebarCollapsed: boolean;
  inspectorOpen: boolean;
  inspectorContent: ReactNode | null;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  openInspector: (content: ReactNode) => void;
  closeInspector: () => void;
}

/**
 * Shell store.
 *
 * Only `sidebarCollapsed` is persisted to localStorage (per 01-shell.md D2).
 * `inspectorContent` is a ReactNode and is deliberately non-serializable —
 * never persist it.
 */
export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      inspectorOpen: false,
      inspectorContent: null,
      toggleSidebar: () => {
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }));
      },
      setSidebarCollapsed: (collapsed) => {
        set({ sidebarCollapsed: collapsed });
      },
      openInspector: (content) => {
        set({ inspectorOpen: true, inspectorContent: content });
      },
      closeInspector: () => {
        set({ inspectorOpen: false, inspectorContent: null });
      },
    }),
    {
      name: "ledger.shell",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);
