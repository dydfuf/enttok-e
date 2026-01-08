import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware, requireAuth } from "../middleware/auth.ts";
import * as calendarRepo from "../db/calendar.ts";
import * as jobsRepo from "../db/jobs.ts";
import { enqueueJob } from "../services/jobs.ts";
import {
  startGoogleOAuth,
  getOAuthState,
  exchangeCodeForTokens,
  fetchUserEmail,
} from "../services/calendar/oauth.ts";
import { manager } from "../websocket/manager.ts";
import { parseIsoToEpoch } from "../lib/time.ts";
import {
  CalendarAccountCreateSchema,
  CalendarSelectionUpdateSchema,
  OAuthCallbackRequestSchema,
  type CalendarProviderInfo,
  type OAuthStartResponse,
  type OAuthCompleteResponse,
} from "../schemas/calendar.ts";
import type { Env } from "../lib/types.ts";

const PROVIDERS: CalendarProviderInfo[] = [
  {
    id: "google",
    label: "Google Calendar",
    auth_method: "oauth2_pkce",
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    notes: "Uses OAuth 2.0 with PKCE for secure desktop app authentication",
  },
  {
    id: "apple",
    label: "Apple Calendar",
    auth_method: "caldav",
    scopes: [],
    notes: "Uses CalDAV protocol with app-specific password",
  },
];

export const calendarRoutes = new Hono<Env>();

calendarRoutes.use("*", authMiddleware);

// Providers (requires auth)
calendarRoutes.get("/providers", requireAuth, (c) => {
  return c.json({ providers: PROVIDERS });
});

// Accounts
calendarRoutes.post(
  "/accounts",
  requireAuth,
  zValidator("json", CalendarAccountCreateSchema),
  (c) => {
    const body = c.req.valid("json");
    const accountId = calendarRepo.createAccount(
      body.provider,
      body.display_name ?? null,
      body.email ?? null,
      body.credentials ?? null,
      body.config ?? null
    );
    const account = calendarRepo.fetchAccount(accountId);
    if (!account) throw new Error("Failed to create account");
    const { credentials: _, ...publicAccount } = account;
    return c.json(publicAccount);
  }
);

calendarRoutes.get("/accounts", requireAuth, (c) => {
  return c.json({ accounts: calendarRepo.fetchAccounts() });
});

calendarRoutes.get(
  "/accounts/:accountId",
  requireAuth,
  zValidator("param", z.object({ accountId: z.string() })),
  (c) => {
    const { accountId } = c.req.valid("param");
    const account = calendarRepo.fetchAccount(accountId);
    if (!account) {
      return c.json({ detail: "Account not found" }, 404);
    }
    const { credentials: _, ...publicAccount } = account;
    return c.json(publicAccount);
  }
);

calendarRoutes.delete(
  "/accounts/:accountId",
  requireAuth,
  zValidator("param", z.object({ accountId: z.string() })),
  (c) => {
    const { accountId } = c.req.valid("param");
    calendarRepo.deleteAccount(accountId);
    return c.json({ ok: true });
  }
);

// Calendars
calendarRoutes.get(
  "/calendars",
  requireAuth,
  zValidator(
    "query",
    z.object({
      account_id: z.string().optional(),
      selected_only: z.string().optional(),
    })
  ),
  (c) => {
    const query = c.req.valid("query");
    const accountId = query.account_id;
    const selectedOnly = query.selected_only !== "false";
    return c.json({ calendars: calendarRepo.fetchCalendars(accountId, selectedOnly) });
  }
);

calendarRoutes.patch(
  "/calendars/:accountId/:calendarId",
  requireAuth,
  zValidator("param", z.object({ accountId: z.string(), calendarId: z.string() })),
  zValidator("json", CalendarSelectionUpdateSchema),
  (c) => {
    const { accountId, calendarId } = c.req.valid("param");
    const body = c.req.valid("json");
    calendarRepo.updateCalendarSelection(accountId, calendarId, body.selected);
    return c.json({ ok: true });
  }
);

