import { Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import AppSidebar from "./AppSidebar";
import SuggestionSidebar from "./SuggestionSidebar";
import { SidebarToggleBridge } from "@/contexts/SidebarControlsContext";

export default function AppLayout() {
  return (
    <SidebarProvider className="h-full min-h-0">
      <SidebarToggleBridge side="left" />
      <AppSidebar />
      <SidebarInset className="min-h-0">
        <main className="flex-1 min-h-0 overflow-y-auto">
          <Outlet />
        </main>
      </SidebarInset>
      <SidebarProvider className="min-h-0 w-auto flex-none" keyboardShortcut="l">
        <SidebarToggleBridge side="right" />
        <SuggestionSidebar />
      </SidebarProvider>
    </SidebarProvider>
  );
}
