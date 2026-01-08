import type { Database } from "bun:sqlite";

export function createTables(db: Database): void {
  // Jobs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      job_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      progress REAL,
      message TEXT,
      payload_json TEXT,
      result_json TEXT,
      error_json TEXT
    )
  `);

  // Job events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      meta_json TEXT
    )
  `);

  // Sync state table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_state (
      connector TEXT PRIMARY KEY,
      cursor TEXT,
      last_sync_at TEXT
    )
  `);

  // Calendar accounts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_accounts (
      account_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      email TEXT,
      display_name TEXT,
      credentials_json TEXT,
      config_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Calendar calendars table
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_calendars (
      account_id TEXT NOT NULL,
      calendar_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      name TEXT,
      description TEXT,
      is_primary INTEGER DEFAULT 0,
      access_role TEXT,
      background_color TEXT,
      foreground_color TEXT,
      time_zone TEXT,
      selected INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (account_id, calendar_id)
    )
  `);

  // Calendar events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      account_id TEXT NOT NULL,
      calendar_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      title TEXT,
      description TEXT,
      start_time TEXT,
      end_time TEXT,
      start_ts INTEGER,
      end_ts INTEGER,
      all_day INTEGER DEFAULT 0,
      location TEXT,
      conference_url TEXT,
      visibility TEXT,
      status TEXT,
      organizer_json TEXT,
      attendees_json TEXT,
      html_link TEXT,
      time_zone TEXT,
      created_at TEXT,
      updated_at TEXT,
      PRIMARY KEY (account_id, calendar_id, event_id)
    )
  `);

  // Atlassian accounts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS atlassian_accounts (
      account_id TEXT PRIMARY KEY,
      service TEXT NOT NULL,
      org TEXT NOT NULL,
      base_url TEXT NOT NULL,
      email TEXT NOT NULL,
      api_token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Activity events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_events (
      event_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      account_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      url TEXT,
      actor TEXT,
      event_time TEXT NOT NULL,
      event_ts INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      raw_json TEXT
    )
  `);
}

export function createIndexes(db: Database): void {
  // Atlassian accounts index
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_atlassian_accounts_service
    ON atlassian_accounts (service)
  `);

  // Activity events indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_activity_events_time
    ON activity_events (event_ts)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_activity_events_source
    ON activity_events (source)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_activity_events_account
    ON activity_events (account_id)
  `);

  // Calendar events indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_calendar_events_range
    ON calendar_events (start_ts, end_ts)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_calendar_events_calendar
    ON calendar_events (account_id, calendar_id)
  `);

  // Calendar calendars index
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_calendar_calendars_selected
    ON calendar_calendars (account_id, selected)
  `);
}
