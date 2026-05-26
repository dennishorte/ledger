import type { NodeId, NodeStatus } from "../coreTypes";

export interface DocNode {
  id: NodeId;
  parentId: NodeId | null;
  title: string;
  status: NodeStatus;
  /** Sibling node IDs this node depends on, per its parent's manifest. */
  dependsOn: NodeId[];
  /** True when an authored `docs/**.md` file backs this node. */
  authored: boolean;
  /** File path key, kept for debugging/routing. */
  source?: string;
}
