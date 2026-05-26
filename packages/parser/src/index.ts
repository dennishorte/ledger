// Schema
export { parseDocNode } from "./schema/parseDocNode";
export { validateDocNode } from "./schema/validateDocNode";
export type { ValidationError, ValidationResult } from "./schema/validateDocNode";
export type { DocumentNode } from "./schema/types";

// Project metadata
export { validateProjectMetadata } from "./project/validateProjectMetadata";
export type { ProjectMetadata, ProjectMetadataResult } from "./project/types";

// Docs graph
export { buildDocGraph, idForPath } from "./docs/buildDocGraph";
export type { DocNode } from "./docs/types";

// Core types (canonical home — re-exported by app/src/lib/types.ts)
export type { NodeId, NodeStatus } from "./coreTypes";
