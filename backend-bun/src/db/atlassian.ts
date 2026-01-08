import { getDb } from "./connection.ts";
import { utcNow, generateId } from "../lib/time.ts";

interface AtlassianAccountRow {
  account_id: string;
  service: string;
  org: string;
  base_url: string;
  email: string;
  api_token: string;
  created_at: string;
  updated_at: string;
}

export interface AtlassianAccount {
  account_id: string;
  service: "jira" | "confluence";
  org: string;
  base_url: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export function createAtlassianAccount(
  service: "jira" | "confluence",
  org: string,
  email: string,
  apiToken: string
): string {
  const accountId = generateId("atl");
  const now = utcNow();
  const baseUrl = `https://${org}.atlassian.net`;

  const stmt = getDb().prepare(`
    INSERT INTO atlassian_accounts
    (account_id, service, org, base_url, email, api_token, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(accountId, service, org, baseUrl, email, apiToken, now, now);

  return accountId;
}

export function fetchAtlassianAccount(accountId: string): (AtlassianAccount & { api_token: string }) | null {
  const stmt = getDb().prepare<AtlassianAccountRow, [string]>(
    "SELECT * FROM atlassian_accounts WHERE account_id = ?"
  );
  const row = stmt.get(accountId);
  if (!row) return null;

  return {
    account_id: row.account_id,
    service: row.service as "jira" | "confluence",
    org: row.org,
    base_url: row.base_url,
    email: row.email,
    api_token: row.api_token,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function fetchAtlassianAccounts(service?: "jira" | "confluence"): AtlassianAccount[] {
  let query = "SELECT * FROM atlassian_accounts";
  const params: unknown[] = [];

  if (service) {
    query += " WHERE service = ?";
    params.push(service);
  }
  query += " ORDER BY created_at DESC";

  const stmt = getDb().prepare(query);
  const rows = stmt.all(...(params as [])) as AtlassianAccountRow[];

  return rows.map((row) => ({
    account_id: row.account_id,
    service: row.service as "jira" | "confluence",
    org: row.org,
    base_url: row.base_url,
    email: row.email,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export function deleteAtlassianAccount(accountId: string): void {
  getDb().run("DELETE FROM atlassian_accounts WHERE account_id = ?", [accountId]);
}

// Sync state management
export interface SyncState {
  connector: string;
  cursor: string | null;
  last_sync_at: string | null;
}

export function fetchSyncState(connector: string): SyncState | null {
  const stmt = getDb().prepare<SyncState, [string]>(
    "SELECT * FROM sync_state WHERE connector = ?"
  );
  return stmt.get(connector) ?? null;
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

export function deleteSyncState(connector: string): void {
  getDb().run("DELETE FROM sync_state WHERE connector = ?", [connector]);
}
