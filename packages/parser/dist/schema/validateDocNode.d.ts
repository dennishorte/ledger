/**
 * validateDocNode — ajv 2020-12 validator for leaf implementation docs.
 *
 * Takes the candidate JSON produced by parseDocNode and validates it against
 * the canonical JSON Schema in docs/_schemas/document-node.schema.json.
 *
 * Returns a Result union — never throws. All errors are collected with
 * allErrors: true so callers see the full picture in one pass.
 */
import type { DocumentNode } from "./types";
export interface ValidationError {
    /** JSON Pointer path to the failing field, e.g. "/sections/Requirements". */
    path: string;
    /** Human-readable message from ajv, lightly normalized. */
    message: string;
    /** The ajv keyword that failed, e.g. "required", "enum", "format". */
    keyword: string;
}
export type ValidationResult = {
    ok: true;
    node: DocumentNode;
} | {
    ok: false;
    errors: ValidationError[];
};
/**
 * Validate a candidate JSON object against the DocumentNode schema.
 *
 * @param candidate - Output of parseDocNode (unknown; may be any shape)
 * @returns {ok: true, node} on success, {ok: false, errors} on failure.
 */
export declare function validateDocNode(candidate: unknown): ValidationResult;
//# sourceMappingURL=validateDocNode.d.ts.map