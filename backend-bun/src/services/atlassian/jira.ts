/**
 * Jira sync service - fetches issues and extracts activity events
 */

import { atlassianFetch, type AtlassianAuth } from "./client.ts";
import * as atlassianRepo from "../../db/atlassian.ts";
import * as activityRepo from "../../db/activity.ts";
import * as jobsRepo from "../../db/jobs.ts";
import { manager } from "../../websocket/manager.ts";
import { parseIsoToEpoch } from "../../lib/time.ts";
import type { ActivityEventInput } from "../../db/activity.ts";

// JQL query to find issues the user is involved with
const JQL_QUERY = `
  (creator = currentUser() OR reporter = currentUser() OR assignee = currentUser() OR commenter = currentUser())
  AND updated >= -7d
  ORDER BY updated DESC
`.trim().replace(/\s+/g, " ");

interface JiraSearchResponse {
  issues: JiraIssue[];
  nextPageToken?: string;
}

interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    created: string;
    updated: string;
    status?: { name: string };
    creator?: { displayName: string; emailAddress?: string };
    reporter?: { displayName: string; emailAddress?: string };
    assignee?: { displayName: string; emailAddress?: string } | null;
    comment?: {
      comments: JiraComment[];
    };
  };
  changelog?: {
    histories: JiraHistory[];
  };
}

interface JiraComment {
  id: string;
  created: string;
  updated: string;
  author: { displayName: string; emailAddress?: string };
  body?: unknown;
}

interface JiraHistory {
  id: string;
  created: string;
  author: { displayName: string; emailAddress?: string };
  items: JiraHistoryItem[];
}

interface JiraHistoryItem {
  field: string;
  fieldtype: string;
  from: string | null;
  fromString: string | null;
  to: string | null;
  toString: string | null;
}

async function searchIssues(
  auth: AtlassianAuth,
  email: string,
  nextPageToken?: string
): Promise<JiraSearchResponse> {
  const payload: Record<string, unknown> = {
    jql: JQL_QUERY,
    maxResults: 50,
    fields: ["summary", "created", "updated", "status", "creator", "reporter", "assignee", "comment"],
    expand: ["changelog"],
  };

  if (nextPageToken) {
    payload.nextPageToken = nextPageToken;
  }

  const result = await atlassianFetch<JiraSearchResponse>(auth, "/rest/api/3/search", {
    method: "POST",
    body: payload,
  });

  return result ?? { issues: [] };
}

function extractIssueUrl(issue: JiraIssue, baseUrl: string): string {
  return `${baseUrl}/browse/${issue.key}`;
}

