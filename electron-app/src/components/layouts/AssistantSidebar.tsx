import { useCallback, useId, useMemo, useState } from "react";
import { Bot, FileText, History, Loader2, Plus, X } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type {
  ClaudeJobRecord,
  ClaudeJobResponse,
  ClaudeSessionResponse,
  ElectronAPI,
} from "@/shared/electron-api";
import { getElectronAPI } from "@/lib/electron";
import { ActivityStream } from "@/components/activity";
import { useEditorOptional } from "@/contexts/EditorContext";

export type ChatRole = "user" | "assistant";

// Designed for future history persistence via backend sessions API
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  status?: "pending" | "streaming" | "complete" | "error";
  error?: string | null;
}

type ClaudeAPI = Pick<
  ElectronAPI,
  "spawnClaude" | "createClaudeSession" | "getJob"
>;

const MAX_SELECTION_CHARS = 2000;
const MAX_NOTE_CONTEXT_CHARS = 4000;

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

function buildPromptWithContext(
  userPrompt: string,
  selectedText: string | null,
  noteContent: string | null,
  includeNoteContext: boolean
): string {
  const parts: string[] = [];

  if (selectedText) {
    const truncated = truncateText(selectedText, MAX_SELECTION_CHARS);
    parts.push(`[Selected Text]\n${truncated}`);
  } else if (includeNoteContext && noteContent) {
    const truncated = truncateText(noteContent, MAX_NOTE_CONTEXT_CHARS);
    parts.push(`[Current Note]\n${truncated}`);
  }

  parts.push(`[Request]\n${userPrompt}`);

  return parts.join("\n\n---\n\n");
}

