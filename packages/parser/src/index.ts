// Schema
export { parseDocNode } from "./schema/parseDocNode.js";
export { validateDocNode } from "./schema/validateDocNode.js";
export type { ValidationError, ValidationResult } from "./schema/validateDocNode.js";
export type { DocumentNode } from "./schema/types.js";

// Project metadata
export { validateProjectMetadata } from "./project/validateProjectMetadata.js";
export type { ProjectMetadata, ProjectMetadataResult, HealthConfig } from "./project/types.js";
export { HEALTH_DEFAULTS } from "./project/types.js";

// Docs graph
export { buildDocGraph, idForPath, pathForNodeId } from "./docs/buildDocGraph.js";
export type { BuildDocGraphResult, DocValidationFailure } from "./docs/buildDocGraph.js";
export type { DocNode } from "./docs/types.js";

// Core types (canonical home — re-exported by app/src/lib/types.ts)
export type { NodeId, NodeStatus } from "./coreTypes.js";

// Runner types and validators (05-task-runner/01-store-schema)
export type {
  TaskId,
  TaskType,
  TaskStatus,
  TaskSource,
  ResourceClaim,
  ReviewPayload,
  Task,
  TaskInput,
  LogEventId,
  ConnectionStatus,
  BaseLogEvent,
  LogEvent,
} from "./runner/types.js";
export { validateTask } from "./runner/validateTask.js";
export { validateLogEvent } from "./runner/validateLogEvent.js";
export { validateTaskInput } from "./runner/validateTaskInput.js";

// Dispatcher helpers (06-agent-dispatcher/05-dispatch-api — promoted from server/src/dispatcher/prompts/index.ts)
export { defaultResourceClaims } from "./runner/defaultResourceClaims.js";

// HITL validators (05-task-runner/03-hitl-gate)
export { validateHitlApprove } from "./runner/validateHitlApprove.js";
export { validateHitlReject } from "./runner/validateHitlReject.js";
export type {
  HitlApproveBody,
  HitlApproveValidationResult,
} from "./runner/validateHitlApprove.js";
export type {
  HitlRejectBody,
  HitlRejectValidationResult,
} from "./runner/validateHitlReject.js";

// Alert types (08-alerts — algedonic channel)
export type { Alert } from "./alerts/types.js";
