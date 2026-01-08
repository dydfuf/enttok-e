import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware, requireAuth } from "../middleware/auth.ts";
import * as atlassianRepo from "../db/atlassian.ts";
import * as jobsRepo from "../db/jobs.ts";
import { enqueueJob } from "../services/jobs.ts";
import { manager } from "../websocket/manager.ts";
import type { Env } from "../lib/types.ts";

const JiraAccountCreateSchema = z.object({
  org: z.string(),
  email: z.string(),
  api_token: z.string(),
});

export const jiraRoutes = new Hono<Env>();

jiraRoutes.use("*", authMiddleware);
jiraRoutes.use("*", requireAuth);

jiraRoutes.get("/accounts", (c) => {
  return c.json({ accounts: atlassianRepo.fetchAtlassianAccounts("jira") });
});

jiraRoutes.post("/accounts", zValidator("json", JiraAccountCreateSchema), (c) => {
  const body = c.req.valid("json");
  const accountId = atlassianRepo.createAtlassianAccount(
    "jira",
    body.org,
    body.email,
    body.api_token
  );
  const account = atlassianRepo.fetchAtlassianAccount(accountId);
  if (!account) throw new Error("Failed to create account");
  const { api_token: _, ...publicAccount } = account;
  return c.json(publicAccount);
});

jiraRoutes.delete(
  "/accounts/:accountId",
  zValidator("param", z.object({ accountId: z.string() })),
  (c) => {
    const { accountId } = c.req.valid("param");
    atlassianRepo.deleteAtlassianAccount(accountId);
    return c.json({ ok: true });
  }
);

jiraRoutes.post(
  "/accounts/:accountId/sync",
  zValidator("param", z.object({ accountId: z.string() })),
  (c) => {
    const { accountId } = c.req.valid("param");
    const payload = { account_id: accountId };
    const jobId = jobsRepo.createJob("connector.jira.sync", payload);
    enqueueJob(jobId);
    manager.emitLog("info", `Jira sync job queued ${jobId}`);
    return c.json({ job_id: jobId, status: "queued" });
  }
);
