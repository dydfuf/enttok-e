import { Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { NavBar } from "./NavBar";
import AppSidebar from "./AppSidebar";
import AssistantSidebar from "./AssistantSidebar";
import { StatusBar } from "./StatusBar";
import { SidebarToggleBridge } from "@/contexts/SidebarControlsContext";

export default function AppLayout() {
  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex flex-1 min-h-0">
        {/* Icon Navigation Bar */}
        <NavBar />

        {/* Left Content Sidebar */}
        <SidebarProvider
          className="min-h-0 flex-1"
          defaultOpen={true}
          style={{ "--sidebar-left-offset": "3.5rem" } as React.CSSProperties}
        >
          <SidebarToggleBridge side="left" />
          <AppSidebar />
          <SidebarInset className="min-h-0 flex flex-col">
            <main className="flex-1 min-h-0 overflow-y-auto">
              <Outlet />
            </main>
          </SidebarInset>
        </SidebarProvider>

        <SidebarProvider className="min-h-0 w-auto flex-none" keyboardShortcut="l">
          <SidebarToggleBridge side="right" />
          <AssistantSidebar />
        </SidebarProvider>
      </div>
      <StatusBar />
    </div>
  );
}
