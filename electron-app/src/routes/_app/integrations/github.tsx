import { createFileRoute, Link } from "@tanstack/react-router";
import { useGitHub } from "@/contexts/GitHubContext";
import { useEffect } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FolderPlus,
  GitPullRequest,
  GitCommit,
  Loader2,
  RefreshCw,
  Terminal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useGitHubRepos } from "@/hooks/useGitHubRepos";

export const Route = createFileRoute("/_app/integrations/github")({
  component: GitHubIntegrationPage,
});

function getRepoLabel(repoPath: string): string {
  const normalized = repoPath.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[/\\]/);
  return parts[parts.length - 1] || repoPath;
}

function GitHubIntegrationPage() {
  const { status, summary, loading, error, refresh, refreshSummary } =
    useGitHub();
  const {
    repoPaths,
    loading: repoLoading,
    error: repoError,
    addRepo,
    removeRepo,
  } = useGitHubRepos();

  const isConnected = status?.cli.found && status?.auth.authenticated;
  const repoSignature = repoPaths.join("|");

  useEffect(() => {
    if (isConnected || repoPaths.length > 0) {
      refreshSummary();
    }
  }, [isConnected, repoPaths.length, repoSignature, refreshSummary]);

  return (
    <div className="min-h-full p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link
            to="/integrations"
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 mb-2 inline-block"
          >
            &larr; Back to integrations
          </Link>
          <div className="flex items-center gap-3">
            <svg
              className="w-8 h-8 text-gray-900 dark:text-gray-100"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <title>GitHub Logo</title>
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              GitHub
            </h1>
          </div>
        </div>

        <div className="space-y-6">
          <ConnectionStatusCard
            status={status}
            loading={loading}
            error={error}
            onRefresh={refresh}
          />

          <LocalReposCard
            repoPaths={repoPaths}
            loading={repoLoading}
            error={repoError}
            onAddRepo={addRepo}
            onRemoveRepo={removeRepo}
          />

          <DailySummaryCard
            summary={summary}
            loading={loading}
            onRefresh={() => refreshSummary()}
          />
        </div>
      </div>
    </div>
  );
}

type ConnectionStatusCardProps = {
  status: ReturnType<typeof useGitHub>["status"];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

function ConnectionStatusCard({
  status,
  loading,
  error,
  onRefresh,
}: ConnectionStatusCardProps) {
  const cliInstalled = status?.cli.found;
  const authenticated = status?.auth.authenticated;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          Connection Status
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">GitHub CLI (gh)</span>
          </div>
          {cliInstalled ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-600 dark:text-green-400">
                v{status?.cli.version}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-red-600 dark:text-red-400">
                Not installed
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-muted-foreground"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <title>GitHub Account</title>
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <span className="text-sm">Account</span>
          </div>
          {authenticated ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm text-green-600 dark:text-green-400">
                @{status?.auth.username}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-amber-600 dark:text-amber-400">
                Not connected
              </span>
            </div>
          )}
        </div>

        {!cliInstalled && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-300">
              GitHub CLI is not installed. Install it from{" "}
              <a
                href="https://cli.github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline"
              >
                cli.github.com
              </a>
            </p>
          </div>
        )}

        {cliInstalled && !authenticated && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
              Run the following command in your terminal to connect:
            </p>
            <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono">
              gh auth login
            </code>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                {error}
              </p>
            )}
          </div>
        )}

        {cliInstalled && authenticated && (
          <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-sm text-green-700 dark:text-green-300">
              Connected to GitHub as <strong>@{status?.auth.username}</strong>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type LocalReposCardProps = {
  repoPaths: string[];
  loading: boolean;
  error: string | null;
  onAddRepo: () => void;
  onRemoveRepo: (repoPath: string) => void;
};

function LocalReposCard({
  repoPaths,
  loading,
  error,
  onAddRepo,
  onRemoveRepo,
}: LocalReposCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          Local Commits
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddRepo}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderPlus className="h-4 w-4" />
            )}
            <span className="ml-2">Add repository</span>
          </Button>
        </CardTitle>
        <CardDescription>
          Commits are read locally from the repositories you select. Only these
          folders are accessed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {repoPaths.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No repositories selected yet.
          </p>
        ) : (
          <div className="space-y-2">
            {repoPaths.map((repoPath) => (
              <div
                key={repoPath}
                className="flex items-center justify-between gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {getRepoLabel(repoPath)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {repoPath}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveRepo(repoPath)}
                  aria-label={`Remove ${repoPath}`}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}

type DailySummaryCardProps = {
  summary: ReturnType<typeof useGitHub>["summary"];
  loading: boolean;
  onRefresh: () => void;
};

function DailySummaryCard({
  summary,
  loading,
  onRefresh,
}: DailySummaryCardProps) {
  if (!summary && loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return null;
  }

  const { stats, prs, commits } = summary;
  const hasActivity =
    stats.totalPRsAuthored > 0 ||
    stats.totalPRsReviewed > 0 ||
    stats.totalCommits > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          Today&apos;s Activity
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </CardTitle>
        <CardDescription>{summary.date}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="text-2xl font-bold">{stats.totalPRsAuthored}</div>
            <div className="text-xs text-muted-foreground">PRs Created</div>
          </div>
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="text-2xl font-bold">{stats.totalPRsReviewed}</div>
            <div className="text-xs text-muted-foreground">PRs Reviewed</div>
          </div>
          <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="text-2xl font-bold">{stats.totalCommits}</div>
            <div className="text-xs text-muted-foreground">Commits</div>
          </div>
        </div>

        {!hasActivity && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No activity yet today
          </p>
        )}

        {prs.authored.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <GitPullRequest className="h-4 w-4" />
              Pull Requests
            </h4>
            <div className="space-y-2">
              {prs.authored.slice(0, 5).map((pr) => (
                <a
                  key={pr.url}
                  href={pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm truncate">{pr.title}</span>
                    <Badge
                      variant={pr.state === "open" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {pr.state}
                    </Badge>
                  </div>
                  <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {commits.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <GitCommit className="h-4 w-4" />
              Recent Commits
            </h4>
            <div className="space-y-2">
              {commits.slice(0, 5).map((commit) => {
                const content = (
                  <div className="flex items-center gap-2 min-w-0">
                    <code className="text-xs text-muted-foreground">
                      {commit.sha}
                    </code>
                    <span className="text-sm truncate">{commit.message}</span>
                  </div>
                );

                const rowClass =
                  "flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 group";

                if (commit.url) {
                  return (
                    <a
                      key={`${commit.sha}-${commit.createdAt}`}
                      href={commit.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={rowClass}
                    >
                      {content}
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                    </a>
                  );
                }

                return (
                  <div key={`${commit.sha}-${commit.createdAt}`} className={rowClass}>
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
