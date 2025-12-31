import { useCallback, useEffect, useMemo, useState } from "react";
import { Github, Lightbulb, Loader2, RefreshCw } from "lucide-react";
import {
	Sidebar,
	SidebarContent,
	SidebarHeader,
	SidebarRail,
} from "@/components/ui/sidebar";
import BackendStatusIndicator from "@/components/BackendStatusIndicator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
	ClaudeJobRecord,
	ClaudeJobResponse,
	ClaudeSessionResponse,
	ElectronAPI,
} from "@/shared/electron-api";
import { getElectronAPI } from "@/lib/electron";
import { useGitHub } from "@/contexts/GitHubContext";
import { formatGitHubAsMarkdown } from "@/lib/github-formatter";

type SuggestionItem = {
	id: string;
	prompt: string;
	status: string;
	createdAt: string;
	output: string | null;
	error: string | null;
};

type ClaudeAPI = Pick<
	ElectronAPI,
	"spawnClaude" | "createClaudeSession" | "getJob"
>;

function extractOutput(job: ClaudeJobRecord) {
	if (job.result?.stdout_tail && job.result.stdout_tail.length > 0) {
		return job.result.stdout_tail.join("\n");
	}
	if (job.error?.stdout_tail && job.error.stdout_tail.length > 0) {
		return job.error.stdout_tail.join("\n");
	}
	if (job.error?.message) {
		return job.error.message;
	}
	return null;
}

