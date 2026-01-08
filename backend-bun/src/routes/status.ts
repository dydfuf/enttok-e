import { Hono } from "hono";
import { authMiddleware, requireAuth } from "../middleware/auth.ts";
import { statusSnapshot } from "../services/jobs.ts";
import { getSchedulerStatus } from "../services/scheduler.ts";
import type { Env } from "../lib/types.ts";

export const statusRoutes = new Hono<Env>();

statusRoutes.use("*", authMiddleware);
statusRoutes.use("*", requireAuth);

statusRoutes.get("/", (c) => {
  const snapshot = statusSnapshot();
  const scheduler = getSchedulerStatus();
  return c.json({
    status: "ok",
    uptime_sec: snapshot.uptime_sec,
    timestamp: new Date().toISOString(),
    queue_depth: snapshot.queue_depth,
    workers: snapshot.workers,
    scheduler: {
      running: scheduler.running,
      interval_sec: scheduler.interval_ms / 1000,
    },
  });
});
