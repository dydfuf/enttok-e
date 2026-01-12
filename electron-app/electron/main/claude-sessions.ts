/**
 * Claude Sessions Module
 *
 * This file re-exports from the modular implementation in ./claude-sessions/
 * for backward compatibility with existing imports.
 *
 * Module structure:
 * - types.ts: All type definitions (public and internal)
 * - constants.ts: Directory constants (CLAUDE_DIR, PROJECTS_DIR)
 * - paths.ts: Path conversion utilities
 * - message-utils.ts: Message extraction and command markup detection
 * - file-utils.ts: File listing and project resolution
 * - parser.ts: Session file parsing and metadata extraction
 * - index.ts: Main API functions and re-exports
 */

// Re-export everything from the modular implementation
export {
  // Types
  type ClaudeSessionMessage,
  type ClaudeSession,
  type ClaudeSessionListResult,
  type ClaudeSessionDetailResult,
  // Functions
  getClaudeProjectsDir,
  listClaudeProjects,
  listClaudeSessions,
  getClaudeSessionDetail,
  getClaudeSessionsForDate,
} from "./claude-sessions/index.js";