function GitHubActivityCard() {
  const { status, summary, loading, refreshSummary } = useGitHub();
  const [hasFetched, setHasFetched] = useState(false);

  const isConnected = status?.cli.found && status?.auth.authenticated;

  useEffect(() => {
    if (isConnected && !hasFetched && !loading) {
      refreshSummary();
      setHasFetched(true);
    }
  }, [isConnected, hasFetched, loading, refreshSummary]);

  const handleRefresh = useCallback(() => {
    refreshSummary();
  }, [refreshSummary]);

  const handleInsert = useCallback(() => {
    if (!summary) return;
    const markdown = formatGitHubAsMarkdown(summary);
    if (!markdown.trim()) return;
    window.dispatchEvent(
      new CustomEvent("suggestion:apply", { detail: { text: markdown } })
    );
  }, [summary]);

  const handleCopy = useCallback(async () => {
    if (!summary) return;
    const markdown = formatGitHubAsMarkdown(summary);
    if (!markdown.trim()) return;
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      // ignore
    }
  }, [summary]);

  if (!isConnected) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Github className="size-4" />
          <span>GitHub not connected</span>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Go to Integrations → GitHub to connect
        </p>
      </div>
    );
  }

  const hasActivity =
    summary &&
    (summary.prs.authored.length > 0 ||
      summary.prs.reviewed.length > 0 ||
      summary.commits.length > 0);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Github className="size-4" />
          <span>Today's GitHub</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw className={cn("size-3", loading && "animate-spin")} />
        </Button>
      </div>

      {loading && !summary ? (
        <div className="mt-2 text-xs text-muted-foreground">Loading...</div>
      ) : !hasActivity ? (
        <div className="mt-2 text-xs text-muted-foreground">
          No activity found for today
        </div>
      ) : (
        <>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {summary.prs.authored.length > 0 && (
              <div>{summary.prs.authored.length} PR(s) authored</div>
            )}
            {summary.prs.reviewed.length > 0 && (
              <div>{summary.prs.reviewed.length} PR(s) reviewed</div>
            )}
            {summary.commits.length > 0 && (
              <div>{summary.commits.length} commit(s)</div>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={handleCopy}
            >
              Copy
            </Button>
            <Button size="sm" className="flex-1" onClick={handleInsert}>
              Insert
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default function SuggestionSidebar() {
	const [prompt, setPrompt] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
	const [sessionId, setSessionId] = useState<string | null>(null);

	const claudeAPI = useMemo<ClaudeAPI | null>(() => getElectronAPI(), []);

	const updateSuggestion = useCallback(
		(id: string, patch: Partial<SuggestionItem>) => {
			setSuggestions((prev) =>
				prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
			);
		},
		[],
	);

	const pollJob = useCallback(
		async (jobId: string) => {
			if (!claudeAPI) {
				updateSuggestion(jobId, { status: "failed", error: "API unavailable" });
				return;
			}
			let attempts = 0;
			const maxAttempts = 40;
			while (attempts < maxAttempts) {
				attempts += 1;
				try {
					const job = await claudeAPI.getJob(jobId);
					updateSuggestion(jobId, {
						status: job.status,
						output: extractOutput(job),
						error: job.status === "failed" ? extractOutput(job) : null,
					});
					if (["succeeded", "failed", "canceled"].includes(job.status)) {
						return;
					}
				} catch (error) {
					updateSuggestion(jobId, {
						status: "failed",
						error: error instanceof Error ? error.message : "fetch failed",
					});
					return;
				}
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
			updateSuggestion(jobId, { status: "failed", error: "timeout" });
		},
		[claudeAPI, updateSuggestion],
	);

	const handleSubmit = useCallback(async () => {
		if (!claudeAPI) {
			return;
		}
		const trimmed = prompt.trim();
		if (!trimmed) {
			return;
		}
		setIsSubmitting(true);
		try {
			let activeSessionId = sessionId;
			if (!activeSessionId) {
				const session: ClaudeSessionResponse =
					await claudeAPI.createClaudeSession();
				activeSessionId = session.session_id;
				setSessionId(activeSessionId);
			}
			const response: ClaudeJobResponse = await claudeAPI.spawnClaude({
				prompt: trimmed,
				session_id: activeSessionId,
			});
			const newItem: SuggestionItem = {
				id: response.job_id,
				prompt: trimmed,
				status: response.status,
				createdAt: new Date().toISOString(),
				output: null,
				error: null,
			};
			setSuggestions((prev) => [newItem, ...prev]);
			setPrompt("");
			void pollJob(response.job_id);
		} catch (error) {
			const message = error instanceof Error ? error.message : "spawn failed";
			setSuggestions((prev) => [
				{
					id: `error-${Date.now()}`,
					prompt: trimmed,
					status: "failed",
					createdAt: new Date().toISOString(),
					output: null,
					error: message,
				},
				...prev,
			]);
		} finally {
			setIsSubmitting(false);
		}
	}, [claudeAPI, pollJob, prompt, sessionId]);

	const handleNewSession = useCallback(() => {
		setSessionId(null);
		setSuggestions([]);
	}, []);

	const handleApply = useCallback((text: string) => {
		if (!text.trim()) {
			return;
		}
		window.dispatchEvent(
			new CustomEvent("suggestion:apply", { detail: { text } }),
		);
	}, []);

	const handleCopy = useCallback(async (text: string) => {
		if (!text.trim()) {
			return;
		}
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// ignore
		}
	}, []);

	return (
		<Sidebar collapsible="icon" variant="sidebar" side="right">
			<SidebarHeader className="h-12 flex-row items-center px-3">
				<span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">
					Suggestions
				</span>
			</SidebarHeader>
			<SidebarContent>
				<div className="flex-1 p-4 group-data-[collapsible=icon]:hidden">
					<div className="text-sm text-muted-foreground text-center py-6">
						<Lightbulb className="mx-auto mb-2 size-6 opacity-50" />
						Generate a quick suggestion with Claude
					</div>
					<div className="space-y-3">
						<Textarea
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							placeholder="e.g., summarize today's work log in 3 bullets"
							className="min-h-20"
						/>
						<div className="flex gap-2">
							<Button
								type="button"
								className="flex-1"
								onClick={handleSubmit}
								disabled={isSubmitting || !prompt.trim()}
							>
								{isSubmitting ? (
									<>
										<Loader2 className="mr-2 size-4 animate-spin" />
										Running
									</>
								) : (
									"Generate"
								)}
							</Button>
							<Button
								type="button"
								variant="secondary"
								className="flex-1"
								onClick={handleNewSession}
							>
								New Session
							</Button>
						</div>
						<div className="text-[11px] text-muted-foreground">
							Session: {sessionId ?? "not started"}
						</div>
					</div>
					<GitHubActivityCard />
					<div className="mt-4 space-y-3">
						{suggestions.length === 0 ? (
							<div className="text-xs text-muted-foreground text-center py-3">
								No suggestions yet
							</div>
						) : (
							suggestions.map((item) => (
								<div
									key={item.id}
									className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 p-3"
								>
									<div className="flex items-center justify-between text-xs text-muted-foreground">
										<span className="truncate max-w-[180px]">
											{item.prompt}
										</span>
										<span
											className={cn(
												"text-[10px] uppercase",
												item.status === "succeeded"
													? "text-emerald-500"
													: item.status === "failed"
														? "text-red-500"
														: "text-amber-500",
											)}
										>
											{item.status}
										</span>
									</div>
									<div className="mt-2 text-xs whitespace-pre-wrap text-gray-700 dark:text-gray-200">
										{item.output ?? item.error ?? "Waiting for response..."}
									</div>
									<div className="mt-3 flex gap-2">
										<Button
											type="button"
											variant="secondary"
											size="sm"
											className="flex-1"
											onClick={() => handleCopy(item.output ?? "")}
											disabled={!item.output}
										>
											Copy
										</Button>
										<Button
											type="button"
											size="sm"
											className="flex-1"
											onClick={() => handleApply(item.output ?? "")}
											disabled={!item.output}
										>
											Apply
										</Button>
									</div>
								</div>
							))
						)}
					</div>
					<BackendStatusIndicator />
				</div>
			</SidebarContent>
			<SidebarRail />
		</Sidebar>
	);
}
