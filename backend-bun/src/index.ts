import { createApp } from "./app.ts";
import { websocket } from "./routes/events.ts";
import { config, ensureDirs } from "./lib/config.ts";
import { initDatabase, closeDatabase } from "./db/connection.ts";
import { startWorkers, registerJobHandler } from "./services/jobs.ts";
import { runClaudeJob } from "./services/claude.ts";
import { runCalendarSyncJob } from "./services/calendar/sync.ts";
import { runJiraSyncJob } from "./services/atlassian/jira.ts";
import { runConfluenceSyncJob } from "./services/atlassian/confluence.ts";
import { startScheduler, stopScheduler } from "./services/scheduler.ts";

async function main() {
  // Ensure required directories exist
  await ensureDirs();

  // Initialize database
  initDatabase();

  // Register job handlers
  registerJobHandler("claude.spawn", runClaudeJob);
  registerJobHandler("connector.calendar.sync", runCalendarSyncJob);
  registerJobHandler("connector.jira.sync", runJiraSyncJob);
  registerJobHandler("connector.confluence.sync", runConfluenceSyncJob);

  // Start job workers
  startWorkers();

  // Start background scheduler for auto-sync
  startScheduler();

  const app = createApp();

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    stopScheduler();
    closeDatabase();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\nShutting down...");
    stopScheduler();
    closeDatabase();
    process.exit(0);
  });

  // Start server with Bun.serve (supports WebSocket)
  const server = Bun.serve({
    port: config.BACKEND_PORT,
    fetch: app.fetch,
    websocket,
  });

  console.log(`Server running on http://127.0.0.1:${server.port}`);
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
