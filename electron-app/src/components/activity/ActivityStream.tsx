import { Bot, History, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityItem } from "./ActivityItem";
import { cn } from "@/lib/utils";
import type { ActivityStreamItem } from "@/lib/activity-types";

interface ActivityStreamProps {
  activities?: ActivityStreamItem[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onIncludeInChat?: () => void;
}

export function ActivityStream({
  activities = [],
  isLoading = false,
  onRefresh,
  onIncludeInChat,
}: ActivityStreamProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-muted/30 sticky top-0 backdrop-blur-sm z-10">
        <h3 className="font-semibold text-sm">Activity Stream</h3>
        <div className="flex gap-1.5 items-center">
          {activities.length > 0 && onIncludeInChat && (
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1.5 text-xs px-2 cursor-pointer"
              onClick={onIncludeInChat}
            >
              <Bot className="size-3" />
              Include
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onRefresh}
            disabled={isLoading || !onRefresh}
            aria-label="Refresh activity stream"
          >
            <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Activity list */}
      <div className="flex-1 overflow-y-auto p-3">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <History className="size-8 mb-2 opacity-50" />
            <p className="text-sm font-medium">No activities yet</p>
            <p className="text-xs mt-1">
              Connect your services to see activity here
            </p>
          </div>
        ) : (
          <div className="space-y-0" role="list">
            {activities.map((activity, index) => (
              <ActivityItem
                key={activity.id}
                item={activity}
                isLast={index === activities.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
