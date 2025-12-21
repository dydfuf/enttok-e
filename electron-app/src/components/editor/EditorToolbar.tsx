import {
  FolderOpen,
  Save,
  FilePlus,
  PanelLeft,
  Columns2,
  PanelRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ViewMode = "editor" | "split" | "preview";

interface EditorToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  isDirty: boolean;
  isLoading: boolean;
  filePath: string | null;
  className?: string;
}

export function EditorToolbar({
  viewMode,
  onViewModeChange,
  onNew,
  onOpen,
  onSave,
  isDirty,
  isLoading,
  filePath,
  className,
}: EditorToolbarProps) {
  const fileName = filePath ? filePath.split("/").pop() : "Untitled";

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "flex h-10 items-center gap-1 border-b border-border bg-background px-2",
          className
        )}
      >
        {/* File operations */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onNew}
                disabled={isLoading}
              >
                <FilePlus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New file</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onOpen}
                disabled={isLoading}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open file (Ctrl+O)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onSave}
                disabled={isLoading || !isDirty}
              >
                <Save className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save (Ctrl+S)</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* File name */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span className="max-w-[200px] truncate">{fileName}</span>
          {isDirty && <span className="text-primary">*</span>}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* View mode toggle */}
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => {
            if (value) onViewModeChange(value as ViewMode);
          }}
          className="h-8"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value="editor"
                aria-label="Editor only"
                className="h-8 w-8 p-0"
              >
                <PanelLeft className="h-4 w-4" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>Editor only</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value="split"
                aria-label="Split view"
                className="h-8 w-8 p-0"
              >
                <Columns2 className="h-4 w-4" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>Split view</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value="preview"
                aria-label="Preview only"
                className="h-8 w-8 p-0"
              >
                <PanelRight className="h-4 w-4" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>Preview only</TooltipContent>
          </Tooltip>
        </ToggleGroup>
      </div>
    </TooltipProvider>
  );
}

export default EditorToolbar;
