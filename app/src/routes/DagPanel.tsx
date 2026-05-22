import type { JSX } from "react";
import { DagCanvas } from "@/components/dag/DagCanvas";

/**
 * Renders the project's document tree as a directed graph (01-ui/02-dag).
 *
 * Phase-1 data source: build-time parse of `docs/**` (see lib/parseDocs.ts).
 * Swaps to an API-backed source once the backend lands.
 */
export default function DagPanel(): JSX.Element {
  return <DagCanvas />;
}
