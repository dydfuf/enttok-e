import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/tags")({
  component: TagsLayout,
});

function TagsLayout() {
  return <Outlet />;
}
