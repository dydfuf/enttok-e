import { createMiddleware } from "hono/factory";
import { config } from "../lib/config.ts";
import type { Env } from "../lib/types.ts";

// Middleware to extract token from headers and store in context
export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  const token = c.req.header("x-backend-token");
  c.set("token", token);
  await next();
});

// Middleware to require authentication
export const requireAuth = createMiddleware<Env>(async (c, next) => {
  // If no BACKEND_TOKEN is configured, skip auth
  if (!config.BACKEND_TOKEN) {
    return next();
  }

  const token = c.get("token");
  if (token !== config.BACKEND_TOKEN) {
    return c.json({ detail: "unauthorized" }, 401);
  }
  await next();
});

// Helper to verify WebSocket token
export function verifyWsToken(headers: Headers): boolean {
  if (!config.BACKEND_TOKEN) return true;
  return headers.get("x-backend-token") === config.BACKEND_TOKEN;
}