// Events
calendarRoutes.get(
  "/events",
  requireAuth,
  zValidator(
    "query",
    z.object({
      start: z.string(),
      end: z.string(),
      account_id: z.string().optional(),
      calendar_ids: z.string().optional(),
      selected_only: z.string().optional(),
    })
  ),
  (c) => {
    const query = c.req.valid("query");

    const startTs = parseIsoToEpoch(query.start);
    const endTs = parseIsoToEpoch(query.end);

    if (startTs >= endTs) {
      return c.json({ detail: "start must be before end" }, 400);
    }

    const calendarIds = query.calendar_ids?.split(",").filter(Boolean);
    const selectedOnly = query.selected_only !== "false";

    return c.json({
      events: calendarRepo.fetchEvents(startTs, endTs, {
        accountId: query.account_id,
        calendarIds,
        selectedOnly,
      }),
    });
  }
);

// Sync
calendarRoutes.post(
  "/accounts/:accountId/sync",
  requireAuth,
  zValidator("param", z.object({ accountId: z.string() })),
  zValidator("json", z.record(z.string(), z.unknown()).optional()),
  (c) => {
    const { accountId } = c.req.valid("param");
    const body = c.req.valid("json") ?? {};
    const payload = { ...body, account_id: accountId };
    const jobId = jobsRepo.createJob("connector.calendar.sync", payload as Record<string, unknown>);
    enqueueJob(jobId);
    manager.emitLog("info", `Calendar sync job queued ${jobId}`);
    return c.json({ job_id: jobId, status: "queued" });
  }
);

// Google OAuth
calendarRoutes.post("/oauth/google/start", requireAuth, async (c) => {
  const result = await startGoogleOAuth();
  return c.json<OAuthStartResponse>(result);
});

calendarRoutes.get(
  "/oauth/google/callback",
  zValidator(
    "query",
    z.object({
      code: z.string().optional(),
      state: z.string().optional(),
      error: z.string().optional(),
    })
  ),
  async (c) => {
    const { code, state, error } = c.req.valid("query");

    if (error) {
      return c.html(
        `<html><body><h1>Error</h1><p>${error}</p><script>window.close();</script></body></html>`
      );
    }

    if (!code || !state) {
      return c.html(
        `<html><body><h1>Error</h1><p>Missing code or state</p><script>window.close();</script></body></html>`
      );
    }

    const oauthState = getOAuthState(state);
    if (!oauthState) {
      return c.html(
        `<html><body><h1>Error</h1><p>Invalid or expired state</p><script>window.close();</script></body></html>`
      );
    }

    try {
      const tokens = await exchangeCodeForTokens(
        code,
        oauthState.code_verifier,
        oauthState.redirect_uri
      );

      const email = await fetchUserEmail(tokens.access_token);

      calendarRepo.createAccount(
        "google",
        email,
        email,
        tokens,
        { scopes: ["https://www.googleapis.com/auth/calendar.readonly"] }
      );

      manager.emitLog("info", `Google Calendar connected: ${email}`);

      return c.html(
        `<html><body><h1>Success!</h1><p>Google Calendar connected as ${email}</p><p>You can close this window.</p><script>window.close();</script></body></html>`
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      return c.html(
        `<html><body><h1>Error</h1><p>${errorMessage}</p><script>window.close();</script></body></html>`
      );
    }
  }
);

calendarRoutes.post(
  "/oauth/google/complete",
  requireAuth,
  zValidator("json", OAuthCallbackRequestSchema),
  async (c) => {
    const body = c.req.valid("json");
    const oauthState = getOAuthState(body.state);
    if (!oauthState) {
      return c.json<OAuthCompleteResponse>({
        account: null,
        success: false,
        message: "Invalid or expired state",
      });
    }

    try {
      const tokens = await exchangeCodeForTokens(
        body.code,
        oauthState.code_verifier,
        oauthState.redirect_uri
      );

      const email = await fetchUserEmail(tokens.access_token);

      const accountId = calendarRepo.createAccount(
        "google",
        email,
        email,
        tokens,
        { scopes: ["https://www.googleapis.com/auth/calendar.readonly"] }
      );

      const account = calendarRepo.fetchAccount(accountId);
      if (!account) {
        return c.json<OAuthCompleteResponse>({
          account: null,
          success: false,
          message: "Failed to create account",
        });
      }

      const { credentials: _, ...publicAccount } = account;
      return c.json<OAuthCompleteResponse>({
        account: publicAccount,
        success: true,
        message: "Success",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      return c.json<OAuthCompleteResponse>({
        account: null,
        success: false,
        message: errorMessage,
      });
    }
  }
);
