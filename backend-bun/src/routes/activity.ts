import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware, requireAuth } from "../middleware/auth.ts";
import * as activityRepo from "../db/activity.ts";
import { parseIsoToEpoch } from "../lib/time.ts";
import type { Env } from "../lib/types.ts";

export const activityRoutes = new Hono<Env>();

activityRoutes.use("*", authMiddleware);
activityRoutes.use("*", requireAuth);

activityRoutes.get(
  "/events",
  zValidator(
    "query",
    z.object({
      start: z.string(),
      end: z.string(),
      source: z.string().optional(),
      account_id: z.string().optional(),
      limit: z.string().optional(),
    })
  ),
  (c) => {
    const query = c.req.valid("query");

    const startTs = parseIsoToEpoch(query.start);
    const endTs = parseIsoToEpoch(query.end);

    if (startTs >= endTs) {
      return c.json({ detail: "start must be before end" }, 400);
    }

    return c.json({
      events: activityRepo.fetchActivityEvents(startTs, endTs, {
        source: query.source,
        accountId: query.account_id,
        limit: query.limit ? parseInt(query.limit) : undefined,
      }),
    });
  }
);
