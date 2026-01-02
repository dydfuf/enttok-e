import { useEffect, useRef } from "react";
import { useFileSystem } from "@/hooks/useFileSystem";
import { useAutoSave } from "@/hooks/useAutoSave";
import { LivePreviewEditor } from "./LivePreviewEditor";
import { EditorToolbar } from "./EditorToolbar";
import { cn } from "@/lib/utils";

interface EditorLayoutProps {
  initialFilePath?: string;
  className?: string;
  hideToolbar?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
  onSaveRef?: React.MutableRefObject<(() => void) | null>;
}

export function EditorLayout({
  initialFilePath,
  className,
  hideToolbar = false,
  onDirtyChange,
  onSaveRef,
}: EditorLayoutProps) {
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

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

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
    return () => {
      window.removeEventListener("suggestion:apply", handler);
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

      {/* Editor area - Live Preview */}
      <div className="flex-1 overflow-hidden">
        <LivePreviewEditor
          value={content}
          onChange={setContent}
          className="h-full"
        />
      </div>
    </div>
  );
}

export default EditorLayout;
