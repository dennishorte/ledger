/**
 * ProjectMetadata — TypeScript interface hand-aligned with
 * docs/_schemas/project-metadata.schema.json (schema version 1).
 *
 * Keep in lockstep with the JSON Schema. See 03-project-metadata D9.
 */
export interface ProjectMetadata {
    /** Authored by the operator; const: 1 in schema. */
    schemaVersion: 1;
    /** Human-readable project name shown in the topbar. */
    name: string;
    /** Relative path from project root to docs tree. No leading/trailing slash. */
    docs: string;
    /** Identifier of the agent runtime used to dispatch tasks. */
    agent: string;
}
import type { ValidationError } from "../schema/validateDocNode";
export type ProjectMetadataResult = {
    ok: true;
    metadata: ProjectMetadata;
} | {
    ok: false;
    errors: ValidationError[];
};
//# sourceMappingURL=types.d.ts.map