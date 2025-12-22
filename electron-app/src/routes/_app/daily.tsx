import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/daily")({
  component: DailyLayout,
});

function DailyLayout() {
  return <Outlet />;
}
