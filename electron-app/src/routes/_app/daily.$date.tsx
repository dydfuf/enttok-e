import { useCallback, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { parseISO, isToday } from "date-fns";
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

  const {
    vaultPath,
    datesWithNotes,
    createOrGetDailyNote,
    formatDateForStorage,
  } = useDailyNotes();

  const handleNavigate = useCallback(
    (date: Date) => {
      const dateStr = formatDateForStorage(date);
      if (isToday(date)) {
        navigate({ to: "/daily" });
      } else {
        navigate({ to: "/daily/$date", params: { date: dateStr } });
      }
    },
    [formatDateForStorage, navigate]
  );

  return (
    <DailyNotePage
      date={selectedDate}
      vaultPath={vaultPath}
      datesWithNotes={datesWithNotes}
      createOrGetDailyNote={createOrGetDailyNote}
      onNavigate={handleNavigate}
      onErrorAction={() => navigate({ to: "/daily" })}
      errorActionLabel="Go to Today"
    />
  );
}
