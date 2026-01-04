import { Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import TitleBar from "../components/TitleBar";
import { Toaster } from "@/components/ui/sonner";
import { VaultProvider } from "@/contexts/VaultContext";
import { SidebarControlsProvider } from "@/contexts/SidebarControlsContext";
import { BackendProvider } from "@/contexts/BackendContext";
import { GitHubProvider } from "@/contexts/GitHubContext";
import { EditorProvider } from "@/contexts/EditorContext";

export const Route = createRootRoute({
	component: () => (
		<BackendProvider>
			<GitHubProvider>
				<VaultProvider>
					<SidebarControlsProvider>
						<EditorProvider>
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
						</EditorProvider>
					</SidebarControlsProvider>
				</VaultProvider>
			</GitHubProvider>
		</BackendProvider>
	),
});
