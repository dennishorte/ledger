/**
 * validateHitlApprove — ajv 2020-12 validator for POST /api/tasks/:id/approve.
 *
 * Per 03-hitl-gate Spec Review S1: success branch is { ok: true; input } (NOT value).
 */

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../../../../docs/_schemas/hitl-approve.schema.json" with { type: "json" };
import type { ValidationError } from "../schema/validateDocNode.js";
import { toValidationErrors } from "../schema/validateDocNode.js";

export interface HitlApproveBody {
  dbRowVersion: number;
  note?: string;
}

export type HitlApproveValidationResult =
  | { ok: true; input: HitlApproveBody }
  | { ok: false; errors: ValidationError[] };

const ajv = new Ajv2020({ allErrors: true, strict: true, useDefaults: true });
addFormats(ajv);
const _validate = ajv.compile<HitlApproveBody>(schema);

export function validateHitlApprove(value: unknown): HitlApproveValidationResult {
  const clone = structuredClone(value);
  if (_validate(clone)) return { ok: true, input: clone };
  return { ok: false, errors: toValidationErrors(_validate.errors) };
}
