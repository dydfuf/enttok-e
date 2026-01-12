import path from "path";
import os from "os";

export const CLAUDE_DIR = path.join(os.homedir(), ".claude");
export const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");
