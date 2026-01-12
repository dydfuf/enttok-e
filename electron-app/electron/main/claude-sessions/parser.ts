import fs from "fs";
import readline from "readline";
import type {
  ClaudeSession,
  ClaudeSessionMessage,
  ClaudeSessionRecord,
} from "./types.js";
import { extractMessageText, isMetaMessage, isCommandMarkup } from "./message-utils.js";

/**
 * Parse a complete session file and extract all messages, summary, and first message.
 */
export async function parseSessionFile(
  filePath: string
): Promise<{ messages: ClaudeSessionMessage[]; summary: string; firstMessage: string }> {
  const messages: ClaudeSessionMessage[] = [];
  let summary = "";
  let firstMessage = "";
  let fallbackMessage = "";

  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      resolve({ messages, summary, firstMessage });
      return;
    }

    const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      if (!line.trim()) return;

      try {
        const parsed = JSON.parse(line) as ClaudeSessionRecord;
        messages.push(parsed);

        // Extract summary
        if (parsed.type === "summary" && parsed.summary && !summary) {
          summary = parsed.summary;
        }

        const messageText = extractMessageText(parsed.message);
        if (messageText && !isCommandMarkup(messageText)) {
          if (parsed.type === "user" && !isMetaMessage(parsed) && !firstMessage) {
            firstMessage = messageText.slice(0, 200);
          }
          if (parsed.type === "assistant" && !fallbackMessage) {
            fallbackMessage = messageText.slice(0, 200);
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    });

    rl.on("close", () => {
      resolve({
        messages,
        summary,
        firstMessage: firstMessage || fallbackMessage,
      });
    });

    rl.on("error", () => {
      resolve({
        messages,
        summary,
        firstMessage: firstMessage || fallbackMessage,
      });
    });
  });
}

/**
 * Extract metadata from a session file by reading the first 100 lines.
 * More efficient than parsing the entire file when only metadata is needed.
 */
export async function getSessionMetadata(
  filePath: string
): Promise<Partial<ClaudeSession> | null> {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      resolve(null);
      return;
    }

    const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let summary = "";
    let firstMessage = "";
    let fallbackMessage = "";
    let timestamp = "";
    let gitBranch = "";
    let sessionId = "";
    let messageCount = 0;
    let projectPath = "";
    let linesRead = 0;
    const maxLines = 100; // Read up to 100 lines to get metadata

    rl.on("line", (line) => {
      linesRead++;
      if (linesRead > maxLines) {
        rl.close();
        return;
      }

      if (!line.trim()) return;

      try {
        const parsed = JSON.parse(line) as ClaudeSessionRecord;
        const isMeta = isMetaMessage(parsed);

        // Count user and assistant messages
        if ((parsed.type === "user" || parsed.type === "assistant") && !isMeta) {
          messageCount++;
        }

        // Extract summary
        if (parsed.type === "summary" && parsed.summary && !summary) {
          summary = parsed.summary;
        }

        const messageText = extractMessageText(parsed.message);
        if (messageText && !isCommandMarkup(messageText)) {
          if (parsed.type === "user" && !isMeta && !firstMessage) {
            firstMessage = messageText.slice(0, 200);
          }
          if (parsed.type === "assistant" && !fallbackMessage) {
            fallbackMessage = messageText.slice(0, 200);
          }
        }

        // Extract metadata from first non-summary message
        if (!timestamp && parsed.timestamp) {
          timestamp = parsed.timestamp;
        }
        if (!gitBranch && parsed.gitBranch) {
          gitBranch = parsed.gitBranch;
        }
        if (!sessionId && parsed.sessionId) {
          sessionId = parsed.sessionId;
        }
        if (!projectPath && parsed.cwd) {
          projectPath = parsed.cwd;
        }
      } catch {
        // Skip invalid JSON lines
      }
    });

    rl.on("close", () => {
      resolve({
        summary,
        firstMessage: firstMessage || fallbackMessage,
        timestamp,
        gitBranch,
        messageCount,
        id: sessionId,
        projectPath,
      });
    });

    rl.on("error", () => {
      resolve(null);
    });
  });
}
