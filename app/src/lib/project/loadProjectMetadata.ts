/**
 * loadProjectMetadata — build-time loader and validator for .ledger/project.json.
 *
 * Uses direct Vite JSON imports (same pattern as 02-schema's validateDocNode.ts).
 * Returns a Result union; never throws. See 03-project-metadata D8.
 */

import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../../../../docs/_schemas/project-metadata.schema.json" with { type: "json" };
import rawProject from "../../../../.ledger/project.json" with { type: "json" };
import type { ProjectMetadata } from "./types";

// ---------------------------------------------------------------------------
// Re-export ValidationError from 02-schema — one error type across all
// schema-validated artifacts (see Spec Review S2).
// ---------------------------------------------------------------------------

export type { ValidationError } from "@/lib/schema/validateDocNode";
import type { ValidationError } from "@/lib/schema/validateDocNode";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ProjectMetadataResult =
  | { ok: true; metadata: ProjectMetadata }
  | { ok: false; errors: ValidationError[] };

// ---------------------------------------------------------------------------
// Compiled validator (module singleton — compile once, reuse across calls)
// ---------------------------------------------------------------------------

const _ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(_ajv);
const _validate = _ajv.compile<ProjectMetadata>(schema);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a candidate value against the ProjectMetadata schema.
 *
 * Exposed as a named function so tests can call it with fixture objects
 * without going through the module-level Vite import.
 */
export function validateProjectMetadata(parsed: unknown): ProjectMetadataResult {
  const valid = _validate(parsed);

  if (valid) {
    return { ok: true, metadata: parsed };
  }

  const errors: ValidationError[] = (_validate.errors ?? []).map((e) => ({
    path: e.instancePath || "/",
    message: e.message ?? "validation failed",
    keyword: e.keyword,
  }));

  return { ok: false, errors };
}

/**
 * Load and validate .ledger/project.json.
 *
 * Exported for test use; production consumers use the module-level
 * `projectMetadata` singleton instead.
 */
export function loadProjectMetadata(): ProjectMetadataResult {
  return validateProjectMetadata(rawProject);
}

// ---------------------------------------------------------------------------
// Module-level singleton — build-time, sync. One instance per bundle.
// ---------------------------------------------------------------------------

export const projectMetadata: ProjectMetadataResult = loadProjectMetadata();
