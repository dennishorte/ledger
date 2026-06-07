/**
 * Tests for parseIssueItems — focused on the priority-tag extraction that
 * 06-health's IssueRollupWidget depends on. Regression for the em-dash/comma
 * continuation forms that the original `\)`-anchored regex tagged UNKNOWN
 * (07-health-daemon discovery).
 */

import { describe, it, expect } from "vitest";
import { parseIssueItems } from "./parseIssues";

function priorities(raw: string): string[] {
  return parseIssueItems("99-test", raw).map((i) => i.priority);
}

const HEADER = "## Open Issues\n\n";

describe("parseIssueItems priority extraction", () => {
  it("tags the plain `(Priority: X)` form", () => {
    expect(priorities(HEADER + "- A nit. *(Priority: LOW)*")).toEqual(["LOW"]);
  });

  it("tags the em-dash continuation form (regression)", () => {
    expect(priorities(HEADER + "- **Bug.** *(Priority: HIGH — confusing today)*")).toEqual(["HIGH"]);
  });

  it("tags the comma continuation form (regression)", () => {
    expect(priorities(HEADER + "- **Bug.** *(Priority: HIGH, blocks verification)*")).toEqual(["HIGH"]);
  });

  it("tags the trailing-period form", () => {
    expect(priorities(HEADER + "- **Note.** *(Priority: MEDIUM.)*")).toEqual(["MEDIUM"]);
  });

  it("returns UNKNOWN for untagged bullets and (Defer.) notes", () => {
    expect(priorities(HEADER + "- Deferred thing. *(Defer.)*")).toEqual(["UNKNOWN"]);
    expect(priorities(HEADER + "- Untagged note.")).toEqual(["UNKNOWN"]);
  });

  it("tags TRIVIAL and is case-insensitive", () => {
    expect(priorities(HEADER + "- A nit. *(Priority: TRIVIAL)*")).toEqual(["TRIVIAL"]);
    expect(priorities(HEADER + "- A nit. *(priority: high — lower-cased)*")).toEqual(["HIGH"]);
  });

  it("accepts the `* ` bullet style", () => {
    expect(priorities(HEADER + "* **Bug.** *(Priority: MEDIUM)*")).toEqual(["MEDIUM"]);
  });

  it("extracts one item per bullet across the section", () => {
    const raw =
      HEADER +
      "- **Critical.** *(Priority: HIGH — now)*\n" +
      "- **Drift.** *(Priority: MEDIUM, later)*\n" +
      "- A nit. *(Priority: LOW)*";
    expect(priorities(raw)).toEqual(["HIGH", "MEDIUM", "LOW"]);
  });

  it("returns [] when there is no Open Issues section", () => {
    expect(parseIssueItems("99-test", "# Title\n\nNo issues section here.")).toEqual([]);
  });
});
