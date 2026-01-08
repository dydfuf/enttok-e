import {
  Calendar,
  Mail,
  Bug,
  FileText,
  Code,
  MessageSquare,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ActivitySource =
  | "calendar"
  | "gmail"
  | "jira"
  | "confluence"
  | "github"
  | "slack"
  | "claude";

export interface ActivityItemData {
  id: string;
  title: string;
  description: string;
  source: ActivitySource;
  sourceLabel: string;
  time: string;
  isLast?: boolean;
}

const sourceConfig: Record<
  ActivitySource,
  { icon: LucideIcon; color: string; bgColor: string }
> = {
  calendar: {
    icon: Calendar,
    color: "text-orange-500",
    bgColor: "bg-orange-500",
  },
  gmail: {
    icon: Mail,
    color: "text-red-500",
    bgColor: "bg-red-500",
  },
  jira: {
    icon: Bug,
    color: "text-blue-500",
    bgColor: "bg-blue-500",
  },
  confluence: {
    icon: FileText,
    color: "text-blue-400",
    bgColor: "bg-blue-400",
  },
  github: {
    icon: Code,
    color: "text-foreground",
    bgColor: "bg-gray-700 dark:bg-gray-300",
  },
  slack: {
    icon: MessageSquare,
    color: "text-purple-500",
    bgColor: "bg-purple-500",
  },
  claude: {
    icon: Bot,
    color: "text-orange-500",
    bgColor: "bg-orange-500",
  },
};

interface ActivityItemProps {
  item: ActivityItemData;
}

export function ActivityItem({ item }: ActivityItemProps) {
  const config = sourceConfig[item.source];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "relative pl-4 pb-4",
        !item.isLast && "border-l border-border"
      )}
    >
      {/* Timeline dot */}
      <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-background border border-border flex items-center justify-center">
        <div className={cn("w-1.5 h-1.5 rounded-full", config.bgColor)} />
      </div>

      <div className="flex flex-col gap-1">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold">{item.title}</span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {item.time}
          </span>
        </div>

        {/* Content card */}
        <div className="text-xs bg-muted/50 p-2 rounded-md border border-border">
          {/* Source badge */}
          <div className="flex items-center gap-1.5 mb-1">
            <Icon className={cn("size-3.5", config.color)} />
            <span className="text-[10px] uppercase font-semibold text-muted-foreground">
              {item.sourceLabel}
            </span>
          </div>
          {/* Description */}
          <p className="text-muted-foreground line-clamp-2">{item.description}</p>
        </div>
      </div>
    </div>
  );
}
