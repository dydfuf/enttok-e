import { useState, useEffect } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useFileSystem } from "@/hooks/useFileSystem";
import { useAutoSave } from "@/hooks/useAutoSave";
import { MarkdownEditor } from "./MarkdownEditor";
import { MarkdownPreview } from "./MarkdownPreview";
import { EditorToolbar, type ViewMode } from "./EditorToolbar";
import { cn } from "@/lib/utils";

interface EditorLayoutProps {
  initialFilePath?: string;
  className?: string;
}

export function EditorLayout({
  initialFilePath,
  className,
}: EditorLayoutProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("split");

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
        viewMode={viewMode}
        onViewModeChange={setViewMode}
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

      {/* Editor area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "editor" && (
          <MarkdownEditor
            value={content}
            onChange={setContent}
            className="h-full"
          />
        )}

        {viewMode === "preview" && (
          <MarkdownPreview content={content} className="h-full" />
        )}

        {viewMode === "split" && (
          <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel defaultSize={50} minSize={20}>
              <MarkdownEditor
                value={content}
                onChange={setContent}
                className="h-full"
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={20}>
              <MarkdownPreview content={content} className="h-full" />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}

export default EditorLayout;
