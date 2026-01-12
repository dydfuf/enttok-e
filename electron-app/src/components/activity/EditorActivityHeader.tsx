import { useState } from "react";
import { Bot, ChevronDown, ChevronRight, History, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ActivityItem } from "./ActivityItem";
import { cn } from "@/lib/utils";
import type { ActivityStreamItem } from "@/lib/activity-types";

interface EditorActivityHeaderProps {
  activities?: ActivityStreamItem[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onIncludeInChat?: () => void;
  onSummarize?: () => void;
}

export function EditorActivityHeader({
  activities = [],
  isLoading = false,
  onRefresh,
  onIncludeInChat,
  onSummarize,
}: EditorActivityHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      {/* Header - always visible */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {isOpen ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
            <History className="size-4" />
            <span>Activity Stream</span>
            {activities.length > 0 && (
              <span className="text-xs text-muted-foreground/70">
                ({activities.length})
              </span>
            )}
          </button>
        </CollapsibleTrigger>

        {/* Action buttons - always accessible */}
        <div className="flex gap-1.5 items-center">
          {activities.length > 0 && onSummarize && (
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1.5 text-xs px-2 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onSummarize();
              }}
            >
              <Sparkles className="size-3" />
              Summarize
            </Button>
          )}
          {activities.length > 0 && onIncludeInChat && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs px-2 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onIncludeInChat();
              }}
            >
              <Bot className="size-3" />
              Include
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={(e) => {
              e.stopPropagation();
              onRefresh?.();
            }}
            disabled={isLoading || !onRefresh}
            aria-label="Sync activity stream"
          >
            <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Collapsible content */}
      <CollapsibleContent>
        <div className="max-h-[300px] overflow-y-auto border-b border-border bg-background/50">
          {activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <History className="size-6 mb-2 opacity-50" />
              <p className="text-sm">No activities for this day</p>
              <p className="text-xs mt-1">
                Connect your services to see activity here
              </p>
            </div>
          ) : (
            <ul className="p-3 space-y-0 list-none">
              {activities.map((activity, index) => (
                <li key={activity.id}>
                  <ActivityItem
                    item={activity}
                    isLast={index === activities.length - 1}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
