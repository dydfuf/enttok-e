import { useCallback, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { isToday } from "date-fns";
import { DailyNotePage } from "@/components/daily/DailyNotePage";
import { useDailyNotes } from "@/hooks/useDailyNotes";

export const Route = createFileRoute("/_app/daily/")({
  component: DailyIndexPage,
});

function DailyIndexPage() {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);

  const {
    vaultPath,
    datesWithNotes,
    createOrGetDailyNote,
    formatDateForStorage,
    loadDatesWithNotes,
  } = useDailyNotes();

  const handleNavigate = useCallback(
    (date: Date) => {
      const dateStr = formatDateForStorage(date);
      if (isToday(date)) {
        loadDatesWithNotes();
      } else {
        navigate({ to: "/daily/$date", params: { date: dateStr } });
      }
    },
    [formatDateForStorage, loadDatesWithNotes, navigate]
  );

  return (
    <DailyNotePage
      date={today}
      vaultPath={vaultPath}
      datesWithNotes={datesWithNotes}
      createOrGetDailyNote={createOrGetDailyNote}
      onNavigate={handleNavigate}
      onErrorAction={() => window.location.reload()}
      errorActionLabel="Retry"
    />
  );
}
