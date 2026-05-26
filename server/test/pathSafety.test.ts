import { describe, expect, it } from "vitest";
import { assertContained, PathContainmentError } from "../src/pathSafety.js";

describe("assertContained", () => {
  it("passes when candidate equals parent", () => {
    expect(() => { assertContained("/foo/bar", "/foo/bar"); }).not.toThrow();
  });

  it("passes when candidate is a direct child", () => {
    expect(() => { assertContained("/foo/bar", "/foo/bar/baz"); }).not.toThrow();
  });

  it("passes when candidate is a deeply nested descendant", () => {
    expect(() => { assertContained("/foo", "/foo/bar/baz/qux"); }).not.toThrow();
  });

  it("rejects a candidate with .. segments that escape", () => {
    expect(() => { assertContained("/foo/bar", "/foo/bar/../.."); }).toThrow(PathContainmentError);
  });

  it("rejects a sibling directory", () => {
    expect(() => { assertContained("/foo/bar", "/foo/baz"); }).toThrow(PathContainmentError);
  });

  it("rejects an ancestor directory", () => {
    expect(() => { assertContained("/foo/bar", "/foo"); }).toThrow(PathContainmentError);
  });

  it("rejects a completely different root", () => {
    expect(() => { assertContained("/foo/bar", "/etc/passwd"); }).toThrow(PathContainmentError);
  });

  it("rejects path traversal in the middle of the path", () => {
    expect(() => { assertContained("/foo", "/foo/bar/../.."); }).toThrow(PathContainmentError);
  });

  it("error message includes both paths", () => {
    try {
      assertContained("/foo/bar", "/etc");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PathContainmentError);
      expect((e as PathContainmentError).message).toMatch(/path escapes parent/);
    }
  });
});
