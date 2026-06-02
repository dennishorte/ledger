import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { NodeId } from "@/lib/types";

interface DagViewState {
  /**
   * Per-node expansion overrides. Only nodes the operator has explicitly
   * toggled appear here; absent nodes fall back to the status-driven default
   * (see `computeEffectiveExpansion`). Persisted across reloads (02-dag D15).
   */
  overrides: Record<NodeId, boolean>;
  setOverride: (id: NodeId, expanded: boolean) => void;
  /** Bulk-set overrides (Expand all / Collapse all). */
  setMany: (entries: Record<NodeId, boolean>) => void;
  /** Reset to active work — clear all overrides so defaults take over. */
  reset: () => void;
}

export const useDagViewStore = create<DagViewState>()(
  persist(
    (set) => ({
      overrides: {},
      setOverride: (id, expanded) => {
        set((s) => ({ overrides: { ...s.overrides, [id]: expanded } }));
      },
      setMany: (entries) => {
        set((s) => ({ overrides: { ...s.overrides, ...entries } }));
      },
      reset: () => {
        set({ overrides: {} });
      },
    }),
    {
      name: "ledger.dagView",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ overrides: state.overrides }),
    },
  ),
);
