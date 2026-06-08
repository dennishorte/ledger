import { useQuery } from "@tanstack/react-query";
import { projectMetadata } from "./loadProjectMetadata";
import type { ProjectMetadata } from "@ledger/parser";

interface ProjectApiResponse {
  project: ProjectMetadata;
}

/**
 * Runtime data source: TanStack Query against GET /api/project.
 * Falls back to the build-time static import so the topbar renders
 * instantly and degrades gracefully if the server is unreachable.
 */
export function useProjectMetadata(): ProjectMetadata | null {
  const fallback = projectMetadata.ok ? projectMetadata.metadata : null;
  const { data } = useQuery({
    queryKey: ["project"],
    queryFn: async (): Promise<ProjectMetadata> => {
      const res = await fetch("/api/project");
      if (!res.ok) throw new Error(`/api/project returned ${res.status.toString()}`);
      const body = (await res.json()) as ProjectApiResponse;
      return body.project;
    },
    placeholderData: () => fallback ?? undefined,
    staleTime: 60_000,
  });
  return data ?? fallback;
}
