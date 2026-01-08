import { Hono } from "hono";
import { cors } from "hono/cors";
import { healthRoutes } from "./routes/health.ts";
import { statusRoutes } from "./routes/status.ts";
import { jobsRoutes } from "./routes/jobs.ts";
import { eventsRoutes } from "./routes/events.ts";
import { claudeRoutes } from "./routes/claude.ts";
import { calendarRoutes } from "./routes/calendar.ts";
import { jiraRoutes } from "./routes/jira.ts";
import { confluenceRoutes } from "./routes/confluence.ts";
import { activityRoutes } from "./routes/activity.ts";
import type { Env } from "./lib/types.ts";

export function createApp() {
  const app = new Hono<Env>();

  // CORS middleware
  app.use(
    "*",
    cors({
      origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "app://.", // Electron production
      ],
      credentials: true,
      allowHeaders: ["Content-Type", "X-Backend-Token"],
      exposeHeaders: ["*"],
    })
  );

  // Global error handler
  app.onError((error, c) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : "Error";

    console.error(`Unhandled exception: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }

    return c.json(
      {
        detail: errorMessage,
        type: errorName,
      },
      500
    );
  });

  // Not found handler
  app.notFound((c) => {
    return c.json({ detail: "Not found", type: "NotFoundError" }, 404);
  });

  // Mount routes
  app.route("/health", healthRoutes);
  app.route("/status", statusRoutes);
  app.route("/jobs", jobsRoutes);
  app.route("/events", eventsRoutes);
  app.route("/claude", claudeRoutes);
  app.route("/calendar", calendarRoutes);
  app.route("/jira", jiraRoutes);
  app.route("/confluence", confluenceRoutes);
  app.route("/activity", activityRoutes);

  return app;
}

export type App = ReturnType<typeof createApp>;
