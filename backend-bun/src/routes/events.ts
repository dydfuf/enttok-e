import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";
import { manager, type WSData } from "../websocket/manager.ts";
import { config } from "../lib/config.ts";
import { utcNow } from "../lib/time.ts";

const { upgradeWebSocket, websocket } = createBunWebSocket<WSData>();

export const eventsRoutes = new Hono();

eventsRoutes.get(
  "/",
  upgradeWebSocket((c) => ({
    onOpen(_event, ws) {
      // Verify token from headers
      const token = c.req.header("x-backend-token");

      if (config.BACKEND_TOKEN && token !== config.BACKEND_TOKEN) {
        ws.close(1008, "Unauthorized");
        return;
      }

      const rawWs = ws.raw as unknown as ServerWebSocket<WSData>;
      manager.connect(rawWs);
      ws.send(JSON.stringify({ type: "connected", timestamp: utcNow() }));
    },
    onMessage(_event, _ws) {
      // Echo or handle messages if needed
      // Currently just keeping connection alive
    },
    onClose(_event, ws) {
      const rawWs = ws.raw as unknown as ServerWebSocket<WSData>;
      manager.disconnect(rawWs);
    },
  }))
);

export { websocket };
