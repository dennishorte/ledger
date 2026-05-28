/**
 * validateTask — ajv 2020-12 validator for the Task domain object.
 *
 * Mirrors the pattern of validateDocNode and validateProjectMetadata.
 * Accepts the full Task shape including the runner-specific fields
 * (dbRowVersion, priority, optional transcriptPath).
 */

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../../../../docs/_schemas/task.schema.json" with { type: "json" };
import type { Task } from "./types.js";
import type { ValidationError } from "../schema/validateDocNode.js";
import { toValidationErrors } from "../schema/validateDocNode.js";

export type TaskValidationResult =
  | { ok: true; task: Task }
  | { ok: false; errors: ValidationError[] };

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const _validate = ajv.compile<Task>(schema);

export function validateTask(input: unknown): TaskValidationResult {
  if (_validate(input)) return { ok: true, task: input };
  return { ok: false, errors: toValidationErrors(_validate.errors) };
}
