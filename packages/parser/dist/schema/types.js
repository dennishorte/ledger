/**
 * DocumentNode — the fully-validated shape of a leaf implementation doc.
 *
 * NodeStatus and NodeId are canonical in packages/parser/src/coreTypes.ts.
 * Re-exported here so schema consumers import from one place.
 *
 * DocumentNode is a superset of DocNode: it carries the full validated
 * front-matter, section map, and manifest-row payload. parseDocs.ts projects
 * DocumentNode → DocNode for panel consumers (02-schema D8 / S4).
 */
export {};
