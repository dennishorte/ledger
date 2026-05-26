/**
 * validateDocNode — ajv 2020-12 validator for leaf implementation docs.
 *
 * Takes the candidate JSON produced by parseDocNode and validates it against
 * the canonical JSON Schema in docs/_schemas/document-node.schema.json.
 *
 * Returns a Result union — never throws. All errors are collected with
 * allErrors: true so callers see the full picture in one pass.
 */
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../../../../docs/_schemas/document-node.schema.json" with { type: "json" };
// ---------------------------------------------------------------------------
// Compiled validator (module singleton — compile once, reuse across calls)
// ---------------------------------------------------------------------------
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const _validate = ajv.compile(schema);
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Validate a candidate JSON object against the DocumentNode schema.
 *
 * @param candidate - Output of parseDocNode (unknown; may be any shape)
 * @returns {ok: true, node} on success, {ok: false, errors} on failure.
 */
export function validateDocNode(candidate) {
    const valid = _validate(candidate);
    if (valid) {
        return { ok: true, node: candidate };
    }
    const errors = (_validate.errors ?? []).map((e) => ({
        path: e.instancePath || "/",
        message: e.message ?? "validation failed",
        keyword: e.keyword,
    }));
    return { ok: false, errors };
}
