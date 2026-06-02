import { useCallback, useEffect, useMemo, useRef, type JSX } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { DocDagNode } from "@/components/dag/DocDagNode";
import { DocSubtreeNode } from "@/components/dag/DocSubtreeNode";
import { DocCollapsedSubtreeNode } from "@/components/dag/DocCollapsedSubtreeNode";
import { NodeInspector } from "@/components/dag/NodeInspector";
import { useDagLayout, type DocNodeData } from "@/components/dag/useDagLayout";
import { useDocGraph } from "@/components/dag/useDocGraph";
import { computeEffectiveExpansion } from "@/lib/dagExpansion";
import { useShellStore } from "@/stores/shell";
import { useDagViewStore } from "@/stores/dagView";
import type { DocNode, NodeId } from "@/lib/types";

const nodeTypes: NodeTypes = {
  doc: DocDagNode,
  subtree: DocSubtreeNode,
  collapsedSubtree: DocCollapsedSubtreeNode,
};

const proOptions = { hideAttribution: true } as const;
const fitViewOptions = { padding: 0.2 } as const;

function DagCanvasInner(): JSX.Element {
  const docs = useDocGraph();
  const openInspector = useShellStore((s) => s.openInspector);
  const { fitView } = useReactFlow();

  const overrides = useDagViewStore((s) => s.overrides);
  const setOverride = useDagViewStore((s) => s.setOverride);
  const setMany = useDagViewStore((s) => s.setMany);
  const reset = useDagViewStore((s) => s.reset);

  // Effective expansion = operator overrides layered over the status-driven
  // default (D15). Memoized so the Set identity is stable across renders that
  // don't touch docs/overrides — `useDagLayout`'s effect keys on it.
  const { expanded, subtreeParentIds } = useMemo(
    () => computeEffectiveExpansion(docs, overrides),
    [docs, overrides],
  );

  const onToggleExpand = useCallback(
    (id: NodeId) => {
      setOverride(id, !expanded.has(id));
    },
    [expanded, setOverride],
  );

  // Called when the user clicks the header strip of a subtree rect.
  const onSubtreeHeaderClick = useCallback(
    (node: DocNode) => {
      openInspector(<NodeInspector node={node} allNodes={docs} />);
    },
    [docs, openInspector],
  );

  const { nodes, edges } = useDagLayout(docs, expanded, onToggleExpand, onSubtreeHeaderClick);

  // Fit the viewport once, when nodes first appear. Deliberately NOT keyed on
  // every layout change: re-fitting on each expand/collapse would yank the
  // viewport around on every toggle.
  const didFitRef = useRef(false);
  useEffect(() => {
    if (didFitRef.current || nodes.length === 0) return;
    didFitRef.current = true;
    void fitView(fitViewOptions);
  }, [nodes, fitView]);

  const expandAll = useCallback(() => {
    setMany(Object.fromEntries([...subtreeParentIds].map((id) => [id, true])));
  }, [subtreeParentIds, setMany]);

  const collapseAll = useCallback(() => {
    setMany(Object.fromEntries([...subtreeParentIds].map((id) => [id, false])));
  }, [subtreeParentIds, setMany]);

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_, node) => {
      // Subtree + collapsed-subtree nodes handle their own header/chevron
      // clicks; ignore React Flow node-click events on them here.
      if (node.type !== "doc") return;
      const data = node.data as DocNodeData;
      openInspector(<NodeInspector node={data.node} allNodes={docs} />);
    },
    [docs, openInspector],
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        proOptions={proOptions}
        minZoom={0.4}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--color-border)"
        />
        <Panel position="top-left">
          <div className="flex items-center gap-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] p-1 text-[11px] shadow-sm">
            <button
              type="button"
              onClick={expandAll}
              className="cursor-pointer rounded px-2 py-1 text-[color:var(--color-fg)] transition-colors hover:bg-[color:var(--color-surface-sunken)]"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="cursor-pointer rounded px-2 py-1 text-[color:var(--color-fg)] transition-colors hover:bg-[color:var(--color-surface-sunken)]"
            >
              Collapse all
            </button>
            <span className="h-4 w-px bg-[color:var(--color-border)]" aria-hidden />
            <button
              type="button"
              onClick={reset}
              title="Clear manual overrides — revert to status-driven default"
              className="cursor-pointer rounded px-2 py-1 text-[color:var(--color-muted)] transition-colors hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-fg)]"
            >
              Reset to active work
            </button>
          </div>
        </Panel>
        <Controls
          showInteractive={false}
          className="!bg-[color:var(--color-surface-raised)] !shadow-sm [&>button]:!border-[color:var(--color-border)] [&>button]:!bg-[color:var(--color-surface-raised)] [&>button]:!text-[color:var(--color-fg)] [&>button:hover]:!bg-[color:var(--color-surface-sunken)]"
        />
      </ReactFlow>
    </div>
  );
}

export function DagCanvas(): JSX.Element {
  return (
    <ReactFlowProvider>
      <DagCanvasInner />
    </ReactFlowProvider>
  );
}
