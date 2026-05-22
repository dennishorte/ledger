import { useCallback, useMemo, type JSX } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
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

const nodeTypes: NodeTypes = { doc: DocDagNode, subtree: DocSubtreeNode };

const proOptions = { hideAttribution: true } as const;

function DagCanvasInner(): JSX.Element {
  const docs = useDocGraph();
  const { nodes, edges } = useDagLayout(docs);
  const openInspector = useShellStore((s) => s.openInspector);

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_, node) => {
      // Subtree group rects are non-interactive; ignore clicks on them.
      if (node.type !== "doc") return;
      const data = node.data as DocNodeData;
      openInspector(<NodeInspector node={data.node} allNodes={docs} />);
    },
    [docs, openInspector],
  );

  const minimapStyle = useMemo(
    () => ({
      backgroundColor: "var(--color-surface-sunken)",
      border: "1px solid var(--color-border)",
    }),
    [],
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
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
        <MiniMap
          pannable
          zoomable
          style={minimapStyle}
          nodeColor="var(--color-surface-raised)"
          nodeStrokeColor="var(--color-border-strong)"
          maskColor="oklch(0.97 0.015 80 / 0.6)"
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
