import { Star, BookOpen, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ShortcutItem {
  id: string;
  title: string;
  icon: "star" | "book" | "default";
  href: string;
}

interface SidebarShortcutsProps {
  shortcuts?: ShortcutItem[];
  onAddClick?: () => void;
  defaultOpen?: boolean;
}

const iconMap = {
  star: Star,
  book: BookOpen,
  default: Star,
};

const iconColorMap = {
  star: "text-yellow-500",
  book: "text-blue-500",
  default: "text-muted-foreground",
};

export function SidebarShortcuts({
  shortcuts = [],
  onAddClick,
  defaultOpen = true,
}: SidebarShortcutsProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group/collapsible">
      <div className="flex items-center justify-between px-1">
        <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold text-muted-foreground opacity-80 hover:opacity-100 transition-opacity">
          <ChevronRight className="size-3 transition-transform group-data-[state=open]/collapsible:rotate-90" />
          <span>Shortcuts</span>
        </CollapsibleTrigger>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-primary"
          onClick={onAddClick}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      <CollapsibleContent className="mt-1 space-y-0.5">
        {shortcuts.length === 0 ? (
          <div className="py-2 px-2 text-xs text-muted-foreground">
            No shortcuts yet
          </div>
        ) : (
          shortcuts.map((shortcut) => {
            const Icon = iconMap[shortcut.icon] || iconMap.default;
            const iconColor = iconColorMap[shortcut.icon] || iconColorMap.default;
            return (
              <Link
                key={shortcut.id}
                to={shortcut.href}
                className="flex items-center py-1.5 px-2 hover:bg-accent rounded-md cursor-pointer group transition-colors"
              >
                <Icon className={cn("size-4 mr-2", iconColor)} />
                <span className="text-sm truncate">{shortcut.title}</span>
              </Link>
            );
          })
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
