/**
 * validateProjectMetadata — pure validator for .ledger/project.json.
 *
 * Takes unknown input and validates against project-metadata.schema.json.
 * No I/O. The Vite-import wrapper lives in app/src/lib/project/loadProjectMetadata.ts.
 */

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../../../../docs/_schemas/project-metadata.schema.json" with { type: "json" };
import type { ProjectMetadata, ProjectMetadataResult } from "./types.js";
import { HEALTH_DEFAULTS } from "./types.js";
import { toValidationErrors } from "../schema/validateDocNode.js";

// Raw shape accepted by the JSON Schema (health is optional with optional fields).
interface ProjectMetadataRaw {
  schemaVersion: 1;
  name: string;
  docs: string;
  agent: string;
  health?: {
    sizeThresholdTokens?: number;
    stalenessGraceDays?: number;
    orphanThresholdDays?: number;
  };
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const compile = ajv.compile<ProjectMetadataRaw>(schema);

export function validateProjectMetadata(input: unknown): ProjectMetadataResult {
  if (!compile(input)) return { ok: false, errors: toValidationErrors(compile.errors) };
  const metadata: ProjectMetadata = {
    schemaVersion: input.schemaVersion,
    name: input.name,
    docs: input.docs,
    agent: input.agent,
    health: {
      sizeThresholdTokens:
        input.health?.sizeThresholdTokens ?? HEALTH_DEFAULTS.sizeThresholdTokens,
      stalenessGraceDays:
        input.health?.stalenessGraceDays ?? HEALTH_DEFAULTS.stalenessGraceDays,
      orphanThresholdDays:
        input.health?.orphanThresholdDays ?? HEALTH_DEFAULTS.orphanThresholdDays,
    },
  };
  return { ok: true, metadata };
}
