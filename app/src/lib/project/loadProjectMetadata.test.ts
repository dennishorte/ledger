/**
 * loadProjectMetadata smoke test — asserts the Vite-import wrapper boots
 * cleanly and the real .ledger/project.json passes validation.
 *
 * Fixture-based validator tests moved to packages/parser/test/project/validateProjectMetadata.test.ts.
 */

import { describe, it, expect } from "vitest";
import { projectMetadata } from "./loadProjectMetadata";

describe("projectMetadata singleton (real .ledger/project.json)", () => {
  it("validates successfully", () => {
    expect(projectMetadata.ok).toBe(true);
  });
});
