import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import { DailyNotePage } from "@/components/daily/DailyNotePage";
import { useDailyNotes } from "@/hooks/useDailyNotes";

export const Route = createFileRoute("/_app/daily/$date")({
  component: DailyDatePage,
});

function DailyDatePage() {
  const { date: dateParam } = Route.useParams();
  const navigate = useNavigate();

  // Parse the date from URL
  const selectedDate = useMemo(() => parseISO(dateParam), [dateParam]);

  const { vaultPath, createOrGetDailyNote } = useDailyNotes();

  return (
    <DailyNotePage
      date={selectedDate}
      vaultPath={vaultPath}
      createOrGetDailyNote={createOrGetDailyNote}
      onErrorAction={() => navigate({ to: "/daily" })}
      errorActionLabel="Go to Today"
    />
  );
}
