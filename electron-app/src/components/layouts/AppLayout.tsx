import { Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import AppSidebar from "./AppSidebar";
import SuggestionSidebar from "./SuggestionSidebar";

export default function AppLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </SidebarInset>
      <SidebarProvider className="min-h-0 w-auto flex-none">
        <SuggestionSidebar />
      </SidebarProvider>
    </SidebarProvider>
  );
}
