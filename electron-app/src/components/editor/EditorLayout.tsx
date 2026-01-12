import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import { useFileSystem } from "@/hooks/useFileSystem";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useActivityStream } from "@/hooks/useActivityStream";
import { LivePreviewEditor, type SelectionInfo } from "./LivePreviewEditor";
import { EditorToolbar } from "./EditorToolbar";
import { EditorActivityHeader } from "@/components/activity";
import { cn } from "@/lib/utils";
import { useEditorOptional } from "@/contexts/EditorContext";
import type { ActivityStreamItem } from "@/lib/activity-types";

interface EditorLayoutProps {
  initialFilePath?: string;
  className?: string;
  hideToolbar?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
  onSaveRef?: React.MutableRefObject<(() => void) | null>;
  vaultPath?: string | null;
}

export function EditorLayout({
  initialFilePath,
  className,
  hideToolbar = false,
  onDirtyChange,
  onSaveRef,
  vaultPath,
}: EditorLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    filePath,
    content,
    isDirty,
    isLoading,
    error,
    openFile,
    saveFile,
    setContent,
    createNewFile,
    loadFile,
  } = useFileSystem();

  const contentRef = useRef(content);
  const filePathRef = useRef(filePath);
  const editorContext = useEditorOptional();

  // Parse selected date from URL (e.g., /daily/2024-01-12)
  const selectedDate = useMemo(() => {
    const match = location.pathname.match(/^\/daily\/(\d{4}-\d{2}-\d{2})$/);
    if (match) {
      return parseISO(match[1]);
    }
    return new Date(); // Default to today
  }, [location.pathname]);

  const {
    activities,
    isLoading: isActivityLoading,
    refresh: refreshActivity,
  } = useActivityStream({ selectedDate });

  const handleIncludeActivity = useCallback(() => {
    if (activities.length === 0) return;
    window.dispatchEvent(
      new CustomEvent<{ activities: ActivityStreamItem[] }>("activity:include", {
        detail: { activities },
      })
    );
  }, [activities]);

  const handleSummarize = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent<{
        activities: ActivityStreamItem[];
        noteContent: string | null;
        prompt: string;
      }>("activity:summarize", {
        detail: {
          activities,
          noteContent: contentRef.current,
          prompt: "오늘 한 일 요약해줘",
        },
      })
    );
  }, [activities]);

  useEffect(() => {
    contentRef.current = content;
    editorContext?.setNoteContent(content);
  }, [content, editorContext]);

  useEffect(() => {
    filePathRef.current = filePath;
    editorContext?.setNotePath(filePath);
  }, [filePath, editorContext]);

  const handleSelectionChange = useCallback(
    (selection: SelectionInfo | null) => {
      if (selection) {
        editorContext?.setSelection(selection.text, {
          from: selection.from,
          to: selection.to,
        });
      } else {
        editorContext?.clearSelection();
      }
    },
    [editorContext]
  );

  const handleOpenNote = useCallback(
    (noteId: string) => {
      navigate({ to: "/notes/$noteId", params: { noteId } });
    },
    [navigate]
  );

  // Expose save function to parent
  useEffect(() => {
    if (onSaveRef) {
      onSaveRef.current = saveFile;
    }
  }, [onSaveRef, saveFile]);

  // Notify parent of dirty state changes
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Auto-save functionality
  useAutoSave({
    content,
    filePath,
    isDirty,
    onSave: saveFile,
    debounceMs: 2000,
    enabled: true,
  });

  // Load initial file if provided
  useEffect(() => {
    if (initialFilePath) {
      loadFile(initialFilePath);
    }
  }, [initialFilePath, loadFile]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail;
      if (!detail?.text || !filePathRef.current) {
        return;
      }
      const trimmed = detail.text.trim();
      if (!trimmed) {
        return;
      }
      const current = contentRef.current || "";
      const next = current ? `${current}\n\n${trimmed}\n` : `${trimmed}\n`;
      setContent(next);
    };

    window.addEventListener("suggestion:apply", handler);
    window.addEventListener("editor:append", handler);
    return () => {
      window.removeEventListener("suggestion:apply", handler);
      window.removeEventListener("editor:append", handler);
    };
  }, [setContent]);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Toolbar */}
      {!hideToolbar && (
        <EditorToolbar
          onNew={createNewFile}
          onOpen={openFile}
          onSave={saveFile}
          isDirty={isDirty}
          isLoading={isLoading}
          filePath={filePath}
        />
      )}

      {/* Error display */}
      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {/* Activity Stream - collapsible header */}
      <EditorActivityHeader
        activities={activities}
        isLoading={isActivityLoading}
        onRefresh={refreshActivity}
        onIncludeInChat={handleIncludeActivity}
        onSummarize={handleSummarize}
      />

      {/* Editor area - Live Preview */}
      <div className="flex-1 overflow-hidden">
        <LivePreviewEditor
          value={content}
          onChange={setContent}
          className="h-full"
          filePath={filePath}
          vaultPath={vaultPath}
          onSelectionChange={handleSelectionChange}
          onOpenNote={handleOpenNote}
        />
      </div>
    </div>
  );
}

export default EditorLayout;
