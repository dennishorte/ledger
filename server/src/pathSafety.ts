import { isAbsolute, relative, resolve, sep } from "node:path";

export class PathContainmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathContainmentError";
  }
}

export function assertContained(parent: string, candidate: string): void {
  const parentAbs = resolve(parent);
  const candidateAbs = resolve(candidate);
  const rel = relative(parentAbs, candidateAbs);
  // candidate === parent is allowed: readDocs walks docsRoot itself and re-asserts containment per file.
  if (rel === "" || rel === ".") return;
  if (rel.startsWith("..") || isAbsolute(rel) || rel.split(sep).includes("..")) {
    throw new PathContainmentError(
      `path escapes parent: candidate=${candidateAbs} parent=${parentAbs}`,
    );
  }
}
