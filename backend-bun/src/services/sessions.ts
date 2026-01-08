import { config } from "../lib/config.ts";
import { generateId } from "../lib/time.ts";

interface SessionMessage {
  role: "user" | "assistant";
  content: string;
}

const sessions = new Map<string, SessionMessage[]>();

export function createSession(): string {
  const sessionId = generateId("session");
  sessions.set(sessionId, []);
  return sessionId;
}

export function getSessionMessages(sessionId: string): SessionMessage[] {
  return [...(sessions.get(sessionId) ?? [])];
}

export function appendSessionMessage(sessionId: string, role: "user" | "assistant", content: string): void {
  if (!content.trim()) return;

  let messages = sessions.get(sessionId);
  if (!messages) {
    messages = [];
    sessions.set(sessionId, messages);
  }

  messages.push({ role, content });

  // Enforce max messages limit
  while (messages.length > config.SESSION_MAX_MESSAGES) {
    messages.shift();
  }

  // Enforce max chars limit
  let totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
  while (totalChars > config.SESSION_MAX_CHARS && messages.length > 0) {
    const removed = messages.shift();
    if (removed) {
      totalChars -= removed.content.length;
    }
  }
}

export function formatSessionPrompt(history: SessionMessage[], prompt: string): string {
  const transcript: string[] = [];

  for (const message of history) {
    const roleLabel = message.role === "user" ? "User" : "Assistant";
    transcript.push(`${roleLabel}: ${message.content}`);
  }

  transcript.push(`User: ${prompt}`);
  return transcript.join("\n\n");
}
