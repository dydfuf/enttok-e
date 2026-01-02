import { MoreHorizontal } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";

export interface TagItem {
  id: string;
  name: string;
  count?: number;
}

interface SidebarTagsProps {
  tags?: TagItem[];
  onMoreClick?: () => void;
  defaultOpen?: boolean;
}

export function SidebarTags({
  tags = [],
  onMoreClick,
  defaultOpen = true,
}: SidebarTagsProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group/collapsible">
      <div className="flex items-center justify-between px-1">
        <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold text-muted-foreground opacity-80 hover:opacity-100 transition-opacity">
          <ChevronRight className="size-3 transition-transform group-data-[state=open]/collapsible:rotate-90" />
          <span>Tags</span>
        </CollapsibleTrigger>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-primary"
          onClick={onMoreClick}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </div>
      <CollapsibleContent className="mt-2">
        {tags.length === 0 ? (
          <div className="py-2 px-2 text-xs text-muted-foreground">
            No tags yet
          </div>
        ) : (
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-1">
            {tags.map((tag) => (
              <Link
                key={tag.id}
                to="/tags"
                search={{ tag: tag.name }}
                className="inline-flex items-center text-sm text-muted-foreground hover:text-primary cursor-pointer transition-colors"
              >
                <span className="opacity-60 mr-0.5">#</span>
                {tag.name}
              </Link>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
