/**
 * Confluence sync service - fetches pages/blogposts/comments and extracts activity events
 */

import { atlassianFetch, type AtlassianAuth } from "./client.ts";
import * as atlassianRepo from "../../db/atlassian.ts";
import * as activityRepo from "../../db/activity.ts";
import * as jobsRepo from "../../db/jobs.ts";
import { manager } from "../../websocket/manager.ts";
import { parseIsoToEpoch } from "../../lib/time.ts";
import type { ActivityEventInput } from "../../db/activity.ts";

// CQL queries
const CONTENT_CQL = `
  type in ("page","blogpost")
  AND (creator = currentUser() OR lastmodifiedby = currentUser())
  AND lastmodified >= now("-7d")
  ORDER BY lastmodified DESC
`.trim().replace(/\s+/g, " ");

const COMMENT_CQL = `
  type = comment
  AND creator = currentUser()
  AND created >= now("-7d")
  ORDER BY created DESC
`.trim().replace(/\s+/g, " ");

interface ConfluenceSearchResponse {
  results: ConfluenceContent[];
  start: number;
  limit: number;
  totalSize: number;
  _links?: {
    base?: string;
  };
}

interface ConfluenceContent {
  id: string;
  type: string;
  title: string;
  status: string;
  _links?: {
    webui?: string;
    self?: string;
  };
  history?: {
    createdBy?: { displayName: string; email?: string };
    createdDate?: string;
    lastUpdated?: {
      by?: { displayName: string; email?: string };
      when?: string;
      number?: number;
    };
  };
  version?: {
    by?: { displayName: string; email?: string };
    when?: string;
    number?: number;
  };
  container?: {
    title?: string;
    _links?: {
      webui?: string;
    };
  };
}

async function searchContent(
  auth: AtlassianAuth,
  cql: string,
  start: number = 0,
  limit: number = 50
): Promise<ConfluenceSearchResponse> {
  const params = new URLSearchParams({
    cql,
    start: String(start),
    limit: String(limit),
    expand: "history,history.lastUpdated,version,container",
  });

  const result = await atlassianFetch<ConfluenceSearchResponse>(
    auth,
    `/wiki/rest/api/content/search?${params}`
  );

  return result ?? { results: [], start: 0, limit, totalSize: 0 };
}

function buildContentUrl(content: ConfluenceContent, baseUrl: string): string {
  if (content._links?.webui) {
    return `${baseUrl}/wiki${content._links.webui}`;
  }
  return `${baseUrl}/wiki/spaces`;
}

function parseContentEvents(
  content: ConfluenceContent,
  accountId: string,
  userEmail: string,
  baseUrl: string
): ActivityEventInput[] {
  const events: ActivityEventInput[] = [];
  const contentUrl = buildContentUrl(content, baseUrl);
  const userEmailLower = userEmail.toLowerCase();

  const isUser = (author?: { email?: string }): boolean => {
    return author?.email?.toLowerCase() === userEmailLower;
  };

  const contentType = content.type === "blogpost" ? "blogpost" : "page";

  // 1. Content created event
  if (content.history?.createdDate && isUser(content.history.createdBy)) {
    const createdTs = parseIsoToEpoch(content.history.createdDate);
    events.push({
      event_id: `confluence:created:${content.id}`,
      source: "confluence",
      account_id: accountId,
      event_type: `${contentType}.created`,
      title: `Created ${contentType}: ${content.title}`,
      url: contentUrl,
      actor: content.history.createdBy?.displayName ?? "Unknown",
      event_time: content.history.createdDate,
      event_ts: createdTs,
    });
  }

  // 2. Content updated event (if version > 1)
  const version = content.version ?? content.history?.lastUpdated;
  if (version?.when && version.number && version.number > 1) {
    const updatedBy = version.by;
    if (isUser(updatedBy)) {
      const updatedTs = parseIsoToEpoch(version.when);
      events.push({
        event_id: `confluence:updated:${content.id}:${version.number}`,
        source: "confluence",
        account_id: accountId,
        event_type: `${contentType}.updated`,
        title: `Updated ${contentType}: ${content.title}`,
        description: `Version ${version.number}`,
        url: contentUrl,
        actor: updatedBy?.displayName ?? "Unknown",
        event_time: version.when,
        event_ts: updatedTs,
      });
    }
  }

  return events;
}

