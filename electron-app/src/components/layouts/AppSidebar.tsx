import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  SidebarSearch,
  SidebarCalendar,
  SidebarQuickFilters,
  SidebarShortcuts,
  SidebarTags,
  type ShortcutItem,
  type TagItem,
} from "@/components/sidebar";
import { useDailyNotes } from "@/hooks/useDailyNotes";

// Placeholder data - will be replaced with real data from hooks
const defaultShortcuts: ShortcutItem[] = [
  { id: "1", title: "Quarterly Goals", icon: "star", href: "/notes/quarterly-goals" },
  { id: "2", title: "Daily Journal", icon: "book", href: "/notes/daily-journal" },
];

const defaultTags: TagItem[] = [
  { id: "1", name: "features" },
  { id: "2", name: "hello" },
  { id: "3", name: "todo" },
  { id: "4", name: "sponsor" },
];

export default function AppSidebar() {
  const [searchValue, setSearchValue] = useState("");
  const { datesWithNotes } = useDailyNotes();

  return (
    <Sidebar collapsible="offcanvas" variant="sidebar" className="border-r-0">
      <SidebarHeader className="h-12 flex-row items-center px-4 group-data-[collapsible=offcanvas]:hidden">
        <span className="text-sm font-semibold">Enttok-e</span>
      </SidebarHeader>
      <SidebarContent className="gap-0 overflow-y-auto">
        {/* Search */}
        <div className="px-4 pb-2">
          <SidebarSearch
            value={searchValue}
            onChange={setSearchValue}
          />
        </div>

        {/* Mini Calendar */}
        <div className="px-4 py-4">
          <SidebarCalendar datesWithNotes={datesWithNotes} />
        </div>

        {/* Quick Filters */}
        <div className="px-4 pb-6">
          <SidebarQuickFilters />
        </div>

        <SidebarSeparator />

        {/* Shortcuts */}
        <div className="px-4 py-4">
          <SidebarShortcuts shortcuts={defaultShortcuts} />
        </div>

        {/* Tags */}
        <div className="px-4 pb-4">
          <SidebarTags tags={defaultTags} />
        </div>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
