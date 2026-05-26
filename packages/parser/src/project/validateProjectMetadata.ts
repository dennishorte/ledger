/**
 * validateProjectMetadata — pure validator for .ledger/project.json.
 *
 * Takes unknown input and validates against project-metadata.schema.json.
 * No I/O. The Vite-import wrapper lives in app/src/lib/project/loadProjectMetadata.ts.
 */

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../../../../docs/_schemas/project-metadata.schema.json" with { type: "json" };
import type { ProjectMetadata, ProjectMetadataResult } from "./types";
import { toValidationErrors } from "../schema/validateDocNode";

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const compile = ajv.compile<ProjectMetadata>(schema);

export function validateProjectMetadata(input: unknown): ProjectMetadataResult {
  if (compile(input)) return { ok: true, metadata: input };
  return { ok: false, errors: toValidationErrors(compile.errors) };
}
