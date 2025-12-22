import { Lightbulb } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default function SuggestionSidebar() {
  return (
    <Sidebar collapsible="icon" variant="sidebar" side="right">
      <SidebarHeader className="h-12 flex-row items-center justify-between px-2">
        <SidebarTrigger />
        <span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">
          Suggestions
        </span>
      </SidebarHeader>
      <SidebarContent>
        <div className="flex-1 p-4 group-data-[collapsible=icon]:hidden">
          <div className="text-sm text-muted-foreground text-center py-8">
            <Lightbulb className="mx-auto mb-2 size-6 opacity-50" />
            Connect GitHub to get activity-based suggestions
          </div>
        </div>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
