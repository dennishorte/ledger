import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import Root from "@/routes/Root";
import DocsPanel from "@/routes/DocsPanel";
import DocViewerPanel from "@/routes/DocViewerPanel";
import TaskConsolePanel from "@/routes/TaskConsolePanel";
import LogStreamPanel from "@/routes/LogStreamPanel";
import HealthDashboardPanel from "@/routes/HealthDashboardPanel";
import ReplayPanel from "@/routes/ReplayPanel";
import NotFoundPanel from "@/routes/NotFoundPanel";

// DagPanel pulls in elkjs (~250 KB gzip via `elk.bundled.js`) and React Flow.
// Route-level lazy split keeps that weight off non-DAG paths and gives each
// panel its own chunk going forward.
const DagPanel = lazy(() => import("@/routes/DagPanel"));

const panelFallback = (
  <div className="flex h-full w-full items-center justify-center text-sm text-[color:var(--color-muted)]">
    Loading…
  </div>
);

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Root />,
    children: [
      { index: true, element: <Navigate to="/dag" replace /> },
      {
        path: "dag",
        element: (
          <Suspense fallback={panelFallback}>
            <DagPanel />
          </Suspense>
        ),
      },
      { path: "docs", element: <DocsPanel /> },
      { path: "docs/:nodeId", element: <DocViewerPanel /> },
      { path: "tasks", element: <TaskConsolePanel /> },
      { path: "logs/:taskId", element: <LogStreamPanel /> },
      { path: "health", element: <HealthDashboardPanel /> },
      { path: "replay/:subtree", element: <ReplayPanel /> },
      { path: "*", element: <NotFoundPanel /> },
    ],
  },
]);
