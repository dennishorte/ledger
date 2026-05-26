/**
 * loadProjectMetadata — build-time loader for .ledger/project.json.
 *
 * Thin Vite-import wrapper around validateProjectMetadata from @ledger/parser.
 * The pure validator lives in the parser package so the API server can reuse it.
 */

import rawProject from "../../../../.ledger/project.json" with { type: "json" };
import { validateProjectMetadata } from "@ledger/parser";
import type { ProjectMetadataResult } from "@ledger/parser";

export type { ValidationError } from "@ledger/parser";
export type { ProjectMetadataResult };

export function loadProjectMetadata(): ProjectMetadataResult {
  return validateProjectMetadata(rawProject);
}

export const projectMetadata: ProjectMetadataResult = loadProjectMetadata();
