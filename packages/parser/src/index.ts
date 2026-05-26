// Schema
export { parseDocNode } from "./schema/parseDocNode.js";
export { validateDocNode } from "./schema/validateDocNode.js";
export type { ValidationError, ValidationResult } from "./schema/validateDocNode.js";
export type { DocumentNode } from "./schema/types.js";

// Project metadata
export { validateProjectMetadata } from "./project/validateProjectMetadata.js";
export type { ProjectMetadata, ProjectMetadataResult } from "./project/types.js";

// Docs graph
export { buildDocGraph, idForPath } from "./docs/buildDocGraph.js";
export type { DocNode } from "./docs/types.js";

// Core types (canonical home — re-exported by app/src/lib/types.ts)
export type { NodeId, NodeStatus } from "./coreTypes.js";
