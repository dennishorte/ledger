import { useCallback, useEffect, type JSX } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { DocDagNode } from "@/components/dag/DocDagNode";
import { DocSubtreeNode } from "@/components/dag/DocSubtreeNode";
import { NodeInspector } from "@/components/dag/NodeInspector";
import { useDagLayout, type DocNodeData } from "@/components/dag/useDagLayout";
import { useDocGraph } from "@/components/dag/useDocGraph";
import { useShellStore } from "@/stores/shell";
import type { DocNode } from "@/lib/types";

const nodeTypes: NodeTypes = { doc: DocDagNode, subtree: DocSubtreeNode };

const proOptions = { hideAttribution: true } as const;
const fitViewOptions = { padding: 0.2 } as const;

function DagCanvasInner(): JSX.Element {
  const docs = useDocGraph();
  const openInspector = useShellStore((s) => s.openInspector);
  const { fitView } = useReactFlow();

  // Called when the user clicks the header strip of a subtree rect.
  const onSubtreeHeaderClick = useCallback(
    (node: DocNode) => {
      openInspector(<NodeInspector node={node} allNodes={docs} />);
    },
    [docs, openInspector],
  );

  const { nodes, edges } = useDagLayout(docs, onSubtreeHeaderClick);

  // ELK resolves asynchronously, so React Flow mounts with an empty node set
  // and its `fitView` prop has nothing to fit on the first paint. Refit
  // imperatively once layout produces nodes; subsequent doc-set changes
  // (rare in Phase 1) refit the same way.
  useEffect(() => {
    if (nodes.length === 0) return;
    void fitView(fitViewOptions);
  }, [nodes, fitView]);

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_, node) => {
      // Subtree group rects handle their own header clicks via onHeaderClick;
      // ignore any React Flow node-click events on them here.
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
