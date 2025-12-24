import { Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import TitleBar from "../components/TitleBar";
import { Toaster } from "@/components/ui/sonner";
import { VaultProvider } from "@/contexts/VaultContext";
import { SidebarControlsProvider } from "@/contexts/SidebarControlsContext";
import { BackendProvider } from "@/contexts/BackendContext";

export const Route = createRootRoute({
  component: () => (
    <BackendProvider>
      <VaultProvider>
        <SidebarControlsProvider>
          <div className="h-screen flex flex-col">
            <TitleBar />
            <div className="flex-1 min-h-0 overflow-hidden">
              <Outlet />
            </div>
            <Toaster position="bottom-right" richColors />
            <TanStackDevtools
              config={{
                position: "bottom-right",
              }}
              plugins={[
                {
                  name: "Tanstack Router",
                  render: <TanStackRouterDevtoolsPanel />,
                },
              ]}
            />
          </div>
        </SidebarControlsProvider>
      </VaultProvider>
    </BackendProvider>
  ),
});
