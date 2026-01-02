import { format } from "date-fns";
import { FolderOpen, FileText, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface DailyHeaderProps {
  date: Date;
  isDirty?: boolean;
  onSave?: () => void;
}

export function DailyHeader({ date, isDirty = false, onSave }: DailyHeaderProps) {
  const dateStr = format(date, "yyyy-MM-dd");

  return (
    <div className="flex items-center justify-between">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <button type="button" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                <FolderOpen className="size-4" />
                <span>Personal</span>
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="flex items-center gap-1.5">
              <FileText className="size-4" />
              <span>{dateStr}</span>
              {isDirty && <span className="text-primary">*</span>}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-2">
        {onSave && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("size-8", isDirty && "text-primary")}
                onClick={onSave}
                disabled={!isDirty}
              >
                <Save className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save (Ctrl+S)</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
