import type { ServerWebSocket } from "bun";
import { utcNow } from "../lib/time.ts";

export interface WSData {
  id: string;
}

class WebSocketManager {
  private connections = new Set<ServerWebSocket<WSData>>();

  connect(ws: ServerWebSocket<WSData>): void {
    this.connections.add(ws);
  }

  disconnect(ws: ServerWebSocket<WSData>): void {
    this.connections.delete(ws);
  }

  broadcast(payload: Record<string, unknown>): void {
    const message = JSON.stringify(payload);
    const dead: ServerWebSocket<WSData>[] = [];

    for (const conn of this.connections) {
      try {
        conn.send(message);
      } catch {
        dead.push(conn);
      }
    }

    for (const conn of dead) {
      this.connections.delete(conn);
    }
  }

  emitLog(level: string, message: string, meta?: Record<string, unknown>): void {
    const logMessage = message.trim();
    if (!logMessage) return;

    // Log to console
    if (level === "error") {
      console.error(logMessage);
    } else if (level === "warn") {
      console.warn(logMessage);
    } else {
      console.log(logMessage);
    }

    // Broadcast to connected clients
    this.broadcast({
      type: "log",
      level,
      message: logMessage,
      timestamp: utcNow(),
      meta,
    });
  }

  emitJobStatus(jobId: string, status: string): void {
    this.broadcast({
      type: "job.status",
      job_id: jobId,
      status,
    });
  }

  emitJobProgress(jobId: string, progress: number): void {
    this.broadcast({
      type: "job.progress",
      job_id: jobId,
      progress,
    });
  }

  get connectionCount(): number {
    return this.connections.size;
  }
}

export const manager = new WebSocketManager();
