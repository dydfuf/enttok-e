/**
 * GitHub PR-related functions
 */

import type { GitHubPR, RawPR } from "./types.js";
import { execGh } from "./cli.js";
import { getDateString } from "./utils.js";

/**
 * Map raw PR data from GitHub API to GitHubPR type
 */
function mapRawPRToGitHubPR(pr: RawPR): GitHubPR {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state,
    repository: pr.repository?.nameWithOwner || "",
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
  };
}

/**
 * Filter out PRs that already exist in the exclude set
 */
function excludeDuplicatePRs(prs: GitHubPR[], excludeUrls: Set<string>): GitHubPR[] {
  return prs.filter((pr) => !excludeUrls.has(pr.url));
}

/**
 * Get PRs authored and reviewed by the current user for a given date
 */
export async function getTodayPRs(
  date?: string
): Promise<{ authored: GitHubPR[]; reviewed: GitHubPR[] }> {
  const dateStr = getDateString(date);

  const [authoredResult, reviewedResult] = await Promise.all([
    execGh<RawPR[]>([
      "search",
      "prs",
      "--author=@me",
      "--updated=>=" + dateStr,
      "--json",
      "number,title,url,state,repository,createdAt,updatedAt",
      "--limit",
      "50",
    ]),
    execGh<RawPR[]>([
      "search",
      "prs",
      "--reviewed-by=@me",
      "--updated=>=" + dateStr,
      "--json",
      "number,title,url,state,repository,createdAt,updatedAt",
      "--limit",
      "50",
    ]),
  ]);

  const authored =
    authoredResult.success && authoredResult.data
      ? authoredResult.data.map(mapRawPRToGitHubPR)
      : [];

  const allReviewed =
    reviewedResult.success && reviewedResult.data
      ? reviewedResult.data.map(mapRawPRToGitHubPR)
      : [];

  const authoredUrls = new Set(authored.map((pr) => pr.url));
  const reviewed = excludeDuplicatePRs(allReviewed, authoredUrls);

  return { authored, reviewed };
}
