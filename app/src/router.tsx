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
// TEMPORARY — fixture route for 01-ui/08-markdown acceptance verification.
// Remove when 01-ui/03-docs ships DocViewerPanel as the real consumer.
import MarkdownPreviewPanel from "@/routes/MarkdownPreviewPanel";

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
      // TEMPORARY — remove with 01-ui/03-docs
      { path: "markdown-preview", element: <MarkdownPreviewPanel /> },
      { path: "*", element: <NotFoundPanel /> },
    ],
  },
]);
