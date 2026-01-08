import { join } from "node:path";

// Environment variables (Bun auto-loads .env)
export const config = {
  // Server
  BACKEND_PORT: parseInt(Bun.env.BACKEND_PORT ?? "49671"),
  BACKEND_TOKEN: Bun.env.BACKEND_TOKEN ?? "",

  // Directories
  APP_DATA_DIR: Bun.env.APP_DATA_DIR ?? join(process.cwd(), "data"),
  get LOG_DIR() {
    return Bun.env.LOG_DIR ?? join(this.APP_DATA_DIR, "logs");
  },
  get DB_PATH() {
    return join(this.APP_DATA_DIR, "index.db");
  },

  // Workers
  BACKEND_WORKERS: parseInt(Bun.env.BACKEND_WORKERS ?? "2"),

  // Claude session limits
  SESSION_MAX_MESSAGES: parseInt(Bun.env.CLAUDE_SESSION_MAX_MESSAGES ?? "20"),
  SESSION_MAX_CHARS: parseInt(Bun.env.CLAUDE_SESSION_MAX_CHARS ?? "12000"),
  SESSION_OUTPUT_LINES: parseInt(Bun.env.CLAUDE_SESSION_OUTPUT_LINES ?? "200"),

  // Google OAuth
  GOOGLE_CLIENT_ID: Bun.env.GOOGLE_CLIENT_ID ?? "",
  GOOGLE_CLIENT_SECRET: Bun.env.GOOGLE_CLIENT_SECRET ?? "",
  GOOGLE_REDIRECT_PORT_MIN: parseInt(Bun.env.GOOGLE_REDIRECT_PORT_MIN ?? "49800"),
  GOOGLE_REDIRECT_PORT_MAX: parseInt(Bun.env.GOOGLE_REDIRECT_PORT_MAX ?? "49899"),
} as const;

export async function ensureDirs(): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(config.APP_DATA_DIR, { recursive: true });
  await mkdir(config.LOG_DIR, { recursive: true });
}
