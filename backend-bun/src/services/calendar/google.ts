import { google, type calendar_v3 } from "googleapis";
import * as calendarRepo from "../../db/calendar.ts";
import { refreshAccessToken } from "./oauth.ts";
import { parseIsoToEpoch } from "../../lib/time.ts";

interface Credentials {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

async function getAuthedClient(accountId: string): Promise<calendar_v3.Calendar> {
  const account = calendarRepo.fetchAccount(accountId);
  if (!account || !account.credentials) {
    throw new Error("Account not found or not connected");
  }

  const creds = account.credentials as unknown as Credentials;

  // Check if token needs refresh (60 second buffer)
  const expiresAt = new Date(creds.expires_at).getTime();
  const now = Date.now();

  if (expiresAt - now < 60000) {
    // Refresh token
    const newTokens = await refreshAccessToken(creds.refresh_token);
    const updatedCreds = {
      ...creds,
      access_token: newTokens.access_token,
      expires_at: newTokens.expires_at,
    };
    calendarRepo.updateAccountCredentials(accountId, updatedCreds);
    creds.access_token = newTokens.access_token;
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: creds.access_token });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

export interface ParsedCalendar {
  calendar_id: string;
  name: string;
  description: string | null;
  is_primary: boolean;
  access_role: string | null;
  background_color: string | null;
  foreground_color: string | null;
  time_zone: string | null;
}

export async function listCalendars(accountId: string): Promise<ParsedCalendar[]> {
  const calendar = await getAuthedClient(accountId);

  const response = await calendar.calendarList.list();
  const items = response.data.items || [];

  return items.map((item) => ({
    calendar_id: item.id || "",
    name: item.summary || "",
    description: item.description || null,
    is_primary: item.primary === true,
    access_role: item.accessRole || null,
    background_color: item.backgroundColor || null,
    foreground_color: item.foregroundColor || null,
    time_zone: item.timeZone || null,
  }));
}

export interface ParsedEvent {
  event_id: string;
  title: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  start_ts: number | null;
  end_ts: number | null;
  all_day: boolean;
  location: string | null;
  conference_url: string | null;
  visibility: string | null;
  status: string | null;
  organizer: Record<string, unknown> | null;
  attendees: Record<string, unknown>[] | null;
  html_link: string | null;
  time_zone: string | null;
}

function parseEvent(event: calendar_v3.Schema$Event, calendarTz: string | null): ParsedEvent {
  const start = event.start;
  const end = event.end;

  let startTime: string | null = null;
  let endTime: string | null = null;
  let startTs: number | null = null;
  let endTs: number | null = null;
  let allDay = false;
  let timeZone = calendarTz;

  if (start?.date) {
    // All-day event
    allDay = true;
    startTime = start.date;
    startTs = parseIsoToEpoch(start.date);
  } else if (start?.dateTime) {
    startTime = start.dateTime;
    startTs = parseIsoToEpoch(start.dateTime);
    timeZone = start.timeZone || calendarTz;
  }

  if (end?.date) {
    endTime = end.date;
    endTs = parseIsoToEpoch(end.date);
  } else if (end?.dateTime) {
    endTime = end.dateTime;
    endTs = parseIsoToEpoch(end.dateTime);
  }

  // Conference URL
  let conferenceUrl: string | null = null;
  if (event.hangoutLink) {
    conferenceUrl = event.hangoutLink;
  } else if (event.conferenceData?.entryPoints?.[0]?.uri) {
    conferenceUrl = event.conferenceData.entryPoints[0].uri;
  }

  return {
    event_id: event.id || "",
    title: event.summary || null,
    description: event.description || null,
    start_time: startTime,
    end_time: endTime,
    start_ts: startTs,
    end_ts: endTs,
    all_day: allDay,
    location: event.location || null,
    conference_url: conferenceUrl,
    visibility: event.visibility || null,
    status: event.status || null,
    organizer: event.organizer
      ? { email: event.organizer.email, displayName: event.organizer.displayName }
      : null,
    attendees: event.attendees
      ? event.attendees.map((a) => ({
          email: a.email,
          displayName: a.displayName,
          responseStatus: a.responseStatus,
        }))
      : null,
    html_link: event.htmlLink || null,
    time_zone: timeZone,
  };
}

export interface EventsResult {
  events: ParsedEvent[];
  nextSyncToken: string | null;
  deletedEventIds: string[];
}

export async function listEvents(
  accountId: string,
  calendarId: string,
  options: {
    syncToken?: string;
    timeMin?: string;
    timeMax?: string;
    calendarTz?: string | null;
  } = {}
): Promise<EventsResult> {
  const calendar = await getAuthedClient(accountId);
  const { syncToken, timeMin, timeMax, calendarTz } = options;

  const events: ParsedEvent[] = [];
  const deletedEventIds: string[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  try {
    do {
      const params: calendar_v3.Params$Resource$Events$List = {
        calendarId,
        singleEvents: true,
        orderBy: "startTime",
        pageToken,
        maxResults: 250,
      };

      if (syncToken) {
        params.syncToken = syncToken;
      } else {
        if (timeMin) params.timeMin = timeMin;
        if (timeMax) params.timeMax = timeMax;
      }

      const response = await calendar.events.list(params);

      for (const item of response.data.items || []) {
        if (item.status === "cancelled") {
          if (item.id) deletedEventIds.push(item.id);
        } else {
          events.push(parseEvent(item, calendarTz ?? null));
        }
      }

      pageToken = response.data.nextPageToken ?? undefined;
      nextSyncToken = response.data.nextSyncToken ?? null;
    } while (pageToken);

    return { events, nextSyncToken, deletedEventIds };
  } catch (error: unknown) {
    // Handle 410 Gone (sync token expired)
    if (error instanceof Error && error.message.includes("410")) {
      // Return empty result to trigger full sync
      return { events: [], nextSyncToken: null, deletedEventIds: [] };
    }
    throw error;
  }
}
