import { useEffect } from "react";
import { useFileSystem } from "@/hooks/useFileSystem";
import { useAutoSave } from "@/hooks/useAutoSave";
import { LivePreviewEditor } from "./LivePreviewEditor";
import { EditorToolbar } from "./EditorToolbar";
import { cn } from "@/lib/utils";

interface EditorLayoutProps {
  initialFilePath?: string;
  className?: string;
}

export function EditorLayout({
  initialFilePath,
  className,
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

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Toolbar */}
      <EditorToolbar
        onNew={createNewFile}
        onOpen={openFile}
        onSave={saveFile}
        isDirty={isDirty}
        isLoading={isLoading}
        filePath={filePath}
      />

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
