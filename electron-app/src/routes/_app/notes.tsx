import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/notes")({
  component: NotesLayout,
});

function NotesLayout() {
  return <Outlet />;
}
