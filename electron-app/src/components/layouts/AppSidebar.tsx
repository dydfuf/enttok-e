import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarRail,
} from "@/components/ui/sidebar";
import { SidebarSearch, SidebarCalendar } from "@/components/sidebar";
import { useDailyNotes } from "@/hooks/useDailyNotes";

export default function AppSidebar() {
  const [searchValue, setSearchValue] = useState("");
  const { datesWithNotes } = useDailyNotes();

  return (
    <Sidebar collapsible="offcanvas" variant="sidebar" className="border-r-0">
      <SidebarContent className="mt-4 gap-0 overflow-y-auto">
        {/* Search */}
        <div className="px-4 py-2">
          <SidebarSearch value={searchValue} onChange={setSearchValue} />
        </div>

        {/* Mini Calendar */}
        <div className="px-4 py-4">
          <SidebarCalendar datesWithNotes={datesWithNotes} />
        </div>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
