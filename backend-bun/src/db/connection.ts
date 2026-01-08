import { Database } from "bun:sqlite";
import { config } from "../lib/config.ts";
import { createTables, createIndexes } from "./schema.ts";

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

export function initDatabase(): void {
  db = new Database(config.DB_PATH);

  // Enable WAL mode for better concurrent access
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  // Create tables and indexes
  createTables(db);
  createIndexes(db);

  console.log(`Database initialized at ${config.DB_PATH}`);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Helper functions for common operations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function execute(query: string, ...params: any[]): void {
  getDb().run(query, ...params);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function queryOne<T = unknown>(query: string, ...params: any[]): T | null {
  return getDb().query(query).get(...params) as T | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function queryAll<T = unknown>(query: string, ...params: any[]): T[] {
  return getDb().query(query).all(...params) as T[];
}