function parseIssueEvents(
  issue: JiraIssue,
  accountId: string,
  userEmail: string,
  baseUrl: string
): ActivityEventInput[] {
  const events: ActivityEventInput[] = [];
  const issueUrl = extractIssueUrl(issue, baseUrl);
  const userEmailLower = userEmail.toLowerCase();

  // Helper to check if author matches user
  const isUser = (author?: { emailAddress?: string }): boolean => {
    return author?.emailAddress?.toLowerCase() === userEmailLower;
  };

  // 1. Issue created event
  if (issue.fields.creator && isUser(issue.fields.creator)) {
    const createdTs = parseIsoToEpoch(issue.fields.created);
    events.push({
      event_id: `jira:issue:created:${issue.id}`,
      source: "jira",
      account_id: accountId,
      event_type: "issue.created",
      title: `Created: ${issue.key} - ${issue.fields.summary}`,
      url: issueUrl,
      actor: issue.fields.creator.displayName,
      event_time: issue.fields.created,
      event_ts: createdTs,
    });
  }

  // 2. Status change events from changelog
  if (issue.changelog?.histories) {
    for (const history of issue.changelog.histories) {
      // Only include if user is author OR user is assignee
      const includeHistory = isUser(history.author) || (issue.fields.assignee && isUser(issue.fields.assignee));
      if (!includeHistory) continue;

      for (const item of history.items) {
        if (item.field.toLowerCase() === "status") {
          const historyTs = parseIsoToEpoch(history.created);
          events.push({
            event_id: `jira:status:${history.id}:${issue.id}:${item.field}`,
            source: "jira",
            account_id: accountId,
            event_type: "issue.status.changed",
            title: `${issue.key}: ${item.fromString ?? "?"} → ${item.toString ?? "?"}`,
            description: `Status changed on ${issue.fields.summary}`,
            url: issueUrl,
            actor: history.author.displayName,
            event_time: history.created,
            event_ts: historyTs,
          });
        }
      }
    }
  }

  // 3. Comment events
  if (issue.fields.comment?.comments) {
    for (const comment of issue.fields.comment.comments) {
      if (!isUser(comment.author)) continue;

      const commentTs = parseIsoToEpoch(comment.created);
      events.push({
        event_id: `jira:comment:${comment.id}`,
        source: "jira",
        account_id: accountId,
        event_type: "issue.commented",
        title: `Commented on ${issue.key}`,
        description: issue.fields.summary,
        url: issueUrl,
        actor: comment.author.displayName,
        event_time: comment.created,
        event_ts: commentTs,
      });
    }
  }

  // 4. Issue updated event (if user is assignee and not already captured)
  if (issue.fields.assignee && isUser(issue.fields.assignee)) {
    const updatedTs = parseIsoToEpoch(issue.fields.updated);
    const createdTs = parseIsoToEpoch(issue.fields.created);

    // Only add if updated != created (to avoid duplicate with created event)
    if (updatedTs !== createdTs) {
      events.push({
        event_id: `jira:issue:updated:${issue.id}:${updatedTs}`,
        source: "jira",
        account_id: accountId,
        event_type: "issue.updated",
        title: `Updated: ${issue.key} - ${issue.fields.summary}`,
        url: issueUrl,
        actor: issue.fields.assignee.displayName,
        event_time: issue.fields.updated,
        event_ts: updatedTs,
      });
    }
  }

  return events;
}

async function fetchAllEvents(
  auth: AtlassianAuth,
  accountId: string,
  userEmail: string
): Promise<ActivityEventInput[]> {
  const allEvents: ActivityEventInput[] = [];
  let nextPageToken: string | undefined;
  let pageCount = 0;
  const maxPages = 10; // Safety limit

  do {
    const response = await searchIssues(auth, userEmail, nextPageToken);

    for (const issue of response.issues) {
      const issueEvents = parseIssueEvents(issue, accountId, userEmail, auth.baseUrl);
      allEvents.push(...issueEvents);
    }

    nextPageToken = response.nextPageToken;
    pageCount++;

    if (pageCount >= maxPages) {
      console.warn("Jira sync: reached max page limit");
      break;
    }
  } while (nextPageToken);

  return allEvents;
}

export async function runJiraSyncJob(
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

  if (account.service !== "jira") {
    jobsRepo.updateJob(jobId, {
      status: "failed",
      error: { message: `Invalid service type: ${account.service}` },
    });
    manager.emitJobStatus(jobId, "failed");
    return;
  }

  jobsRepo.updateJob(jobId, { status: "running", progress: 0.1, message: "Fetching Jira issues" });
  manager.emitJobStatus(jobId, "running");

  try {
    const auth: AtlassianAuth = {
      baseUrl: account.base_url,
      email: account.email,
      apiToken: account.api_token,
    };

    // Fetch all events
    jobsRepo.updateJob(jobId, { progress: 0.2, message: "Parsing issues" });
    const events = await fetchAllEvents(auth, accountId, account.email);

    // Upsert events
    jobsRepo.updateJob(jobId, { progress: 0.7, message: "Saving events" });
    const savedCount = activityRepo.upsertActivityEvents(events);

    // Update sync state
    const connector = `jira:${accountId}`;
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
    jobsRepo.recordEvent(jobId, "info", `Jira sync completed: ${savedCount} events`);
    manager.emitJobStatus(jobId, "succeeded");

    // Broadcast activity sync event
    manager.broadcast({
      type: "activity.sync",
      source: "jira",
      account_id: accountId,
      event_count: savedCount,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    jobsRepo.updateJob(jobId, {
      status: "failed",
      error: { message: errorMessage },
    });
    jobsRepo.recordEvent(jobId, "error", `Jira sync failed: ${errorMessage}`);
    manager.emitJobStatus(jobId, "failed");
  }
}
