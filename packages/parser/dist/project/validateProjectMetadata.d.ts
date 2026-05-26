/**
 * validateProjectMetadata — pure validator for .ledger/project.json.
 *
 * Takes unknown input and validates against project-metadata.schema.json.
 * No I/O. The Vite-import wrapper lives in app/src/lib/project/loadProjectMetadata.ts.
 */
import type { ProjectMetadataResult } from "./types";
export declare function validateProjectMetadata(input: unknown): ProjectMetadataResult;
//# sourceMappingURL=validateProjectMetadata.d.ts.map