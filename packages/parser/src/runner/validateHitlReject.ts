/**
 * validateHitlReject — ajv 2020-12 validator for POST /api/tasks/:id/reject.
 *
 * Per 03-hitl-gate Spec Review S1: success branch is { ok: true; input } (NOT value).
 *
 * The schema uses $ref to task-input.schema.json for the optional `followUp`
 * sub-shape; ajv resolves the ref by ID. We register task-input.schema.json
 * via ajv.addSchema so the $ref resolves at compile time. useDefaults: true
 * propagates through $ref, so defaults from task-input.schema.json are
 * applied to followUp at validation time (D13 — belt-and-braces with the
 * route's later validateTaskInput call).
 */

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../../../../docs/_schemas/hitl-reject.schema.json" with { type: "json" };
import taskInputSchema from "../../../../docs/_schemas/task-input.schema.json" with { type: "json" };
import type { TaskInput } from "./types.js";
import type { ValidationError } from "../schema/validateDocNode.js";
import { toValidationErrors } from "../schema/validateDocNode.js";

export interface HitlRejectBody {
  dbRowVersion: number;
  reason: string;
  followUp?: TaskInput;
}

export type HitlRejectValidationResult =
  | { ok: true; input: HitlRejectBody }
  | { ok: false; errors: ValidationError[] };

const ajv = new Ajv2020({ allErrors: true, strict: true, useDefaults: true });
addFormats(ajv);
ajv.addSchema(taskInputSchema);
const _validate = ajv.compile<HitlRejectBody>(schema);

export function validateHitlReject(value: unknown): HitlRejectValidationResult {
  const clone = structuredClone(value);
  if (_validate(clone)) return { ok: true, input: clone };
  return { ok: false, errors: toValidationErrors(_validate.errors) };
}
