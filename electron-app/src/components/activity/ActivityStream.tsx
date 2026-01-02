import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActivityItem, type ActivityItemData } from "./ActivityItem";
import { cn } from "@/lib/utils";

interface ActivityStreamProps {
  activities?: ActivityItemData[];
  isLoading?: boolean;
  onRefresh?: () => void;
  showNewBadge?: boolean;
}

export function ActivityStream({
  activities = [],
  isLoading = false,
  onRefresh,
  showNewBadge = true,
}: ActivityStreamProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/30 sticky top-0 backdrop-blur-sm z-10">
        <h3 className="font-semibold text-sm">Activity Stream</h3>
        <div className="flex gap-2 items-center">
          {showNewBadge && activities.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
              NEW
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Activity list */}
      <div className="flex-1 overflow-y-auto p-4">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">No activities yet</p>
            <p className="text-xs mt-1">
              Connect your services to see activity here
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {activities.map((activity, index) => (
              <ActivityItem
                key={activity.id}
                item={{
                  ...activity,
                  isLast: index === activities.length - 1,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
