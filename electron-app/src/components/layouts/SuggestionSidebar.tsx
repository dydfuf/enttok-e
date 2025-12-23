import { useCallback, useMemo, useState } from "react";
import { Lightbulb, Loader2 } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import BackendStatusPanel from "@/components/BackendStatusPanel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ClaudeJobResponse = {
  job_id: string;
  status: string;
};

type ClaudeSessionResponse = {
  session_id: string;
};

type ClaudeJobRecord = {
  job_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  progress?: number | null;
  message?: string | null;
  payload?: Record<string, unknown>;
  result?: {
    stdout_tail?: string[];
    stderr_tail?: string[];
    exit_code?: number;
  } | null;
  error?: {
    message?: string;
    stdout_tail?: string[];
    stderr_tail?: string[];
    exit_code?: number;
  } | null;
};

type SuggestionItem = {
  id: string;
  prompt: string;
  status: string;
  createdAt: string;
  output: string | null;
  error: string | null;
};

type ClaudeAPI = {
  spawnClaude: (payload: Record<string, unknown>) => Promise<ClaudeJobResponse>;
  createClaudeSession: () => Promise<ClaudeSessionResponse>;
  getJob: (jobId: string) => Promise<ClaudeJobRecord>;
};

function getClaudeAPI(): ClaudeAPI | null {
  if (typeof window === "undefined") {
    return null;
  }
  const api = (window as unknown as { electronAPI?: ClaudeAPI }).electronAPI;
  return api ?? null;
}

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

export default function SuggestionSidebar() {
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const claudeAPI = useMemo(() => getClaudeAPI(), []);

  const updateSuggestion = useCallback(
    (id: string, patch: Partial<SuggestionItem>) => {
      setSuggestions((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
      );
    },
    []
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
    [claudeAPI, updateSuggestion]
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
        const session = await claudeAPI.createClaudeSession();
        activeSessionId = session.session_id;
        setSessionId(activeSessionId);
      }
      const response = await claudeAPI.spawnClaude({
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
      new CustomEvent("suggestion:apply", { detail: { text } })
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
                    <span className="truncate max-w-[180px]">{item.prompt}</span>
                    <span
                      className={cn(
                        "text-[10px] uppercase",
                        item.status === "succeeded"
                          ? "text-emerald-500"
                          : item.status === "failed"
                            ? "text-red-500"
                            : "text-amber-500"
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
          <BackendStatusPanel />
        </div>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