function extractOutput(job: ClaudeJobRecord): string | null {
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

type TabType = "assistant" | "activity";

export default function AssistantSidebar() {
  const [activeTab, setActiveTab] = useState<TabType>("assistant");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const editorContext = useEditorOptional();
  const claudeAPI = useMemo<ClaudeAPI | null>(() => getElectronAPI(), []);

  const updateMessage = useCallback(
    (id: string, patch: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === id ? { ...msg, ...patch } : msg))
      );
    },
    []
  );

  const pollJob = useCallback(
    async (jobId: string, messageId: string) => {
      if (!claudeAPI) {
        updateMessage(messageId, { status: "error", error: "API unavailable" });
        return;
      }

      let attempts = 0;
      const maxAttempts = 60;

      while (attempts < maxAttempts) {
        attempts += 1;
        try {
          const job = await claudeAPI.getJob(jobId);
          const output = extractOutput(job);

          if (job.status === "succeeded") {
            updateMessage(messageId, {
              content: output || "No response",
              status: "complete",
            });
            return;
          }

          if (job.status === "failed" || job.status === "canceled") {
            updateMessage(messageId, {
              content: output || "Request failed",
              status: "error",
              error: output,
            });
            return;
          }

          if (output) {
            updateMessage(messageId, { content: output, status: "streaming" });
          }
        } catch (error) {
          updateMessage(messageId, {
            status: "error",
            error: error instanceof Error ? error.message : "Fetch failed",
          });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      updateMessage(messageId, { status: "error", error: "Request timeout" });
    },
    [claudeAPI, updateMessage]
  );

  const handleSubmit = useCallback(
    async (userPrompt: string, selectedText: string | null, noteContent: string | null, includeNoteContext: boolean) => {
      if (!claudeAPI || !userPrompt.trim()) return;

      setIsSubmitting(true);

      const fullPrompt = buildPromptWithContext(userPrompt, selectedText, noteContent, includeNoteContext);

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: userPrompt,
        timestamp: new Date().toISOString(),
        status: "complete",
      };

      const assistantMessageId = `assistant-${Date.now()}`;
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        status: "pending",
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);

      try {
        let activeSessionId = sessionId;
        if (!activeSessionId) {
          const session: ClaudeSessionResponse =
            await claudeAPI.createClaudeSession();
          activeSessionId = session.session_id;
          setSessionId(activeSessionId);
        }

        const response: ClaudeJobResponse = await claudeAPI.spawnClaude({
          prompt: fullPrompt,
          session_id: activeSessionId,
        });

        void pollJob(response.job_id, assistantMessageId);
      } catch (error) {
        updateMessage(assistantMessageId, {
          status: "error",
          error: error instanceof Error ? error.message : "Request failed",
          content: "Failed to send message",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [claudeAPI, pollJob, sessionId, updateMessage]
  );

  const handleNewSession = useCallback(() => {
    setSessionId(null);
    setMessages([]);
  }, []);

  const handleApply = useCallback((text: string) => {
    if (!text.trim()) return;
    window.dispatchEvent(
      new CustomEvent("suggestion:apply", { detail: { text } })
    );
  }, []);

  const handleCopy = useCallback(async (text: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
    }
  }, []);

  return (
    <Sidebar collapsible="icon" variant="sidebar" side="right">
      <SidebarContent className="group-data-[collapsible=icon]:hidden">
        <div className="flex items-center gap-1 p-1 h-10 border-b border-border bg-muted/30">
          <Button
            variant={activeTab === "assistant" ? "secondary" : "ghost"}
            size="sm"
            className="flex-1 gap-2"
            onClick={() => setActiveTab("assistant")}
          >
            <Bot className="size-4" />
          </Button>
          <Button
            variant={activeTab === "activity" ? "secondary" : "ghost"}
            size="sm"
            className="flex-1 gap-2"
            onClick={() => setActiveTab("activity")}
          >
            <History className="size-4" />
          </Button>
        </div>

        {activeTab === "assistant" && (
          <AssistantTab
            messages={messages}
            isSubmitting={isSubmitting}
            sessionId={sessionId}
            selectedText={editorContext?.selectedText ?? null}
            noteContent={editorContext?.noteContent ?? null}
            includeNoteContext={editorContext?.includeNoteContext ?? true}
            onIncludeNoteContextChange={editorContext?.setIncludeNoteContext}
            onClearSelection={editorContext?.clearSelection}
            onSubmit={handleSubmit}
            onNewSession={handleNewSession}
            onApply={handleApply}
            onCopy={handleCopy}
          />
        )}

        {activeTab === "activity" && <ActivityStream activities={[]} />}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

interface AssistantTabProps {
  messages: ChatMessage[];
  isSubmitting: boolean;
  sessionId: string | null;
  selectedText: string | null;
  noteContent: string | null;
  includeNoteContext: boolean;
  onIncludeNoteContextChange?: (include: boolean) => void;
  onClearSelection?: () => void;
  onSubmit: (prompt: string, selectedText: string | null, noteContent: string | null, includeNoteContext: boolean) => void;
  onNewSession: () => void;
  onApply: (text: string) => void;
  onCopy: (text: string) => void;
}

function AssistantTab({
  messages,
  isSubmitting,
  sessionId,
  selectedText,
  noteContent,
  includeNoteContext,
  onIncludeNoteContextChange,
  onClearSelection,
  onSubmit,
  onNewSession,
  onApply,
  onCopy,
}: AssistantTabProps) {
  const [inputValue, setInputValue] = useState("");
  const checkboxId = useId();

  const handleSubmit = () => {
    if (!inputValue.trim() || isSubmitting) return;
    onSubmit(inputValue.trim(), selectedText, noteContent, includeNoteContext);
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasSelection = Boolean(selectedText);
  const hasNoteContent = Boolean(noteContent);
  const selectionLength = selectedText?.length ?? 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs text-muted-foreground">
          {sessionId ? "Session active" : "No session"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={onNewSession}
        >
          <Plus className="size-3" />
          New
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Bot className="size-8 mb-2 opacity-50" />
            <p className="text-sm font-medium">Ask anything</p>
            <p className="text-xs mt-1">
              Get help with your notes from Claude
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onApply={onApply}
              onCopy={onCopy}
            />
          ))
        )}
      </div>

      <div className="border-t border-border p-3 space-y-2">
        {hasSelection && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-primary/10 border border-primary/20">
            <FileText className="size-3.5 text-primary shrink-0" />
            <span className="text-xs text-primary flex-1 truncate">
              Selection ({selectionLength} chars)
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={onClearSelection}
            >
              <X className="size-3" />
            </Button>
          </div>
        )}

        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={hasSelection ? "Ask about selection..." : "Ask Claude..."}
          className={cn(
            "w-full min-h-[60px] max-h-[120px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          )}
          disabled={isSubmitting}
        />

        <div className="flex items-center justify-between">
          {!hasSelection && hasNoteContent && (
            <div className="flex items-center gap-2">
              <Checkbox
                id={checkboxId}
                checked={includeNoteContext}
                onCheckedChange={(checked) => onIncludeNoteContextChange?.(Boolean(checked))}
              />
              <label
                htmlFor={checkboxId}
                className="text-xs text-muted-foreground cursor-pointer"
              >
                Include note
              </label>
            </div>
          )}
          {(hasSelection || !hasNoteContent) && <div />}

          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || !inputValue.trim()}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-3 mr-1.5 animate-spin" />
                Sending
              </>
            ) : (
              "Send"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  onApply: (text: string) => void;
  onCopy: (text: string) => void;
}

function MessageBubble({ message, onApply, onCopy }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isPending = message.status === "pending";
  const isStreaming = message.status === "streaming";
  const isError = message.status === "error";

  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <span className="text-[10px] text-muted-foreground uppercase font-medium px-1">
        {isUser ? "You" : "Assistant"}
      </span>

      <div
        className={cn(
          "rounded-lg px-3 py-2 text-sm max-w-[90%]",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted border border-border",
          isError && "border-destructive/50 bg-destructive/10"
        )}
      >
        {isPending ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            <span>Thinking...</span>
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {message.content || (isError ? "An error occurred" : "")}
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse" />
            )}
          </div>
        )}
      </div>

      {!isUser && message.status === "complete" && message.content && (
        <div className="flex gap-1 mt-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => onCopy(message.content)}
          >
            Copy
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => onApply(message.content)}
          >
            Insert
          </Button>
        </div>
      )}
    </div>
  );
}
