import type { ClaudeSessionMessage, ClaudeSessionRecord } from "./types.js";

/**
 * Extract text content from a session message.
 * Handles both string content and array content formats.
 */
export function extractMessageText(
  message?: ClaudeSessionMessage["message"]
): string {
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => (typeof part.text === "string" ? part.text.trim() : ""))
      .filter((part) => part.length > 0);
    return parts.join("\n").trim();
  }
  return "";
}

/**
 * Check if a message is a meta message (internal system message).
 */
export function isMetaMessage(message: ClaudeSessionRecord): boolean {
  return Boolean(message.isMeta);
}

/**
 * Check if text content is command markup that should be excluded from display.
 */
export function isCommandMarkup(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith("<command-name>") ||
    trimmed.startsWith("<command-message>") ||
    trimmed.startsWith("<command-args>") ||
    trimmed.startsWith("<local-command")
  );
}
