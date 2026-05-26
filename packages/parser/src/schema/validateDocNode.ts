/**
 * validateDocNode — ajv 2020-12 validator for leaf implementation docs.
 *
 * Takes the candidate JSON produced by parseDocNode and validates it against
 * the canonical JSON Schema in docs/_schemas/document-node.schema.json.
 *
 * Returns a Result union — never throws. All errors are collected with
 * allErrors: true so callers see the full picture in one pass.
 */

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../../../../docs/_schemas/document-node.schema.json" with { type: "json" };
import type { DocumentNode } from "./types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ValidationError {
  /** JSON Pointer path to the failing field, e.g. "/sections/Requirements". */
  path: string;
  /** Human-readable message from ajv, lightly normalized. */
  message: string;
  /** The ajv keyword that failed, e.g. "required", "enum", "format". */
  keyword: string;
}

export type ValidationResult =
  | { ok: true; node: DocumentNode }
  | { ok: false; errors: ValidationError[] };

// ---------------------------------------------------------------------------
// Compiled validator (module singleton — compile once, reuse across calls)
// ---------------------------------------------------------------------------

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const _validate = ajv.compile<DocumentNode>(schema);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a candidate JSON object against the DocumentNode schema.
 *
 * @param candidate - Output of parseDocNode (unknown; may be any shape)
 * @returns {ok: true, node} on success, {ok: false, errors} on failure.
 */
export function validateDocNode(candidate: unknown): ValidationResult {
  const valid = _validate(candidate);

  if (valid) {
    return { ok: true, node: candidate };
  }

  const errors: ValidationError[] = (_validate.errors ?? []).map((e) => ({
    path: e.instancePath || "/",
    message: e.message ?? "validation failed",
    keyword: e.keyword,
  }));

  return { ok: false, errors };
}