function parseCommentEvents(
  content: ConfluenceContent,
  accountId: string,
  userEmail: string,
  baseUrl: string
): ActivityEventInput[] {
  const events: ActivityEventInput[] = [];
  const userEmailLower = userEmail.toLowerCase();

  const isUser = (author?: { email?: string }): boolean => {
    return author?.email?.toLowerCase() === userEmailLower;
  };

  // Comment created event
  if (content.history?.createdDate && isUser(content.history.createdBy)) {
    const createdTs = parseIsoToEpoch(content.history.createdDate);
    const containerTitle = content.container?.title ?? "Unknown page";
    const containerUrl = content.container?._links?.webui
      ? `${baseUrl}/wiki${content.container._links.webui}`
      : buildContentUrl(content, baseUrl);

    events.push({
      event_id: `confluence:comment:${content.id}`,
      source: "confluence",
      account_id: accountId,
      event_type: "comment.created",
      title: `Commented on: ${containerTitle}`,
      url: containerUrl,
      actor: content.history.createdBy?.displayName ?? "Unknown",
      event_time: content.history.createdDate,
      event_ts: createdTs,
    });
  }

  return events;
}

async function fetchAllEvents(
  auth: AtlassianAuth,
  accountId: string,
  userEmail: string
): Promise<ActivityEventInput[]> {
  const allEvents: ActivityEventInput[] = [];
  const maxPages = 10;

  // Fetch content (pages/blogposts)
  let start = 0;
  let pageCount = 0;

  do {
    const response = await searchContent(auth, CONTENT_CQL, start);

    for (const content of response.results) {
      const contentEvents = parseContentEvents(content, accountId, userEmail, auth.baseUrl);
      allEvents.push(...contentEvents);
    }

    start = response.start + response.limit;
    pageCount++;

    if (start >= response.totalSize || pageCount >= maxPages) break;
  } while (true);

  // Fetch comments
  start = 0;
  pageCount = 0;

  do {
    const response = await searchContent(auth, COMMENT_CQL, start);

    for (const content of response.results) {
      const commentEvents = parseCommentEvents(content, accountId, userEmail, auth.baseUrl);
      allEvents.push(...commentEvents);
    }

    start = response.start + response.limit;
    pageCount++;

    if (start >= response.totalSize || pageCount >= maxPages) break;
  } while (true);

  return allEvents;
}

export async function runConfluenceSyncJob(
  jobId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const accountId = payload.account_id as string;

  // Validate account
  const account = atlassianRepo.fetchAtlassianAccount(accountId);
  if (!account) {
    jobsRepo.updateJob(jobId, {
      status: "failed",
      error: { message: "Account not found" },
    });
    manager.emitJobStatus(jobId, "failed");
    return;
  }

  if (account.service !== "confluence") {
    jobsRepo.updateJob(jobId, {
      status: "failed",
      error: { message: `Invalid service type: ${account.service}` },
    });
    manager.emitJobStatus(jobId, "failed");
    return;
  }

  jobsRepo.updateJob(jobId, { status: "running", progress: 0.1, message: "Fetching Confluence content" });
  manager.emitJobStatus(jobId, "running");

  try {
    const auth: AtlassianAuth = {
      baseUrl: account.base_url,
      email: account.email,
      apiToken: account.api_token,
    };

    // Fetch all events
    jobsRepo.updateJob(jobId, { progress: 0.2, message: "Parsing content" });
    const events = await fetchAllEvents(auth, accountId, account.email);

    // Upsert events
    jobsRepo.updateJob(jobId, { progress: 0.7, message: "Saving events" });
    const savedCount = activityRepo.upsertActivityEvents(events);

    // Update sync state
    const connector = `confluence:${accountId}`;
    atlassianRepo.upsertSyncState(connector, null);

    // Complete
    jobsRepo.updateJob(jobId, {
      status: "succeeded",
      progress: 1,
      result: {
        account_id: accountId,
        events_found: events.length,
        events_saved: savedCount,
      },
    });
    jobsRepo.recordEvent(jobId, "info", `Confluence sync completed: ${savedCount} events`);
    manager.emitJobStatus(jobId, "succeeded");

    // Broadcast activity sync event
    manager.broadcast({
      type: "activity.sync",
      source: "confluence",
      account_id: accountId,
      event_count: savedCount,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    jobsRepo.updateJob(jobId, {
      status: "failed",
      error: { message: errorMessage },
    });
    jobsRepo.recordEvent(jobId, "error", `Confluence sync failed: ${errorMessage}`);
    manager.emitJobStatus(jobId, "failed");
  }
}
