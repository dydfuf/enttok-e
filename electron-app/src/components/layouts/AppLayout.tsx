import { Outlet } from "@tanstack/react-router";
import Sidebar from "./Sidebar";
import SuggestionPanel from "./SuggestionPanel";

export default function AppLayout() {
  return (
    <div className="flex h-screen bg-white dark:bg-gray-950">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <SuggestionPanel />
    </div>
  );
}
