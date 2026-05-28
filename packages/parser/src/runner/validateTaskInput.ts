/**
 * validateTaskInput — ajv 2020-12 validator for the TaskInput type.
 *
 * Gates POST /api/tasks request bodies. Applies defaults for optional fields
 * (source, dependsOn, resourceClaims, priority) via ajv's useDefaults: true.
 * This is the only validator in @ledger/parser that uses useDefaults.
 */

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../../../../docs/_schemas/task-input.schema.json" with { type: "json" };
import type { TaskInput } from "./types.js";
import type { ValidationError } from "../schema/validateDocNode.js";
import { toValidationErrors } from "../schema/validateDocNode.js";

export type TaskInputValidationResult =
  | { ok: true; input: TaskInput }
  | { ok: false; errors: ValidationError[] };

const ajv = new Ajv2020({ allErrors: true, strict: true, useDefaults: true });
addFormats(ajv);
const _validate = ajv.compile<TaskInput>(schema);

export function validateTaskInput(value: unknown): TaskInputValidationResult {
  // Clone so defaults are applied to a mutable copy without mutating caller's object
  const clone = structuredClone(value);
  if (_validate(clone)) return { ok: true, input: clone };
  return { ok: false, errors: toValidationErrors(_validate.errors) };
}
