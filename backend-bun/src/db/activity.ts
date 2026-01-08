import { getDb } from "./connection.ts";
import { utcNow, generateId } from "../lib/time.ts";

interface ActivityEventRow {
  event_id: string;
  source: string;
  account_id: string;
  event_type: string;
  title: string;
  description: string | null;
  url: string | null;
  actor: string | null;
  event_time: string;
  event_ts: number;
  created_at: string;
  updated_at: string;
  raw_json: string | null;
}

export interface ActivityEvent {
  event_id: string;
  source: string;
  account_id: string;
  event_type: string;
  title: string;
  description: string | null;
  url: string | null;
  actor: string | null;
  event_time: string;
  event_ts: number;
}

export function createActivityEvent(data: {
  source: string;
  account_id: string;
  event_type: string;
  title: string;
  description?: string;
  url?: string;
  actor?: string;
  event_time: string;
  event_ts: number;
  raw?: Record<string, unknown>;
}): string {
  const eventId = generateId("act");
  const now = utcNow();

  const stmt = getDb().prepare(`
    INSERT INTO activity_events
    (event_id, source, account_id, event_type, title, description, url, actor,
     event_time, event_ts, created_at, updated_at, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    eventId,
    data.source,
    data.account_id,
    data.event_type,
    data.title,
    data.description ?? null,
    data.url ?? null,
    data.actor ?? null,
    data.event_time,
    data.event_ts,
    now,
    now,
    data.raw ? JSON.stringify(data.raw) : null
  );

  return eventId;
}

export interface ActivityEventInput {
  event_id: string;
  source: string;
  account_id: string;
  event_type: string;
  title: string;
  description?: string | null;
  url?: string | null;
  actor?: string | null;
  event_time: string;
  event_ts: number;
  raw?: Record<string, unknown>;
}

export function upsertActivityEvents(events: ActivityEventInput[]): number {
  if (events.length === 0) return 0;

  const now = utcNow();
  const stmt = getDb().prepare(`
    INSERT INTO activity_events
    (event_id, source, account_id, event_type, title, description, url, actor,
     event_time, event_ts, created_at, updated_at, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      url = excluded.url,
      actor = excluded.actor,
      event_time = excluded.event_time,
      event_ts = excluded.event_ts,
      updated_at = excluded.updated_at,
      raw_json = excluded.raw_json
  `);

  let count = 0;
  for (const event of events) {
    stmt.run(
      event.event_id,
      event.source,
      event.account_id,
      event.event_type,
      event.title,
      event.description ?? null,
      event.url ?? null,
      event.actor ?? null,
      event.event_time,
      event.event_ts,
      now,
      now,
      event.raw ? JSON.stringify(event.raw) : null
    );
    count++;
  }

  return count;
}

export function fetchActivityEvents(
  startTs: number,
  endTs: number,
  options: {
    source?: string;
    accountId?: string;
    limit?: number;
  } = {}
): ActivityEvent[] {
  const { source, accountId, limit = 500 } = options;

  let query = "SELECT * FROM activity_events WHERE event_ts >= ? AND event_ts <= ?";
  const params: unknown[] = [startTs, endTs];

  if (source) {
    query += " AND source = ?";
    params.push(source);
  }
  if (accountId) {
    query += " AND account_id = ?";
    params.push(accountId);
  }

  query += " ORDER BY event_ts DESC LIMIT ?";
  params.push(limit);

  const stmt = getDb().prepare(query);
  const rows = stmt.all(...(params as [])) as ActivityEventRow[];

  return rows.map((row) => ({
    event_id: row.event_id,
    source: row.source,
    account_id: row.account_id,
    event_type: row.event_type,
    title: row.title,
    description: row.description,
    url: row.url,
    actor: row.actor,
    event_time: row.event_time,
    event_ts: row.event_ts,
  }));
}
