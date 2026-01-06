import { useCallback, useMemo, useState } from "react";
import { Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { NavBar } from "./NavBar";
import AppSidebar from "./AppSidebar";
import AssistantSidebar from "./AssistantSidebar";
import { StatusBar } from "./StatusBar";
import { SidebarToggleBridge } from "@/contexts/SidebarControlsContext";

const ASSISTANT_SIDEBAR_DEFAULT_WIDTH = 16 * 16;
const ASSISTANT_SIDEBAR_MIN_WIDTH = 240;
const ASSISTANT_SIDEBAR_MAX_WIDTH = 520;

export default function AppLayout() {
  const [assistantSidebarWidth, setAssistantSidebarWidth] = useState(
    ASSISTANT_SIDEBAR_DEFAULT_WIDTH
  );

  const handleAssistantResize = useCallback((nextWidth: number) => {
    const clampedWidth = Math.min(
      ASSISTANT_SIDEBAR_MAX_WIDTH,
      Math.max(ASSISTANT_SIDEBAR_MIN_WIDTH, Math.round(nextWidth))
    );
    setAssistantSidebarWidth(clampedWidth);
  }, []);

  const assistantSidebarStyle = useMemo(
    () =>
      ({
        "--sidebar-width": `${assistantSidebarWidth}px`,
      }) as React.CSSProperties,
    [assistantSidebarWidth]
  );

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

        <SidebarProvider
          className="min-h-0 w-auto flex-none"
          keyboardShortcut="l"
          style={assistantSidebarStyle}
        >
          <SidebarToggleBridge side="right" />
          <AssistantSidebar onResize={handleAssistantResize} />
        </SidebarProvider>
      </div>
      <StatusBar />
    </div>
  );
}
