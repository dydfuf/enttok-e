import type { GitHubDailySummary, GitHubPR, GitHubCommit } from "@/shared/electron-api";

function formatPRItem(pr: GitHubPR): string {
  const stateEmoji = pr.state === "merged" ? "🟣" : pr.state === "open" ? "🟢" : "⚫";
  return `- ${stateEmoji} ${pr.title} ([#${pr.number}](${pr.url})) - ${pr.state}`;
}

function formatCommitItem(commit: GitHubCommit): string {
  return `- \`${commit.sha}\` ${commit.message}`;
}

export function formatGitHubAsMarkdown(summary: GitHubDailySummary): string {
  const lines: string[] = [];

  const hasActivity =
    summary.prs.authored.length > 0 ||
    summary.prs.reviewed.length > 0 ||
    summary.commits.length > 0;

  if (!hasActivity) {
    return "";
  }

  lines.push("### GitHub Activity\n");

  if (summary.prs.authored.length > 0) {
    lines.push("**Pull Requests (authored)**");
    for (const pr of summary.prs.authored) {
      lines.push(formatPRItem(pr));
    }
    lines.push("");
  }

  if (summary.prs.reviewed.length > 0) {
    lines.push("**Pull Requests (reviewed)**");
    for (const pr of summary.prs.reviewed) {
      lines.push(formatPRItem(pr));
    }
    lines.push("");
  }

  if (summary.commits.length > 0) {
    lines.push(`**Commits** (${summary.commits.length})`);
    const displayCommits = summary.commits.slice(0, 10);
    for (const commit of displayCommits) {
      lines.push(formatCommitItem(commit));
    }
    if (summary.commits.length > 10) {
      lines.push(`- ... and ${summary.commits.length - 10} more`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatGitHubAsCompactMarkdown(summary: GitHubDailySummary): string {
  const lines: string[] = [];

  if (summary.prs.authored.length > 0) {
    for (const pr of summary.prs.authored) {
      const prefix = pr.state === "merged" ? "feat" : "wip";
      lines.push(`- ${prefix}: ${pr.title} ([PR #${pr.number}](${pr.url}))`);
    }
  }

  if (summary.prs.reviewed.length > 0) {
    for (const pr of summary.prs.reviewed) {
      lines.push(`- review: ${pr.title} ([PR #${pr.number}](${pr.url}))`);
    }
  }

  const uniqueRepos = new Set(summary.commits.map((c) => c.repository));
  if (summary.commits.length > 0 && uniqueRepos.size <= 3) {
    for (const repo of uniqueRepos) {
      const repoCommits = summary.commits.filter((c) => c.repository === repo);
      lines.push(`- commits: ${repoCommits.length} commits to ${repo}`);
    }
  } else if (summary.commits.length > 0) {
    lines.push(`- commits: ${summary.commits.length} commits across ${uniqueRepos.size} repos`);
  }

  return lines.join("\n");
}
