import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware, requireAuth } from "../middleware/auth.ts";
import * as atlassianRepo from "../db/atlassian.ts";
import * as jobsRepo from "../db/jobs.ts";
import { enqueueJob } from "../services/jobs.ts";
import { manager } from "../websocket/manager.ts";
import type { Env } from "../lib/types.ts";

const ConfluenceAccountCreateSchema = z.object({
  org: z.string(),
  email: z.string(),
  api_token: z.string(),
});

export const confluenceRoutes = new Hono<Env>();

confluenceRoutes.use("*", authMiddleware);
confluenceRoutes.use("*", requireAuth);

confluenceRoutes.get("/accounts", (c) => {
  return c.json({ accounts: atlassianRepo.fetchAtlassianAccounts("confluence") });
});

confluenceRoutes.post("/accounts", zValidator("json", ConfluenceAccountCreateSchema), (c) => {
  const body = c.req.valid("json");
  const accountId = atlassianRepo.createAtlassianAccount(
    "confluence",
    body.org,
    body.email,
    body.api_token
  );
  const account = atlassianRepo.fetchAtlassianAccount(accountId);
  if (!account) throw new Error("Failed to create account");
  const { api_token: _, ...publicAccount } = account;
  return c.json(publicAccount);
});

confluenceRoutes.delete(
  "/accounts/:accountId",
  zValidator("param", z.object({ accountId: z.string() })),
  (c) => {
    const { accountId } = c.req.valid("param");
    atlassianRepo.deleteAtlassianAccount(accountId);
    return c.json({ ok: true });
  }
);

confluenceRoutes.post(
  "/accounts/:accountId/sync",
  zValidator("param", z.object({ accountId: z.string() })),
  (c) => {
    const { accountId } = c.req.valid("param");
    const payload = { account_id: accountId };
    const jobId = jobsRepo.createJob("connector.confluence.sync", payload);
    enqueueJob(jobId);
    manager.emitLog("info", `Confluence sync job queued ${jobId}`);
    return c.json({ job_id: jobId, status: "queued" });
  }
);
