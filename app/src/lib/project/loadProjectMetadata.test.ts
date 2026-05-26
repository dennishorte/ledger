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

  it("has name 'Ledger'", () => {
    expect(projectMetadata.ok && projectMetadata.metadata.name).toBe("Ledger");
  });

  it("has docs 'docs'", () => {
    expect(projectMetadata.ok && projectMetadata.metadata.docs).toBe("docs");
  });

  it("has agent 'claude-code'", () => {
    expect(projectMetadata.ok && projectMetadata.metadata.agent).toBe("claude-code");
  });

  it("has schemaVersion 1", () => {
    expect(projectMetadata.ok && projectMetadata.metadata.schemaVersion).toBe(1);
  });
});
