import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ActivityStreamItem } from "@/lib/activity-types";
import { getActivitySourceConfig } from "./activity-config";

interface ActivityItemProps {
  item: ActivityStreamItem;
  isLast?: boolean;
}

export function ActivityItem({ item, isLast = false }: ActivityItemProps) {
  const config = getActivitySourceConfig(item.source);
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "relative pl-6",
        isLast ? "pb-2" : "border-l border-border/70 pb-5"
      )}
      role="listitem"
    >
      {/* Timeline dot */}
      <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-background border border-border flex items-center justify-center">
        <div className={cn("w-2 h-2 rounded-full", config.dotClassName)} />
      </div>

      <div className="flex flex-col gap-2">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 flex-1 text-xs font-semibold leading-4 text-foreground line-clamp-2">
            {item.title}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground font-mono tabular-nums">
            {item.timeLabel}
          </span>
        </div>

        {/* Content card */}
        <div className="rounded-md border border-border/60 bg-muted/40 px-2.5 py-2">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] uppercase tracking-wide",
              config.badgeClassName
            )}
          >
            <Icon className={cn("size-3", config.iconClassName)} />
            {config.label}
          </Badge>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {item.description}
          </p>
        </div>
      </div>
    </div>
  );
}
