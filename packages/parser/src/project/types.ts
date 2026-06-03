/**
 * ProjectMetadata — TypeScript interface hand-aligned with
 * docs/_schemas/project-metadata.schema.json (schema version 1).
 *
 * Keep in lockstep with the JSON Schema. See 03-project-metadata D9.
 */

export interface HealthConfig {
  sizeThresholdTokens: number;
  orphanThresholdDays: number;
}

export const HEALTH_DEFAULTS: HealthConfig = {
  sizeThresholdTokens: 12000,
  orphanThresholdDays: 14,
};

export interface ProjectMetadata {
  /** Authored by the operator; const: 1 in schema. */
  schemaVersion: 1;
  /** Human-readable project name shown in the topbar. */
  name: string;
  /** Relative path from project root to docs tree. No leading/trailing slash. */
  docs: string;
  /** Identifier of the agent runtime used to dispatch tasks. */
  agent: string;
  /** Health scanner thresholds. Always present after parsing — defaults applied by validateProjectMetadata. */
  health: HealthConfig;
}

import type { ValidationError } from "../schema/validateDocNode";

export type ProjectMetadataResult =
  | { ok: true; metadata: ProjectMetadata }
  | { ok: false; errors: ValidationError[] };
