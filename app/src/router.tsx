import { createBrowserRouter, Navigate } from "react-router";
import Root from "@/routes/Root";
import DagPanel from "@/routes/DagPanel";
import DocsPanel from "@/routes/DocsPanel";
import DocViewerPanel from "@/routes/DocViewerPanel";
import TaskConsolePanel from "@/routes/TaskConsolePanel";
import LogStreamPanel from "@/routes/LogStreamPanel";
import HealthDashboardPanel from "@/routes/HealthDashboardPanel";
import ReplayPanel from "@/routes/ReplayPanel";
import NotFoundPanel from "@/routes/NotFoundPanel";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Root />,
    children: [
      { index: true, element: <Navigate to="/dag" replace /> },
      { path: "dag", element: <DagPanel /> },
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
