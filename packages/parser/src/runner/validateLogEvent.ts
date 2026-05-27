/**
 * validateLogEvent — ajv 2020-12 validator for the LogEvent discriminated union.
 *
 * Accepts all six kind variants. The status_change variant's 'from' field is
 * optional (absent on seq-0 creation events per Spec Review S4).
 */

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../../../../docs/_schemas/log-event.schema.json" with { type: "json" };
import type { LogEvent } from "./types.js";
import type { ValidationError } from "../schema/validateDocNode.js";
import { toValidationErrors } from "../schema/validateDocNode.js";

export type LogEventValidationResult =
  | { ok: true; event: LogEvent }
  | { ok: false; errors: ValidationError[] };

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const _validate = ajv.compile<LogEvent>(schema);

export function validateLogEvent(input: unknown): LogEventValidationResult {
  if (_validate(input)) return { ok: true, event: input };
  return { ok: false, errors: toValidationErrors(_validate.errors) };
}
