/**
 * Convert a filesystem path to Claude's project directory name format.
 * Example: /Users/foo/bar -> -Users-foo-bar
 */
export function pathToClaudeProjectDir(projectPath: string): string {
  return projectPath.replace(/\//g, "-");
}

/**
 * Convert Claude's project directory name back to a filesystem path.
 * Example: -Users-foo-bar -> /Users/foo/bar
 */
export function claudeProjectDirToPath(dirName: string): string {
  if (dirName.startsWith("-")) {
    return dirName.replace(/-/g, "/");
  }
  return dirName;
}
