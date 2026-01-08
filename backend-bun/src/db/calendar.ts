import { getDb } from "./connection.ts";
import { utcNow, generateId } from "../lib/time.ts";
import type {
  CalendarAccount,
  CalendarListItem,
  CalendarEvent,
  CalendarProvider,
} from "../schemas/calendar.ts";

// Raw DB row types
interface AccountRow {
  account_id: string;
  provider: string;
  email: string | null;
  display_name: string | null;
  credentials_json: string | null;
  config_json: string | null;
  created_at: string;
  updated_at: string;
}

interface CalendarRow {
  account_id: string;
  calendar_id: string;
  provider: string;
  name: string | null;
  description: string | null;
  is_primary: number;
  access_role: string | null;
  background_color: string | null;
  foreground_color: string | null;
  time_zone: string | null;
  selected: number;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  account_id: string;
  calendar_id: string;
  event_id: string;
  title: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  start_ts: number | null;
  end_ts: number | null;
  all_day: number;
  location: string | null;
  conference_url: string | null;
  visibility: string | null;
  status: string | null;
  organizer_json: string | null;
  attendees_json: string | null;
  html_link: string | null;
  time_zone: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface SyncStateRow {
  connector: string;
  cursor: string | null;
  last_sync_at: string | null;
}

// === ACCOUNTS ===

export function createAccount(
  provider: CalendarProvider,
  displayName: string | null,
  email: string | null,
  credentials: Record<string, unknown> | null,
  config: Record<string, unknown> | null
): string {
  const accountId = generateId("cal");
  const now = utcNow();

  const stmt = getDb().prepare(`
    INSERT INTO calendar_accounts
    (account_id, provider, email, display_name, credentials_json, config_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    accountId,
    provider,
    email,
    displayName,
    credentials ? JSON.stringify(credentials) : null,
    config ? JSON.stringify(config) : null,
    now,
    now
  );

  return accountId;
}

export function fetchAccount(accountId: string): (CalendarAccount & { credentials: Record<string, unknown> | null }) | null {
  const stmt = getDb().prepare<AccountRow, [string]>(
    "SELECT * FROM calendar_accounts WHERE account_id = ?"
  );
  const row = stmt.get(accountId);
  if (!row) return null;

  // Get last sync time
  const syncState = fetchSyncState(`calendar:${accountId}`);

  return {
    account_id: row.account_id,
    provider: row.provider as CalendarProvider,
    display_name: row.display_name,
    email: row.email,
    connected: !!row.credentials_json,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_sync_at: syncState?.last_sync_at ?? null,
    credentials: row.credentials_json ? JSON.parse(row.credentials_json) : null,
  };
}

export function fetchAccounts(): CalendarAccount[] {
  const stmt = getDb().prepare<AccountRow, []>("SELECT * FROM calendar_accounts ORDER BY created_at DESC");
  const rows = stmt.all();

  return rows.map((row) => {
    const syncState = fetchSyncState(`calendar:${row.account_id}`);
    return {
      account_id: row.account_id,
      provider: row.provider as CalendarProvider,
      display_name: row.display_name,
      email: row.email,
      connected: !!row.credentials_json,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_sync_at: syncState?.last_sync_at ?? null,
    };
  });
}

export function updateAccountCredentials(
  accountId: string,
  credentials: Record<string, unknown>
): void {
  const stmt = getDb().prepare(
    "UPDATE calendar_accounts SET credentials_json = ?, updated_at = ? WHERE account_id = ?"
  );
  stmt.run(JSON.stringify(credentials), utcNow(), accountId);
}

export function deleteAccount(accountId: string): void {
  const db = getDb();
  db.run("DELETE FROM sync_state WHERE connector LIKE ?", [`calendar:${accountId}%`]);
  db.run("DELETE FROM calendar_events WHERE account_id = ?", [accountId]);
  db.run("DELETE FROM calendar_calendars WHERE account_id = ?", [accountId]);
  db.run("DELETE FROM calendar_accounts WHERE account_id = ?", [accountId]);
}

// === CALENDARS ===

export function upsertCalendar(
  accountId: string,
  calendarId: string,
  data: {
    provider: string;
    name: string | null;
    description: string | null;
    is_primary: boolean;
    access_role: string | null;
    background_color: string | null;
    foreground_color: string | null;
    time_zone: string | null;
  }
): void {
  const now = utcNow();
  const stmt = getDb().prepare(`
    INSERT INTO calendar_calendars
    (account_id, calendar_id, provider, name, description, is_primary, access_role,
     background_color, foreground_color, time_zone, selected, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(account_id, calendar_id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      is_primary = excluded.is_primary,
      access_role = excluded.access_role,
      background_color = excluded.background_color,
      foreground_color = excluded.foreground_color,
      time_zone = excluded.time_zone,
      updated_at = excluded.updated_at
  `);
  stmt.run(
    accountId,
    calendarId,
    data.provider,
    data.name,
    data.description,
    data.is_primary ? 1 : 0,
    data.access_role,
    data.background_color,
    data.foreground_color,
    data.time_zone,
    now,
    now
  );
}

export function fetchCalendars(
  accountId?: string,
  selectedOnly = true
): CalendarListItem[] {
  let query = "SELECT * FROM calendar_calendars WHERE 1=1";
  const params: unknown[] = [];

  if (accountId) {
    query += " AND account_id = ?";
    params.push(accountId);
  }
  if (selectedOnly) {
    query += " AND selected = 1";
  }
  query += " ORDER BY is_primary DESC, name ASC";

  const stmt = getDb().prepare(query);
  const rows = stmt.all(...(params as [])) as CalendarRow[];

  return rows.map((row) => ({
    account_id: row.account_id,
    calendar_id: row.calendar_id,
    provider: row.provider,
    name: row.name,
    description: row.description,
    is_primary: row.is_primary === 1,
    access_role: row.access_role,
    background_color: row.background_color,
    foreground_color: row.foreground_color,
    time_zone: row.time_zone,
    selected: row.selected === 1,
  }));
}

export function updateCalendarSelection(
  accountId: string,
  calendarId: string,
  selected: boolean
): void {
  const stmt = getDb().prepare(
    "UPDATE calendar_calendars SET selected = ?, updated_at = ? WHERE account_id = ? AND calendar_id = ?"
  );
  stmt.run(selected ? 1 : 0, utcNow(), accountId, calendarId);
}

export function pruneCalendars(accountId: string, keepCalendarIds: string[]): void {
  if (keepCalendarIds.length === 0) {
    getDb().run("DELETE FROM calendar_calendars WHERE account_id = ?", [accountId]);
    return;
  }
  const placeholders = keepCalendarIds.map(() => "?").join(", ");
  getDb().run(
    `DELETE FROM calendar_calendars WHERE account_id = ? AND calendar_id NOT IN (${placeholders})`,
    [accountId, ...keepCalendarIds]
  );
}

// === EVENTS ===

export function upsertEvent(
  accountId: string,
  calendarId: string,
  eventId: string,
  data: {
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
): void {
  const now = utcNow();
  const stmt = getDb().prepare(`
    INSERT INTO calendar_events
    (account_id, calendar_id, event_id, title, description, start_time, end_time, start_ts, end_ts,
     all_day, location, conference_url, visibility, status, organizer_json, attendees_json,
     html_link, time_zone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, calendar_id, event_id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      start_ts = excluded.start_ts,
      end_ts = excluded.end_ts,
      all_day = excluded.all_day,
      location = excluded.location,
      conference_url = excluded.conference_url,
      visibility = excluded.visibility,
      status = excluded.status,
      organizer_json = excluded.organizer_json,
      attendees_json = excluded.attendees_json,
      html_link = excluded.html_link,
      time_zone = excluded.time_zone,
      updated_at = excluded.updated_at
  `);
  stmt.run(
    accountId,
    calendarId,
    eventId,
    data.title,
    data.description,
    data.start_time,
    data.end_time,
    data.start_ts,
    data.end_ts,
    data.all_day ? 1 : 0,
    data.location,
    data.conference_url,
    data.visibility,
    data.status,
    data.organizer ? JSON.stringify(data.organizer) : null,
    data.attendees ? JSON.stringify(data.attendees) : null,
    data.html_link,
    data.time_zone,
    now,
    now
  );
}

export function deleteEvent(accountId: string, calendarId: string, eventId: string): void {
  const stmt = getDb().prepare(
    "DELETE FROM calendar_events WHERE account_id = ? AND calendar_id = ? AND event_id = ?"
  );
  stmt.run(accountId, calendarId, eventId);
}

export function fetchEvents(
  startTs: number,
  endTs: number,
  options: {
    accountId?: string;
    calendarIds?: string[];
    selectedOnly?: boolean;
  } = {}
): CalendarEvent[] {
  const { accountId, calendarIds, selectedOnly = true } = options;

  let query = `
    SELECT e.*, c.background_color as cal_bg, c.foreground_color as cal_fg
    FROM calendar_events e
    JOIN calendar_calendars c ON e.account_id = c.account_id AND e.calendar_id = c.calendar_id
    WHERE e.start_ts < ? AND e.end_ts > ?
  `;
  const params: unknown[] = [endTs, startTs];

  if (accountId) {
    query += " AND e.account_id = ?";
    params.push(accountId);
  }
  if (calendarIds && calendarIds.length > 0) {
    const placeholders = calendarIds.map(() => "?").join(", ");
    query += ` AND e.calendar_id IN (${placeholders})`;
    params.push(...calendarIds);
  }
  if (selectedOnly) {
    query += " AND c.selected = 1";
  }
  query += " ORDER BY e.start_ts ASC";

  interface EventWithColors extends EventRow {
    cal_bg: string | null;
    cal_fg: string | null;
  }

  const stmt = getDb().prepare(query);
  const rows = stmt.all(...(params as [])) as EventWithColors[];

  return rows.map((row) => ({
    account_id: row.account_id,
    calendar_id: row.calendar_id,
    event_id: row.event_id,
    title: row.title,
    description: row.description,
    start_time: row.start_time,
    end_time: row.end_time,
    start_ts: row.start_ts,
    end_ts: row.end_ts,
    all_day: row.all_day === 1,
    location: row.location,
    conference_url: row.conference_url,
    visibility: row.visibility,
    status: row.status,
    organizer: row.organizer_json ? JSON.parse(row.organizer_json) : null,
    attendees: row.attendees_json ? JSON.parse(row.attendees_json) : null,
    html_link: row.html_link,
    time_zone: row.time_zone,
    background_color: row.cal_bg,
    foreground_color: row.cal_fg,
  }));
}

// === SYNC STATE ===

export function fetchSyncState(connector: string): SyncStateRow | null {
  const stmt = getDb().prepare<SyncStateRow, [string]>(
    "SELECT * FROM sync_state WHERE connector = ?"
  );
  return stmt.get(connector);
}

export function upsertSyncState(connector: string, cursor: string | null): void {
  const now = utcNow();
  const stmt = getDb().prepare(`
    INSERT INTO sync_state (connector, cursor, last_sync_at)
    VALUES (?, ?, ?)
    ON CONFLICT(connector) DO UPDATE SET
      cursor = excluded.cursor,
      last_sync_at = excluded.last_sync_at
  `);
  stmt.run(connector, cursor, now);
}
