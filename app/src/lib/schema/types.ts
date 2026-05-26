/**
 * DocumentNode — the fully-validated shape of a leaf implementation doc.
 *
 * NodeStatus and NodeId are canonical in src/lib/types.ts (introduced by
 * 01-ui/02-dag D4). Re-exported here so schema consumers import from one place.
 *
 * DocumentNode is a superset of DocNode: it carries the full validated
 * front-matter, section map, and manifest-row payload. parseDocs.ts projects
 * DocumentNode → DocNode for panel consumers (02-schema D8 / S4).
 */

import type { NodeStatus, NodeId } from "../types";

export type { NodeStatus, NodeId } from "../types";

export interface ChildManifestRow {
  relId: string;
  title: string;
  dependsOn: string[];
  status: NodeStatus;
}

export interface DocumentNode {
  schemaVersion: 1;
  nodeId: NodeId;
  parentId: NodeId | null;
  title: string;
  status: NodeStatus;
  statusAnnotation?: string;
  created: string;
  lastUpdated: string;
  dependencies: string[];
  sections: {
    Requirements: string;
    Design: string;
    Decisions: string;
    "Open Issues": string;
    "Implementation Notes": string;
    Verification: string;
    Children: string;
    [key: string]: string;
  };
  children: ChildManifestRow[];
}
